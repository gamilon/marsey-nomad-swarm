import http from "node:http";
import { isRunId } from "./ids.js";
import {
  BodyTooLargeError,
  parseCreateRunBody,
  readJsonBody,
} from "./http.js";
import { createLlmClient, resolveLlmConfig } from "./llm/index.js";
import { logError, logInfo } from "./log.js";
import { CancelNotAllowedError, CapacityError, Runner } from "./runner.js";
import { RunStore } from "./store.js";

const port = Number(process.env.PORT ?? "8080");
const dataDir = process.env.DATA_DIR ?? "/data/runs";
const maxConcurrent = Math.max(1, Number(process.env.MAX_CONCURRENT_RUNS ?? "2"));

const llmConfig = resolveLlmConfig();
const store = new RunStore(dataDir);
const llm = createLlmClient(llmConfig);
const runner = new Runner(store, llm, maxConcurrent);

function send(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function shouldLogHttp(pathname: string): boolean {
  return pathname !== "/livez" && pathname !== "/readyz" && pathname !== "/health";
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  let pathname = "/";
  let statusCode = 500;

  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    pathname = url.pathname;

    if (req.method === "GET" && url.pathname === "/livez") {
      statusCode = 200;
      send(res, statusCode, { status: "ok" });
      return;
    }

    if (
      req.method === "GET" &&
      (url.pathname === "/readyz" || url.pathname === "/health")
    ) {
      const llmOk = await llm.healthy();
      statusCode = llmOk ? 200 : 503;
      send(res, statusCode, {
        status: llmOk ? "ok" : "degraded",
        llm: llmOk,
        provider: llmConfig.provider,
        model: llm.modelId,
        activeRuns: runner.activeRuns,
        maxConcurrentRuns: runner.maxConcurrentRuns,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/v1/runs") {
      const limitRaw = url.searchParams.get("limit");
      const limit = limitRaw ? Number(limitRaw) : 50;
      if (!Number.isFinite(limit) || limit < 1 || limit > 200) {
        statusCode = 400;
        send(res, statusCode, { error: "limit must be between 1 and 200" });
        return;
      }
      const runs = await store.listSummaries(limit);
      statusCode = 200;
      send(res, statusCode, { runs });
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/runs") {
      const raw = await readJsonBody(req);
      const parsed = parseCreateRunBody(raw);
      if ("error" in parsed) {
        statusCode = 400;
        send(res, statusCode, { error: parsed.error });
        return;
      }
      try {
        const run = await runner.create(parsed.goal, parsed.metadata);
        statusCode = 202;
        send(res, statusCode, { id: run.id, status: run.status });
      } catch (err: unknown) {
        if (err instanceof CapacityError) {
          statusCode = 429;
          send(res, statusCode, { error: "too many concurrent runs" });
          return;
        }
        throw err;
      }
      return;
    }

    const cancelMatch = url.pathname.match(/^\/v1\/runs\/([^/]+)\/cancel$/);
    if (req.method === "POST" && cancelMatch) {
      const id = cancelMatch[1];
      if (!isRunId(id)) {
        statusCode = 400;
        send(res, statusCode, { error: "invalid run id" });
        return;
      }
      try {
        const run = await runner.cancel(id);
        statusCode = 200;
        send(res, statusCode, { id: run.id, status: run.status });
      } catch (err: unknown) {
        if (err instanceof CancelNotAllowedError) {
          statusCode = err.message === "run not found" ? 404 : 409;
          send(res, statusCode, { error: err.message });
          return;
        }
        throw err;
      }
      return;
    }

    const runMatch = url.pathname.match(/^\/v1\/runs\/([^/]+)$/);
    if (req.method === "GET" && runMatch) {
      const id = runMatch[1];
      if (!isRunId(id)) {
        statusCode = 400;
        send(res, statusCode, { error: "invalid run id" });
        return;
      }
      const run = await store.get(id);
      if (!run) {
        statusCode = 404;
        send(res, statusCode, { error: "run not found" });
        return;
      }
      statusCode = 200;
      send(res, statusCode, run);
      return;
    }

    statusCode = 404;
    send(res, statusCode, { error: "not found" });
  } catch (err: unknown) {
    if (err instanceof BodyTooLargeError) {
      statusCode = 413;
      send(res, statusCode, { error: "request body too large" });
      return;
    }
    if (err instanceof SyntaxError) {
      statusCode = 400;
      send(res, statusCode, { error: "invalid JSON" });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    logError("http.error", {
      method: req.method ?? "GET",
      path: pathname,
      error: message.slice(0, 200),
    });
    statusCode = 500;
    send(res, statusCode, { error: "internal server error" });
  } finally {
    if (shouldLogHttp(pathname)) {
      logInfo("http.request", {
        method: req.method ?? "GET",
        path: pathname,
        status: statusCode,
        durationMs: Date.now() - started,
      });
    }
  }
});

await store.init();
server.listen(port, () => {
  logInfo("startup", {
    port,
    provider: llmConfig.provider,
    baseUrl: llmConfig.baseUrl,
    model: llmConfig.model,
    timeoutMs: llmConfig.timeoutMs,
    maxRetries: llmConfig.maxRetries,
    maxConcurrent,
    dataDir,
  });
});
