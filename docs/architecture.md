# Architecture — agent swarm

Control plane designed for a production Nomad Enterprise target. The **supported local run path** is a single-node Nomad CE lab + host Ollama (what is available for day-to-day testing). Cluster bootstrap / Terraform for Enterprise lives outside this repo.

## Roles (generic)

| Role | Responsibility |
|------|----------------|
| **Orchestrator** | HTTP control plane: accept a goal, own run lifecycle/state, invoke planner then workers |
| **Planner** | Decompose a goal into tasks (LLM role via `LlmClient`; no domain baked into the API) |
| **Worker** | Execute one task description; return a handoff (phase 1: in-process; later: Nomad allocs) |

Domain-specific behavior (coding, research, ops, …) is added later via prompts, tools, or worker images — not via orchestrator API fields.

## Runtime layout (lab)

```text
┌─────────────────────────────────────────────────────────┐
│  Bare-metal host                                        │
│                                                         │
│  Ollama (systemd) ─────── :11434                        │
│       ▲                                                 │
│       │ HTTP                                            │
│  Nomad CE (server+client)                               │
│       │                                                 │
│       └── orchestrator job (Docker)                     │
│             POST /v1/runs  GET /v1/runs/:id             │
│             GET /livez  GET /readyz (/health)           │
│             alloc logs → /opt/nomad/data/alloc/.../logs │
│                                                         │
│  Alloy (systemd)                                        │
│       ├── nomad-logs  (alloc files)                     │
│       ├── ollama-logs (journald ollama.service)         │
│       └── nomad-ops   (journald nomad.service)          │
│                 │                                       │
│                 └──► Loki :3100 (e.g. 192.168.0.100)    │
└─────────────────────────────────────────────────────────┘
```

- **Ollama** runs on the **host** (not a Nomad job) for simple device/model/memory handling.
- **Orchestrator** is a Nomad `service` job using the Docker driver; it calls the LLM at `LLM_BASE_URL` (aliases: `OLLAMA_HOST`), typically `http://172.17.0.1:11434` on the lab Docker bridge.
- **Alloy** runs on the **host** and ships alloc + journal logs to Loki. See [`lab/alloy/`](../lab/alloy/).

## LLM providers

The runner depends on a provider-agnostic `LlmClient` (`chat`, `healthy`, `modelId`).

| Env | Purpose |
|-----|---------|
| `LLM_PROVIDER` | Provider id (default `ollama`) |
| `LLM_BASE_URL` | Backend base URL |
| `LLM_MODEL` | Model name |
| `LLM_TIMEOUT_MS` | Per-request LLM timeout (default `120000`) |
| `LLM_MAX_RETRIES` | Retries after transient LLM failures (default `1`; timeouts/cancels are not retried) |
| `OLLAMA_HOST` / `OLLAMA_MODEL` | Deprecated aliases for base URL / model |
| `MAX_CONCURRENT_RUNS` | In-process concurrency cap (default `2`; excess `POST /v1/runs` → `429`) |

Only the Ollama adapter is implemented today; add adapters behind `createLlmClient` without changing the runner.

## API (phase 1)

- `GET /livez` — process liveness (Nomad health check; no auth)
- `GET /readyz` or `GET /health` — LLM readiness (`200` / `503`) plus `activeRuns` / `maxConcurrentRuns`
- `GET /v1/runs?limit=50` — newest-first run summaries (truncated goal)
- `POST /v1/runs` — body `{ "goal": string, "metadata"?: object }` → `202 { "id", "status" }`
- `GET /v1/runs/:id` — status, plan tasks, worker handoffs
- `POST /v1/runs/:id/cancel` — cancel `pending` / `planning` / `working` → `cancelled` (`409` if terminal)

Statuses: `pending` → `planning` → `working` → `completed` | `failed` | `cancelled`.

Request bodies are size-limited; run ids must be UUIDs. The API is **unauthenticated** today — trusted network / lab LAN only.

### Log structure

Every log line is one JSON object on stdout/stderr (Nomad alloc logs). Schema:

| Field | Meaning |
|-------|---------|
| `ts` | ISO-8601 timestamp |
| `level` | `debug` \| `info` \| `warn` \| `error` (`LOG_LEVEL`, default `info`) |
| `event` | Stable event name (see below) |
| … | Event-specific fields (never goals, handoffs, or request bodies) |

| Event | When | Extra fields |
|-------|------|----------------|
| `startup` | Process listen | `port`, `provider`, `baseUrl`, `model`, `timeoutMs`, `maxRetries`, `maxConcurrent`, `dataDir` |
| `http.request` | API call finished (skips `/livez`, `/readyz`, `/health`) | `method`, `path`, `status`, `durationMs` |
| `http.error` | Unhandled handler error | `method`, `path`, `error` (truncated) |
| `run.phase` | Run lifecycle | `runId`, `phase`, optional `taskId`, `taskCount`, `error` |

Example: `nomad alloc logs <id> | jq -c 'select(.event=="run.phase")'`

With Alloy → Loki ([`lab/alloy/`](../lab/alloy/)): `{job="nomad-logs", nomad_task="orchestrator", event="run.phase"}`.

## Security notes (current)

| Area | Status |
|------|--------|
| App auth | None — see roadmap below |
| Body size / goal length | Capped |
| Concurrent runs | Capped (`MAX_CONCURRENT_RUNS`) |
| Run id / filesystem | UUID-validated |
| Client errors | Generic `500`; details logged server-side |
| Prompt injection | Goals are untrusted text; no tools/shell yet |

## Roadmap — Phase 1.5: secure the API

Not implemented yet. Intended sequence:

1. **Bearer / API token** (`ORCHESTRATOR_API_TOKEN` from Nomad variables or Vault) required on `/v1/runs*`; keep `/livez` open for checks
2. **Edge TLS** at the existing Enterprise gateway registered to the Nomad service
3. **Per-token rate limits / quotas** on top of in-process concurrency
4. **Later:** mTLS, OIDC, per-tenant isolation

## Nomad namespace / ACLs (optional)

Lab default job uses the `default` namespace and remains runnable without extra setup. Optional artifacts for namespaced deploy (Enterprise or CE with namespaces):

- [`nomad-jobs/namespace.swarm.hcl`](../nomad-jobs/namespace.swarm.hcl)
- [`nomad-jobs/acl/swarm-deploy.policy.hcl`](../nomad-jobs/acl/swarm-deploy.policy.hcl)
- [`nomad-jobs/acl/swarm-readonly.policy.hcl`](../nomad-jobs/acl/swarm-readonly.policy.hcl)

See [`nomad-jobs/README.md`](../nomad-jobs/README.md).

## Phase 2 (not implemented yet)

- Workers as separate Nomad jobs
- Purpose-specific worker images
- Optional LLM backend as a Nomad job

## Related paths

- Lab Nomad: [`lab/nomad/`](../lab/nomad/)
- Host Ollama: [`lab/ollama/`](../lab/ollama/)
- Host Alloy → Loki: [`lab/alloy/`](../lab/alloy/)
- Orchestrator app: [`orchestrator/`](../orchestrator/)
- Nomad job: [`nomad-jobs/orchestrator.nomad.hcl`](../nomad-jobs/orchestrator.nomad.hcl)
