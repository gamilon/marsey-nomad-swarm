# Minimal policy for Prometheus scrape of Nomad metrics.
# Apply once (management token):
#   nomad acl policy apply -description "Observability metrics scrape" observability-metrics ./observability-metrics.policy.hcl
#   nomad acl token create -name=observability-metrics -policy=observability-metrics
# Put the Secret ID in observability.env as NOMAD_TOKEN=...

namespace "default" {
  policy = "read"
}

agent {
  policy = "read"
}

node {
  policy = "read"
}

operator {
  policy = "read"
}
