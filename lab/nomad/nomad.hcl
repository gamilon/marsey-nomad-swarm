# Single-node Nomad CE on bare metal (server + client).
# Install the binary yourself; copy this file to /etc/nomad.d/nomad.hcl
#
# TLS cert SAN is *.marsey.tel — advertise/connect with a matching hostname
# (e.g. nomad.marsey.tel), not a raw IP.

datacenter = "lab"
data_dir   = "/opt/nomad/data"
bind_addr  = "0.0.0.0"

advertise {
  http = "nomad.marsey.tel"
  rpc  = "nomad.marsey.tel"
  # Serf can stay on the LAN IP
  serf = "{{ GetPrivateIP }}"
}

server {
  enabled          = true
  bootstrap_expect = 1
}

client {
  enabled = true

  host_volume "orchestrator_runs" {
    path      = "/opt/nomad/host_volumes/orchestrator_runs"
    read_only = false
  }
}

acl {
  enabled = true
}

tls {
  http = true
  rpc  = true

  ca_file   = "/etc/nomad.d/tls/ca.pem"
  cert_file = "/etc/nomad.d/tls/cert.pem"
  key_file  = "/etc/nomad.d/tls/cert-key.pem"

  verify_server_hostname = true
  # Lab: no client cert required for UI/CLI (set true for mTLS later).
  verify_https_client = false
}

ports {
  http = 4646
  rpc  = 4647
  serf = 4648
}

telemetry {
  collection_interval        = "10s"
  disable_hostname           = false
  prometheus_metrics         = true
  publish_allocation_metrics = true
  publish_node_metrics       = true
}
