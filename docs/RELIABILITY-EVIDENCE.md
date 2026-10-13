# Reliability evidence

Evidence distinguishes repeatable CI checks, a long-running reference-host test, and an independent availability measurement. They answer different questions and must not be substituted for each other.

## Current release gates

The [2026-10-13 CI run](https://github.com/dineshkorukonda/system-ops/actions/runs/38441366090) passed all eight applicable jobs. Sanitized [native systemd receipts](evidence/native-release-2026-10-13.json) and [production-process receipts](evidence/process-release-2026-10-13.json) are preserved in the repository. The native report identifies the tested synthetic PR merge revision, Ubuntu version, and Node runtime. Later source changes still need passing CI at their own revision.

- [Issue #48](https://github.com/dineshkorukonda/system-ops/issues/48): CI and atomic upgrade/rollback. The `release-fixture` job covers production-process activation, and `native-release` exercises the real interactive installer, service account, sudoers, dashboard background updater, actual systemd readiness rollback, journal recovery, and preservation of working files/configuration/stashes. A successful artifact from the relevant revision is required before closure.
- [Issue #49](https://github.com/dineshkorukonda/system-ops/issues/49): reference environment, actual 24-hour soak, failure drills, alert receipts, and independent availability window.
- [Issue #33](https://github.com/dineshkorukonda/system-ops/issues/33): parent tracker; close after remaining acceptance work.

## Collect evidence

Run the [resource baseline](RESOURCE-BASELINE.md) on a disposable reference Ubuntu host. Preserve the commit, runtime, kernel, hardware, enabled integrations, warmup, measurement duration, samples, and limitations.

```bash
BASELINE_SCENARIOS=traffic BASELINE_SECONDS=86400 BASELINE_OUTPUT=artifacts/soak.json node scripts/resource-baseline.js
```

That command takes a real 24 hours. Synthetic logs are bounded to an active/previous pair by the resource runner; the sample report and dependencies still need disk space. Shorten it for rehearsal, but label that result as a rehearsal. Keep the host awake and preserve process completion status.

The manual `Reference-host reliability soak` workflow runs this command on a dedicated disposable Ubuntu runner labeled `system-ops-reference`. It requires a preinstalled Node 24 runtime, runs only from merged `main`, and has a 25-hour timeout. GitHub-hosted jobs cannot provide this uninterrupted 24-hour window. Provisioning a dedicated runner and an independent observer is an operator prerequisite; an absent runner is not evidence of a completed test. The workflow does not deploy the console to production or measure independent availability.

On an **independent machine**, run:

```bash
node scripts/external-observer.js https://your-host/ready /secure/path/receipts.jsonl
```

Preserve receipts through console/host downtime. Record probe interval, observed window, unknown gaps, expected/injected outages, and recovery time. Local successful requests cannot establish off-host uptime or an SLO.

The `Independent availability observer` workflow collects five sequential five-hour segments on separate GitHub-hosted Ubuntu runners. Each segment uploads its raw receipts. This stays within hosted-job time limits; queue/setup gaps between segments remain unknown coverage and must be reported. The target workload must continue independently. A 25-hour observer workflow is not by itself a 24-hour soak of the application, and planned lab shutdown must be distinguished from an unexpected outage.

For a local WSL lab, identify the kernel/runtime and label the results **WSL lab evidence**. Do not present them as native VPS benchmarks or compare their numbers directly with native Ubuntu. The native GitHub VM release fixture remains separate deployment evidence.

## Failure drill record

For each drill, record timestamp, exact commit, environment, injected condition, expected behavior, observed behavior, recovery command, and artifact references. Cover missing permissions, unavailable endpoints, stale collectors, log rotation, notification failure/retry, disk/retention limits, restart, interrupted upgrade, and rollback. Store only sanitized evidence; no tokens, passwords, visitor IPs, or backup content.

Notification evidence includes receiver acknowledgements and idempotency keys after sanitization. A log saying "sent" alone is weaker than a receiver receipt. Restore evidence requires a tested restore; listing a backup file does not prove recovery.

## Acceptance

Close #48 only after its merged changes and native validation pass. Close #49 only after actual required long-running and independent records exist. Keep #33 open while either child remains. Publish measured resource numbers with their environment and workload rather than reinstating a universal RAM promise.
