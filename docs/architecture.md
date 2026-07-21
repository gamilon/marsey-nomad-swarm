# Architecture — lab agent swarm

Single-node lab on bare metal (Nomad CE + host Ollama). No paid model APIs. Cloud/HVD Nomad is out of scope for this phase.

## Roles (generic)

| Role | Responsibility |
|------|----------------|
| **Orchestrator** | HTTP control plane: accept a goal, own run lifecycle/state, invoke planner then workers |
| **Planner** | Decompose a goal into tasks (LLM role via Ollama; no domain baked into the API) |
| **Worker** | Execute one task description; return a handoff (phase 1: in-process; later: Nomad allocs) |

Domain-specific behavior (coding, research, ops, …) is added later via prompts, tools, or worker images — not via orchestrator API fields.

## Runtime layout

```text
┌─────────────────────────────────────────────────────────┐
│  Bare-metal host (e.g. GEEKOM)                          │
│                                                         │
│  Ollama (systemd) ─────── :11434                        │
│       ▲                                                 │
│       │ HTTP                                            │
│  Nomad client/server                                    │
│       │                                                 │
│       └── orchestrator job (Docker)                     │
│             POST /v1/runs  GET /v1/runs/:id  GET /health│
└─────────────────────────────────────────────────────────┘
```

- **Ollama** runs on the **host** (not a Nomad job) for simple device/model/memory handling.
- **Orchestrator** is a Nomad `service` job using the Docker driver; it calls Ollama at `OLLAMA_HOST` (Docker bridge to the host, typically `http://172.17.0.1:11434`).

## API (phase 1)

- `GET /health` — liveness
- `POST /v1/runs` — body `{ "goal": string, "metadata"?: object }` → `{ "id": string }`
- `GET /v1/runs/:id` — status, plan tasks, worker handoffs

## Phase 2 (not implemented yet)

- Workers as separate Nomad jobs
- Purpose-specific worker images
- Optional Ollama-as-Nomad-job on multi-node clusters

## Related paths

- Lab Nomad: [`lab/nomad/`](../lab/nomad/)
- Host Ollama: [`lab/ollama/`](../lab/ollama/)
- Orchestrator app: [`orchestrator/`](../orchestrator/)
- Nomad job: [`nomad-jobs/orchestrator.nomad.hcl`](../nomad-jobs/orchestrator.nomad.hcl)
