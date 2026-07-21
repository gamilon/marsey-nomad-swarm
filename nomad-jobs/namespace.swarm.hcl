# Optional namespace for swarm workloads.
# Lab CE default path does not require this — apply when using namespaced ACLs
# (Enterprise or CE with namespaces enabled).
#
#   nomad namespace apply nomad-jobs/namespace.swarm.hcl
#
# Then submit with: NOMAD_NAMESPACE=swarm nomad job run ...
# (and set namespace = "swarm" on the job, or use -namespace).

name        = "swarm"
description = "Agent swarm orchestrator and workers"
