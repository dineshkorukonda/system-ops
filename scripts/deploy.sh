#!/usr/bin/env bash
#
# System Ops Mini-Site Deployment & Update Script (v2)
# Run with sudo: sudo bash scripts/deploy.sh
#

set -e

INSTALL_DIR="/opt/system-ops"
OPS_USER="ops"
DEPLOY_USER="deploy"

echo "========================================================"
echo "  Updating System Ops Mini-Site (v2)                    "
echo "========================================================"

if [ "$EUID" -ne 0 ]; then
  echo "Error: Please run this script with sudo or as root."
  exit 1
fi

if [ -d "$INSTALL_DIR" ]; then
  cd "$INSTALL_DIR"
  echo "[1/5] Pulling latest code changes..."
  if id "$DEPLOY_USER" &>/dev/null; then
    su - "$DEPLOY_USER" -c "cd $INSTALL_DIR && git pull origin main" || {
      echo "Notice: Falling back to direct git pull..."
      git pull origin main
    }
  else
    git pull origin main
  fi

  echo "[2/5] Installing dependencies (including Vite build tools)..."
  npm ci

  echo "[3/5] Building production frontend..."
  npm run build

  echo "[4/5] Pruning dev dependencies..."
  npm prune --omit=dev
fi

echo "[5/5] Setting file permissions & restarting service..."
chown -R "$OPS_USER:$OPS_USER" "$INSTALL_DIR"
chmod 750 "$INSTALL_DIR"
if [ -f "$INSTALL_DIR/.env" ]; then
  chmod 600 "$INSTALL_DIR/.env"
fi

if [ -f "$INSTALL_DIR/sudoers/system-ops-sudoers" ]; then
  cp "$INSTALL_DIR/sudoers/system-ops-sudoers" /etc/sudoers.d/system-ops
  chmod 0440 /etc/sudoers.d/system-ops
fi

if [ -f "$INSTALL_DIR/systemd/system-ops.service" ]; then
  cp "$INSTALL_DIR/systemd/system-ops.service" /etc/systemd/system/system-ops.service
fi

systemctl daemon-reload
systemctl restart system-ops.service

echo "========================================================"
echo "  Deployment Complete!"
echo "  - Service Status: sudo systemctl status system-ops"
echo "  - Docker Check:   sudo bash scripts/debug-docker.sh"
echo "========================================================"
