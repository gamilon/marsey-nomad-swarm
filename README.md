# marsey-nomad-swarm

Agent swarm control plane. **Lab path:** bare-metal Nomad CE + host Ollama. Artifacts are shaped for Nomad Enterprise namespaces/ACLs when you have that cluster (external Terraform — not in this repo).

## Layout

| Path | Purpose |
|------|---------|
| [`lab/nomad/`](lab/nomad/) | Local Nomad CE config, systemd unit, ACL policies |
| [`lab/ollama/`](lab/ollama/) | Host Ollama install and Docker→host wiring |
| [`lab/observability/`](lab/observability/) | Loki + Grafana + Prometheus + Alloy (Compose, TLS) |
| [`lab/alloy/`](lab/alloy/) | Legacy host Alloy unit (prefer observability Compose) |
| [`orchestrator/`](orchestrator/) | TypeScript control plane (planner → workers via `LlmClient`) |
| [`nomad-jobs/`](nomad-jobs/) | Orchestrator jobspec + optional `swarm` namespace/ACLs |
| [`docs/architecture.md`](docs/architecture.md) | Roles, API, security roadmap, provider env |
| [`scripts/deploy.sh`](scripts/deploy.sh) | Build local image + `nomad job run` (lab) |

## Quick path

1. Install Nomad — [`lab/nomad/README.md`](lab/nomad/README.md)
2. Install Ollama — [`lab/ollama/README.md`](lab/ollama/README.md)
3. Build & run orchestrator — [`nomad-jobs/README.md`](nomad-jobs/README.md) or `./scripts/deploy.sh`
4. Optional: observability stack — [`lab/observability/README.md`](lab/observability/README.md)

## CI

GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs on pushes and PRs to `main`: `npm ci` / `npm test` / `npm run build` for the orchestrator, plus a Docker image build.
