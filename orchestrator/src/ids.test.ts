import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isRunId } from "./ids.js";

describe("isRunId", () => {
  it("accepts a v4 UUID", () => {
    assert.equal(isRunId("550e8400-e29b-41d4-a716-446655440000"), true);
  });

  it("rejects path traversal and junk", () => {
    assert.equal(isRunId("../etc/passwd"), false);
    assert.equal(isRunId("not-a-uuid"), false);
    assert.equal(isRunId(""), false);
    assert.equal(isRunId("550e8400-e29b-41d4-a716-446655440000/extra"), false);
  });
});
