# system-ops ⚡

> **A fast, lightweight (<35MB RAM), single-pane operations console and telemetry dashboard engineered specifically for single Ubuntu VPS deployments.**  
> Monitor Ollama local LLMs, PM2 process fleets, systemd units, PostgreSQL backups, storage metrics, and real-time Nginx visitor traffic with GeoIP maps — from a unified, mobile-responsive browser console.

---

### GitHub Repository Topics
`nodejs` • `express` • `devops` • `vps-monitoring` • `pm2` • `nginx` • `self-hosted` • `docker` • `ollama` • `systemd` • `grafana-alternative`

---

## 💡 Why system-ops?

Running modern observability stacks (Prometheus, Grafana, Netdata, or Datadog agents) on a modest 2GB–8GB single VPS often consumes 500MB to 2GB+ of precious RAM and requires multi-daemon orchestration.

`system-ops` provides an ultra-lightweight alternative:
- **Zero Heavy Agents**: Runs as a single Node.js process using native Linux kernel introspection (`/proc`, `/sys`, `systemctl`, `journalctl`, `pm2`).
- **Minimal Footprint**: Operates comfortably in under **35MB of RAM**.
- **Self-Contained**: No external database, time-series engine, or cloud telemetry subscriptions required.
- **Security-First**: Sits strictly on local loopback (`127.0.0.1:9080`), protected by signed HTTP-only session cookies, rate limiters, security headers, and least-privilege `sudoers` rules.

---

## 🎯 Feature Matrix

| Module | Features & Capabilities |
| :--- | :--- |
| 🦙 **Ollama AI** | Service state (`systemd`), local loopback socket bound check (`127.0.0.1:11434`), API latency probe, installed model registry (`ollama list`), systemd journal logs tail, and interactive quick chat probe. |
| 🚀 **PM2 Fleet** | Multi-user process monitoring (`deploy`, `root`, or custom users), memory/CPU consumption, process states (`online`, `stopped`, `errored`), restart counts, and per-app live log viewers. |
| 🖥️ **System Health** | Responsive SVG sparklines for live CPU load, RAM utilization, and Swap trends; host uptime, load averages (1m / 5m / 15m), systemd unit health, disk partition meters, listening loopback ports, and TLS certificate expiry countdowns. |
| 🔍 **Process Monitor** | Real-time top process table with interactive fuzzy search and instant sorting by `% CPU` or `% Memory` (RSS). |
| 💾 **PostgreSQL Backups** | Log tailing with heuristic status parsing (`SUCCESS`, `FAILED`, `UNKNOWN`), log source selector, and single-click direct `.dump` file downloads. |
| 🌐 **Traffic Analytics** | Nginx access log streaming parser with device breakdown (📱 Phones vs 💻 Laptops), HTTP status code distribution (2xx / 3xx / 4xx / 5xx), top requested endpoints, visitor IP tables, and an interactive **Leaflet GeoIP World Map**. |

---

## 🏗️ Architecture

```
                    ┌───────────────────────────────┐
                    │      Browser Client (HTTPS)   │
                    └───────────────┬───────────────┘
                                    │
                                    ▼ ops.example.com
                    ┌───────────────────────────────┐
                    │      Nginx Reverse Proxy      │
                    │  (SSL Termination + Real IP)  │
                    └───────────────┬───────────────┘
                                    │ http://127.0.0.1:9080
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Express Server (system-ops)                                             │
│ ├── Middleware: Rate Limiter + Cookie Auth + Security Headers          │
│ ├── Native Linux Collectors:                                           │
│ │   ├── systemService.js    ──► systemctl / journalctl (sudoers)       │
│ │   ├── pm2.js              ──► pm2 jlist (per user via sudoers)       │
│ │   ├── system.js           ──► /proc/loadavg, /proc/meminfo, df, ss   │
│ │   ├── backupFiles.js      ──► /var/backups dump directory            │
│ │   └── trafficAnalytics.js ──► streaming Nginx access.log + GeoIP     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Installation & Deployment

`system-ops` supports two first-class installation methods:

### Option A — Native Systemd Service (Recommended for full host introspection)

#### Automated Install (Ubuntu 22.04 / 24.04)
```bash
git clone https://github.com/dineshkorukonda/system-ops.git /opt/system-ops
cd /opt/system-ops
sudo bash scripts/install.sh
```

#### Manual Setup Step-by-Step
```bash
# 1. Create dedicated ops system user
useradd -r -s /bin/false -d /opt/system-ops ops
usermod -aG systemd-journal,adm ops

# 2. Install production dependencies
npm ci --omit=dev

# 3. Setup environment configuration
cp .env.example .env
nano .env   # Set APP_PASSWORD and SESSION_SECRET

# 4. Secure directory permissions
chown -R ops:ops /opt/system-ops
chmod 750 /opt/system-ops
chmod 600 /opt/system-ops/.env

# 5. Install least-privilege sudoers rules
cp sudoers/system-ops-sudoers /etc/sudoers.d/system-ops
chmod 0440 /etc/sudoers.d/system-ops

# 6. Enable and start systemd unit
cp systemd/system-ops.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now system-ops.service
```

---

### Option B — Docker & Docker Compose

Run `system-ops` in an isolated container while mounting host introspection points read-only:

```bash
# 1. Clone repository
git clone https://github.com/dineshkorukonda/system-ops.git
cd system-ops

# 2. Configure environment
cp .env.example .env
nano .env

# 3. Launch container stack
docker compose up -d

