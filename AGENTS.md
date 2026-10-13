# Repository instructions

Read README.md and CONTRIBUTING.md before changing this project.

- Preserve user changes. Use an isolated branch/worktree when the checkout is dirty.
- Keep React/Vite and Express unless the task explicitly changes the architecture. Prefer existing adapters and collector contracts.
- Node 24.x is the supported runtime. Keep installer, Docker, CI, version files, and docs consistent.
- Never test against production credentials, services, backups, or monitoring data. Native fixtures run only in a disposable CI environment.
- Bound collection concurrency, retention, subprocess output, deadlines, and retries. Preserve last-good sample timestamps and unknown/stale states.
- Keep credentials out of source, logs, snapshots, reports, and responses. Do not broaden sudoers permissions to make a test pass.
- Describe implemented capabilities accurately. Do not claim measured RAM, uptime, restore success, or 24-hour validation without real evidence.
- Documentation sources live in docs/ and root community files. Build public HTML with `npm run docs:build`; do not hand-edit generated web/docs/.
- Run checks appropriate to the change: `npm test`, `npm run typecheck`, `npm run build`, `npm run test:smoke`, and docs checks. UI changes need browser/accessibility validation. Record skipped environment-dependent checks.
- Keep dependency licenses compatible with the project's intended MIT distribution and preserve third-party notices.
- Update CHANGELOG.md under Unreleased for user-visible changes. Do not invent tags, release dates, or published artifacts.
- Use focused PRs with acceptance evidence. Close issues only after merged implementation and required validation. Do not deploy production or weaken repository protections without explicit authorization.
