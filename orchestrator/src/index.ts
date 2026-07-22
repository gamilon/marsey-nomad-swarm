import http from "node:http";
import { isRunId } from "./ids.js";
import {
  BodyTooLargeError,
  parseCreateRunBody,
  readJsonBody,
} from "./http.js";
import { createLlmClient, resolveLlmConfig } from "./llm/index.js";
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

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "GET" && url.pathname === "/livez") {
      send(res, 200, { status: "ok" });
      return;
    }

    if (
      req.method === "GET" &&
      (url.pathname === "/readyz" || url.pathname === "/health")
    ) {
      const llmOk = await llm.healthy();
      send(res, llmOk ? 200 : 503, {
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
        send(res, 400, { error: "limit must be between 1 and 200" });
        return;
      }
      const runs = await store.listSummaries(limit);
      send(res, 200, { runs });
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/runs") {
      const raw = await readJsonBody(req);
      const parsed = parseCreateRunBody(raw);
      if ("error" in parsed) {
        send(res, 400, { error: parsed.error });
        return;
      }
      try {
        const run = await runner.create(parsed.goal, parsed.metadata);
        send(res, 202, { id: run.id, status: run.status });
      } catch (err: unknown) {
        if (err instanceof CapacityError) {
          send(res, 429, { error: "too many concurrent runs" });
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
        send(res, 400, { error: "invalid run id" });
        return;
      }
      try {
        const run = await runner.cancel(id);
        send(res, 200, { id: run.id, status: run.status });
      } catch (err: unknown) {
        if (err instanceof CancelNotAllowedError) {
          const status = err.message === "run not found" ? 404 : 409;
          send(res, status, { error: err.message });
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
        send(res, 400, { error: "invalid run id" });
        return;
      }
      const run = await store.get(id);
      if (!run) {
        send(res, 404, { error: "run not found" });
        return;
      }
      send(res, 200, run);
      return;
    }

    send(res, 404, { error: "not found" });
  } catch (err: unknown) {
    if (err instanceof BodyTooLargeError) {
      send(res, 413, { error: "request body too large" });
      return;
    }
    if (err instanceof SyntaxError) {
      send(res, 400, { error: "invalid JSON" });
      return;
    }
    console.error("request failed", err);
    send(res, 500, { error: "internal server error" });
  }
});

await store.init();
server.listen(port, () => {
  console.log(
    `orchestrator listening on :${port} provider=${llmConfig.provider} ` +
      `base=${llmConfig.baseUrl} model=${llmConfig.model} ` +
      `timeoutMs=${llmConfig.timeoutMs} maxRetries=${llmConfig.maxRetries} ` +
      `maxConcurrent=${maxConcurrent} data=${dataDir}`,
  );
});