# 4. Check container health
docker compose ps
```

> [!NOTE]
> When running in Docker, host metrics are introspected via read-only volume mounts (`/proc:/host/proc:ro`, `/sys:/host/sys:ro`, and `/var/log/nginx:/var/log/nginx:ro`).

> [!CAUTION]
> **Docker Socket Security**: Mounting `/var/run/docker.sock` into a container gives the container root-equivalent access over the host daemon. `system-ops` avoids mounting `docker.sock` by default.

---

## ⚙️ Environment Variables

Configure these in `/opt/system-ops/.env`:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `APP_PASSWORD` | *(required)* | Console login password |
| `SESSION_SECRET` | *(required)* | Secret string used for cookie signing |
| `PORT` | `9080` | Local loopback listen port |
| `HOST` | `127.0.0.1` | Network interface binding (`127.0.0.1` recommended) |
| `PM2_USERS` | `deploy,root` | Comma-separated list of system users whose PM2 daemons to monitor |
| `PM2_PATH_DEPLOY` | `/usr/local/bin/pm2` | Explicit path to PM2 binary for the `deploy` user |
| `PM2_PATH_ROOT` | `/usr/local/bin/pm2` | Explicit path to PM2 binary for `root` |
| `DISK_PATHS` | `/,/var,/var/backups` | Comma-separated filesystem paths to monitor for disk utilization |
| `SYSTEMD_UNITS` | `nginx,ollama,system-ops,postgresql` | Comma-separated systemd services to track |
| `TLS_HOSTS` | `ops.example.com,api.example.com` | Hostnames or cert files to check for SSL/TLS expiry |
| `TRACKED_DOMAINS` | `app.example.com:App,api.example.com:API` | Domain-to-label mapping for Traffic Analytics |
| `NGINX_LOG_PATH` | `/var/log/nginx/access.log` | Path to Nginx access log file for traffic analytics |
| `BACKUPS_DIR` | `/var/backups` | Directory where PostgreSQL dump files are stored |
| `LOG_SOURCES` | `pg-backup:/var/backups/postgres/logs/backup.log:200` | Log sources for Backup tab (`id:target:lines`) |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama API endpoint |

---

## 📡 REST API Reference

All `/api/*` endpoints (except login, logout, and health) require valid session authentication.

| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/health` / `/api/health` | Unauthenticated, leak-free liveness probe |
| `POST` | `/api/login` | Authenticate and obtain signed session cookie |
| `POST` | `/api/logout` | Invalidate and clear session cookie |
| `GET` | `/api/auth/status` | Check if current session token is valid |
| `GET` | `/api/status` | Ollama service state, socket checks, and host summary |
| `GET` | `/api/logs?lines=100` | Fetch journalctl logs for the Ollama service |
| `GET` | `/api/models` | List installed Ollama models with disk sizes |
| `POST` | `/api/test-chat` | Execute a token-capped inference probe on Ollama |
| `GET` | `/api/v2/pm2/snapshot` | Snapshot of all PM2 processes across configured users |
| `GET` | `/api/v2/pm2/logs?user=deploy&app=api` | Tail logs for a specific PM2 application |
| `GET` | `/api/v2/system/snapshot` | Memory, swap, load averages, disks, ports, and TLS status |
| `GET` | `/api/v2/system/processes?sort=cpu&limit=50` | Top system processes sorted by CPU or Memory |
| `GET` | `/api/v2/logs/sources` | List configured backup log sources |
| `GET` | `/api/v2/logs/tail?id=pg-backup&lines=200` | Fetch log tail with heuristic backup status |
| `GET` | `/api/v2/backups/files` | List `.dump` / `.sql.gz` backup archive files |
| `GET` | `/api/v2/backups/download?filename=db.dump` | Stream safe download of a backup dump archive |
| `GET` | `/api/v2/traffic/analytics` | Parsed traffic analytics with GeoIP and device breakdown |

---

## 🔒 Nginx Reverse Proxy Configuration

To expose the dashboard securely with HTTPS:

```nginx
# /etc/nginx/sites-available/ops.example.com
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
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Optional: Restrict dashboard access to specific admin IPs or VPN
    # allow 203.0.113.50;
    # deny all;

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

## 💾 Automated PostgreSQL Backup Script

Place this script at `/var/backups/postgres/backup.sh` to get automated daily backups that integrate with the **Backups** tab:

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
        echo "✓ Backup successful: ${DB_NAME}_$DATE.dump ($SIZE bytes)" >> "$LOG_FILE"
        # Prune dumps older than KEEP_DAYS
        find "$BACKUP_DIR" -maxdepth 1 -name "${DB_NAME}_*.dump" -type f \
            -printf "%T@ %p\n" | sort -n | head -n -${KEEP_DAYS} | \
            cut -d' ' -f2- | while IFS= read -r f; do
                rm -- "$f" && echo "  Deleted old archive: $(basename "$f")" >> "$LOG_FILE"
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

Add to root crontab (`sudo crontab -e`):
```cron
0 2 * * * /bin/bash /var/backups/postgres/backup.sh
```

---

## 🗺️ Roadmap

- [ ] **Webhook Alerting**: Instant alerts to Discord, Slack, or Telegram on disk space (>85%), RAM (>90%), service down, or backup failure.
- [ ] **SSE / WebSockets Streaming**: Zero-polling live log tailing and streaming real-time metrics.
- [ ] **Multi-Node Agent Hub**: Optional lightweight hub mode allowing a central dashboard to aggregate telemetry across multiple satellite VPS nodes.
- [ ] **Docker Container Collector**: Optional native collector for container states via Docker API without requiring raw socket exposure.

---

## 📄 License

[MIT License](LICENSE) © 2026 Dinesh Korukonda