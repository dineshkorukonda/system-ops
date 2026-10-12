#!/usr/bin/env bash
# Build in a versioned staging directory, then activate with a readiness rollback gate.
set -euo pipefail
TASK_SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec /usr/bin/node "$TASK_SCRIPT_DIR/atomic-release.js"
