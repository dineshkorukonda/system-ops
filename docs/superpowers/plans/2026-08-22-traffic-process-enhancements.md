# Traffic Analytics Enhancements & System Process Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance Nginx traffic analytics parsing (top endpoints, status codes, bandwidth, top IPs, browser distribution) and introduce a live System Process Monitor (sorted by CPU/RAM with search filtering) to system-ops.

**Architecture:** Extend backend collectors `trafficAnalytics.js` and `system.js`, expose new/enriched API routes in `server.js`, and build interactive dark-themed dashboard components in `index.html` and `app.js`.

**Tech Stack:** Node.js, Express, UAParser.js, geoip-lite, Vanilla JS / HTML5 / CSS3.

**Spec:** `docs/superpowers/specs/2026-08-22-traffic-process-enhancements-design.md`

## Global Constraints
- Strictly maintain Node.js native testing pattern (`node --test tests/*.test.js`).
- Use Semantic Commits syntax (`feat(...)`, `test(...)`, `fix(...)`) for all git commits.
- Work on branch `feat/traffic-process-enhancements`.
- Preserve existing CSS theme variables and responsive layout integrity.

---

### Task 1: Traffic Analytics Collector Backend & Tests

**Files:**
- Modify: `src/collectors/trafficAnalytics.js`
- Test: `tests/trafficAnalytics.test.js`

**Interfaces:**
- Consumes: Nginx access.log stream
- Produces: `parseTrafficAnalytics(logPath)` returning enriched object with `summary.total_bytes`, `status_codes`, `top_endpoints`, `top_ips`, `browsers`, and `hourly_distribution`.

- [ ] **Step 1: Write unit tests for new traffic analytics metrics**
  Add unit tests in `tests/trafficAnalytics.test.js` checking:
  - Total bandwidth/bytes calculation
  - HTTP status codes categorization (2xx, 3xx, 4xx, 5xx)
  - Top endpoints extraction
  - Top visitor IPs extraction
  - Browser parsing (Chrome, Safari, Firefox, Edge, etc.)
  - Hourly distribution array

- [ ] **Step 2: Run test to verify it fails**
  Run: `node --test tests/trafficAnalytics.test.js`

- [ ] **Step 3: Implement traffic analytics backend extensions**
  Update `src/collectors/trafficAnalytics.js` to parse:
  - `status` (group into 2xx, 3xx, 4xx, 5xx)
  - `body_bytes_sent` (accumulate total bytes)
  - `request` (extract path and tally top endpoints)
  - `clientIp` (tally top visitor IPs with country/city)
  - `uaResult.browser.name` (tally top browsers)
  - `timeLocal` (extract hour for distribution)

- [ ] **Step 4: Run test to verify it passes**
  Run: `node --test tests/trafficAnalytics.test.js`

- [ ] **Step 5: Commit**
  Run:
  ```bash
  git add src/collectors/trafficAnalytics.js tests/trafficAnalytics.test.js
  git commit -m "feat(traffic): extend traffic analytics collector with bandwidth, status codes, top endpoints, top IPs, and browser stats"
  ```

---

### Task 2: System Process Monitor Collector, API Endpoint & Tests

**Files:**
- Modify: `src/collectors/system.js`
- Modify: `src/server.js`
- Create: `tests/systemProcesses.test.js`

**Interfaces:**
- Consumes: OS `ps` command output
- Produces: `getSystemProcesses({ limit, sortBy })` and API route `GET /api/v2/system/processes`

- [ ] **Step 1: Write unit tests for system processes collector**
  Create `tests/systemProcesses.test.js` verifying:
  - `getSystemProcesses()` returns array of process objects
  - Each process contains `pid`, `user`, `cpuPercent`, `memPercent`, `formattedRss`, `state`, `command`
  - Accepts `sortBy` ('cpu' | 'mem') and `limit`

- [ ] **Step 2: Run test to verify it fails**
  Run: `node --test tests/systemProcesses.test.js`

- [ ] **Step 3: Implement process collector and API endpoint**
  - Add `getSystemProcesses` in `src/collectors/system.js`. Handle Linux `ps` command and cross-platform fallback.
  - Expose `GET /api/v2/system/processes` route in `src/server.js`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `node --test tests/systemProcesses.test.js`

- [ ] **Step 5: Commit**
  Run:
  ```bash
  git add src/collectors/system.js src/server.js tests/systemProcesses.test.js
  git commit -m "feat(system): add process monitor collector and GET /api/v2/system/processes endpoint"
  ```

---

### Task 3: Traffic Analytics Frontend Dashboard Cards & Tables

**Files:**
- Modify: `public/index.html`
- Modify: `public/js/app.js`
- Modify: `public/css/style.css`

**Interfaces:**
- Consumes: `GET /api/traffic-analytics` response
- Produces: Visual UI sections for Bandwidth, HTTP Status Codes, Top Endpoints, Top IPs, and Browsers.

- [ ] **Step 1: Add Traffic Analytics UI markup in `index.html`**
  Add cards/sections for:
  - Bandwidth Total display in overall summary metric card
  - HTTP Status Codes breakdown card
  - Top Endpoints / Requested Paths table
  - Top Visitor IPs table
  - Browser distribution card

- [ ] **Step 2: Add CSS styles in `style.css`**
  Add styles for status progress bars, traffic tables, and browser badges.

- [ ] **Step 3: Connect frontend data rendering in `app.js`**
  Update `renderTrafficAnalytics(data)` function in `public/js/app.js` to render the new metrics into the DOM.

- [ ] **Step 4: Commit**
  Run:
  ```bash
  git add public/index.html public/js/app.js public/css/style.css
  git commit -m "feat(ui): render top endpoints, status codes, visitor IPs, and browser stats in traffic dashboard"
  ```

---

### Task 4: System Process Monitor Frontend Component

**Files:**
- Modify: `public/index.html`
- Modify: `public/js/app.js`

**Interfaces:**
- Consumes: `GET /api/v2/system/processes`
- Produces: Interactive Process Monitor section in System tab with search & sort.

- [ ] **Step 1: Add Process Monitor markup in `index.html`**
  Add **System Processes** card to `#tab-system` with:
  - Search filter input (`#sysProcessSearch`)
  - Sort selector (`#sysProcessSort`)
  - Refresh button (`#sysProcessRefreshBtn`)
  - Processes data table (`#sysProcessesTableBody`)

- [ ] **Step 2: Add process fetching & interactive filtering logic in `app.js`**
  Implement `loadSystemProcesses()`, client-side live filtering, and auto-refresh integration.

- [ ] **Step 3: Commit**
  Run:
  ```bash
  git add public/index.html public/js/app.js
  git commit -m "feat(ui): add interactive process monitor to system health dashboard"
  ```

---

### Task 5: Final End-to-End Verification & Semantic Git PR

**Files:**
- Repository root

- [ ] **Step 1: Run all test suites**
  Run: `npm test`

- [ ] **Step 2: Perform git verification and review**
  Verify git status, branch, and commit log.

- [ ] **Step 3: Create Pull Request / Merge Preparation**
  Push branch `feat/traffic-process-enhancements` or prepare PR merge message as requested.
