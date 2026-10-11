# PM2 app discovery and detail URLs

Enable PM2 monitoring first. It discovers accounts from PM2_USERS, readable account homes with .pm2 directories, PM2_HOME for the current account, and the cross-user helper configuration. Monitoring probes an existing daemon socket before invoking PM2; it does not intentionally start a missing daemon. A daemon exit between probe and CLI invocation is still a race inherent to the PM2 CLI.

Current-account monitoring uses the account's actual home, optional PM2_HOME, PM2_PATH_USER, and cached binary discovery. Negative lookups cache for one minute and successful paths for ten minutes; an explicit rescan clears that cache. Discovery does not execute jlist repeatedly to validate a path. User collection runs sequentially, under the collector deadline and command limits.

For cross-user access, install the root-owned helper through the installer. Add explicit lines to root-owned `/etc/system-ops/pm2-monitor.conf`:

```text
# account|PM2_HOME|PM2 binary|Node bin directory
deploy|/home/deploy/.pm2|/home/deploy/.nvm/versions/node/v24.19.0/bin/pm2|/home/deploy/.nvm/versions/node/v24.19.0/bin
```

Use the paths installed on your server. The config must not be group/world writable. The sudoers rule permits only the fixed helper; caller arguments cannot choose a binary, home, PATH, or mutation. It accepts probe, binary lookup, jlist, and bounded logs for numeric app IDs, switching to the configured account before running its binary. The helper itself must remain root-owned outside the writable app checkout.

The inventory retains failed accounts and marks incomplete totals. Up to 16 accounts and 500 apps per account are supported. Duplicate app names retain separate PM2 IDs. Click an app to open `#pm2/account/id`, showing its status, resources, restart count, uptime and log tail. Share or reload that URL to return to the app. An absent app is reported explicitly. Opening the fleet does not automatically tail the first app.

The Ubuntu CI fixture starts three real apps across two isolated daemon homes/users, checks duplicate-name IDs and bounded logs, and includes one failed account. Its report is not evidence from your production `/ops-dk` host.
