# Go Collector Sidecar

Optional lightweight collector for Linux system telemetry. Node uses it automatically when available and falls back to built-in collectors otherwise.

## What it handles

- `/v1/system/snapshot` — uptime, memory, swap, disk, systemd units, ports
- `/v1/processes` — `/proc`-based process sampling with CPU deltas
- `/health` — availability probe

TLS certificate checks stay in Node because they depend on domain discovery.

## Run locally (Linux)

```bash
cd go-collector
go build -o bin/system-ops-collector .
./bin/system-ops-collector
```

Defaults to `http://127.0.0.1:9081`.

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `GO_COLLECTOR_HOST` | `127.0.0.1` | Bind address |
| `GO_COLLECTOR_PORT` | `9081` | Bind port |
| `ENABLE_GO_COLLECTOR` | enabled | Set `false` to disable |
| `GO_COLLECTOR_URL` | `http://127.0.0.1:9081` | Node client URL |
| `DISK_PATHS` | `/,/var` | Disk paths to monitor |
| `SYSTEMD_UNITS` | `system-ops` | Units to inspect |

## Production

`scripts/install.sh` and `scripts/deploy.sh` build the binary when Go is installed and enable `system-ops-collector.service`.
