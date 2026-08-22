# system-ops

Lightweight self-hosted operations console and telemetry dashboard for a single Ubuntu VPS.

Monitors native systemd services, Ollama local LLMs, system health metrics, PostgreSQL backup dumps, and real-time Nginx traffic with GeoIP mapping from a single browser console.

---

## Overview

Traditional monitoring stacks (Prometheus, Grafana, Datadog) often consume 500MB to 2GB of RAM on a VPS. `system-ops` standardizes on native Linux `systemd` and kernel metrics to provide full-stack visibility in under 35MB of RAM without external databases or supervisor daemons.

### Why Native Systemd over PM2?

- Zero Extra RAM: Uses Linux PID 1 (0MB overhead vs 50-100MB+ for PM2).
- Universal Supervision: One tool (`systemctl`) controls Node.js apps, Ollama, Nginx, PostgreSQL, and background workers.
- Rock-Solid Recovery: Native `Restart=always` with cgroup memory and CPU limits.
- Centralized Logging: Automatic log rotation and retention via `journalctl` with zero disk leaks.

---

## Core Capabilities

- System Health: Live SVG sparklines for CPU Load (1m), RAM %, and Swap %. Load averages (1m/5m/15m), disk partition meters, loopback listening ports, and TLS cert expiry countdowns.
- Process Monitor: Searchable, sortable process table with PID, user, CPU%, RAM%, RSS, and command execution details.
- Systemd Services: Unified inspection of all tracked services (Node apps, Ollama, Nginx, Postgres) with active state, memory consumption, PID, and live streaming `journalctl` log viewer.
- Ollama AI: Model registry (`ollama list`), loopback socket bound check, API latency probe, and token-capped quick inference test.
- PostgreSQL Backups: Backup log tail with status analysis (SUCCESS / FAILED), and direct `.dump` file downloads.
- Traffic & GeoIP Analytics: Nginx access log parser, mobile vs desktop breakdown, status codes, top requested endpoints, and Leaflet GeoIP visitor map.

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
   ├── services.js         -> systemctl show / journalctl (sudoers)
   ├── system.js           -> /proc/loadavg, /proc/meminfo, df, ss
   ├── backupFiles.js      -> /var/backups dump directory
   ├── logSources.js       -> tail backup logs
   └── trafficAnalytics.js -> Nginx access.log + GeoIP
```

---

## Installation

### Option 1: Native Systemd Service (Recommended)

#### Quick Upgrade / Clean Reinstall (Ubuntu 22.04 / 24.04)

```bash
# 1. Stop and remove old deployment
sudo systemctl stop system-ops.service 2>/dev/null || true
sudo rm -rf /opt/system-ops

# 2. Clone latest and run automated installer
sudo git clone https://github.com/dineshkorukonda/system-ops.git /opt/system-ops
cd /opt/system-ops
sudo bash scripts/install.sh

# 3. Configure environment and restart
sudo nano /opt/system-ops/.env   # Set your secure APP_PASSWORD
sudo systemctl restart system-ops.service
```

#### Manual Setup

```bash
# 1. Create ops user
useradd -r -s /bin/false -d /opt/system-ops ops
usermod -aG systemd-journal,adm ops

# 2. Install dependencies & build React SPA
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

---

## Standardizing Node.js Apps on Systemd

To run your Node.js apps under systemd instead of PM2, create `/etc/systemd/system/myapp.service`:

```ini
[Unit]
Description=My Node Production App
After=network.target postgresql.service

[Service]
Type=simple
User=deploy
WorkingDirectory=/var/www/myapp
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5s
Environment=NODE_ENV=production
EnvironmentFile=/var/www/myapp/.env

# Safety limits (Protects VPS from OOM crashes)
MemoryMax=600M
CPUQuota=90%
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable and start your app:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now myapp.service
```

Add `myapp` to `SYSTEMD_UNITS` in `/opt/system-ops/.env` to monitor it in `system-ops`.

---

## Deploy at Custom Subdomain & SSL

You can deploy `system-ops` at any subdomain of your choice (e.g., `ops.yourdomain.com`).

### 1-Line Automated Domain & SSL Setup

```bash
sudo bash /opt/system-ops/scripts/setup-domain.sh ops.yourdomain.com admin@yourdomain.com
```

This automatically:
1. Installs Nginx and Certbot if missing.
2. Creates the `/etc/nginx/sites-available/` reverse proxy config pointing to `127.0.0.1:9080`.
3. Tests syntax and symlinks to `sites-enabled`.
4. Provisions a free Let's Encrypt SSL certificate and enables HTTP->HTTPS redirect.
5. Reloads Nginx.

---

## Configuration

Configure environment variables in `/opt/system-ops/.env`:

| Variable | Default | Description |
|---|---|---|
| `APP_PASSWORD` | *(required)* | Dashboard login password |
| `SESSION_SECRET` | *(required)* | Cookie signing secret |
| `PORT` | `9080` | Local loopback listen port |
| `HOST` | `127.0.0.1` | Network interface binding |
| `SYSTEMD_UNITS` | `nginx,ollama,system-ops,postgresql` | Comma-separated systemd services to track |
| `DISK_PATHS` | `/,/var,/var/backups` | Filesystem paths to track disk usage |
| `TLS_HOSTS` | `ops.example.com,api.example.com` | Hostnames or cert files for TLS expiry checks |
| `TRACKED_DOMAINS` | `app.example.com:App,api.example.com:API` | Domain-to-label mapping for traffic analytics |
| `NGINX_LOG_PATH` | `/var/log/nginx/access.log` | Access log path for traffic analytics |
| `BACKUPS_DIR` | `/var/backups` | Directory where PostgreSQL dump files are stored |
| `LOG_SOURCES` | `pg-backup:/var/backups/postgres/logs/backup.log:200` | Backup log sources (`id:target:lines`) |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama API endpoint |

---

## REST API Reference

All `/api/*` endpoints (except login, logout, and health) require session authentication.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/health` / `/api/health` | No | Liveness health check |
| `POST` | `/api/login` | No | Session login |
| `POST` | `/api/logout` | No | Session logout |
| `GET` | `/api/auth/status` | No | Check session validity |
| `GET` | `/api/v2/system/snapshot` | Yes | Host health snapshot (CPU, RAM, Swap, Disk, Ports, TLS) |
| `GET` | `/api/v2/system/processes` | Yes | Top process table (sort by cpu/mem) |
| `GET` | `/api/v2/services/snapshot` | Yes | Status and memory for all systemd services |
| `GET` | `/api/v2/services/logs` | Yes | Tail live journalctl logs for any service |
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

## License

MIT (c) 2026 Dinesh Korukonda