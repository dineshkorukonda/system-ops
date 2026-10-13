# Updates and recovery

Native updates stage a candidate release, validate it, build frontend assets, and switch the active symlink with readiness-gated rollback. They do not reset the live checkout or clear its assets.

## Before updating

Back up the environment file and persistent data. Keep SSH access independent of the dashboard. Confirm Node.js 24 and service-account permissions. The native updater currently follows `origin/main`; published release artifacts do not yet change that update channel.

```bash
sudo bash /opt/system-ops/scripts/deploy.sh
```

Settings → Update now invokes the native background worker where supported. Automatic daily updates are optional; enable them only after validating the recovery path for your deployment.

## Recovery

```bash
sudo bash /opt/system-ops/scripts/recover.sh
sudo systemctl status system-ops.service
sudo journalctl -u system-ops.service -n 100 --no-pager
curl -i http://127.0.0.1:9080/ready
```

An old installation with a broken dashboard launcher needs an initial SSH update. See [atomic releases](ATOMIC-RELEASES.md) for the one-time permission/wrapper repair and custom-port readiness configuration.

Rollback preserves shared data; it cannot undo an incompatible schema migration. Future schema changes need explicit backup/rollback instructions. The current helper retains release directories rather than deleting them automatically.

## Docker

Update your source checkout, rebuild/recreate the image, and keep the data volume:

```bash
git pull --ff-only
docker compose --env-file .env.docker up -d --build
```

Record the previous image/source revision so you can recreate it if needed. The default container does not support the native dashboard updater. See [installation limits](INSTALLATION.md).
