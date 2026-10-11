# System Ops improvement plan

Date: 2026-10-11
Status: Implementation underway; changes are published for review and have not been deployed.

GitHub roadmap: https://github.com/dineshkorukonda/system-ops/issues/33

- #34 deployment/configuration and #35 readiness/freshness have reached `main` through PRs #50–52.
- #36–42 and #60: resource measurement, revocable authentication, explicit integration scheduling, cancellation/concurrency limits, active-view fetching, bounded traffic retention, collector ownership and dependency patches are implemented. PRs #53–59 and #61 were merged into feature branches; their changes are consolidated into one PR targeting `main`.
- #30/#32: pending PM2 work is included in that consolidation: failed-user visibility, distinct application IDs/detail links, correct memory fields, cached discovery and a restricted cross-user helper. A disposable Ubuntu fixture validates real PM2 processes and logs; its CI receipt must pass before treating the fixture as verified.
- Local consolidated checks: 87 tests, collector type checking, frontend build and production smoke test passed; dependency audit reports zero known advisories.
- Earlier same-machine Ubuntu measurements reduced traffic peak RSS from roughly 268 MiB to 96 MiB and average app CPU from 14.6% to 1.7% in a short generated-log scenario. See the raw CI comparison artifacts; these are not production or 24-hour soak measurements.
- #43–49 remain roadmap work: primary-navigation redesign, bounded persistence, HTTP/TCP uptime checks, notification deduplication, Prometheus/Grafana integration, atomic upgrades/rollback and a verified 24-hour soak. Consolidating the existing fixes does not complete these items.

The findings below record the initial local inspection. Implementation issues were refined against the latest GitHub main branch, which already contained some packaging and credential-variable fixes.

## Product direction

Build a reliable, resource-conscious operations console for a single Ubuntu VPS. Its primary job is to answer: what needs attention, what evidence supports that status, and what can the operator do next?

Keep detailed monitoring infrastructure optional. Prometheus owns time-series storage and alert rules; Grafana owns dashboard exploration; Uptime Kuma provides uptime checks and notifications. Integrate with those tools when needed rather than rebuilding all their capabilities inside this app. Hosting extra tools consumes resources too; an external monitoring deployment is an option, not a free resource optimization.

Assumption: the intended audience remains a single VPS administrator. Multi-host, multi-user, enterprise requirements would change this scope.

## Findings from the repository

These are static code findings, not production measurements or confirmed causes of observed CPU/RAM usage. No live Ubuntu host was profiled, no browser usability study was performed, and no tests were run for this planning pass.

| Concern | Evidence | Consequence |
| --- | --- | --- |
| Background work | `src/core/scheduler.js` registers 14 collectors, all enabled by default; system runs every 4 seconds, processes every 5 seconds, Docker and traffic every 10 seconds. | Optional integrations are scheduled even without a user viewing them. Measure their actual cost. |
| Scheduling resilience | `src/core/collectorManager.js` starts initial collectors together and uses fixed intervals. It prevents overlap per collector but has no global concurrency budget, collection deadline, or failure backoff. | Expensive collectors can run concurrently; one hanging initial collection delays scheduling for all collectors. |
| Health trust | `/health` and `/api/health` in `src/server.js` always return `{ok:true}`. | They demonstrate that HTTP responds, not that monitoring is ready or fresh. Preserve liveness and add a distinct readiness contract. |
| History and correctness | `src/core/stateStore.js` retains 300 in-memory points; `src/core/scheduler.js` writes one-minute load average to the history named `cpu`, and skips zero load values. | History disappears on restart; load average must not be described as CPU utilization. |
| Frontend fetching | `src/client/App.jsx` fetches all integrations on login, has empty fetch error handlers, and sets the refresh timestamp after settled requests even when they failed. | Unnecessary initial work and misleading freshness; later polling is already view-specific and pauses in hidden tabs. |
| Deployment parity | Docker copies `src` and `public`, but omits `dist` and `plugins`, although the scheduler imports the PM2 plugin. Docker uses `src/server.js`; systemd uses `src/start.js`. Compose supplies `AUTH_PASSWORD`; auth reads `APP_PASSWORD`. | Startup, UI version, configuration, and failure behavior differ between deployment paths. |
| Upgrade reliability | `scripts/deploy.sh` resets the live checkout and removes `dist` before building. | A failed build can remove the previous UI; releases need staging and rollback. |
| Memory suspects | Traffic processing lazily loads `geoip-lite`, parses user agents, and retains up to 100,000 device keys globally and per domain. Endpoint/IP maps have 500-entry limits. | Profile enrichment and domain cardinality; existing bounds help but do not establish a small total memory footprint. |
| Authentication | Static password-derived session tokens, fallback credentials, and substring matching in the auth-status endpoint. | Authentication behavior needs exact matching, explicit production configuration, expiring revocable sessions, and consistent cookie handling. |
| Product complexity | Separate screens for host health, processes, Docker, PM2, systemd, Ollama, databases, backups, traffic, security, Monix, settings, integrations, and troubleshooting. | Design around operator tasks, with integration details beneath a small primary navigation. |

