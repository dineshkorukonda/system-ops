# system-ops

Lightweight self-hosted operations console and telemetry dashboard for single Ubuntu VPS deployments.

Standardizes entirely on native Linux `systemd` and kernel metrics to provide full-stack observability over services, Ollama LLMs, host health, and Nginx traffic in under 35MB of RAM.

---

## Live Documentation & Setup Guide

For the full interactive guide, copyable `.env` configurations, and custom subdomain deployment instructions, visit:

**[https://system-ops.dineshkorukonda.online/](https://system-ops.dineshkorukonda.online/)**

---

## 1-Line Quickstart

Run this on your Ubuntu VPS as root or with sudo:

```bash
git clone https://github.com/dineshkorukonda/system-ops.git /opt/system-ops && cd /opt/system-ops && sudo bash scripts/install.sh
```

---

## Deploy at Custom Subdomain (SSL)

Automate Nginx reverse proxy configuration and Let's Encrypt SSL issuance in a single command:

```bash
sudo bash /opt/system-ops/scripts/setup-domain.sh ops.yourdomain.com admin@yourdomain.com
```

---

## Core Capabilities

- System Health: Real-time SVG sparklines for CPU Load (1m), RAM %, and Swap %. Load averages (1m/5m/15m), disk partition meters, listening ports, and TLS cert expiry countdowns.
- Systemd Services Fleet: Unified inspection of all tracked services (Node apps, Ollama, Nginx, PostgreSQL) with active state, memory consumption, PID, and live streaming `journalctl` log viewer.
- Process Monitor: Searchable, sortable process table with PID, user, CPU%, RAM%, RSS, and command execution details.
- Ollama AI: Model registry (`ollama list`), loopback socket bound check, API latency probe, and token-capped quick inference probe.
- PostgreSQL Backups: Backup log tail with status analysis (SUCCESS / FAILED), and direct `.dump` file downloads.
- Traffic & GeoIP Analytics: Streaming Nginx access log parser, mobile vs desktop breakdown, HTTP status code distribution, top requested endpoints, and Leaflet GeoIP visitor map.

---

## License

MIT (c) 2026 Dinesh Korukonda