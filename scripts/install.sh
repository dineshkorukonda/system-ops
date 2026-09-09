#!/usr/bin/env bash
#
# system-ops: Zero-Friction Interactive Installer for Ubuntu / Debian
# Standardizes on native Linux systemd with 0MB extra RAM overhead.
#
# Run with:
#   curl -sSL https://raw.githubusercontent.com/dineshkorukonda/system-ops/main/scripts/install.sh | bash
#   OR
#   sudo bash scripts/install.sh
#

set -e

INSTALL_DIR="/opt/system-ops"
OPS_USER="ops"
REPO_URL="https://github.com/dineshkorukonda/system-ops.git"

echo "=========================================================="
echo "    SYSTEM-OPS: Self-Hosted VPS Operations Console        "
echo "    Architecture: Native Linux Systemd (<35MB RAM)       "
echo "=========================================================="
echo ""

if [ "$EUID" -ne 0 ]; then
  echo "Error: Please run as root or with sudo."
  exit 1
fi

# Detect TTY for interactive prompts even when piped through curl | bash
if [ -t 0 ]; then
  TTY_INPUT="/dev/stdin"
else
  TTY_INPUT="/dev/tty"
fi

# 1. System Dependencies Check & Installation
echo "[1/6] Checking system packages (curl, git, nodejs, npm)..."

apt-get update -y -qq

if ! command -v git &>/dev/null; then
  echo "  -> Installing git..."
  apt-get install -y -qq git
fi

if ! command -v curl &>/dev/null; then
  echo "  -> Installing curl..."
  apt-get install -y -qq curl
fi

# Ensure Node.js 18+ is installed
NODE_NEED_INSTALL=false
if ! command -v node &>/dev/null; then
  NODE_NEED_INSTALL=true
else
  NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_VER" -lt 18 ]; then
    NODE_NEED_INSTALL=true
  fi
fi

if [ "$NODE_NEED_INSTALL" = true ]; then
  echo "  -> Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi

echo "  -> Node.js version: $(node -v)"
echo "  -> npm version:     $(npm -v)"

# 2. Interactive Admin Password Configuration (No nano / manual file editing)
echo ""
echo "[2/6] Security & Authentication Setup"

