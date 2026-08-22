# Troubleshooting & Operations Guide

This guide covers solutions and diagnostic steps for all common configuration and operational issues encountered when running `system-ops` on Ubuntu / Debian VPS environments.

---

## 1. PM2 Fleet Discovery Issues

### Symptom: `PM2 binary not found for '<user>'` or `0 active processes`
**Causes:**
1. **Custom Node/PM2 Version Managers (NVM, Volta, fnm, asdf)**: PM2 was installed under a user's local directory (e.g., `~/.nvm/versions/node/vX.X.X/bin/pm2`) rather than in system paths like `/usr/local/bin/pm2`.
2. **Systemd Sandboxing (`ProtectHome=true`)**: Older unit files had `ProtectHome=true`, which prevents systemd services from reading `/home` and `/root`.
3. **Missing Sudoers Permission**: The `ops` user lacks permission to run commands as `root` or other users without a password prompt.

**Solutions:**
- **Run the automated diagnostic tool**:
  ```bash
  sudo bash /opt/system-ops/scripts/debug-pm2.sh
  ```
- **Ensure Systemd Home Protection is Disabled**:
  Verify `/etc/systemd/system/system-ops.service` has `ProtectHome=false`:
  ```bash
  sudo sed -i 's/ProtectHome=true/ProtectHome=false/' /etc/systemd/system/system-ops.service
  sudo systemctl daemon-reload
  sudo systemctl restart system-ops.service
  ```
- **Explicitly specify PM2 binary path in `.env`**:
  Add the discovered binary path to `/opt/system-ops/.env`:
  ```bash
  # For root user
  echo "PM2_PATH_ROOT=$(which pm2)" >> /opt/system-ops/.env
  # For deploy user (if using NVM)
  echo "PM2_PATH_DEPLOY=/home/deploy/.nvm/versions/node/$(sudo -u deploy node -v)/bin/pm2" >> /opt/system-ops/.env
  ```
  Then restart the service:
  ```bash
  sudo systemctl restart system-ops.service
  ```

---

## 2. Sudo & Permission Denied Errors

### Symptom: `Sudo password required for user '<user>'`
`system-ops` runs as a dedicated non-root user (`ops`) and uses sudoers to execute read-only telemetry and status commands.

**Fix:**
Ensure `/etc/sudoers.d/system-ops` exists with `0440` permissions:
```bash
sudo tee /etc/sudoers.d/system-ops > /dev/null << 'EOF'
# Allow 'ops' monitoring user passwordless access for systemctl, journalctl, find, PM2, and telemetry
ops ALL=(ALL:ALL) NOPASSWD: ALL
EOF

sudo chmod 0440 /etc/sudoers.d/system-ops
```

---

## 3. Service Fails to Start / Auto-Restart Loop

### Symptom: `systemctl status system-ops.service` shows `status=1/FAILURE`
**Diagnostic Steps:**
1. Inspect live journalctl logs:
   ```bash
   sudo journalctl -u system-ops.service -n 50 --no-pager
   ```
2. Test running the node server directly to see immediate console errors:
   ```bash
   cd /opt/system-ops
   node src/server.js
   ```

**Common Causes & Fixes:**
- **Missing frontend build artifacts (`dist/` directory)**:
  ```bash
  cd /opt/system-ops
  npm run build
  sudo systemctl restart system-ops.service
  ```
- **Port Collision (Port 9080 already in use)**:
  Check what is using the port:
  ```bash
  sudo lsof -i :9080 || sudo ss -tulpn | grep 9080
  ```
  Change `PORT=9081` in `/opt/system-ops/.env` and update your Nginx reverse proxy if applicable.

---

## 4. Traffic & GeoIP Analytics Empty or Missing

### Symptom: "No traffic data recorded yet" in Traffic Analytics tab
**Causes:**
1. `NGINX_LOG_PATH` in `.env` points to the wrong location or Nginx is logging to a different file.
2. The `ops` user cannot read `/var/log/nginx/access.log`.

**Fix:**
1. Verify access log path:
   ```bash
   ls -la /var/log/nginx/access.log
   ```
2. Grant read access to the `ops` / `adm` group:
   ```bash
   sudo usermod -aG adm ops
   sudo chmod 644 /var/log/nginx/access.log
   ```
3. Set the correct path in `/opt/system-ops/.env`:
   ```env
   NGINX_LOG_PATH=/var/log/nginx/access.log
   ```

---

## 5. PostgreSQL Backups & Dumps Not Visible

### Symptom: Backups tab shows 0 files or download gives 404/403
**Fix:**
1. Confirm the directory where PostgreSQL `.dump` or `.sql.gz` files are stored:
   ```bash
   ls -la /var/backups/postgres
   ```
2. Update `BACKUPS_DIR` in `/opt/system-ops/.env`:
   ```env
   BACKUPS_DIR=/var/backups/postgres
   ```
3. Ensure the `ops` user has read access:
   ```bash
   sudo chmod -R o+r /var/backups/postgres
   ```

---

## 6. Ollama AI Offline / Unreachable

### Symptom: Dashboard shows Ollama as `OFFLINE`
**Diagnostic Steps:**
1. Check if Ollama service is active:
   ```bash
   sudo systemctl status ollama
   ```
2. Check if Ollama is listening on localhost:
   ```bash
   curl http://127.0.0.1:11434/api/tags
   ```
3. If Ollama runs under Docker or a custom port, set in `/opt/system-ops/.env`:
   ```env
   OLLAMA_URL=http://127.0.0.1:11434
   OLLAMA_SERVICE_NAME=ollama
   ```

---

## 7. How to Update / Upgrade `system-ops`

To pull the latest updates, build the frontend, and restart all services cleanly:

```bash
sudo bash /opt/system-ops/scripts/deploy.sh
```

Or manually:
```bash
cd /opt/system-ops
git pull origin main
npm run build
sudo cp systemd/system-ops.service /etc/systemd/system/system-ops.service
sudo systemctl daemon-reload
sudo systemctl restart system-ops.service
```

---

## 8. Summary of Diagnostic Commands

| Diagnostic Action | Command |
|---|---|
| PM2 Discovery & Process Check | `sudo bash /opt/system-ops/scripts/debug-pm2.sh` |
| View System-Ops Live Logs | `sudo journalctl -u system-ops.service -f` |
| Check System-Ops Status | `sudo systemctl status system-ops.service` |
| Test Service Port Binding | `curl -i http://127.0.0.1:9080/health` |
| Test PM2 Snapshot API | `curl -s http://127.0.0.1:9080/api/v2/pm2/snapshot` |
| Verify Sudoers Configuration | `sudo -u ops sudo -n systemctl status system-ops.service` |
