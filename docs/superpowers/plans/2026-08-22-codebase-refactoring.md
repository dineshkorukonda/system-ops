# Codebase Quality & Centralized Utility Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize duplicated helper functions `runCommand` and `formatBytes` into `src/utils/` modules to improve DRY principles, maintainability, and code quality.

**Architecture:** Create `src/utils/exec.js` and `src/utils/formatters.js`, update 6 consuming modules to import from `src/utils/`, and add unit tests.

**Tech Stack:** Node.js, CommonJS modules, Node Native Test Runner.

**Spec:** `docs/superpowers/specs/2026-08-22-codebase-refactoring-design.md`

## Global Constraints
- Preserve exact public API function signatures and return types.
- Ensure 100% test coverage with zero breaking changes.
- Use Semantic Commits (`refactor(...)`, `test(...)`).

---

### Task 1: Create Shared Utility Modules & Utility Unit Tests

**Files:**
- Create: `src/utils/exec.js`
- Create: `src/utils/formatters.js`
- Create: `tests/utils.test.js`

- [ ] **Step 1: Write unit tests for utility functions**
  Create `tests/utils.test.js` testing `formatBytes` and `runCommand`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `node --test tests/utils.test.js`

- [ ] **Step 3: Create `src/utils/exec.js` and `src/utils/formatters.js`**
  Write shared implementations in `src/utils/`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `node --test tests/utils.test.js`

- [ ] **Step 5: Commit**
  Run:
  ```bash
  git add src/utils/ tests/utils.test.js
  git commit -m "feat(utils): add centralized exec and formatters utility modules with tests"
  ```

---

### Task 2: Refactor Collectors & Services to Use Shared Utilities

**Files:**
- Modify: `src/collectors/backupFiles.js`
- Modify: `src/collectors/logSources.js`
- Modify: `src/collectors/pm2.js`
- Modify: `src/collectors/system.js`
- Modify: `src/services/systemService.js`
- Modify: `src/services/ollamaService.js`

- [ ] **Step 1: Replace duplicated `runCommand` and `formatBytes` in collectors and services**
  Import shared functions from `../utils/exec` and `../utils/formatters`.

- [ ] **Step 2: Run full test suite**
  Run: `npm test`

- [ ] **Step 3: Commit**
  Run:
  ```bash
  git add src/collectors/ src/services/
  git commit -m "refactor(dry): replace duplicated runCommand and formatBytes with shared utility modules"
  ```

---

### Task 3: Final Verification & Merge

- [ ] **Step 1: Run all project tests**
  Run: `npm test`

- [ ] **Step 2: Commit final docs and merge branch**
  Commit design & plan files, create PR, and merge to `main`.