Existing strengths to preserve: cache-first snapshot APIs, per-collector overlap protection, bounded chart buffers, incremental traffic reads with rotation detection, configurable intervals, test files, and optional Go sampling.

## Phase 1 — Establish the baseline and repair trust

1. Reproduce native installation on a disposable Ubuntu VM and container installation separately. Record versions, commands, configuration, and startup failures.
2. Profile app-owned Node, Go, and subprocess work together: CPU, RSS, event-loop delay, child-process count, collector duration, errors, skipped runs, API latency, and payload size. Separate observer overhead from host workload.
3. Compare idle/no browser, one active dashboard, multiple dashboards, traffic burst, log rotation, missing integrations, and failed integrations. Record baseline hardware, logs, and enabled features.
4. Fix missing Docker artifacts/imports and password variable mismatch; standardize the entrypoint and validate required production configuration.
5. Separate liveness from readiness. Readiness depends on fresh successful critical collection; optional unavailable integrations must not fail the whole console.
6. Represent collecting, healthy, stale, unavailable, unsupported, disabled, and error states. Show source, last successful collection, age, and error reason. Never turn collection failure into a healthy zero.
7. Correct CPU/load naming and zero-value handling; align frontend freshness with successful responses.
8. Repair exact authentication validation and replace non-expiring shared session tokens with revocable, expiring sessions. Ensure secure cookies behind the configured HTTPS proxy.

Exit gate: repeatable startup on supported Ubuntu, accurate unhealthy/stale behavior during injected failures, documented baseline, and exact authentication checks passing.

## Phase 2 — Reduce background overhead

1. Introduce persisted integration enablement and capability-aware scheduling. Enabled monitors continue with the browser closed; disabled integrations do not collect. Discovery runs slowly or manually.
2. Add a global collection concurrency limit, staggered scheduling, per-collector deadlines with actual cancellation, and bounded retry backoff. Limit subprocess duration/output/concurrency and terminate subprocess trees on timeout.
3. Separate cheap host measurements from slow disk, systemd, certificate, runtime discovery, and traffic enrichment work. Cache and reuse shared discovery results.
4. Fetch only the overview and active view at login. Prevent overlapping refreshes; abort obsolete requests; poll logs only when requested.
5. Make GeoIP/user-agent enrichment optional; bound traffic retention by time and cardinality and expose dropped/sampled counts. Distinguish sampled traffic estimates from full totals.
6. Compare Node and Go sampling under the same workload. Choose one default implementation from evidence. If Go wins enough to justify two processes, give it sole ownership of host/process sampling; make fallback mode explicit and observable. Otherwise remove the sidecar later.

Proposed acceptance targets, to validate after baseline: core console total steady-state RSS at most 150 MiB and average background CPU below 1% of one logical CPU over 30 minutes on a declared reference host, with optional enrichment disabled. Cached API p95 below 200 ms for five simultaneous viewers. After warm-up, RSS must plateau during a 24-hour soak, with no sustained unexplained growth. Measure optional integrations and external monitoring services separately. These are targets, not existing guarantees or universal industry standards.

Exit gate: before/after evidence for the same workloads, stable memory, bounded collection work, and no loss of required monitoring freshness.

## Phase 3 — Simplify the user experience

Primary navigation: Overview, Services, Host, Activity, Settings.

