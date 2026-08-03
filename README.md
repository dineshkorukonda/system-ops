# System Ops Mini-Site (v1)

A lightweight, self-hosted operations web application designed for a single Ubuntu 24.04 VPS running **Ollama** (`llama3.2:3b`). Provides real-time infrastructure visibility into Ollama service state, listen status, model inventory, API health, quick chat probe verification, and systemd journal logs.

Designed with modular extensibility so PM2 process management (`cte-backend-dev`, `cte-backend`) and CoverTheEarth log tails can be added in v2 without rewriting core components.

---

## Features (v1 Scope)

- **Infrastructure Dashboard**:
  - **Service State**: Displays active / inactive / failed status via `systemctl show ollama` with PID and runtime memory.
  - **Process User Verification**: Ensures the process is running strictly under user `ollama`.
  - **Loopback Listen Check**: Verifies Ollama is bound exclusively to `127.0.0.1:11434` (never public `0.0.0.0`).
  - **HTTP API Health**: Live latency timing and parsed model list from `GET http://127.0.0.1:11434/api/tags`.
  - **Quick Chat Probe**: Rate-limited interactive POST to `/api/chat` with custom/preset prompt (`OK`) measuring response latency.
  - **Model Inventory**: Output equivalent to `sudo -u ollama -H ollama list` showing name, size (formatted in GB), modified timestamp, and quick `ollama run <name>` copy helper.
  - **Recent Service Logs**: Stream last N lines (50, 100, 200, 500) from `journalctl -u ollama -n N --no-pager -o short-iso` with keyword filter, timestamp highlighting, auto-scroll, and copy to clipboard.
  - **Host Resource Usage**: RAM and Swap gauges for the Ubuntu VPS.
  - **Auto-Refresh & Themes**: Configurable auto-refresh (10s, 30s, 60s, off), manual refresh trigger, dark & light theme toggle.
  - **v2 Extension Stubs**: Reserved UI and API stubs for PM2 processes and CoverTheEarth logs.

---

## Architecture & Security Model

```
Browser (HTTPS)
   │
   ▼ (subdomain e.g. ops.example.com)
┌────────────────────────────────────────────────────────┐
│ Nginx Reverse Proxy (SSL + Basic Auth / IP Allowlist) │
└───────────────────────────┬────────────────────────────┘
                            │ (http://127.0.0.1:9080)
┌───────────────────────────▼────────────────────────────┐
│ System Ops Express App (User: ops, Port: 9080)         │
│  - Session Auth & Password Protection                  │
│  - Rate Limiter (Max 10 chat probes / 15m)            │
│  - Public Leak-Free /health Endpoint                   │
└──────────────┬──────────────────────────┬──────────────┘
               │                          │
               ▼ (systemctl / journalctl)  ▼ (HTTP GET / POST)
   ┌───────────────────────┐   ┌──────────────────────────┐
   │ systemd (ollama.service)  │   │ Ollama Engine            │
   │ User: ollama          │   │ 127.0.0.1:11434          │
   └───────────────────────┘   └──────────────────────────┘
```

### Security Enforcement
- **Loopback Binding**: App binds exclusively to `127.0.0.1:9080`.
- **Zero Public Port Exposure**: Ollama's port 11434 is restricted to loopback (`127.0.0.1`).
- **Unprivileged Execution**: Runs under a dedicated `ops` user (or `deploy`).
- **Minimal Sudo Rule**: Narrow `/etc/sudoers.d/system-ops` rule strictly granting read-only journalctl/systemctl checks.
- **Authentication**: Double-layer protection using Express Session cookie auth and optional Nginx HTTP Basic Auth / IP allowlist.
- **Rate Limiting**: Express rate limiter protects API and chat probe endpoints from CPU exhaustion.
- **No Database / No Secrets Leakage**: Secrets are loaded from `.env` and excluded from API responses.

---

## Deliverables & File Layout

- `src/server.js`: Main Express backend server & endpoints.
- `src/services/systemService.js`: `systemctl`, `journalctl`, host metrics, and socket listener logic.
- `src/services/ollamaService.js`: Ollama API client calls (`/api/tags`, `/api/chat`).
- `src/middleware/auth.js`: Session cookie, password authentication & authorization.
- `src/middleware/rateLimiter.js`: Rate limiting protection.
- `public/index.html`: Responsive operations dashboard single-page application.
- `public/login.html`: Glassmorphism authentication login interface.
- `public/css/style.css`: Custom CSS design system with light/dark themes.
- `public/js/app.js`: Frontend dynamic rendering, polling, search filtering, and state management.
- `systemd/system-ops.service`: Production systemd service unit.
- `nginx/system-ops.conf`: Nginx server block with SSL, rate limiting, and Basic Auth options.
- `sudoers/system-ops-sudoers`: Sudoers policy for `journalctl` & `systemctl`.
- `scripts/install.sh`: Automated installation script for Ubuntu 24.04 LTS.
- `.env.example`: Template for environment settings.

---

## Installation & Setup Guide (Ubuntu 24.04 LTS)

### Quick Automated Installation

```bash
# Clone or place repository into /opt/system-ops
sudo git clone https://github.com/dineshkorukonda/system-ops.git /opt/system-ops
cd /opt/system-ops

# Run automated installer
sudo bash scripts/install.sh
```

### Manual Installation Steps

#### 1. Create Dedicated Unprivileged User
```bash
sudo useradd -r -s /bin/false -d /opt/system-ops ops
sudo usermod -aG systemd-journal,adm ops
```

