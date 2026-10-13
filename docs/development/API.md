# API overview

The console consumes authenticated JSON endpoints. This is a source-aligned overview, not a versioned OpenAPI compatibility promise. Inspect routes in `src/server.js` and collector schemas before building a client.

## Authentication

`POST /api/login` accepts JSON with `password` and issues a browser session cookie. `POST /api/logout` revokes that session. API callers may use `Authorization: Bearer APP_PASSWORD`; that password grants administrator access and must remain private. See [authentication](../operations/AUTHENTICATION.md).

## Public health

| Endpoint | Meaning |
| --- | --- |
| `GET /health`, `GET /api/health` | HTTP process liveness |
| `GET /ready` | 200 when enabled critical collectors are fresh; otherwise 503 |
| `GET /api/auth/status` | Authentication status |
| `GET /api/v2/settings/branding` | Public branding only |

## Authenticated endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v2/system/snapshot` | Host resources with collection metadata |
| `GET /api/v2/system/processes` | Process inventory; `sort` and `limit` parameters |
| `GET /api/v2/system/capabilities` | Detected/available/enabled integrations |
| `GET /api/v2/ops/health`, `/api/v2/ops/diagnostics` | Collector freshness and diagnostics |
| `GET /api/v2/services/snapshot`, `/api/v2/services/logs` | Systemd inventory/journals |
| `GET /api/v2/pm2/snapshot`, `/api/v2/pm2/logs` | PM2 inventory/logs |
| `GET /api/v2/docker/snapshot`, `/api/v2/docker/logs` | Container inventory/logs |
| `GET /api/v2/traffic/analytics` | Bounded log-derived traffic analytics |
| `GET /api/v2/history` | Persisted observations/incidents |
| `GET /api/v2/checks` | Configured checks and coverage |
| `POST /api/v2/checks/:id/observations` | Import chronological external observations |
| `POST /api/v2/incidents/:id/acknowledge` | Acknowledge an incident |
| `GET /api/v2/notifications`, `POST /api/v2/notifications/test` | Delivery status/test |
| `GET /metrics` | Authenticated Prometheus exposition |
| `GET /api/v2/settings`, `PUT /api/v2/settings` | Read/update persistent settings |
| `GET /api/v2/system/version` | Version/update availability |
| `POST /api/v2/system/update`, `GET /api/v2/system/update/status` | Native updater launch/status |

Missing initial critical samples may produce 503. Optional missing integrations and permission failures must be interpreted using collection metadata, not converted into healthy empty data. Log endpoints apply rate limits and bounded tails. The native updater additionally requires password confirmation in its request body and working sudo/systemd permissions.
