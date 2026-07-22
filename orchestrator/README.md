# Swarm orchestrator (phase 1)

Generic control plane: accept a goal, plan tasks via an `LlmClient` (Ollama adapter today), run workers in-process, expose run status.

## Local dev

```bash
cd orchestrator
npm install
export LLM_BASE_URL=http://127.0.0.1:11434   # or OLLAMA_HOST
export LLM_MODEL=llama3.1:8b                  # or OLLAMA_MODEL
export DATA_DIR=./data/runs
npm run dev
```

```bash
curl -s localhost:8080/livez
curl -s localhost:8080/readyz
curl -s -X POST localhost:8080/v1/runs \
  -H 'content-type: application/json' \
  -d '{"goal":"Summarize three benefits of local LLMs"}'
curl -s localhost:8080/v1/runs
curl -s localhost:8080/v1/runs/<id>
curl -s -X POST localhost:8080/v1/runs/<id>/cancel
```

## Tests / build

```bash
npm test
npm run build
```

## Env

| Variable | Default | Notes |
|----------|---------|-------|
| `PORT` | `8080` | Listen port |
| `DATA_DIR` | `/data/runs` | Run JSON store |
| `LLM_PROVIDER` | `ollama` | Only `ollama` implemented |
| `LLM_BASE_URL` | `http://127.0.0.1:11434` | Prefer over `OLLAMA_HOST` |
| `LLM_MODEL` | `llama3.1:8b` | Prefer over `OLLAMA_MODEL` |
| `LLM_TIMEOUT_MS` | `120000` | Per LLM request timeout |
| `LLM_MAX_RETRIES` | `1` | Transient failure retries |
| `OLLAMA_HOST` / `OLLAMA_MODEL` | — | Aliases for base URL / model |
| `MAX_CONCURRENT_RUNS` | `2` | In-flight runs; excess → `429` |

## Docker image (build on the Nomad host)

```bash
cd orchestrator
docker build -t swarm-orchestrator:local .
```

Or from repo root: [`scripts/deploy.sh`](../scripts/deploy.sh). See [`nomad-jobs/`](../nomad-jobs/) and [`docs/architecture.md`](../docs/architecture.md).
