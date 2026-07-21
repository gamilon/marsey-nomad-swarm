# marsey-nomad-swarm

Lab agent swarm on bare-metal **Nomad CE** with host **Ollama** (no paid model APIs).

## Layout

| Path | Purpose |
|------|---------|
| [`lab/nomad/`](lab/nomad/) | Single-node Nomad config, systemd unit, ACL policies |
| [`lab/ollama/`](lab/ollama/) | Host Ollama install and Docker→host wiring |
| [`orchestrator/`](orchestrator/) | TypeScript control plane (planner → workers via Ollama) |
| [`nomad-jobs/`](nomad-jobs/) | Nomad jobspec for the orchestrator |
| [`docs/architecture.md`](docs/architecture.md) | Swarm roles and runtime layout |

## Quick path

1. Install Nomad — [`lab/nomad/README.md`](lab/nomad/README.md)
2. Install Ollama — [`lab/ollama/README.md`](lab/ollama/README.md)
3. Build & run orchestrator — [`nomad-jobs/README.md`](nomad-jobs/README.md)

Nomad cluster provisioning on AWS (Terraform/HVD) is intentionally out of this repo.
