# system-ops

Lightweight self-hosted operations console and telemetry dashboard for a single Ubuntu VPS.

Monitors Ollama local LLMs, PM2 process fleets, system health, PostgreSQL backup logs, and real-time Nginx traffic with GeoIP mapping from a single browser tab.

---

## Overview

Full-scale monitoring tools like Prometheus and Grafana often consume 500MB to 2GB of RAM. `system-ops` provides single-node visibility in under 35MB of memory without external databases or daemon bloat.

### Features

- System Health: Live CPU load, RAM utilization, Swap trends, disk usage, systemd services, listening ports, and TLS cert expiry.
- Process Monitor: Searchable, sortable process table with PID, user, CPU%, RAM%, RSS, and commands.
- PM2 Fleet: Per-user process lists (deploy, root), CPU/memory stats, restart counts, and live app log viewer.
- Ollama AI: Model registry, service status, token-capped inference probe, and journalctl log viewer.
- PostgreSQL Backups: Backup log tail with status analysis (SUCCESS / FAILED), and direct dump file downloads.
- Traffic Analytics: Nginx access log parser, device breakdown (mobile vs desktop), HTTP status codes, and GeoIP visitor map.

---

## Architecture

```
Browser (HTTPS)
   |
   v ops.example.com
Nginx (SSL Termination + Real IP)
   | http://127.0.0.1:9080
   v
Express App (User: ops, Port: 9080)
   ├── systemService.js    -> systemctl / journalctl (sudoers)
   ├── pm2.js              -> pm2 jlist (per user via sudoers)
   ├── system.js           -> /proc/loadavg, /proc/meminfo, df, ss
   ├── backupFiles.js      -> /var/backups dump directory
   └── trafficAnalytics.js -> Nginx access.log + GeoIP
```

---

## Installation

### Option 1: Native Systemd Service (Recommended)

#### Automated Script (Ubuntu 22.04 / 24.04)

```bash
git clone https://github.com/dineshkorukonda/system-ops.git /opt/system-ops
cd /opt/system-ops
sudo bash scripts/install.sh
```

#### Manual Setup

```bash
# 1. Create ops user
useradd -r -s /bin/false -d /opt/system-ops ops
usermod -aG systemd-journal,adm ops

# 2. Install dependencies & configure env
cd /opt/system-ops
npm ci --omit=dev
cp .env.example .env
nano .env   # Set APP_PASSWORD and SESSION_SECRET

# 3. Secure file permissions
chown -R ops:ops /opt/system-ops
chmod 750 /opt/system-ops
chmod 600 /opt/system-ops/.env

# 4. Install sudoers rules
cp sudoers/system-ops-sudoers /etc/sudoers.d/system-ops
chmod 0440 /etc/sudoers.d/system-ops

# 5. Enable systemd service
cp systemd/system-ops.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now system-ops.service
```

---

### Option 2: Docker Compose

```bash
git clone https://github.com/dineshkorukonda/system-ops.git
cd system-ops
cp .env.example .env
docker compose up -d
```

Host metrics are read via read-only volume mounts (`/proc`, `/sys`, `/var/log/nginx`, `/var/backups`).

---

## Configuration

Configure environment variables in `/opt/system-ops/.env`:

| Variable | Default | Description |
|---|---|---|
| `APP_PASSWORD` | *(required)* | Dashboard login password |
| `SESSION_SECRET` | *(required)* | Cookie signing secret |
| `PORT` | `9080` | Local loopback listen port |
| `HOST` | `127.0.0.1` | Network interface binding |
| `PM2_USERS` | `deploy,root` | Comma-separated users whose PM2 daemons to monitor |
| `DISK_PATHS` | `/,/var,/var/backups` | Filesystem paths to track disk usage |
| `SYSTEMD_UNITS` | `nginx,ollama,system-ops,postgresql` | Systemd services to monitor |
| `TLS_HOSTS` | `ops.example.com,api.example.com` | Hostnames or cert files for TLS expiry checks |
| `TRACKED_DOMAINS` | `app.example.com:App,api.example.com:API` | Domain-to-label mapping for traffic analytics |
| `NGINX_LOG_PATH` | `/var/log/nginx/access.log` | Access log path for traffic analytics |
| `BACKUPS_DIR` | `/var/backups` | Directory where PostgreSQL dump files are stored |
| `LOG_SOURCES` | `pg-backup:/var/backups/postgres/logs/backup.log:200` | Backup log sources (`id:target:lines`) |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama API endpoint |

