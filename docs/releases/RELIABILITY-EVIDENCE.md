# Reliability evidence and issue disposition

The [2026-10-13 CI run](https://github.com/dineshkorukonda/system-ops/actions/runs/38441366090) passed all eight applicable jobs. Sanitized [native systemd receipts](../evidence/native-release-2026-10-13.json) and [production-process receipts](../evidence/process-release-2026-10-13.json) are preserved in the repository. The native report identifies the tested synthetic PR merge revision, Ubuntu version, and Node runtime. Later source changes still need passing CI at their own revision.

## Validated release behavior

The native fixture verifies the real interactive installer, service account/environment permissions, exact sudoers launcher, authenticated dashboard background update, actual systemd readiness rollback, interrupted journal recovery, and preservation of working files, stashes, configuration, and shared data. Separate CI jobs validate Docker startup, frontend/browser behavior, adapters, protected metrics, and process-level activation/rollback.

These are disposable CI checks. They do not prove the health, permissions, or uptime of an operator's production host.

## Maintainer waiver

On 2026-10-13, the maintainer explicitly directed closing the remaining issues without requiring a 24-hour test. The long-running lab effort was stopped; no 24-hour soak or independent availability result is claimed.

- [Issue #48](https://github.com/dineshkorukonda/system-ops/issues/48): release validation and rollback have native/process CI evidence; close as completed after merging the validated implementation.
- [Issue #49](https://github.com/dineshkorukonda/system-ops/issues/49): the remaining long-running reliability evidence requirement is waived at the maintainer's request; close as not planned, rather than claiming the evidence pack is complete.
- [Issue #33](https://github.com/dineshkorukonda/system-ops/issues/33): close the parent tracker after recording the implemented work and the waived child requirement.

## Optional future measurements

The [resource runner](RESOURCE-BASELINE.md) remains available for future measurements. Publish the exact commit, environment, configuration, duration, and limitations with any performance claim. A real 24-hour report must contain 24 hours of actual samples; short CI checks cannot substitute for it.

Independent availability measurement requires an observer on another machine, receipts preserved through outages, and explicit reporting of coverage/unknown gaps. Listing a backup does not prove restorability. No production availability SLO or universal memory guarantee has been established by this work.
