# Project governance

System Ops is maintained by [Dinesh Korukonda](https://github.com/dineshkorukonda), with community contributions. The maintainer is responsible for scope, review, releases, security coordination, and repository administration.

## Decisions

Use issues for concrete defects/proposals, Discussions for questions and open-ended design, and pull requests for implementation. Significant changes should explain user impact, deployment compatibility, resource cost, and alternatives. The maintainer makes final decisions after considering feedback. Decisions and tradeoffs should be recorded publicly except for confidential security/conduct matters.

## Scope and roadmap

The primary audience is an administrator of a single Ubuntu VPS. Existing integrations are optional. Prioritize truthful health data, bounded resource use, reliable installation/upgrades, usable docs, and clear failures. The [reliability roadmap](https://github.com/dineshkorukonda/system-ops/issues/33) tracks acceptance work. Roadmap items are intentions, not delivery dates.

## Reviews and releases

Require passing applicable checks and reviewable evidence. Keep changes focused; disclose skipped checks. Close issues after merged implementation and acceptance validation. Releases follow [RELEASING.md](docs/RELEASING.md). Production deployment remains an operator action.

Contributor status does not automatically confer write access. Additional maintainers may be invited based on sustained contributions and review experience, with responsibilities agreed publicly. No formal election or voting process currently exists.
