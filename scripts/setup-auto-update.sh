#!/usr/bin/env bash
#
# Enable or disable automatic daily updates for system-ops
# Usage: sudo bash scripts/setup-auto-update.sh [--enable|--disable]
#

set -e

INSTALL_DIR="/opt/system-ops"
SERVICE_NAME="system-ops-update"
TIMER_FILE="/etc/systemd/system/${SERVICE_NAME}.timer"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

ACTION="${1:-}"

if [ "$EUID" -ne 0 ]; then
  echo "Error: Please run as root or with sudo."
  exit 1
fi

if [ -z "$ACTION" ]; then
  read -p "Enable automatic daily updates? [y/N]: " REPLY
  if [[ "$REPLY" =~ ^[Yy] ]]; then
    ACTION="--enable"
  else
    ACTION="--disable"
  fi
fi

disable_timer() {
  if systemctl is-enabled "${SERVICE_NAME}.timer" &>/dev/null; then
    systemctl stop "${SERVICE_NAME}.timer" 2>/dev/null || true
    systemctl disable "${SERVICE_NAME}.timer" 2>/dev/null || true
  fi
  rm -f "$TIMER_FILE" "$SERVICE_FILE"
  systemctl daemon-reload
  echo "Automatic updates disabled."
}

enable_timer() {
  cat > "$SERVICE_FILE" << EOF
[Unit]
Description=system-ops daily auto-update
After=network-online.target

[Service]
Type=oneshot
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=/bin/bash -c '${INSTALL_DIR}/scripts/deploy.sh >> ${INSTALL_DIR}/data/update.log 2>&1'
EOF

  cat > "$TIMER_FILE" << EOF
[Unit]
Description=Run system-ops update daily at 03:00

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true
RandomizedDelaySec=1800

[Install]
WantedBy=timers.target
EOF

  mkdir -p "${INSTALL_DIR}/data"
  chown ops:ops "${INSTALL_DIR}/data" 2>/dev/null || true

  systemctl daemon-reload
  systemctl enable --now "${SERVICE_NAME}.timer"
  echo "Automatic daily updates enabled (runs at 03:00 with up to 30min jitter)."
}

case "$ACTION" in
  --enable)
    enable_timer
    ;;
  --disable)
    disable_timer
    ;;
  *)
    echo "Usage: sudo bash scripts/setup-auto-update.sh [--enable|--disable]"
    exit 1
    ;;
esac
