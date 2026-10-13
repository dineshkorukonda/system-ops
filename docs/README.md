# Documentation

System Ops brings host resources, runtime inventory, logs, and optional monitoring integrations into one self-hosted console for a single Ubuntu VPS.

## Start here

- [Quick start](QUICKSTART.md): install and open the console.
- [Installation](INSTALLATION.md): native Ubuntu/systemd, Docker, and deployment limits.
- [Configuration](CONFIGURATION.md): credentials, binding, storage, and integrations.
- [Troubleshooting](TROUBLESHOOTING.md): common permission, discovery, and update failures.

## Operate

- [Authentication](AUTHENTICATION.md)
- [Integration discovery](INTEGRATIONS.md)
- [PM2 monitoring](PM2-MONITORING.md)
- [Discovery and navigation](DISCOVERY-AND-UI.md)
- [Availability checks, alerts, and metrics](CHECKS-ALERTS-AND-METRICS.md)
- [Persistent history and incidents](DURABLE-MONITORING.md)
- [Traffic retention](TRAFFIC-RETENTION.md)
- [Updates and recovery](UPDATES.md)
- [Atomic release details](ATOMIC-RELEASES.md)
- [API overview](API.md)

## Develop and contribute

- [Contributing](../CONTRIBUTING.md)
- [Architecture](ARCHITECTURE.md)
- [Collector ownership](COLLECTOR-OWNERSHIP.md)
- [Collector scheduling](COLLECTOR-SCHEDULING.md)
- [Release process](RELEASING.md)
- [Publish the public site](PUBLIC-SITE.md)
- [Resource measurements](RESOURCE-BASELINE.md)
- [Reliability evidence](RELIABILITY-EVIDENCE.md)
- [Support](../SUPPORT.md), [security](../SECURITY.md), and [governance](../GOVERNANCE.md)

The public site renders these maintained Markdown sources. Run `npm run docs:build` before publishing `web/`. Historical planning files under `docs/superpowers/` are design records, not current installation instructions.

## Scope

Native Ubuntu/systemd is the primary host-monitoring deployment. Docker provides a narrower view. Integration availability depends on installed services, permissions, and configuration. The console uses one administrator password; it does not provide multi-user roles. Backup listings and log indicators do not prove restorability. Memory, uptime, and deployment claims need measured evidence from the relevant environment.
