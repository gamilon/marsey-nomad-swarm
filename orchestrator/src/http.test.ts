import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { describe, it } from "node:test";
import {
  BodyTooLargeError,
  parseCreateRunBody,
  readJsonBody,
} from "./http.js";

describe("readJsonBody", () => {
  it("parses a small JSON object", async () => {
    const req = Readable.from([Buffer.from('{"goal":"x"}')]);
    const body = await readJsonBody(req);
    assert.deepEqual(body, { goal: "x" });
  });

  it("rejects oversized bodies", async () => {
    const req = Readable.from([Buffer.alloc(100, 0x61)]);
    await assert.rejects(() => readJsonBody(req, 50), BodyTooLargeError);
  });
});

describe("parseCreateRunBody", () => {
  it("requires a non-empty goal string", () => {
    assert.deepEqual(parseCreateRunBody({}), { error: "goal (string) is required" });
    assert.deepEqual(parseCreateRunBody({ goal: "  " }), {
      error: "goal must not be empty",
    });
  });

  it("accepts goal and optional metadata", () => {
    assert.deepEqual(parseCreateRunBody({ goal: "do thing", metadata: { a: 1 } }), {
      goal: "do thing",
      metadata: { a: 1 },
    });
  });

  it("rejects oversized goals and bad metadata", () => {
    assert.equal(
      "error" in parseCreateRunBody({ goal: "x".repeat(100) }, 10),
      true,
    );
    assert.deepEqual(parseCreateRunBody({ goal: "ok", metadata: [] }), {
      error: "metadata must be a JSON object",
    });
  });
});
