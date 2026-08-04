# system-ops

Lightweight self-hosted operations dashboard for a single Ubuntu VPS. Monitors Ollama, PM2 processes, system health, and PostgreSQL backup logs from a single browser tab.

---

## What It Does

| Tab | What You See |
|-----|-------------|
| **Ollama** | Service state, API health, model list, journal logs, quick chat probe |
| **PM2** | Per-user process list (deploy + root), CPU/memory/uptime, live log tail |
| **System** | RAM/swap, disk usage, systemd services, listening ports, TLS expiry |
| **Backups** | PostgreSQL backup log tail with status badge (SUCCESS / FAILED / UNKNOWN) |

Runs as an unprivileged `ops` user behind Nginx + SSL. All system calls go through narrow passwordless `sudo` rules in `/etc/sudoers.d/system-ops`.

---

## Architecture

```
Browser (HTTPS)
   │
   ▼ ops.yourdomain.com
Nginx (SSL + optional IP allowlist)
   │ http://127.0.0.1:9080
   ▼
Express App  (user: ops, port: 9080)
   ├── sudo -n → journalctl / systemctl
   ├── sudo -n -u deploy → pm2 jlist
   ├── sudo -n -u root   → pm2 jlist
   └── sudo -n tail      → /var/backups/postgres/logs/backup.log
```

---

## Quick Update (Deployed Server)

Run these commands **as root** on the server after merging a PR to `main`:

```bash
# 1. Pull latest code
cd /opt/system-ops
git pull origin main

# 2. Update sudoers (if sudoers/system-ops-sudoers changed in the PR)
cp /opt/system-ops/sudoers/system-ops-sudoers /etc/sudoers.d/system-ops
chmod 0440 /etc/sudoers.d/system-ops

# 3. Restart the dashboard service
systemctl restart system-ops.service

# 4. Verify it came back up
systemctl status system-ops.service
```

That's it. No build step, no npm install needed unless `package.json` changed.

---

## First-Time Install (Ubuntu 24.04)

```bash
# Clone
git clone https://github.com/dineshkorukonda/system-ops.git /opt/system-ops
cd /opt/system-ops

# Run automated installer (creates ops user, installs deps, sets up systemd)
sudo bash scripts/install.sh
```

Or manually:

```bash
# 1. Create ops user
useradd -r -s /bin/false -d /opt/system-ops ops
usermod -aG systemd-journal,adm ops

# 2. Install Node dependencies
npm ci --only=production

# 3. Configure environment
cp .env.example .env
nano .env   # set APP_PASSWORD and SESSION_SECRET

# 4. Set permissions
chown -R ops:ops /opt/system-ops
chmod 750 /opt/system-ops
chmod 600 /opt/system-ops/.env

# 5. Install sudoers rules
cp sudoers/system-ops-sudoers /etc/sudoers.d/system-ops
chmod 0440 /etc/sudoers.d/system-ops

# 6. Register systemd service
cp systemd/system-ops.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now system-ops.service
```

---

## Environment Variables (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_PASSWORD` | *(required)* | Dashboard login password |
| `SESSION_SECRET` | *(required)* | Cookie signing secret |
| `PORT` | `9080` | Listen port (loopback only) |
| `PM2_USERS` | `deploy,root` | Comma-separated users whose PM2 to monitor |
| `LOG_SOURCES` | `pg-backup:/var/backups/postgres/logs/backup.log:200` | Log sources (see below) |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama API base URL |

**LOG_SOURCES format:** `id:type:target:lines` or shorthand `id:/path/to/file:lines`  
Example: `pg-backup:/var/backups/postgres/logs/backup.log:200,journal:postgresql:100`

---

## PostgreSQL Backup Script Setup

Place this at `/var/backups/postgres/backup.sh` and add to root's crontab:

```bash
# /var/backups/postgres/backup.sh
#!/bin/bash
DATE=$(date +%F)
DB_NAME="iskcon_family_v5"
BACKUP_DIR="/var/backups/postgres"
LOG_FILE="$BACKUP_DIR/logs/backup.log"
KEEP_DAYS=7

mkdir -p "$BACKUP_DIR/logs"
echo "=== Backup started at $(date) ===" >> "$LOG_FILE"

if /usr/bin/pg_dump -F c "$DB_NAME" > "$BACKUP_DIR/${DB_NAME}_$DATE.dump" 2>> "$LOG_FILE"; then
    SIZE=$(stat -c%s "$BACKUP_DIR/${DB_NAME}_$DATE.dump")
    if [ "$SIZE" -gt 1000000 ]; then
        echo "✓ Backup successful: ${DB_NAME}_$DATE.dump ($SIZE bytes)" >> "$LOG_FILE"
        # Delete dumps older than KEEP_DAYS (handles spaces in filenames correctly)
        find "$BACKUP_DIR" -maxdepth 1 -name "${DB_NAME}_*.dump" -type f \
            -printf "%T@ %p\n" | sort -n | head -n -${KEEP_DAYS} | \
            cut -d' ' -f2- | while IFS= read -r f; do
                rm -- "$f" && echo "  Deleted: $(basename "$f")" >> "$LOG_FILE"
            done
    else
        echo "✗ FAILED: Backup file too small ($SIZE bytes)" >> "$LOG_FILE"
        rm -f "$BACKUP_DIR/${DB_NAME}_$DATE.dump"
    fi
else
    echo "✗ FAILED: pg_dump error" >> "$LOG_FILE"
    rm -f "$BACKUP_DIR/${DB_NAME}_$DATE.dump"
fi
echo "" >> "$LOG_FILE"
```

Crontab (runs daily at 2 AM):
```
0 2 * * * /bin/bash /var/backups/postgres/backup.sh
```

Log rotation (`/etc/logrotate.d/pg-backup`):
```
/var/backups/postgres/logs/backup.log {
    monthly
    rotate 3
    compress
    missingok
    notifempty
    create 0640 root root
}
```

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/health` | No | Public health check |
| `POST` | `/api/login` | No | Session login |
| `POST` | `/api/logout` | No | Session logout |
| `GET` | `/api/status` | Yes | Ollama service + host metrics |
| `GET` | `/api/logs` | Yes | journalctl -u ollama |
| `GET` | `/api/models` | Yes | Ollama model list |
| `POST` | `/api/test-chat` | Yes | Quick chat probe |
| `GET` | `/api/v2/pm2/snapshot` | Yes | PM2 process list (all users) |
| `GET` | `/api/v2/pm2/logs` | Yes | PM2 app log tail |
| `GET` | `/api/v2/system/snapshot` | Yes | System health snapshot |
| `GET` | `/api/v2/logs/sources` | Yes | Configured log sources |
| `GET` | `/api/v2/logs/tail` | Yes | Log file / journal tail |

---

## License

MIT