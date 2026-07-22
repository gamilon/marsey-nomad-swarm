# Lab observability (Loki + Grafana + Prometheus + Alloy)

Containerized stack beside Nomad (not a Nomad job — so metrics/logs stay up if Nomad is unhealthy). TLS on `*.marsey.tel`, Grafana login, edge basic auth for Loki/Prometheus APIs, Loki tenant **`marsey`**.

| URL | Auth |
|-----|------|
| https://grafana.marsey.tel | Grafana admin user/password |
| https://loki.marsey.tel | nginx basic auth (+ tenant `marsey`) |
| https://prometheus.marsey.tel | nginx basic auth |

MinIO, Alloy UI, and raw Loki/Prometheus ports are **not** published to the host.

## Prerequisites

- Docker + Compose plugin; `systemctl enable --now docker`
- Nomad lab with TLS (`*.marsey.tel`) and ACLs ([`lab/nomad`](../nomad/))
- Hostnames (DNS or `/etc/hosts`) for `grafana.marsey.tel`, `loki.marsey.tel`, `prometheus.marsey.tel` → lab LAN IP
- Browser trusts the same CA as Nomad (`ca.pem`)

## Install (suggested: `/opt/observability`)

```bash
sudo mkdir -p /opt/observability
sudo rsync -a --exclude '.data' ./ /opt/observability/
cd /opt/observability
```

Or run from the repo checkout: `cd lab/observability`.

### 1. TLS certs (copy, do not bind-mount Nomad’s dir)

```bash
sudo cp /etc/nomad.d/tls/ca.pem \
        /etc/nomad.d/tls/cert.pem \
        /etc/nomad.d/tls/cert-key.pem \
        ./tls/
sudo chown "$USER:$USER" tls/*.pem
chmod 0644 tls/ca.pem tls/cert.pem
chmod 0600 tls/cert-key.pem
```

See [`tls/README.md`](tls/README.md).

### 2. Secrets / env

```bash
cp observability.env.example .env
# Edit .env: Grafana password, MinIO password, NOMAD_TOKEN (below)
```

Compose interpolates `${…}` from **`.env`** in this directory.

### 3. Edge basic auth (Loki + Prometheus)

```bash
cp nginx/htpasswd.example nginx/htpasswd
# Or generate your own:
# docker run --rm httpd:2.4-alpine htpasswd -nbB lab 'your-password' > nginx/htpasswd
```

Example file password is `change-me-edge` (user `lab`). Change it.

### 4. Nomad metrics token

Copy updated [`lab/nomad/nomad.hcl`](../nomad/nomad.hcl) (includes `telemetry {}`) to the host and restart Nomad, then:

```bash
export NOMAD_ADDR=https://nomad.marsey.tel:4646
export NOMAD_CACERT=/etc/nomad.d/tls/ca.pem
export NOMAD_TOKEN=<management-token>

nomad acl policy apply -description "Observability metrics" \
  observability-metrics ./nomad/observability-metrics.policy.hcl

nomad acl token create -name=observability-metrics -policy=observability-metrics
# Put Secret ID into .env as NOMAD_TOKEN=...
```

### 5. Start

```bash
# Disable host systemd Alloy if it was installed — Compose Alloy owns log shipping
sudo systemctl disable --now alloy 2>/dev/null || true

docker compose up -d
docker compose ps
```

### 6. Survive reboot

```bash
sudo systemctl enable docker

# Optional belt-and-suspenders (install path must be /opt/observability):
sudo cp observability.service /etc/systemd/system/observability.service
sudo systemctl daemon-reload
sudo systemctl enable --now observability
```

Every Compose service uses `restart: unless-stopped`, so containers return after reboot once Docker is up.

## Verify

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' https://grafana.marsey.tel/api/health
curl -fsS -u lab:change-me-edge https://loki.marsey.tel/
curl -fsS -u lab:change-me-edge https://prometheus.marsey.tel/-/ready

# LogQL in Grafana Explore (Loki datasource, tenant marsey)
# {job="nomad-logs", nomad_task="orchestrator"}
# {job="ollama-logs"}
# {job="nomad-ops"}
```

Prometheus targets: Status → Targets (via https://prometheus.marsey.tel or Grafana).

## Layout

| Path | Purpose |
|------|---------|
| `docker-compose.yml` | Stack (`name: marsey-observability`) |
| `loki-config.yaml` | Simple-scalable Loki + retention 14d + `auth_enabled` |
| `alloy/config.alloy` | Alloc + journal → Loki tenant `marsey` |
| `nginx/nginx.conf` | TLS SNI + internal `:3100` Loki gateway |
| `grafana/provisioning/` | Loki + Prometheus datasources |
| `prometheus/prometheus.yml` | Scrapes + Nomad |
| `observability.env.example` | Secret placeholders → copy to `.env` |
| `observability.service` | Optional systemd helper |

## Alloy (Compose)

Replaces host [`lab/alloy`](../alloy/) for this lab. Pipelines: `nomad-logs`, `ollama-logs`, `nomad-ops`. Push URL is internal `http://gateway:3100` with `tenant_id = "marsey"`.

Bind mounts: `/opt/nomad/data/alloc`, journal dirs, `/etc/machine-id`. Alloy runs as root in the container for journal access.

## Lab hardening notes

- Image tags are pinned (not `:latest`).
- Loki retention 14d; Prometheus TSDB 15d.
- Compose memory/CPU limits on heavy services.
- Grafana: anonymous off, secure cookies, `GF_SERVER_ROOT_URL=https://grafana.marsey.tel`.
- `.gitignore`: `.env`, `htpasswd`, `tls/*.pem`, `.data/`.

### Docker log rotation (host)

Avoid filling the root disk with container stdout. Example `/etc/docker/daemon.json`:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "3"
  }
}
```

Then `sudo systemctl restart docker`.

## Migration from `/opt/loki` + host Alloy

1. `docker compose -f /opt/loki/docker-compose.yml down` (or stop that stack).
2. Install this stack as above (new tenant `marsey` — old `tenant1` data is not visible).
3. `sudo systemctl disable --now alloy` if the host unit was enabled.
4. Point bookmarks at `https://grafana.marsey.tel`.
