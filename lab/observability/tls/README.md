# Copy TLS materials used for *.marsey.tel into this directory (do not commit *.pem).
#
# From the Nomad host (example):
#
#   sudo cp /etc/nomad.d/tls/ca.pem \
#           /etc/nomad.d/tls/cert.pem \
#           /etc/nomad.d/tls/cert-key.pem \
#           /path/to/marsey-nomad-swarm/lab/observability/tls/
#   sudo chown "$USER:$USER" ca.pem cert.pem cert-key.pem
#   chmod 0644 ca.pem cert.pem
#   chmod 0600 cert-key.pem
#
# Required files:
#   ca.pem         — CA (browser trust + Prometheus → Nomad scrape)
#   cert.pem       — leaf cert with SAN *.marsey.tel
#   cert-key.pem   — private key
#
# After copy, edge nginx mounts this directory read-only.
