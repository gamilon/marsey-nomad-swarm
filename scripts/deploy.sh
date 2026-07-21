#!/usr/bin/env bash
# Build the orchestrator image on this host and submit the lab Nomad job.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${IMAGE:-swarm-orchestrator:local}"
JOBSPEC="${JOBSPEC:-$ROOT/nomad-jobs/orchestrator.nomad.hcl}"

echo "Building ${IMAGE}..."
docker build -t "${IMAGE}" "${ROOT}/orchestrator"

echo "Submitting ${JOBSPEC}..."
nomad job run "${JOBSPEC}"

echo "Done. Check status with: nomad job status orchestrator"
