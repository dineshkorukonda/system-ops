# Configuration

Use `.env.example` for native/development installs and `.env.docker.example` for Compose. Set real values locally; never commit credentials. The examples and source are the authoritative list of environment settings.

## Core settings

| Setting | Purpose |
| --- | --- |
| `HOST`, `PORT` | HTTP binding; native defaults are `127.0.0.1:9080` |
| `APP_PASSWORD` | Shared administrator/API password; set a unique strong value |
| `SESSION_SECRET` | Random secret, at least 32 bytes; required in production |
| `TRUST_PROXY` | Only trusted reverse-proxy addresses; `loopback` for local Nginx |
| `COOKIE_SECURE` | Force HTTPS cookies when the deployment uses TLS |
| `SYSTEM_OPS_DATA_DIR` | Persistent settings, history, incident, and update state |
| `SITE_NAME`, `SITE_SUBTITLE` | Initial branding before saved settings exist |
| `ENABLE_GO_COLLECTOR`, `GO_COLLECTOR_URL` | Optional sidecar selection and endpoint |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Store it in your environment file. Production validation rejects missing/default credentials without printing credential values. Protect the file with mode 0600 and restart the service after environment changes:

```bash
sudo systemctl restart system-ops.service
```

## Integration settings

`SYSTEMD_UNITS`, `DISK_PATHS`, `TLS_HOSTS`, `LOG_SOURCES`, `BACKUPS_DIR`, `NGINX_LOG_PATH`, and `TRACKED_DOMAINS` select data sources. PM2 discovery supports configured users/homes/binaries and a restricted native helper. Docker needs an accessible CLI and local socket. Read [integration discovery](INTEGRATIONS.md) and [PM2 monitoring](PM2-MONITORING.md) before broadening permissions.

Availability checks and integration enablement are configured through Settings; persistent settings may override initial defaults. Optional absence is different from a failing configured source. Use diagnostics and collector status to distinguish them.

## Notifications and persistence

Set `SYSTEM_OPS_WEBHOOK_URL` and, where needed, `SYSTEM_OPS_WEBHOOK_TOKEN` for alerts. The receiver must deduplicate stable idempotency keys. Keep destinations/tokens private. See [checks and alerts](CHECKS-ALERTS-AND-METRICS.md).

Keep the data directory on persistent storage and back it up before upgrades. SQLite history is bounded by retention settings; backup dump files are separate operator-managed data. In Compose, use the named volume and explicit mounts for host files. Do not reuse production data in tests.
