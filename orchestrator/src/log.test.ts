import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getLogLevel, log, setLogLevel } from "./log.js";

describe("log", () => {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  let lines: string[];

  function capture(): void {
    lines = [];
    console.log = (msg?: unknown) => {
      lines.push(String(msg));
    };
    console.warn = (msg?: unknown) => {
      lines.push(String(msg));
    };
    console.error = (msg?: unknown) => {
      lines.push(String(msg));
    };
  }

  afterEach(() => {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
    setLogLevel("info");
  });

  it("emits JSON with ts, level, event, and fields", () => {
    capture();
    log("info", "run.phase", { runId: "abc", phase: "planning" });
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]) as Record<string, unknown>;
    assert.equal(parsed.level, "info");
    assert.equal(parsed.event, "run.phase");
    assert.equal(parsed.runId, "abc");
    assert.equal(parsed.phase, "planning");
    assert.equal(typeof parsed.ts, "string");
  });

  it("omits nullish fields", () => {
    capture();
    log("info", "test", { keep: 1, drop: undefined, also: null });
    const parsed = JSON.parse(lines[0]) as Record<string, unknown>;
    assert.equal(parsed.keep, 1);
    assert.equal("drop" in parsed, false);
    assert.equal("also" in parsed, false);
  });

  it("respects LOG_LEVEL / setLogLevel", () => {
    capture();
    setLogLevel("warn");
    assert.equal(getLogLevel(), "warn");
    log("info", "hidden");
    log("warn", "visible");
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).event, "visible");
  });

  it("writes errors to console.error", () => {
    capture();
    log("error", "http.error", { status: 500 });
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).level, "error");
  });
});
