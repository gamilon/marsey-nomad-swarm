# Host Ollama (lab)

Run **Ollama on the bare-metal host** under systemd — not as a Nomad job. The orchestrator Nomad allocation reaches it over the Docker bridge.

## Install

```bash
curl -fsSL https://ollama.com/install.sh | sh
sudo systemctl enable --now ollama
```

Confirm:

```bash
curl -s http://127.0.0.1:11434/api/tags
```

## Model (32GB RAM lab default)

Pull a general model (not domain-specific):

```bash
ollama pull llama3.1:8b
```

Set the same name in the orchestrator job env `OLLAMA_MODEL` (default `llama3.1:8b`).

## Listen address (Docker → host)

By default Ollama binds to `127.0.0.1`, which **containers cannot reach**. For Nomad Docker jobs on the same host, listen on all interfaces or at least the docker0 bridge:

```bash
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/override.conf <<'EOF'
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
EOF
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

Restrict with a host firewall if the machine is on an untrusted network (allow `11434/tcp` only from Docker bridge / localhost).

Orchestrator job default: `OLLAMA_HOST=http://172.17.0.1:11434` (docker0 gateway to the host). If your docker0 CIDR differs, adjust:

```bash
ip -4 addr show docker0
```

## Verify from a container

```bash
docker run --rm curlimages/curl:8.5.0 \
  -s "http://172.17.0.1:11434/api/tags"
```

## Why host, not Nomad?

See [docs/architecture.md](../../docs/architecture.md). Short version: simpler device/model/memory on a single node; revisit packaging Ollama as a Nomad job when you have multiple clients.
