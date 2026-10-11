#!/usr/bin/env bash
set -euo pipefail
TASK_ROOT="$(pwd)"
TASK_REFERENCE="${BASELINE_REFERENCE_REF:-392f610}"
TASK_WORKTREE="$(mktemp -d -t system-ops-reference-XXXXXX)"
cleanup() {
  if [[ "$TASK_WORKTREE" == /tmp/system-ops-reference-* ]]; then
    git -C "$TASK_ROOT" worktree remove --force "$TASK_WORKTREE" || true
  fi
}
trap cleanup EXIT
mkdir -p "$TASK_ROOT/artifacts/comparison"
git worktree add --detach "$TASK_WORKTREE" "$TASK_REFERENCE"
cd "$TASK_WORKTREE"
npm ci
npm run build
BASELINE_OUTPUT="$TASK_ROOT/artifacts/comparison/before.json" node scripts/resource-baseline.js
cd "$TASK_ROOT"
npm ci
npm run build
BASELINE_OUTPUT="$TASK_ROOT/artifacts/comparison/after.json" node scripts/resource-baseline.js
node - <<'NODE'
const fs = require('node:fs');
const before = JSON.parse(fs.readFileSync('artifacts/comparison/before.json'));
const after = JSON.parse(fs.readFileSync('artifacts/comparison/after.json'));
if (JSON.stringify(before.machine) !== JSON.stringify(after.machine)) throw new Error('Reference machine metadata differs');
const comparison = { beforeCommit: before.commit, afterCommit: after.commit, machine: after.machine,
  note: 'Default policies differ intentionally: optional integrations are now disabled and traffic enrichment is opt-in. Traffic remains enabled in both fixtures. Short runs are not a production budget or 24-hour soak.',
  results: after.results.map(current => ({ scenario: current.scenario,
    before: before.results.find(previous => previous.scenario === current.scenario)?.summary,
    after: current.summary, processing: current.traffic?.processing })) };
fs.writeFileSync('artifacts/comparison/summary.json', JSON.stringify(comparison, null, 2));
console.log(JSON.stringify(comparison.results, null, 2));
NODE
