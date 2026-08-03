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
  echo "[1/4] Pulling latest code changes..."
  if id "$DEPLOY_USER" &>/dev/null; then
    su - "$DEPLOY_USER" -c "cd $INSTALL_DIR && git pull origin main && npm ci --omit=dev" || {
      echo "Notice: Falling back to direct git pull..."
      git pull origin main
      npm ci --omit=dev
    }
  else
    git pull origin main
    npm ci --omit=dev
  fi
fi

echo "[2/4] Setting file permissions..."
chown -R "$OPS_USER:$OPS_USER" "$INSTALL_DIR"
chmod 750 "$INSTALL_DIR"
if [ -f "$INSTALL_DIR/.env" ]; then
  chmod 600 "$INSTALL_DIR/.env"
fi

echo "[3/4] Updating narrow sudoers configuration..."
if [ -f "$INSTALL_DIR/sudoers/system-ops-sudoers" ]; then
  cp "$INSTALL_DIR/sudoers/system-ops-sudoers" /etc/sudoers.d/system-ops
  chmod 0440 /etc/sudoers.d/system-ops
fi

echo "[4/4] Restarting system-ops service..."
systemctl daemon-reload
systemctl restart system-ops.service

echo "========================================================"
echo "  Deployment Complete!"
echo "  - Service Status: sudo systemctl status system-ops"
echo "========================================================"
