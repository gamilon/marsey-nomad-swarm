job "orchestrator" {
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
        # Docker bridge gateway to the host where Ollama listens (see lab/ollama/README.md).
        OLLAMA_HOST  = "http://172.17.0.1:11434"
        OLLAMA_MODEL = "llama3.1:8b"
      }

      resources {
        cpu    = 500
        memory = 512
      }

      service {
        name     = "orchestrator"
        port     = "http"
        provider = "nomad"

        check {
          type     = "http"
          path     = "/health"
          interval = "15s"
          timeout  = "5s"
        }
      }
    }
  }
}
