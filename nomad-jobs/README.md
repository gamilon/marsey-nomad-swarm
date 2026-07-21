# Orchestrator Nomad job

Phase-1 control plane job. Image is built locally on the Nomad host; Ollama stays on the host. The default jobspec targets the **lab CE** path (`datacenters = ["lab"]`, no namespace) and does not require Enterprise.

## Prerequisites

1. [Host Ollama](../lab/ollama/README.md) installed, model pulled, `OLLAMA_HOST=0.0.0.0:11434`
2. Nomad lab cluster up ([lab/nomad](../lab/nomad/)) with deploy ACL token
3. Docker on the Nomad host

## Host volume for run state

On the Nomad **client** host:

```bash
sudo mkdir -p /opt/nomad/host_volumes/orchestrator_runs
# Match node image USER (uid/gid 1000) so the task can write run state
sudo chown -R 1000:1000 /opt/nomad/host_volumes/orchestrator_runs
```

Add to `/etc/nomad.d/nomad.hcl` (client stanza) and restart Nomad:

```hcl
client {
  enabled = true

  host_volume "orchestrator_runs" {
    path      = "/opt/nomad/host_volumes/orchestrator_runs"
    read_only = false
  }
}
```

(Merge with your existing `client` block — do not duplicate `client { }`.)

## Build and run (lab default)

```bash
# From repo root
./scripts/deploy.sh

# Or manually:
cd orchestrator
docker build -t swarm-orchestrator:local .

export NOMAD_ADDR=https://nomad.marsey.tel:4646
export NOMAD_CACERT=/etc/nomad.d/tls/ca.pem
export NOMAD_TOKEN=<lab-deploy Secret ID>

nomad job run ../nomad-jobs/orchestrator.nomad.hcl
nomad status orchestrator
```

Dynamic port is in `nomad status` / UI. Example:

```bash
# replace HOST:PORT with allocation address
curl -s http://HOST:PORT/livez
curl -s http://HOST:PORT/readyz
curl -s -X POST http://HOST:PORT/v1/runs \
  -H 'content-type: application/json' \
  -d '{"goal":"List three reasons to run models on-prem"}'
```

Nomad checks `/livez` (process up). Use `/readyz` (or `/health`) to see LLM connectivity. If readiness is degraded, check Ollama listen address and `172.17.0.1:11434` from a test container (see lab/ollama README).

## Optional: `swarm` namespace + ACLs

Not required for the lab default path. When you want isolation (Enterprise or CE with namespaces):

```bash
nomad namespace apply nomad-jobs/namespace.swarm.hcl
nomad acl policy apply -description "swarm deploy" swarm-deploy nomad-jobs/acl/swarm-deploy.policy.hcl
nomad acl policy apply -description "swarm readonly" swarm-readonly nomad-jobs/acl/swarm-readonly.policy.hcl
# create tokens bound to those policies, then:
export NOMAD_NAMESPACE=swarm
# add namespace = "swarm" to the job (or: nomad job run -namespace=swarm ...)
```

Cluster bootstrap / Terraform for Nomad Enterprise is out of this repo.
