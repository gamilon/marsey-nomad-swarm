import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { ChatMessage, ChatOptions, LlmClient } from "./llm/types.js";
import { CancelNotAllowedError, Runner } from "./runner.js";
import { RunStore } from "./store.js";

class SlowLlm implements LlmClient {
  readonly modelId = "test";
  calls = 0;

  async chat(_messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    this.calls += 1;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 5_000);
      options.signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        },
        { once: true },
      );
    });
    return '{"tasks":[{"id":"t1","description":"x"}]}';
  }

  async healthy(): Promise<boolean> {
    return true;
  }
}

describe("Runner.cancel", () => {
  it("cancels an in-flight run", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "swarm-runs-"));
    try {
      const store = new RunStore(dir);
      await store.init();
      const llm = new SlowLlm();
      const runner = new Runner(store, llm, 2);

      const created = await runner.create("slow goal");
      // Let execute enter planning / LLM call
      await new Promise((r) => setTimeout(r, 50));

      const cancelled = await runner.cancel(created.id);
      assert.equal(cancelled.status, "cancelled");

      await new Promise((r) => setTimeout(r, 100));
      const final = await store.get(created.id);
      assert.equal(final?.status, "cancelled");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects cancel on completed runs", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "swarm-runs-"));
    try {
      const store = new RunStore(dir);
      await store.init();
      const run = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        goal: "done",
        metadata: {},
        status: "completed" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        plan: [],
        handoffs: [],
      };
      await store.save(run);
      const runner = new Runner(store, new SlowLlm(), 2);
      await assert.rejects(
        () => runner.cancel(run.id),
        (err: unknown) =>
          err instanceof CancelNotAllowedError &&
          /cannot cancel/.test(err.message),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
