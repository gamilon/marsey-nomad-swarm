import http from "node:http";
import { OllamaClient } from "./ollama.js";
import { Runner } from "./runner.js";
import { RunStore } from "./store.js";

const port = Number(process.env.PORT ?? "8080");
const dataDir = process.env.DATA_DIR ?? "/data/runs";
const ollamaHost = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
const ollamaModel = process.env.OLLAMA_MODEL ?? "llama3.1:8b";

const store = new RunStore(dataDir);
const ollama = new OllamaClient(ollamaHost, ollamaModel);
const runner = new Runner(store, ollama);

function send(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      const ollamaOk = await ollama.healthy();
      send(res, ollamaOk ? 200 : 503, {
        status: ollamaOk ? "ok" : "degraded",
        ollama: ollamaOk,
        model: ollamaModel,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/runs") {
      const body = (await readJson(req)) as {
        goal?: string;
        metadata?: Record<string, unknown>;
      };
      if (!body.goal || typeof body.goal !== "string") {
        send(res, 400, { error: "goal (string) is required" });
        return;
      }
      const run = await runner.create(body.goal, body.metadata ?? {});
      send(res, 202, { id: run.id, status: run.status });
      return;
    }

    const runMatch = url.pathname.match(/^\/v1\/runs\/([^/]+)$/);
    if (req.method === "GET" && runMatch) {
      const run = await store.get(runMatch[1]);
      if (!run) {
        send(res, 404, { error: "run not found" });
        return;
      }
      send(res, 200, run);
      return;
    }

    send(res, 404, { error: "not found" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    send(res, 500, { error: message });
  }
});

await store.init();
server.listen(port, () => {
  console.log(
    `orchestrator listening on :${port} ollama=${ollamaHost} model=${ollamaModel} data=${dataDir}`,
  );
});
