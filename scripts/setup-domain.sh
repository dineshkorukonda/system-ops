#!/usr/bin/env bash
#
# Custom Domain & SSL Automation Script for system-ops
# Usage: sudo bash scripts/setup-domain.sh <subdomain.domain.com> [admin-email]
#

set -e

echo "=========================================================="
echo "  system-ops: Custom Subdomain & SSL Setup Automation     "
echo "=========================================================="

if [ "$EUID" -ne 0 ]; then
  echo "Error: Please run as root or with sudo."
  exit 1
fi

DOMAIN="$1"
EMAIL="$2"

if [ -z "$DOMAIN" ]; then
  read -p "Enter your custom domain or subdomain (e.g., ops.yourdomain.com): " DOMAIN
fi

if [ -z "$DOMAIN" ]; then
  echo "Error: Domain name cannot be empty."
  exit 1
fi

# Sanitize domain name
DOMAIN=$(echo "$DOMAIN" | tr '[:upper:]' '[:lower:]' | tr -d ' ')

echo ""
echo "Target Domain: $DOMAIN"

# 1. Install Nginx and Certbot if missing
if ! command -v nginx &>/dev/null; then
  echo "[1/5] Installing Nginx..."
  apt-get update -y && apt-get install -y nginx
else
  echo "[1/5] Nginx is installed."
fi

if ! command -v certbot &>/dev/null; then
  echo "[2/5] Installing Certbot and Nginx plugin..."
  apt-get update -y && apt-get install -y certbot python3-certbot-nginx
else
  echo "[2/5] Certbot is installed."
fi

# 2. Write Nginx configuration for the domain
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN.conf"
echo "[3/5] Generating Nginx configuration at $NGINX_CONF..."

cat > "$NGINX_CONF" << EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:9080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

# 3. Enable site and test configuration
echo "[4/5] Enabling site and testing Nginx configuration..."
ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/$DOMAIN.conf"
nginx -t

systemctl reload nginx

# 4. Provision Let's Encrypt SSL Certificate
echo "[5/5] Provisioning Let's Encrypt SSL Certificate with Certbot..."

if [ -n "$EMAIL" ]; then
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect
else
  certbot --nginx -d "$DOMAIN" --agree-tos --redirect || {
    echo "Notice: Interactive certbot prompts may be required."
  }
fi

systemctl reload nginx

echo ""
echo "=========================================================="
echo "  Domain Setup Complete!"
echo "  - Console URL: https://$DOMAIN"
echo "  - Backend:     http://127.0.0.1:9080 (Managed by systemd)"
echo "  - SSL Cert:    Managed automatically by Certbot"
echo "=========================================================="
