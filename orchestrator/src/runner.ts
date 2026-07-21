import { randomUUID } from "node:crypto";
import type { OllamaClient } from "./ollama.js";
import type { RunStore } from "./store.js";
import type { Handoff, Run, Task } from "./types.js";

function now(): string {
  return new Date().toISOString();
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error(`Could not parse JSON from model output: ${trimmed.slice(0, 200)}`);
  }
}

export class Runner {
  constructor(
    private readonly store: RunStore,
    private readonly ollama: OllamaClient,
  ) {}

  async create(goal: string, metadata: Record<string, unknown> = {}): Promise<Run> {
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
    await this.store.save(run);
    void this.execute(run.id);
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

      const planRaw = await this.ollama.chat([
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
        const workerRaw = await this.ollama.chat([
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
