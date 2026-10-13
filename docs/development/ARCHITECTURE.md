# Architecture

System Ops keeps React/Vite for the console and Express for the HTTP API. A collector manager schedules enabled integrations and caches snapshots with collection metadata. Optional adapters inspect local services, commands, logs, and configured endpoints.

## Boundaries

- `src/client/`: console views, navigation, and shared UI.
- `src/server.js` and `src/start.js`: HTTP routing, authentication, and startup.
- `src/core/`: collector lifecycle and cached state.
- `src/collectors/`: resource, runtime, log, and integration adapters.
- `src/services/`: persistent settings/history, checks, incidents, notifications, and updates.
- `go-collector/`: optional host collector; Node remains the fallback.
- `scripts/`, `systemd/`, `sudoers/`: installation, fixtures, and native deployment.
- `web/`: public marketing assets; `docs/` and `.github/` community files are rendered into `web/docs/`.
- `config/`: Vite, Playwright, and collector TypeScript configuration; standard host discovery files stay at the root.

Documentation is grouped under `docs/getting-started/`, `docs/operations/`, `docs/development/`, `docs/releases/`, `docs/community/`, and `docs/plans/`. GitHub-recognized contribution/support/security/conduct policies live in `.github/`. The root keeps README, LICENSE, and AGENTS as entry points.

HTTP liveness and collection readiness are separate. Snapshot failures preserve last-good values and timestamps; missing data must remain unknown/stale. Read [collector ownership](COLLECTOR-OWNERSHIP.md) and [scheduling](COLLECTOR-SCHEDULING.md) before adding a collector.

SQLite stores bounded history/checks/incidents and a notification outbox. It is not a replacement for an external monitoring system. Local probes cannot prove availability of their own host during an outage. Prometheus/Grafana integration is optional and has separate resource costs.

## Public documentation

`scripts/build-site.mjs` renders the explicit page catalog in `web/pages.json`, generates a search index and sitemap, and rewrites Markdown links to published routes. The public site is static and has no access to console credentials or APIs. `npm run docs:check` validates repository/published links and page metadata. `npm run site:dev` serves a local preview after a build.
