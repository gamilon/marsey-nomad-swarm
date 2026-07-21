# Lab Nomad CE (single node, bare metal)

Local **test cluster** for this repo: Nomad Community Edition on a **bare-metal** lab host — one machine runs both **server** and **client** (`bootstrap_expect = 1`). Runs as a dedicated `nomad` user (not root). TLS required (self-signed CA + cert). Production Nomad Enterprise bootstrap is out of this repo.

## Prerequisites

- Bare-metal Linux host with systemd
- Nomad CE binary at `/usr/local/bin/nomad`
- Docker installed if you use the Docker task driver (unit expects the `docker` group)
- TLS materials: `ca.pem`, `cert.pem`, `cert-key.pem` (cert SAN should match the host name or LAN IP you use in the browser)

## Install

```bash
# System group + service account (no login shell, no password)
sudo groupadd --system nomad
sudo useradd --system \
  --gid nomad \
  --home-dir /opt/nomad \
  --no-create-home \
  --shell /usr/sbin/nologin \
  --comment "HashiCorp Nomad service account" \
  nomad

# Data + config owned by nomad; not world-writable
sudo mkdir -p /opt/nomad/data /etc/nomad.d/tls
sudo cp nomad.hcl /etc/nomad.d/nomad.hcl
sudo cp ca.pem cert.pem cert-key.pem /etc/nomad.d/tls/
sudo chown -R nomad:nomad /opt/nomad /etc/nomad.d
sudo chmod 0750 /opt/nomad /opt/nomad/data /etc/nomad.d /etc/nomad.d/tls
sudo chmod 0640 /etc/nomad.d/nomad.hcl /etc/nomad.d/tls/ca.pem /etc/nomad.d/tls/cert.pem
sudo chmod 0600 /etc/nomad.d/tls/cert-key.pem

sudo cp nomad.service /etc/systemd/system/nomad.service
sudo systemctl daemon-reload
sudo systemctl enable --now nomad
```

The unit sets `SupplementaryGroups=docker` so Nomad can use `/var/run/docker.sock` without running as root. That group is effectively root-equivalent — fine for a lab box; do not treat it as a hard security boundary.

`advertise` uses `nomad.marsey.tel` so it matches the TLS cert SAN `*.marsey.tel`. Point that name (DNS or `/etc/hosts`) at the lab host’s LAN IP.

## Verify

```bash
export NOMAD_ADDR=https://nomad.marsey.tel:4646
export NOMAD_CACERT=/etc/nomad.d/tls/ca.pem

systemctl status nomad
nomad node status
nomad server members
```

UI: `https://nomad.marsey.tel:4646` (trust/import `ca.pem` in the browser).

## Existing install (enable TLS)

```bash
sudo mkdir -p /etc/nomad.d/tls
sudo cp ca.pem cert.pem cert-key.pem /etc/nomad.d/tls/
sudo cp nomad.hcl /etc/nomad.d/nomad.hcl
sudo chown -R nomad:nomad /etc/nomad.d
sudo chmod 0640 /etc/nomad.d/tls/ca.pem /etc/nomad.d/tls/cert.pem
sudo chmod 0600 /etc/nomad.d/tls/cert-key.pem
sudo systemctl restart nomad
```

## ACLs (authentication)

ACLs are enabled in `nomad.hcl`. Bootstrap once (management token — keep offline):

```bash
export NOMAD_ADDR=https://nomad.marsey.tel:4646
export NOMAD_CACERT=/etc/nomad.d/tls/ca.pem
nomad acl bootstrap
export NOMAD_TOKEN=<bootstrap Secret ID>
```

### Day-to-day tokens (do this next)

From this repo’s `lab/nomad/acl/` directory, with `NOMAD_TOKEN` set to the bootstrap token:

```bash
# Deploy jobs / operate the default namespace
nomad acl policy apply -description "Lab deploy" deploy deploy.policy.hcl
nomad acl token create -name="lab-deploy" -policy=deploy -type=client

# Optional read-only
nomad acl policy apply -description "Lab read-only" readonly readonly.policy.hcl
nomad acl token create -name="lab-readonly" -policy=readonly -type=client
```

Use the **Secret ID** from `lab-deploy` for normal CLI/UI work:

```bash
export NOMAD_TOKEN=<lab-deploy Secret ID>
```

Reserve the bootstrap token for ACL changes only.

## Notes

- Binds on `0.0.0.0` so other lab machines can reach the API; tighten later if needed.
- HTTP and RPC are TLS; `verify_https_client` is off so you do not need a client cert for the UI.
- If hostname verification fails, confirm DNS/`/etc/hosts` for `nomad.marsey.tel` and that the cert SAN is `*.marsey.tel` (wildcards do not cover a bare IP).
- Service runs as `User=nomad` / `Group=nomad`; data dir, config, and TLS files must be readable by that user.
- Host volume `orchestrator_runs` is declared for the swarm orchestrator job; create the path before restarting:

```bash
sudo mkdir -p /opt/nomad/host_volumes/orchestrator_runs
sudo chown -R 1000:1000 /opt/nomad/host_volumes/orchestrator_runs
```

See also [lab/ollama](../ollama/) and [nomad-jobs](../../nomad-jobs/).