- Overview: actionable incidents first, service availability, resource pressure, backup freshness, and collection freshness. Include a clear empty state when nothing needs attention.
- Services: one inventory for systemd, PM2, Docker, and enabled runtimes; open logs and evidence inside service details. Availability and application health remain distinct.
- Host: CPU utilization, load, RAM, disks, network, and processes, with units and useful time ranges.
- Activity: incident history, uptime transitions, backup outcomes, and optional traffic details.
- Settings: integration enablement, intervals, retention, credentials, updates, and diagnostics.

Use fewer badges and tables on the overview, consistent status semantics, readable text, keyboard navigation, mobile layouts, and clear loading/error/empty states. Keep detailed technical diagnostics accessible in details and settings.

Exit gate: representative operators can identify a failed service, inspect supporting evidence, and find its logs without guidance. Validate desktop/mobile and keyboard use with working interactions, not screenshots alone.

## Phase 4 — Add durable monitoring and interoperability

1. Add SQLite for settings, incidents, check outcomes, and a small bounded local history. Define migrations, retention, restart recovery, and disk-failure behavior. Avoid writing every detailed process list to disk.
2. Add configured HTTP/TCP checks with timeouts, expected responses, state transitions, and persisted results. Define uptime denominators and treat unknown periods explicitly.
3. Add one notification destination first, with test delivery, deduplication, cooldowns, retries, recovery messages, and maintenance windows. Do not declare delivery success without receiver acknowledgement.
4. Expose a protected Prometheus-compatible `/metrics` endpoint with stable names, units, labels, freshness, and collector self-monitoring. Bound labels; do not use arbitrary request paths, IP addresses, or user agents as metric labels.
5. Provide optional Prometheus/Grafana configuration and dashboard examples. Retain existing external uptime integration where useful; require a probe outside the monitored VPS to detect a full-host outage.

Exit gate: checks and history survive restart; a controlled outage produces an incident, delivered notification, recovery event, and correct timeline; an external probe detects the monitored host going offline.

## Phase 5 — Make releases and claims verifiable

1. CI gates: tests, frontend build, Linux integration tests, Docker build/start smoke test, dependency checks, and configuration validation.
2. Build frontend and collector artifacts in CI. Stage versioned releases, verify readiness, activate them atomically, and roll back on failure. Keep database migration compatibility in the rollback design.
3. Publish an evidence pack: reference host, configuration, resource traces, collection accuracy comparisons, screenshots/recordings of real failure scenarios, incident/notification outcomes, and reproducible commands.
4. Test missing permissions, corrupted config, stale collector, unavailable database, log rotation, notification failure, app restart, interrupted upgrade, rollback, and retention/disk limits.
5. Replace the unverified README claim of “Under 35MB RAM” with measured results and their test conditions. Set an availability SLO only after collecting data from an independent probe over a defined window.

Exit gate: a clean install, upgrade, failed upgrade, rollback, 24-hour soak, and end-to-end outage demonstration all produce repeatable evidence.

## Stack decision and boundaries

Keep React/Vite for the UI and Express for the API initially. Move touched API/frontend modules toward TypeScript and validate shared response schemas incrementally. Separate HTTP/auth, collection scheduling, integration adapters, and persistence. Do not add another framework merely to reorganize files.

Use one supported Node runtime consistently across CI, installers, Docker, and documentation. Prefer native Ubuntu/systemd as the first validated deployment, given host inspection requirements; document exactly which Docker host-inspection features work rather than promising parity by mounting `/proc` alone.

Consolidate the three UI asset trees (`src/client`, legacy `public`, and `web`) after routes and deployment artifacts are verified. Retire duplicate collectors and API paths only after consumers migrate. Freeze new integrations until Phases 1 and 2 pass.

## First implementation slice

Start with reproducible Ubuntu/Docker startup, deployment/auth configuration fixes, accurate readiness/freshness, and the resource baseline. Follow with integration enablement and scheduler bounds. These improvements create a trustworthy foundation for UI changes and determine whether retaining Go is justified.

## Reference capabilities

- Prometheus: time-series collection/storage, exporters, and alerting integration — https://prometheus.io/docs/introduction/overview/
- Grafana: dashboards backed by configured data sources — https://grafana.com/docs/grafana/latest/fundamentals/getting-started/
- Uptime Kuma: availability checks, notifications, and status pages — https://github.com/louislam/uptime-kuma
