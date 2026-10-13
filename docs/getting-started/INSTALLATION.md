# Installation

## Native Ubuntu/systemd

The primary deployment is a single Ubuntu host with systemd. Debian is recognized by the installer but should be validated on your distribution before relying on it. The installer needs root access, network access to package repositories/GitHub, and an interactive terminal. It installs Node.js 24.x, builds the React assets, creates the `ops` account, and installs the service and read permissions.

Follow [quick start](QUICKSTART.md). Review `scripts/install.sh`, `systemd/`, and `sudoers/` before installation. The default path is `/opt/system-ops`; the installer does not expose custom-path flags. A standalone Node server on Windows/macOS cannot provide Linux systemd and host-security parity.

Running the installer again on an existing Git installation delegates to the staged updater and preserves configuration and working files. A pre-existing directory without a Git installation is refused. When invoked from a local repository, installation clones committed source and sets the public upstream; it does not copy uncommitted work, `.env`, or a worktree's Git pointer.

The Go collector is optional. If enabled, its build needs the toolchain declared in `go-collector/go.mod`. Node collectors remain available when the sidecar is absent or unhealthy.

## Docker Compose

```bash
git clone https://github.com/dineshkorukonda/system-ops.git
cd system-ops
cp .env.docker.example .env.docker
# Set APP_PASSWORD, SESSION_SECRET, and any mounted paths in .env.docker.
docker compose --env-file .env.docker up -d --build
```

The multi-stage image includes built frontend assets. Persistent settings/history live in the `system-ops-data` volume. Do not remove that volume when recreating containers. Use HTTPS or a private network for access.

## Deployment comparison

| Capability | Native Ubuntu/systemd | Default Docker image |
| --- | --- | --- |
| Resource/process collection | Host view | Container `/proc` view |
| Host systemd journals/security/package commands | With configured permissions | Unavailable |
| Mounted logs and backup files | With configured permissions | With explicit readable mounts |
| PM2/Docker discovery | Host runtimes with configured readers | Requires explicit CLI/socket setup; no parity guarantee |
| Dashboard native updater | Supported after permissions setup | Unavailable; rebuild/recreate image |
| Optional Go sidecar | Supported when built/configured | Not packaged by default |

Mounting `/host/proc` does not make current collectors read the host's metrics. Mounting the Docker socket does not install a Docker CLI and gives the container powerful host access. Keep mounts limited to the data you need and review the comments in `docker-compose.yml`.

## Development

See [Contributing](../../.github/CONTRIBUTING.md) for local setup and checks. Use `npm ci` to install the locked dependency graph. Production startup rejects empty/example credentials; see [configuration](CONFIGURATION.md).
