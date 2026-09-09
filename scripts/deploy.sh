#!/usr/bin/env bash
#
# System Ops Mini-Site Deployment & Update Script (v2)
# Run with sudo: sudo bash scripts/deploy.sh
#

INSTALL_DIR="/opt/system-ops"
OPS_USER="ops"
DEPLOY_USER="deploy"
DEPLOY_FAILED=0

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

  run_as_ops() {
    su -s /bin/bash "$OPS_USER" -c "cd $INSTALL_DIR && $*"
  }

  # Git pull / prior sudo npm may leave root-owned files in dist/ — ops cannot
  # overwrite them during vite build (EACCES on unlink).
  echo "Fixing ownership before npm (prevents dist/ permission errors)..."
  chown -R "$OPS_USER:$OPS_USER" "$INSTALL_DIR"

  echo "[2/5] Installing dependencies (including Vite build tools)..."
  if ! run_as_ops "npm ci"; then
    echo "ERROR: npm ci failed"
    DEPLOY_FAILED=1
  fi

  if [ "$DEPLOY_FAILED" -eq 0 ]; then
    echo "[3/5] Building production frontend..."
    if ! run_as_ops "npm run build"; then
      echo "ERROR: npm run build failed"
      DEPLOY_FAILED=1
    fi
  fi

  if [ "$DEPLOY_FAILED" -eq 0 ]; then
    echo "[4/5] Pruning dev dependencies..."
    run_as_ops "npm prune --omit=dev" || true
  fi
fi

echo "[5/5] Setting file permissions & restarting service..."
chown -R "$OPS_USER:$OPS_USER" "$INSTALL_DIR"
chmod 750 "$INSTALL_DIR"
if [ -f "$INSTALL_DIR/.env" ]; then
  chmod 600 "$INSTALL_DIR/.env"
fi

if [ -f "$INSTALL_DIR/sudoers/system-ops-sudoers" ]; then
  if cp "$INSTALL_DIR/sudoers/system-ops-sudoers" /etc/sudoers.d/system-ops 2>/dev/null; then
    chmod 0440 /etc/sudoers.d/system-ops
  else
    echo "Notice: Could not update /etc/sudoers.d/system-ops (filesystem may be read-only). Skipping."
  fi
fi

if [ -f "$INSTALL_DIR/systemd/system-ops.service" ]; then
  if cp "$INSTALL_DIR/systemd/system-ops.service" /etc/systemd/system/system-ops.service 2>/dev/null; then
    systemctl daemon-reload 2>/dev/null || true
  else
    echo "Notice: Could not update systemd unit (filesystem may be read-only). Skipping."
  fi
fi

if [ "$DEPLOY_FAILED" -eq 1 ]; then
  echo "WARNING: Build failed — restarting service with previous build..."
fi

systemctl restart system-ops.service || systemctl start system-ops.service

# Wait for health check (up to 30s)
echo "Waiting for service to become healthy..."
HEALTH_OK=0
for i in $(seq 1 15); do
  if curl -sf http://127.0.0.1:9080/health >/dev/null 2>&1; then
    HEALTH_OK=1
    break
  fi
  sleep 2
done

echo "========================================================"
if [ "$DEPLOY_FAILED" -eq 1 ]; then
  echo "  Deployment FAILED (build step)"
  echo "  Service was restarted with existing files."
  echo "  Check: sudo journalctl -u system-ops.service -n 50"
  exit 1
elif [ "$HEALTH_OK" -eq 0 ]; then
  echo "  Deployment finished but health check FAILED"
  echo "  Run: sudo journalctl -u system-ops.service -n 50"
  exit 1
else
  echo "  Deployment Complete!"
  echo "  - Service Status: sudo systemctl status system-ops"
fi
echo "========================================================"
