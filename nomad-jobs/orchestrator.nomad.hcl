job "orchestrator" {
  # Lab CE default: no namespace (default). For optional swarm namespace, see
  # nomad-jobs/README.md and set: namespace = "swarm"
  datacenters = ["lab"]
  type        = "service"

  group "orchestrator" {
    count = 1

    network {
      port "http" {
        to = 8080
      }
    }

    volume "runs" {
      type      = "host"
      source    = "orchestrator_runs"
      read_only = false
    }

    task "orchestrator" {
      driver = "docker"

      config {
        image = "swarm-orchestrator:local"
        ports = ["http"]
        # Image is built on this Nomad host; do not pull from a registry.
        force_pull = false
      }

      volume_mount {
        volume      = "runs"
        destination = "/data/runs"
        read_only   = false
      }

      env {
        PORT         = "8080"
        DATA_DIR     = "/data/runs"
        # Prefer LLM_*; OLLAMA_* aliases still work in the app.
        LLM_PROVIDER = "ollama"
        # Docker bridge gateway to the host where Ollama listens (see lab/ollama/README.md).
        LLM_BASE_URL = "http://172.17.0.1:11434"
        LLM_MODEL    = "llama3.1:8b"
        LLM_TIMEOUT_MS      = "120000"
        LLM_MAX_RETRIES     = "1"
        MAX_CONCURRENT_RUNS = "2"
      }

      resources {
        cpu    = 500
        memory = 512
      }

      service {
        name     = "orchestrator"
        port     = "http"
        provider = "nomad"

        # Liveness only — LLM readiness is /readyz (or /health).
        check {
          type     = "http"
          path     = "/livez"
          interval = "15s"
          timeout  = "5s"
        }
      }
    }
  }
}
