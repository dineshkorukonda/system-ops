# Collector and API ownership

The Node scheduler owns monitoring policy, deadlines and cache writes. The built React app owns both login and dashboard rendering; the old public dashboard scripts/styles have been retired. Production startup requires the frontend build. `/login.html` remains a compatible URL that serves the React entrypoint. The marketing website is a separate product surface.

Snapshot APIs read the scheduler's cache. Viewer requests never run optional discovery. Interactive log tails and explicit enabled rescans remain actions. Legacy `/api/status`, `/api/models`, and `/api/traffic-analytics` are cache-backed compatibility aliases; their duplicate route implementations have been removed. Each source carries collection provenance.

Node is the default host/process backend. A separately installed Go collector is opt-in with ENABLE_GO_COLLECTOR=true. It is not required by the Node systemd unit and the installer does not build/start it unless opted in. Diagnostics expose selected backend, fallback, error and memory separately. Memory allocation is not used as a substitute for missing RSS.

Both external Go responses and scheduled host/process results pass runtime schema validation before caching. The schema boundary has JSDoc types checked by `npm run typecheck`; the remaining codebase can migrate incrementally. Invalid sidecar payloads produce an observable Node fallback, and responses are capped at 1 MiB.

The Go backend currently lacks a host CPU-utilization sample; the UI treats it as unknown. Windows PowerShell exposes cumulative CPU seconds, which are now kept separately rather than presented as utilization. Go therefore does not yet provide the same full metric contract. A same-runner Node/Go benchmark includes the Node app, sidecar and live descendants; use its receipts alongside feature coverage when revisiting the default. A lower memory figure alone does not justify losing metrics.
