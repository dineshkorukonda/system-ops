#!/usr/bin/env bash
# Build in a versioned staging directory, then activate with a readiness rollback gate.
set -euo pipefail
TASK_SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
export INSTALL_DIR="$(cd -- "$TASK_SCRIPT_DIR/.." && pwd)"
TASK_RELEASE_HELPER="$TASK_SCRIPT_DIR/atomic-release.js"
if [[ -f "$INSTALL_DIR/current/scripts/atomic-release.js" ]]; then
  TASK_RELEASE_HELPER="$INSTALL_DIR/current/scripts/atomic-release.js"
fi
exec /usr/bin/node "$TASK_RELEASE_HELPER" "$@"
