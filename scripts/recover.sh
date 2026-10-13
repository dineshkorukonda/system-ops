#!/usr/bin/env bash
# Recover through the staged updater. Preserve working files, stashes, and data.
set -euo pipefail
INSTALL_DIR="${INSTALL_DIR:-/opt/system-ops}"
if [ "$EUID" -ne 0 ]; then
  echo "Error: run with sudo — sudo bash $INSTALL_DIR/scripts/recover.sh"
  exit 1
fi
if [ ! -f "$INSTALL_DIR/scripts/deploy.sh" ]; then
  echo "Error: deploy wrapper not found in $INSTALL_DIR"
  exit 1
fi
echo "Recovering with staged validation and interrupted-upgrade rollback..."
bash "$INSTALL_DIR/scripts/deploy.sh"
READINESS_URL="${READINESS_URL:-http://127.0.0.1:9080/ready}"
if curl --fail --silent --show-error --max-time 5 "$READINESS_URL" >/dev/null; then
  echo "Recovery completed and collection is ready."
else
  echo "Readiness failed. Inspect: sudo journalctl -u system-ops.service -n 80"
  exit 1
fi
