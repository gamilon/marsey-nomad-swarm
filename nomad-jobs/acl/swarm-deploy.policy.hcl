# Least-privilege deploy token for the swarm namespace.
# Apply after creating the namespace:
#   nomad acl policy apply -description "swarm deploy" swarm-deploy nomad-jobs/acl/swarm-deploy.policy.hcl

namespace "swarm" {
  policy       = "write"
  capabilities = [
    "submit-job",
    "dispatch-job",
    "read-logs",
    "read-fs",
    "alloc-lifecycle",
    "list-jobs",
    "read-job",
    "scale-job",
  ]
}

node {
  policy = "read"
}

agent {
  policy = "read"
}

host_volume "orchestrator_runs" {
  policy = "write"
}
