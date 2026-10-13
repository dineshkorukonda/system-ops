# Documentation

System Ops brings host resources, runtime inventory, logs, and optional monitoring integrations into one self-hosted console for a single Ubuntu VPS.

## Start here

- [Quick start](getting-started/QUICKSTART.md): install and open the console.
- [Installation](getting-started/INSTALLATION.md): native Ubuntu/systemd, Docker, and deployment limits.
- [Configuration](getting-started/CONFIGURATION.md): credentials, binding, storage, and integrations.
- [Troubleshooting](getting-started/TROUBLESHOOTING.md): common permission, discovery, and update failures.

## Operate

- [Authentication](operations/AUTHENTICATION.md)
- [Integration discovery](operations/INTEGRATIONS.md)
- [PM2 monitoring](operations/PM2-MONITORING.md)
- [Discovery and navigation](operations/DISCOVERY-AND-UI.md)
- [Availability checks, alerts, and metrics](operations/CHECKS-ALERTS-AND-METRICS.md)
- [Persistent history and incidents](operations/DURABLE-MONITORING.md)
- [Traffic retention](operations/TRAFFIC-RETENTION.md)
- [Updates and recovery](operations/UPDATES.md)
- [Atomic release details](releases/ATOMIC-RELEASES.md)
- [API overview](development/API.md)

## Develop and contribute

- [Contributing](../.github/CONTRIBUTING.md)
- [Architecture](development/ARCHITECTURE.md)
- [Collector ownership](development/COLLECTOR-OWNERSHIP.md)
- [Collector scheduling](development/COLLECTOR-SCHEDULING.md)
- [Release process](releases/RELEASING.md)
- [Publish the public site](development/PUBLIC-SITE.md)
- [Resource measurements](releases/RESOURCE-BASELINE.md)
- [Reliability evidence](releases/RELIABILITY-EVIDENCE.md)
- [Support](../.github/SUPPORT.md), [security](../.github/SECURITY.md), and [governance](community/GOVERNANCE.md)

The public site renders these maintained Markdown sources. Run `npm run docs:build` before publishing `web/`. Historical planning files under `docs/superpowers/` are design records, not current installation instructions.

## Scope

Native Ubuntu/systemd is the primary host-monitoring deployment. Docker provides a narrower view. Integration availability depends on installed services, permissions, and configuration. The console uses one administrator password; it does not provide multi-user roles. Backup listings and log indicators do not prove restorability. Memory, uptime, and deployment claims need measured evidence from the relevant environment.
