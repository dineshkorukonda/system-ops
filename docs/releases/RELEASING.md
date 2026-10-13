# Release process

Only maintainers publish releases. Use semantic versioning for user-facing releases and record changes in CHANGELOG.md. Until stable tags exist, refer to exact commits in validation records. The native updater currently follows `main`; do not describe it as a pinned release channel.

## Prepare

1. Resolve release blockers and review dependency/license changes.
2. Update package/lockfile versions together and move completed Unreleased entries into the intended version with the actual release date.
3. Run tests, typecheck, build, production smoke, docs/link checks, and public-site browser checks.
4. Require applicable Linux, Docker, browser, observability, and native release fixtures in CI.
5. Record installation, upgrade, failed upgrade, interruption recovery, and rollback evidence. Include migration compatibility and backup requirements.
6. Package the source and built public site with `npm run release:pack`. This produces revision/version metadata and SHA-256 checksums under `release-artifacts/`; dependencies and secrets are excluded.

## Publish

Create an annotated `vX.Y.Z` tag only after the release commit is merged and checks pass. The manual release workflow validates that an existing tag points to a commit on main and matches package.json, then prepares a **draft** GitHub release with archives/checksums. Review its notes, attach acceptance evidence, and publish manually. The workflow never deploys to a VPS or publishes to npm.

Use release notes to state supported deployment methods, known limitations, verification environment, breaking configuration changes, and upgrade/rollback instructions. Do not label short CI runs as a 24-hour soak or production availability proof.

## Repository administration

The repository should enable Discussions and private vulnerability reporting. Route questions to Discussions, defects to issue forms, and vulnerabilities to private reports. Protect main with PR review and required stable CI checks. Introduce new required checks only after they have passed on the default branch. Avoid blanket admin lockout or requiring every conditional fixture on every branch.

Suggested labels: `bug`, `enhancement`, `documentation`, `needs-triage`, `good first issue`, `help wanted`, `security`, and `release`. Security details stay private even if a public tracking label is used.
