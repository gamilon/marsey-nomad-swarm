# Day-to-day operator: submit/manage jobs, inspect cluster. Not management.

namespace "default" {
  policy       = "write"
  capabilities = ["submit-job", "dispatch-job", "read-logs", "read-fs", "alloc-exec", "alloc-lifecycle", "csi-write-volume", "csi-mount-volume", "list-jobs", "read-job", "scale-job"]
}

node {
  policy = "read"
}

agent {
  policy = "read"
}

operator {
  policy = "read"
}

plugin {
  policy = "read"
}

quota {
  policy = "read"
}

host_volume "*" {
  policy = "write"
}
