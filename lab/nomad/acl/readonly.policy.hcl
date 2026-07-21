# Read-only: inspect jobs/allocs/nodes. No submit or ACL changes.

namespace "default" {
  policy = "read"
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
