# Quick start

Use a Ubuntu VPS with systemd and administrator access. The installer installs Node.js 24, builds the console, creates the `ops` service account, and configures selected read permissions. Review the script before running it.

```bash
curl -fsSL https://raw.githubusercontent.com/dineshkorukonda/system-ops/main/scripts/install.sh -o /tmp/system-ops-install.sh
less /tmp/system-ops-install.sh
sudo bash /tmp/system-ops-install.sh
```

Choose a strong administrator password. Automatic updates and domain setup are optional prompts. The default server binds to loopback on port 9080.

## Open the console

For private access, open an SSH tunnel from your computer:

```bash
ssh -L 9080:127.0.0.1:9080 your-user@your-vps
```

Then visit http://127.0.0.1:9080 and sign in. For a public hostname, configure HTTPS:

```bash
sudo bash /opt/system-ops/scripts/setup-domain.sh ops.yourdomain.com admin@yourdomain.com
```

Use the hostname after setup succeeds. Do not treat the installer's displayed public IP URL as a reachable endpoint when the server binds to loopback.

## Verify

```bash
sudo systemctl status system-ops.service
curl -i http://127.0.0.1:9080/ready
sudo journalctl -u system-ops.service -n 50 --no-pager
```

`/ready` may return 503 during initial collection. A healthy response means enabled critical collectors have recent samples; it does not mean every monitored service is healthy. Start with detected sources, enable the integrations you need, and check diagnostics for missing permissions.

Next: [configuration](CONFIGURATION.md), [updates and recovery](UPDATES.md), or [troubleshooting](TROUBLESHOOTING.md).
