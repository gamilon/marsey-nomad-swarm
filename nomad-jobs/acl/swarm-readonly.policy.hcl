# Read-only inspect token for the swarm namespace.
#   nomad acl policy apply -description "swarm readonly" swarm-readonly nomad-jobs/acl/swarm-readonly.policy.hcl

namespace "swarm" {
  policy       = "read"
  capabilities = [
    "list-jobs",
    "read-job",
    "read-logs",
    "read-fs",
  ]
}

node {
  policy = "read"
}

agent {
  policy = "read"
}
