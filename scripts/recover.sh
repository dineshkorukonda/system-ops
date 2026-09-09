#!/usr/bin/env bash
#
# One-command recovery when the dashboard update fails or the service is down.
# Run on the server as root:
#   sudo bash /opt/system-ops/scripts/recover.sh
#

set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/system-ops}"
OPS_USER="${OPS_USER:-ops}"

if [ "$EUID" -ne 0 ]; then
  echo "Error: run with sudo — e.g. sudo bash $INSTALL_DIR/scripts/recover.sh"
  exit 1
fi

if [ ! -d "$INSTALL_DIR" ]; then
  echo "Error: install dir not found: $INSTALL_DIR"
  exit 1
fi

echo "========================================================"
echo "  system-ops recovery                                  "
echo "========================================================"

echo "[1/4] Fixing ownership..."
chown -R "$OPS_USER:$OPS_USER" "$INSTALL_DIR"
chmod 750 "$INSTALL_DIR"
[ -f "$INSTALL_DIR/.env" ] && chmod 600 "$INSTALL_DIR/.env"

echo "[2/4] Syncing git to origin/main..."
su -s /bin/bash "$OPS_USER" -c "cd $INSTALL_DIR && git checkout -- dist/ 2>/dev/null || true"
su -s /bin/bash "$OPS_USER" -c "cd $INSTALL_DIR && git fetch origin main && git reset --hard origin/main"

echo "[3/4] Running deploy..."
bash "$INSTALL_DIR/scripts/deploy.sh"

echo "[4/4] Health check..."
if curl -sf http://127.0.0.1:9080/health >/dev/null; then
  echo "OK — service is healthy. Refresh the dashboard in your browser."
else
  echo "WARNING — health check failed. Run: sudo journalctl -u system-ops.service -n 80"
  exit 1
fi