#### 2. Install Dependencies & Build
```bash
cd /opt/system-ops
sudo npm ci --only=production
sudo cp .env.example .env
```

Edit `.env` to configure your `APP_PASSWORD` and `SESSION_SECRET`:
```bash
sudo nano /opt/system-ops/.env
```

Set file permissions:
```bash
sudo chown -R ops:ops /opt/system-ops
sudo chmod 750 /opt/system-ops
sudo chmod 600 /opt/system-ops/.env
```

#### 3. Install Narrow Sudoers Rules
```bash
sudo cp sudoers/system-ops-sudoers /etc/sudoers.d/system-ops
sudo chmod 0440 /etc/sudoers.d/system-ops
```

#### 4. Register & Enable systemd Unit
```bash
sudo cp systemd/system-ops.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now system-ops.service
sudo systemctl status system-ops.service
```

---

## Nginx & SSL Subdomain Setup

#### 1. Link Nginx Virtual Host
```bash
sudo cp nginx/system-ops.conf /etc/nginx/sites-available/system-ops.conf
# Edit subdomain domain name
sudo nano /etc/nginx/sites-available/system-ops.conf
sudo ln -s /etc/nginx/sites-available/system-ops.conf /etc/nginx/sites-enabled/
```

#### 2. Generate SSL Certificate with Certbot
```bash
sudo certbot --nginx -d ops.yourdomain.com
```

#### 3. Test & Reload Nginx
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## API Endpoints Reference

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | No | Public health probe returning `{"ok": true}` |
| `POST` | `/api/login` | No | Authenticates password & sets HTTP-only session cookie |
| `POST` | `/api/logout` | No | Clears authentication session cookie |
| `GET` | `/api/auth/status` | No | Returns `{ "authenticated": true/false }` |
| `GET` | `/api/status` | **Yes** | Consolidated systemd state, listener check, API health & host metrics |
| `GET` | `/api/logs?lines=100` | **Yes** | Fetches recent `journalctl -u ollama` logs |
| `GET` | `/api/models` | **Yes** | Returns parsed model list from API & CLI |
| `POST` | `/api/test-chat` | **Yes** (Rate-limited) | Runs quick chat probe test on `/api/chat` |
| `GET` | `/api/v2/pm2/status` | **Yes** | Stub endpoint for v2 PM2 integration (`501 Not Implemented`) |

---

## Screenshot / Visual Overview of Final Dashboard

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ SYSTEM OPS v1.0 // Ubuntu 24.04 LTS          [Ollama Healthy] [Auto-refresh: 30s] 🌙   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Last Updated: 07:05:00 AM  │ Process User: ollama  │ Host: ubuntu-24-vps               │
├───────────────────────────────────┬────────────────────────────────────────────────────┤
│ systemd Service                   │ Listener Check                                     │
│ [ ACTIVE ]                        │ [ 127.0.0.1:11434 ]                                │
│ SubState: running  PID: 4120      │ Public exposure: NONE (Safe)                       │
├───────────────────────────────────┼────────────────────────────────────────────────────┤
│ API Health (GET /api/tags)        │ Resource Usage                                     │
│ [ HTTP 200 OK ]                   │ RAM Usage:  2.10 GB / 8.00 GB [████░░░░░░] 26%     │
│ Latency: 12 ms  Models: 1         │ Swap Usage: 0.15 GB / 4.00 GB [█░░░░░░░░░] 3%      │
├───────────────────────────────────┴────────────────────────────────────────────────────┤
│ Quick Chat Probe (POST /api/chat)                                                     │
│ Model: [ llama3.2:3b ]  Prompt: [ OK ]  [ Run Chat Test ]                             │
│ Result: [ PASS ]  Latency: 184 ms  Response: "OK"                                      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Installed Ollama Models (sudo -u ollama -H ollama list)                                │
│ Name              Size       Modified Date            Digest         Action            │
│ llama3.2:3b       2.02 GB    08/03/2026, 06:40 AM     a80c4f12345    [ Run Cmd ]       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Recent Service Logs (journalctl -u ollama -n 100 --no-pager -o short-iso)              │
│ Filter: [ Search logs... ] [x] Auto-scroll [ Copy Logs ]                               │
│ 2026-08-03T06:50:12+00:00 ubuntu-24-vps ollama[4120]: Listening on 127.0.0.1:11434     │
│ 2026-08-03T06:50:12+00:00 ubuntu-24-vps ollama[4120]: [GIN] 200 | GET /api/tags        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ CoverTheEarth & PM2 Ops Integration [ v2 COMING SOON ]                                 │
│ [Stub] PM2 Process Manager (cte-backend-dev)                                           │
│ [Stub] PM2 Production Instance (cte-backend)                                           │
│ [Stub] CoverTheEarth BackEnd Log Tails                                                 │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Verification & Testing

To test the ops site locally before setting up Nginx:

```bash
# Start server in dev mode
npm start

# Verify leak-free public health check
curl -i http://127.0.0.1:9080/health
# Response: HTTP/1.1 200 OK -> {"ok":true}

# Verify unauthorized API access is blocked
curl -i http://127.0.0.1:9080/api/status
# Response: HTTP/1.1 401 Unauthorized -> {"error":"Unauthorized"}

# Verify authorized access with Bearer header
curl -i -H "Authorization: Bearer admin-password-change-me" http://127.0.0.1:9080/api/status
```

---

## License

MIT License. Designed for single-server VPS operations management.