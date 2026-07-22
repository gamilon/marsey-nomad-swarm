import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { RunStore } from "./store.js";
import type { Run } from "./types.js";

function run(partial: Partial<Run> & Pick<Run, "id" | "createdAt">): Run {
  return {
    goal: "g",
    metadata: {},
    status: "completed",
    updatedAt: partial.createdAt,
    plan: [],
    handoffs: [],
    ...partial,
  };
}

describe("RunStore.listSummaries", () => {
  it("returns newest first with truncated goals", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "swarm-list-"));
    try {
      const store = new RunStore(dir);
      await store.init();
      await store.save(
        run({
          id: "550e8400-e29b-41d4-a716-446655440001",
          createdAt: "2026-01-01T00:00:00.000Z",
          goal: "old",
        }),
      );
      await store.save(
        run({
          id: "550e8400-e29b-41d4-a716-446655440002",
          createdAt: "2026-06-01T00:00:00.000Z",
          goal: "x".repeat(200),
        }),
      );

      const list = await store.listSummaries(10);
      assert.equal(list.length, 2);
      assert.equal(list[0].id, "550e8400-e29b-41d4-a716-446655440002");
      assert.ok(list[0].goal.length <= 120);
      assert.ok(list[0].goal.endsWith("…"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
