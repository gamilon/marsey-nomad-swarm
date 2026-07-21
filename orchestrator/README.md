# Swarm orchestrator (phase 1)

Generic control plane: accept a goal, plan tasks via host Ollama, run workers in-process, expose run status.

## Local dev

```bash
cd orchestrator
npm install
export OLLAMA_HOST=http://127.0.0.1:11434
export OLLAMA_MODEL=llama3.1:8b
export DATA_DIR=./data/runs
npm run dev
```

```bash
curl -s localhost:8080/health
curl -s -X POST localhost:8080/v1/runs \
  -H 'content-type: application/json' \
  -d '{"goal":"Summarize three benefits of local LLMs"}'
curl -s localhost:8080/v1/runs/<id>
```

## Docker image (build on the Nomad host)

```bash
cd orchestrator
docker build -t swarm-orchestrator:local .
```

Then run the Nomad job — see [`nomad-jobs/orchestrator.nomad.hcl`](../nomad-jobs/orchestrator.nomad.hcl) and [`lab/ollama/README.md`](../lab/ollama/README.md).