APP_PASSWORD=""
if [ -f "$INSTALL_DIR/.env" ]; then
  EXISTING_PASS=$(grep '^APP_PASSWORD=' "$INSTALL_DIR/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
  if [ -n "$EXISTING_PASS" ] && [ "$EXISTING_PASS" != "ChangeThisToYourSecurePassword123!" ]; then
    echo "  -> Existing password detected in .env."
    read -p "  Do you want to keep the existing password? [Y/n]: " KEEP_PASS < "$TTY_INPUT"
    if [[ ! "$KEEP_PASS" =~ ^[Nn] ]]; then
      APP_PASSWORD="$EXISTING_PASS"
    fi
  fi
fi

while [ -z "$APP_PASSWORD" ]; do
  echo -n "  Enter Admin Dashboard Password: "
  read -s PASS1 < "$TTY_INPUT"
  echo ""
  
  if [ ${#PASS1} -lt 4 ]; then
    echo "  Error: Password must be at least 4 characters."
    continue
  fi

  echo -n "  Confirm Admin Dashboard Password: "
  read -s PASS2 < "$TTY_INPUT"
  echo ""

  if [ "$PASS1" != "$PASS2" ]; then
    echo "  Error: Passwords do not match. Please try again."
  else
    APP_PASSWORD="$PASS1"
    echo "  ✓ Password set successfully."
  fi
done

# 3. Setup Dedicated User and Directory
echo ""
echo "[3/6] Setting up user '$OPS_USER' and directory $INSTALL_DIR..."

if ! id "$OPS_USER" &>/dev/null; then
  useradd -r -s /bin/false -d "$INSTALL_DIR" "$OPS_USER"
fi
usermod -aG systemd-journal,adm "$OPS_USER" || true

# Grant Docker socket access when Docker is installed
if [ -S /var/run/docker.sock ] || command -v docker &>/dev/null; then
  usermod -aG docker "$OPS_USER" 2>/dev/null || true
  echo "  -> Added $OPS_USER to docker group (if docker is installed)"
fi

# Stop existing service if running
systemctl stop system-ops.service 2>/dev/null || true

# Clone or update repository
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "  -> Updating existing repository at $INSTALL_DIR..."
  cd "$INSTALL_DIR"
  git fetch --all --prune
  git reset --hard origin/main
else
  # If running inside the repo already, copy files; else git clone
  CURRENT_DIR=$(pwd)
  if [ -f "$CURRENT_DIR/package.json" ] && [ "$CURRENT_DIR" != "$INSTALL_DIR" ]; then
    echo "  -> Installing from local repository..."
    mkdir -p "$INSTALL_DIR"
    cp -r "$CURRENT_DIR"/* "$CURRENT_DIR"/.* "$INSTALL_DIR"/ 2>/dev/null || cp -r "$CURRENT_DIR"/* "$INSTALL_DIR"/
  else
    echo "  -> Cloning latest system-ops from GitHub..."
    rm -rf "$INSTALL_DIR"
    git clone "$REPO_URL" "$INSTALL_DIR"
  fi
fi

cd "$INSTALL_DIR"

# 4. Auto-Detect Services & Generate .env
echo ""
echo "[4/6] Auto-detecting systemd units and generating .env..."

# Detect common installed services
DETECTED_UNITS=()
for unit in nginx postgresql ollama system-ops docker redis mysql fail2ban; do
  if systemctl list-unit-files "${unit}.service" &>/dev/null && [ "$(systemctl list-unit-files "${unit}.service" 2>/dev/null | grep -c "${unit}.service")" -gt 0 ]; then
    DETECTED_UNITS+=("$unit")
  fi
done

if [ ${#DETECTED_UNITS[@]} -eq 0 ]; then
  DETECTED_UNITS_STR="nginx,ollama,system-ops,postgresql"
else
  DETECTED_UNITS_STR=$(IFS=,; echo "${DETECTED_UNITS[*]}")
fi

echo "  -> Tracked services: $DETECTED_UNITS_STR"

RAND_SECRET=$(openssl rand -hex 16 2>/dev/null || date +%s | md5sum | head -c 32)

cat > "$INSTALL_DIR/.env" << EOF
# System-Ops Auto-Generated Configuration
APP_PASSWORD=$APP_PASSWORD
SESSION_SECRET=$RAND_SECRET

PORT=9080
HOST=127.0.0.1
ENABLE_SYSTEM_COLLECTOR=true

SYSTEMD_UNITS=$DETECTED_UNITS_STR
DISK_PATHS=/,/var,/var/backups
TLS_HOSTS=

NGINX_LOG_PATH=/var/log/nginx/access.log
TRACKED_DOMAINS=

BACKUPS_DIR=/var/backups
LOG_SOURCES=

OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_SERVICE_NAME=ollama
ENABLE_CHAT_TEST=true

RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=3000
CHAT_TEST_RATE_LIMIT_MAX=30
LOG_TAIL_RATE_LIMIT_MAX=300
EOF

# 5. Build Frontend & Secure Permissions
echo ""
echo "[5/6] Building production artifacts & securing permissions..."

npm ci --silent 2>/dev/null || npm install --silent
echo "  -> Building React SPA production bundle..."
npm run build --silent || true

chown -R "$OPS_USER:$OPS_USER" "$INSTALL_DIR"
chmod 750 "$INSTALL_DIR"
chmod 600 "$INSTALL_DIR/.env"

# Install sudoers
cp "$INSTALL_DIR/sudoers/system-ops-sudoers" /etc/sudoers.d/system-ops
chmod 0440 /etc/sudoers.d/system-ops

# Install and start systemd unit
cp "$INSTALL_DIR/systemd/system-ops.service" /etc/systemd/system/system-ops.service
systemctl daemon-reload
systemctl enable system-ops.service
systemctl restart system-ops.service

# 6. Optional Auto-Update Timer
echo ""
echo "[6/7] Automatic Updates"
read -p "  Enable automatic daily updates? [y/N]: " ENABLE_AUTO_UPDATE < "$TTY_INPUT"
if [[ "$ENABLE_AUTO_UPDATE" =~ ^[Yy] ]]; then
  bash "$INSTALL_DIR/scripts/setup-auto-update.sh" --enable || {
    echo "  Notice: Auto-update setup encountered an issue. Re-run: sudo bash /opt/system-ops/scripts/setup-auto-update.sh --enable"
  }
fi

# 7. Optional 1-Click Custom Domain & SSL Setup
echo ""
echo "[7/7] Domain & HTTPS Configuration"
read -p "  Do you want to configure a custom domain with free SSL right now? [y/N]: " SETUP_DOMAIN < "$TTY_INPUT"

CONSOLE_URL="http://$(curl -s https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}'):9080"

if [[ "$SETUP_DOMAIN" =~ ^[Yy] ]]; then
  echo ""
  read -p "  Enter your domain (e.g. ops.yourdomain.com): " CUSTOM_DOMAIN < "$TTY_INPUT"
  read -p "  Enter your email for Let's Encrypt SSL: " ADMIN_EMAIL < "$TTY_INPUT"

  if [ -n "$CUSTOM_DOMAIN" ]; then
    bash "$INSTALL_DIR/scripts/setup-domain.sh" "$CUSTOM_DOMAIN" "$ADMIN_EMAIL" || {
      echo "  Notice: Domain setup encountered an issue. You can re-run it anytime with: bash /opt/system-ops/scripts/setup-domain.sh"
    }
    CONSOLE_URL="https://$CUSTOM_DOMAIN"
  fi
fi

# Detect Host IP
HOST_IP=$(curl -s https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')

echo ""
echo "=========================================================="
echo "  ✓ SYSTEM-OPS INSTALLATION COMPLETE!                     "
echo "=========================================================="
echo "  Console URL:     $CONSOLE_URL"
echo "  Direct Loopback: http://127.0.0.1:9080"
echo "  Systemd Status:  systemctl status system-ops.service"
echo "  Live Logs:       journalctl -u system-ops.service -f"
echo "=========================================================="
echo ""
