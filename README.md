# system-ops

Lightweight self-hosted operations console for a single Ubuntu VPS. Under 35 MB RAM on a native systemd install.

**Full docs and feature tour:** [system-ops.dineshkorukonda.online](https://system-ops.dineshkorukonda.online/)

---

## Features

| Area | What you get |
|------|----------------|
| **System health** | CPU/RAM/swap sparklines, disk meters, listening ports, TLS expiry |
| **Services** | systemd fleet + live journalctl logs |
| **Security** | UFW firewall rules and fail2ban banned IPs in plain language |
| **Databases** | PostgreSQL, Redis, and MySQL reachability probes |
| **Certbot** | Let's Encrypt certificate inventory and renewal hints |
| **OS updates** | Pending apt package count banner |
| **Backups** | PostgreSQL dump listing and log tailing (when configured) |
| **Traffic** | Nginx access log analytics with GeoIP map |
| **PM2 / Docker** | Optional fleet views when those runtimes are present |
| **Self-update** | Pull latest from Settings, or run `deploy.sh` / `recover.sh` over SSH |

---

## Install (recommended)

One command on Ubuntu / Debian as root:

```bash
curl -sSL https://raw.githubusercontent.com/dineshkorukonda/system-ops/main/scripts/install.sh | bash
```

The installer prompts for your admin password, detects running services, generates secrets, builds the dashboard, and installs systemd units.

Custom subdomain + HTTPS:

```bash
sudo bash /opt/system-ops/scripts/setup-domain.sh ops.yourdomain.com admin@yourdomain.com
```

---

## Update

From the server:

```bash
sudo bash /opt/system-ops/scripts/deploy.sh
```

Or use **Settings → Update now** in the dashboard.

If the dashboard update fails or the site is down:

```bash
sudo bash /opt/system-ops/scripts/recover.sh
```

---

## Docker (optional)

Docker is supported for read-only host monitoring. Native systemd install is recommended for full features (Go sidecar, in-dashboard updates, security collectors).

```bash
cp .env.docker.example .env.docker
# edit APP_PASSWORD and paths, then:
docker compose --env-file .env.docker up -d --build
```

Notes:

- The image runs a multi-stage build so the React UI is included.
- Mount `/var/run/docker.sock` only if you need the Docker page (see security comment in `docker-compose.yml`).
- Set `BACKUPS_DIR` and add a volume mount when backup files live on the host.

---

## Development

```bash
git clone https://github.com/dineshkorukonda/system-ops.git
cd system-ops
npm install
cp .env.example .env   # set APP_PASSWORD
npm run build          # produces dist/
npm start              # http://127.0.0.1:9080
```

Run tests:

```bash
npm test
```

Frontend hot reload (proxies API to port 9080):

```bash
npm run dev & npx vite
```

Configuration reference: [`.env.example`](.env.example)

Troubleshooting: [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md)

Changelog: [`CHANGELOG.md`](CHANGELOG.md)

---

## Marketing site

Static landing page source lives in [`web/`](web/). Sync `web/` to your static host (e.g. the nginx vhost for `system-ops.dineshkorukonda.online`) after changes.

---

MIT © 2026 Dinesh Korukonda
