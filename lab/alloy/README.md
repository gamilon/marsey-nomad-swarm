# Lab Alloy (host log shipper → Loki)

Runs **Grafana Alloy on the bare-metal lab host** under systemd — same pattern as [Nomad](../nomad/) and [Ollama](../ollama/). One agent, three pipelines:

| Pipeline (Loki `job`) | Source |
|------------------------|--------|
| `nomad-logs` | Nomad alloc files under `/opt/nomad/data/alloc/*/alloc/logs/` |
| `ollama-logs` | journald `_SYSTEMD_UNIT=ollama.service` |
| `nomad-ops` | journald `_SYSTEMD_UNIT=nomad.service` |

No Loki auth. Default push URL: `http://192.168.0.100:3100/loki/api/v1/push`.

## Prerequisites

- Nomad lab installed ([lab/nomad](../nomad/)) so alloc logs exist under `/opt/nomad/data`
- Ollama optional but expected for `ollama-logs` ([lab/ollama](../ollama/))
- Loki reachable at the URL in `alloy.env` (lab: `192.168.0.100:3100`)

## Install Alloy package

Debian/Ubuntu:

```bash
sudo mkdir -p /etc/apt/keyrings
sudo wget -q -O /etc/apt/keyrings/grafana.asc https://apt.grafana.com/gpg-full.key
sudo chmod 644 /etc/apt/keyrings/grafana.asc
echo "deb [signed-by=/etc/apt/keyrings/grafana.asc] https://apt.grafana.com stable main" | sudo tee /etc/apt/sources.list.d/grafana.list
sudo apt-get update
sudo apt-get install -y alloy
```

The package creates an `alloy` user and `/usr/bin/alloy`. Disable the package unit if you use this repo’s unit instead:

```bash
sudo systemctl disable --now alloy
```

## Configure and enable (this repo’s unit)

From this directory:

```bash
# Service account + groups (package may already create alloy)
sudo groupadd --system alloy 2>/dev/null || true
sudo useradd --system \
  --gid alloy \
  --home-dir /var/lib/alloy \
  --no-create-home \
  --shell /usr/sbin/nologin \
  --comment "Grafana Alloy" \
  alloy 2>/dev/null || true

# Read Nomad alloc trees + systemd journal
sudo usermod -aG nomad,systemd-journal alloy

# Ensure Nomad data is group-traversable for alloy (nomad group)
sudo chmod g+rx /opt/nomad /opt/nomad/data /opt/nomad/data/alloc 2>/dev/null || true
# New alloc dirs inherit from Nomad; if alloy cannot read a path, fix ownership/mode on the host.

sudo mkdir -p /etc/alloy /var/lib/alloy/data
sudo cp config.alloy /etc/alloy/config.alloy
sudo cp alloy.env.example /etc/alloy/alloy.env
# Edit LOKI_URL in /etc/alloy/alloy.env if needed
sudo chown -R alloy:alloy /etc/alloy /var/lib/alloy
sudo chmod 0640 /etc/alloy/alloy.env /etc/alloy/config.alloy

sudo cp alloy.service /etc/systemd/system/alloy.service
sudo systemctl daemon-reload
sudo systemctl enable --now alloy
```

## Verify

```bash
systemctl status alloy
journalctl -u alloy -f

# Alloy HTTP (localhost only)
curl -s http://127.0.0.1:12345/-/ready
```

In Grafana/Loki Explore:

```logql
{job="nomad-logs", nomad_task="orchestrator"}
{job="nomad-logs", nomad_task="orchestrator", event="run.phase"}
{job="ollama-logs"}
{job="nomad-ops"}
```

### Labels (`nomad-logs`)

| Label | From |
|-------|------|
| `job` | static `nomad-logs` |
| `datacenter` | static `lab` |
| `nomad_alloc` | path alloc UUID |
| `nomad_task` | path task name |
| `stream` | `stdout` / `stderr` |
| `level`, `event` | JSON fields when the line is structured (orchestrator) |

## Files

| File | Dest on host |
|------|----------------|
| `config.alloy` | `/etc/alloy/config.alloy` |
| `alloy.env.example` | `/etc/alloy/alloy.env` |
| `alloy.service` | `/etc/systemd/system/alloy.service` |
