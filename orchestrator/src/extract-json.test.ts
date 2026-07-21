import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractJson } from "./json.js";

describe("extractJson", () => {
  it("parses raw JSON", () => {
    assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  });

  it("extracts JSON embedded in prose", () => {
    assert.deepEqual(extractJson('Sure.\n{"tasks":[{"id":"t1"}]}\n'), {
      tasks: [{ id: "t1" }],
    });
  });

  it("throws when no JSON object is present", () => {
    assert.throws(() => extractJson("nope"), /Could not parse JSON/);
  });
});
