import { randomUUID } from "node:crypto";
import { extractJson } from "./json.js";
import type { LlmClient } from "./llm/types.js";
import type { RunStore } from "./store.js";
import type { Handoff, Run, Task } from "./types.js";

export class CapacityError extends Error {
  constructor(message = "too many concurrent runs") {
    super(message);
    this.name = "CapacityError";
  }
}

function now(): string {
  return new Date().toISOString();
}

export class Runner {
  private active = 0;

  constructor(
    private readonly store: RunStore,
    private readonly llm: LlmClient,
    private readonly maxConcurrent: number = 2,
  ) {}

  get activeRuns(): number {
    return this.active;
  }

  async create(goal: string, metadata: Record<string, unknown> = {}): Promise<Run> {
    if (this.active >= this.maxConcurrent) {
      throw new CapacityError();
    }
    this.active += 1;

    const run: Run = {
      id: randomUUID(),
      goal,
      metadata,
      status: "pending",
      createdAt: now(),
      updatedAt: now(),
      plan: [],
      handoffs: [],
    };

    try {
      await this.store.save(run);
    } catch (err) {
      this.active -= 1;
      throw err;
    }

    void this.execute(run.id).finally(() => {
      this.active -= 1;
    });
    return run;
  }

  private async execute(id: string): Promise<void> {
    const run = await this.store.get(id);
    if (!run) {
      return;
    }

    try {
      run.status = "planning";
      run.updatedAt = now();
      await this.store.save(run);

      const planRaw = await this.llm.chat([
        {
          role: "system",
          content:
            "You are a generic task planner. Given a goal, return JSON only: " +
            '{"tasks":[{"id":"t1","description":"..."},...]}. ' +
            "Keep 1-5 concrete tasks. No domain assumptions beyond the goal text.",
        },
        { role: "user", content: run.goal },
      ]);

      const planParsed = extractJson(planRaw) as { tasks?: Task[] };
      const tasks = (planParsed.tasks ?? []).map((t, i) => ({
        id: t.id || `t${i + 1}`,
        description: t.description || String(t),
      }));
      if (tasks.length === 0) {
        throw new Error("Planner returned no tasks");
      }
      run.plan = tasks;
      run.status = "working";
      run.updatedAt = now();
      await this.store.save(run);

      const handoffs: Handoff[] = [];
      for (const task of tasks) {
        const workerRaw = await this.llm.chat([
          {
            role: "system",
            content:
              "You are a generic worker. Execute the assigned task for the overall goal. " +
              'Return JSON only: {"handoff":"..."}. The handoff summarizes what you did or concluded.',
          },
          {
            role: "user",
            content: JSON.stringify({
              goal: run.goal,
              task,
              prior_handoffs: handoffs,
            }),
          },
        ]);
        const workerParsed = extractJson(workerRaw) as { handoff?: string };
        handoffs.push({
          taskId: task.id,
          content: workerParsed.handoff ?? workerRaw,
          completedAt: now(),
        });
        run.handoffs = [...handoffs];
        run.updatedAt = now();
        await this.store.save(run);
      }

      run.status = "completed";
      run.updatedAt = now();
      await this.store.save(run);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      run.status = "failed";
      run.error = message;
      run.updatedAt = now();
      await this.store.save(run);
    }
  }
}
