#!/usr/bin/env bash
#
# Ollama Ops Mini-Site Installation Script for Ubuntu 24.04 LTS
# Run with sudo: sudo bash scripts/install.sh
#

set -e

INSTALL_DIR="/opt/ollama-ops"
OPS_USER="ops"

echo "========================================================"
echo "  Installing Ollama Ops Mini-Site on Ubuntu 24.04 LTS   "
echo "========================================================"

if [ "$EUID" -ne 0 ]; then
  echo "Error: Please run as root or with sudo."
  exit 1
fi

# 1. Create dedicated unprivileged user 'ops'
if ! id "$OPS_USER" &>/dev/null; then
    echo "[1/6] Creating unprivileged user '$OPS_USER'..."
    useradd -r -s /bin/false -d "$INSTALL_DIR" "$OPS_USER"
else
    echo "[1/6] User '$OPS_USER' already exists."
fi

# Add ops user to systemd-journal and adm groups for log access
usermod -aG systemd-journal,adm "$OPS_USER" || true

# 2. Copy source code to /opt/ollama-ops
echo "[2/6] Setting up installation directory at $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
cp -r package*.json src public systemd nginx sudoers .env.example "$INSTALL_DIR/"

# 3. Setup Environment File
if [ ! -f "$INSTALL_DIR/.env" ]; then
    echo "[3/6] Initializing .env configuration..."
    cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
    
    # Generate random session secret
    RAND_SECRET=$(openssl rand -hex 16 2>/dev/null || date +%s | md5sum | head -c 32)
    sed -i "s/SESSION_SECRET=.*/SESSION_SECRET=${RAND_SECRET}/" "$INSTALL_DIR/.env"
    
    echo "  -> Created $INSTALL_DIR/.env. Please update APP_PASSWORD!"
else
    echo "[3/6] Existing .env file preserved."
fi

# 4. Install Node dependencies
echo "[4/6] Installing Node.js dependencies..."
cd "$INSTALL_DIR"
npm ci --only=production

# Set ownership
chown -R "$OPS_USER:$OPS_USER" "$INSTALL_DIR"
chmod 750 "$INSTALL_DIR"
chmod 600 "$INSTALL_DIR/.env"

# 5. Install Sudoers Rule
echo "[5/6] Installing narrow sudoers rules for journalctl & systemctl..."
cp "$INSTALL_DIR/sudoers/ollama-ops-sudoers" /etc/sudoers.d/ollama-ops
chmod 0440 /etc/sudoers.d/ollama-ops

# 6. Install and Enable Systemd Service
echo "[6/6] Registering and starting systemd unit (ollama-ops.service)..."
cp "$INSTALL_DIR/systemd/ollama-ops.service" /etc/systemd/system/ollama-ops.service
systemctl daemon-reload
systemctl enable ollama-ops.service
systemctl restart ollama-ops.service

echo "========================================================"
echo "  Installation Complete!"
echo "  - Service Status: sudo systemctl status ollama-ops"
echo "  - Local Endpoint: http://127.0.0.1:9080"
echo "  - Nginx Config:   /opt/ollama-ops/nginx/ollama-ops.conf"
echo ""
echo "  NEXT STEPS:"
echo "  1. Edit /opt/ollama-ops/.env to set your APP_PASSWORD"
echo "  2. Link Nginx config: sudo cp /opt/ollama-ops/nginx/ollama-ops.conf /etc/nginx/sites-available/"
echo "  3. Update server_name and run: sudo certbot --nginx -d your-subdomain.com"
echo "========================================================"
