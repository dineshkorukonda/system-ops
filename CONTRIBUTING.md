# Contributing to System Ops

Thanks for helping make a dependable operations console for a single Ubuntu VPS. Documentation, bug reproductions, accessibility improvements, and tested fixes are welcome.

## Before starting

Search [issues](https://github.com/dineshkorukonda/system-ops/issues) and [discussions](https://github.com/dineshkorukonda/system-ops/discussions). For a substantial feature, open a feature request and agree on scope before implementation. Maintainers may decline integrations that add unbounded resource use or exceed the single-host focus. Report vulnerabilities using [SECURITY.md](SECURITY.md).

## Development

Use Node.js 24.x and npm. Linux is needed for host collectors and deployment fixtures; Windows/macOS can build the frontend and run platform-independent checks. Go is optional; the sidecar uses the version in `go-collector/go.mod`.

```bash
git clone https://github.com/dineshkorukonda/system-ops.git
cd system-ops
npm ci
cp .env.example .env
# Set APP_PASSWORD and a random SESSION_SECRET in .env.
npm run build
npm start
```

The console listens at http://127.0.0.1:9080. For frontend hot reload, run `npm run dev` in one terminal and `npx vite` in another. Use a disposable configuration and data directory; never point tests at production data.

## Checks

```bash
npm test
npm run typecheck
npm run build
npm run test:smoke
npm run docs:build
npm run docs:check
```

For UI changes also run `npx playwright install chromium` and `npm run test:ui`. For the public site use `npm run test:site`. CI covers Docker and native Linux fixtures. A skipped platform-specific check is a limitation to disclose, not a pass. [Release validation](docs/RELEASING.md) explains the environment-dependent gates.

## Pull requests

Fork the project, create a focused branch, and use the PR template. Include the concrete problem, behavior after the change, related issue, checks run, and remaining limitations. Include desktop/mobile screenshots for visual changes. Keep unrelated refactors and generated runtime data out of PRs. Update documentation and the Unreleased changelog when behavior changes. Prefer titles such as `fix(pm2): preserve the configured home` or `docs: explain Docker limitations`.

Maintainers review correctness, permissions, compatibility, resource bounds, accessibility, and test evidence. Address feedback with commits on the same branch. Issues close after the implementation is merged and acceptance evidence exists; referencing an issue does not by itself complete it. See [governance](GOVERNANCE.md).

## Licensing and conduct

Contributions are accepted under the project's MIT license. Retain third-party notices and check dependency licenses before adding or upgrading packages. No CLA is currently required. Follow the [Code of Conduct](CODE_OF_CONDUCT.md). AI-assisted contributions follow the same review and validation requirements; contributors remain responsible for their changes.
