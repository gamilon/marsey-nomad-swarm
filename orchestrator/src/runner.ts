import { randomUUID } from "node:crypto";
import { extractJson } from "./json.js";
import { LlmAbortedError, LlmTimeoutError } from "./llm/ollama.js";
import type { LlmClient } from "./llm/types.js";
import { logEvent } from "./log.js";
import type { RunStore } from "./store.js";
import type { Handoff, Run, Task } from "./types.js";

export class CapacityError extends Error {
  constructor(message = "too many concurrent runs") {
    super(message);
    this.name = "CapacityError";
  }
}

export class CancelNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CancelNotAllowedError";
  }
}

const CANCELABLE = new Set(["pending", "planning", "working"]);

function now(): string {
  return new Date().toISOString();
}

export class Runner {
  private active = 0;
  private readonly controllers = new Map<string, AbortController>();

  constructor(
    private readonly store: RunStore,
    private readonly llm: LlmClient,
    private readonly maxConcurrent: number = 2,
  ) {}

  get activeRuns(): number {
    return this.active;
  }

  get maxConcurrentRuns(): number {
    return this.maxConcurrent;
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

    const controller = new AbortController();
    this.controllers.set(run.id, controller);

    try {
      await this.store.save(run);
      logEvent({ runId: run.id, phase: "pending" });
    } catch (err) {
      this.controllers.delete(run.id);
      this.active -= 1;
      throw err;
    }

    void this.execute(run.id, controller.signal).finally(() => {
      this.controllers.delete(run.id);
      this.active -= 1;
    });
    return run;
  }

  async cancel(id: string): Promise<Run> {
    const run = await this.store.get(id);
    if (!run) {
      throw new CancelNotAllowedError("run not found");
    }
    if (!CANCELABLE.has(run.status)) {
      throw new CancelNotAllowedError(`cannot cancel run in status ${run.status}`);
    }

    const controller = this.controllers.get(id);
    controller?.abort();

    // If execute is between LLM calls or never started, persist cancel now.
    // execute() will also observe abort and write cancelled if it still owns the run.
    const latest = await this.store.get(id);
    if (latest && CANCELABLE.has(latest.status)) {
      latest.status = "cancelled";
      latest.error = "cancelled by client";
      latest.updatedAt = now();
      await this.store.save(latest);
      logEvent({ runId: id, phase: "cancelled" });
      return latest;
    }
    return (await this.store.get(id)) ?? run;
  }

  private async execute(id: string, signal: AbortSignal): Promise<void> {
    let run = await this.store.get(id);
    if (!run) {
      return;
    }
    if (signal.aborted || run.status === "cancelled") {
      return;
    }

    try {
      await this.ensureActive(id, signal);
      run.status = "planning";
      run.updatedAt = now();
      await this.saveIfActive(run, signal);
      logEvent({ runId: id, phase: "planning" });

      const planRaw = await this.llm.chat(
        [
          {
            role: "system",
            content:
              "You are a generic task planner. Given a goal, return JSON only: " +
              '{"tasks":[{"id":"t1","description":"..."},...]}. ' +
              "Keep 1-5 concrete tasks. No domain assumptions beyond the goal text.",
          },
          { role: "user", content: run.goal },
        ],
        { signal },
      );

      await this.ensureActive(id, signal);
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
      await this.saveIfActive(run, signal);
      logEvent({ runId: id, phase: "working", taskCount: tasks.length });

      const handoffs: Handoff[] = [];
      for (const task of tasks) {
        await this.ensureActive(id, signal);
        logEvent({ runId: id, phase: "working", taskId: task.id });
        const workerRaw = await this.llm.chat(
          [
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
          ],
          { signal },
        );
        await this.ensureActive(id, signal);
        const workerParsed = extractJson(workerRaw) as { handoff?: string };
        handoffs.push({
          taskId: task.id,
          content: workerParsed.handoff ?? workerRaw,
          completedAt: now(),
        });
        run.handoffs = [...handoffs];
        run.updatedAt = now();
        await this.saveIfActive(run, signal);
      }

      await this.ensureActive(id, signal);
      run.status = "completed";
      run.updatedAt = now();
      await this.saveIfActive(run, signal);
      logEvent({ runId: id, phase: "completed" });
    } catch (err: unknown) {
      const latest = (await this.store.get(id)) ?? run;
      if (
        err instanceof LlmAbortedError ||
        (err instanceof Error && err.name === "AbortError") ||
        signal.aborted ||
        latest.status === "cancelled"
      ) {
        if (latest.status !== "cancelled") {
          latest.status = "cancelled";
          latest.error = "cancelled by client";
          latest.updatedAt = now();
          await this.store.save(latest);
          logEvent({ runId: id, phase: "cancelled" });
        }
        return;
      }

      const message =
        err instanceof LlmTimeoutError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      latest.status = "failed";
      latest.error = message;
      latest.updatedAt = now();
      await this.store.save(latest);
      logEvent({ runId: id, phase: "failed", error: message.slice(0, 200) });
    }
  }

  private async ensureActive(id: string, signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
      throw new LlmAbortedError();
    }
    const latest = await this.store.get(id);
    if (!latest || latest.status === "cancelled") {
      throw new LlmAbortedError();
    }
  }

  private async saveIfActive(run: Run, signal: AbortSignal): Promise<void> {
    await this.ensureActive(run.id, signal);
    await this.store.save(run);
  }
}