---

## API Reference

All `/api/*` endpoints (except login, logout, and health) require session authentication.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/health` / `/api/health` | No | Liveness health check |
| `POST` | `/api/login` | No | Session login |
| `POST` | `/api/logout` | No | Session logout |
| `GET` | `/api/auth/status` | No | Check session validity |
| `GET` | `/api/v2/system/snapshot` | Yes | Host health snapshot (CPU, RAM, Swap, Disk, Ports, TLS) |
| `GET` | `/api/v2/system/processes` | Yes | Top process table (sort by cpu/mem) |
| `GET` | `/api/v2/pm2/snapshot` | Yes | PM2 processes across all configured users |
| `GET` | `/api/v2/pm2/logs` | Yes | Tail logs for a PM2 application |
| `GET` | `/api/status` | Yes | Ollama service state & host summary |
| `GET` | `/api/models` | Yes | Installed Ollama models list |
| `POST` | `/api/test-chat` | Yes | Quick inference probe on Ollama |
| `GET` | `/api/logs` | Yes | Tail journalctl logs for Ollama |
| `GET` | `/api/v2/logs/sources` | Yes | Configured backup log sources |
| `GET` | `/api/v2/logs/tail` | Yes | Tail backup log source with status heuristics |
| `GET` | `/api/v2/backups/files` | Yes | List PostgreSQL dump files |
| `GET` | `/api/v2/backups/download` | Yes | Download a backup dump file |
| `GET` | `/api/v2/traffic/analytics` | Yes | Traffic analytics with GeoIP and device stats |

---

## PostgreSQL Backup Script Setup

Place this script at `/var/backups/postgres/backup.sh` and add to root crontab:

```bash
#!/bin/bash
set -euo pipefail

DATE=$(date +%F)
DB_NAME="app_production"
BACKUP_DIR="/var/backups/postgres"
LOG_FILE="$BACKUP_DIR/logs/backup.log"
KEEP_DAYS=7

mkdir -p "$BACKUP_DIR/logs"
echo "=== Backup started at $(date) ===" >> "$LOG_FILE"

if /usr/bin/pg_dump -F c "$DB_NAME" > "$BACKUP_DIR/${DB_NAME}_$DATE.dump" 2>> "$LOG_FILE"; then
    SIZE=$(stat -c%s "$BACKUP_DIR/${DB_NAME}_$DATE.dump")
    if [ "$SIZE" -gt 1000000 ]; then
        echo "Backup successful: ${DB_NAME}_$DATE.dump ($SIZE bytes)" >> "$LOG_FILE"
        find "$BACKUP_DIR" -maxdepth 1 -name "${DB_NAME}_*.dump" -type f \
            -printf "%T@ %p\n" | sort -n | head -n -${KEEP_DAYS} | \
            cut -d' ' -f2- | while IFS= read -r f; do
                rm -- "$f" && echo "  Deleted old archive: $(basename "$f")" >> "$LOG_FILE"
            done
    else
        echo "FAILED: Backup file too small ($SIZE bytes)" >> "$LOG_FILE"
        rm -f "$BACKUP_DIR/${DB_NAME}_$DATE.dump"
    fi
else
    echo "FAILED: pg_dump error" >> "$LOG_FILE"
    rm -f "$BACKUP_DIR/${DB_NAME}_$DATE.dump"
fi
echo "" >> "$LOG_FILE"
```

Add to crontab (`sudo crontab -e`):
```cron
0 2 * * * /bin/bash /var/backups/postgres/backup.sh
```

---

## Nginx Reverse Proxy Configuration

```nginx
server {
    listen 80;
    server_name ops.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ops.example.com;

    ssl_certificate /etc/letsencrypt/live/ops.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ops.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:9080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Development

```bash
# Install dependencies
npm install

# Build React SPA
npm run build

# Start server
npm start

# Run test suite
npm test
```

---

## License

MIT (c) 2026 Dinesh Korukonda