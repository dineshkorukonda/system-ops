#!/usr/bin/env bash
#
# Helper script to find PM2 binaries for root and deploy users
# Run: bash /opt/system-ops/scripts/debug-pm2.sh
#

echo "================================================="
echo "   PM2 Binary & Process Diagnostics              "
echo "================================================="

echo ""
echo "[1] Checking root user PM2..."
ROOT_PM2=$(which pm2 2>/dev/null || find /root/.nvm /usr /opt -name pm2 -type f 2>/dev/null | grep 'bin/pm2' | head -1)
if [ -n "$ROOT_PM2" ]; then
  echo "  -> Found root PM2 binary at: $ROOT_PM2"
  "$ROOT_PM2" jlist 2>&1 | head -c 200
  echo ""
else
  echo "  -> Could not find PM2 binary for root."
fi

echo ""
echo "[2] Checking deploy user PM2..."
DEPLOY_PM2=$(sudo -u deploy which pm2 2>/dev/null || sudo -u deploy bash -lc "which pm2" 2>/dev/null || find /home/deploy -name pm2 -type f 2>/dev/null | grep 'bin/pm2' | head -1)
if [ -n "$DEPLOY_PM2" ]; then
  echo "  -> Found deploy PM2 binary at: $DEPLOY_PM2"
  sudo -u deploy "$DEPLOY_PM2" jlist 2>&1 | head -c 200
  echo ""
else
  echo "  -> Could not find PM2 binary for deploy."
fi

echo ""
echo "================================================="
echo "  To configure system-ops with these paths:      "
if [ -n "$ROOT_PM2" ]; then
  echo "  echo \"PM2_PATH_ROOT=$ROOT_PM2\" >> /opt/system-ops/.env"
fi
if [ -n "$DEPLOY_PM2" ]; then
  echo "  echo \"PM2_PATH_DEPLOY=$DEPLOY_PM2\" >> /opt/system-ops/.env"
fi
echo "================================================="
