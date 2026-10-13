# PM2 app discovery and detail URLs

Enable PM2 monitoring first. It discovers accounts from PM2_USERS, readable account homes with .pm2 directories, PM2_HOME for the current account, and the cross-user helper configuration. Monitoring probes an existing daemon socket before invoking PM2; it does not intentionally start a missing daemon. A daemon exit between probe and CLI invocation is still a race inherent to the PM2 CLI.

Native installation and updated deployments run a one-time root filesystem scan of existing daemon sockets. This fills missing cross-user helper entries for accounts such as `root` and `dinesh`, discovers safely owned NVM/Volta/global executables, and refreshes the root-owned read-only helper. Existing operator-configured entries are preserved. No PM2 CLI or daemon is started by this setup scan. Unreadable account homes remain unresolved candidates; an empty/inaccessible inventory is reported as unavailable rather than healthy zero apps.

For an existing host bootstrapping through an older release helper, run this after deploying the repaired release:

```bash
sudo env INSTALL_DIR=/opt/system-ops OPS_USER=ops /usr/bin/node /opt/system-ops/current/scripts/setup-runtime-discovery.js
sudo systemctl restart system-ops.service
```

The command prints the detected PM2 accounts, approved binary paths, local Docker sockets, and any setup issues. If a daemon uses a nonstandard home or binary, configure `PM2_HOME_ROOT` / `PM2_PATH_ROOT` or `PM2_HOME_DINESH` / `PM2_PATH_DINESH` in `.env`, then repeat setup. These paths must belong to the target account or root, with no writable parent directories belonging to other users. Advanced intentionally shared installations can continue to use explicit root-owned helper configuration.

The same setup records standard and rootless Docker sockets and grants only inventory/network/stats/log reads against observed local sockets. Discovery and collection share socket selection: explicit context, explicit host, explicit socket, an existing current-account rootless socket, standard socket, then recorded sockets. It does not grant Docker mutation commands or automatically enable monitoring. Sidebar category counts represent visible views, not processes or containers.

Current-account monitoring uses the account's actual home, optional PM2_HOME, PM2_PATH_USER, and cached binary discovery. Negative lookups cache for one minute and successful paths for ten minutes; an explicit rescan clears that cache. Discovery does not execute jlist repeatedly to validate a path. User collection runs sequentially, under the collector deadline and command limits.

For cross-user access, install the root-owned helper through the installer. Add explicit lines to root-owned `/etc/system-ops/pm2-monitor.conf`:

```text
# account|PM2_HOME|PM2 binary|Node bin directory
deploy|/home/deploy/.pm2|/home/deploy/.nvm/versions/node/v24.19.0/bin/pm2|/home/deploy/.nvm/versions/node/v24.19.0/bin
```

Use the paths installed on your server. The config must not be group/world writable. The sudoers rule permits only the fixed helper; caller arguments cannot choose a binary, home, PATH, or mutation. It accepts probe, binary lookup, jlist, and bounded logs for numeric app IDs, switching to the configured account before running its binary. The helper itself must remain root-owned outside the writable app checkout.

The inventory retains failed accounts and marks incomplete totals. Up to 16 accounts and 500 apps per account are supported. Duplicate app names retain separate PM2 IDs. Click an app to open `#pm2/account/id`, showing its status, resources, restart count, uptime and log tail. Share or reload that URL to return to the app. An absent app is reported explicitly. Opening the fleet does not automatically tail the first app.

The Ubuntu CI fixture starts three real apps across two isolated daemon homes/users, checks duplicate-name IDs and bounded logs, and includes one failed account. Its report is not evidence from your production `/ops-dk` host.
