# Dynamic Runtimes, Docker Subsystem, & Dashboard Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform System-Ops into a runtime-aware operations console that dynamically detects host capabilities (Docker, PM2, Ollama), adds a dedicated Docker inspection tab, separates PM2 from Systemd services, cleans System Health to pure host telemetry, and eliminates the CARTO map watermark.

**Architecture:** 
A lightweight capability collector (`capabilities.js`) detects whether Docker, PM2, Ollama, and Systemd are installed/active. A new Docker collector (`docker.js`) gathers container states, metrics, and logs. The frontend adapts its sidebar dynamically so non-existent services (like Ollama or PM2) are completely omitted. System Health drops hardcoded ports in favor of real listening sockets, and Traffic Analytics transitions to key-free OpenStreetMap tiles with a cyber-dark CSS filter.

**Tech Stack:** Node.js, Express, React 19, Tailwind CSS v4, Leaflet, Docker CLI.

**Spec:** `docs/superpowers/specs/2026-09-05-dynamic-runtimes-docker-system-design.md`

## Global Constraints
- Node.js native test runner (`node --test tests/*.test.js`).
- Zero new runtime npm dependencies.
- Non-blocking execution for all command probes with strict timeouts (max 3.5s).
- Preserve dark theme consistency (`#000000` base, `#141414` surface, `#262626` borders).

---

### Task 1: Capabilities Discovery Collector & Endpoint

**Files:**
- Create: `src/collectors/capabilities.js`
- Test: `tests/capabilities.test.js`
- Modify: `src/core/scheduler.js:10-50`
- Modify: `src/server.js:105-130`

**Interfaces:**
- Produces: `getCapabilities(): Promise<{ docker: { available: boolean, count: number, running: number }, pm2: { available: boolean, count: number }, ollama: { available: boolean, running: boolean }, systemd: { available: boolean, count: number } }>`
- Endpoint: `GET /api/v2/system/capabilities`

- [ ] **Step 1: Write the failing test for capabilities detection**

```javascript
// tests/capabilities.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { getCapabilities } = require('../src/collectors/capabilities');

test('getCapabilities returns expected capability structure with booleans', async () => {
  const caps = await getCapabilities();
  assert.ok(typeof caps === 'object' && caps !== null);
  assert.ok('docker' in caps);
  assert.ok('pm2' in caps);
  assert.ok('ollama' in caps);
  assert.ok('systemd' in caps);
  assert.ok(typeof caps.docker.available === 'boolean');
  assert.ok(typeof caps.pm2.available === 'boolean');
  assert.ok(typeof caps.ollama.available === 'boolean');
  assert.ok(typeof caps.systemd.available === 'boolean');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/capabilities.test.js`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `src/collectors/capabilities.js`**

Implement probe checking Docker (`docker ps -q`), PM2 (sockets / PM2 binary / proc search), Ollama (`which ollama` / systemctl status ollama / port 11434 check), and Systemd.

- [ ] **Step 4: Register in `scheduler.js` and expose `/api/v2/system/capabilities` in `server.js`**

- [ ] **Step 5: Run tests and verify they pass**

Run: `node --test tests/capabilities.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/collectors/capabilities.js src/core/scheduler.js src/server.js tests/capabilities.test.js
git commit -m "feat: add dynamic capabilities discovery collector and endpoint"
```

---

### Task 2: Docker Collector, API Endpoints & Unit Tests

**Files:**
- Create: `src/collectors/docker.js`
- Test: `tests/docker.test.js`
- Modify: `src/server.js:210-250`
- Modify: `src/core/scheduler.js:70-110`

**Interfaces:**
- Produces: `getDockerSnapshot(): Promise<{ available: boolean, total: number, running: number, exited: number, memoryFormatted: string, containers: Array<{ id: string, name: string, image: string, state: string, status: string, ports: string, cpu: string, memory: string }> }>`
- Produces: `getDockerLogs(containerId, lines): Promise<{ success: boolean, containerId: string, output: string }>`
- Endpoints: `GET /api/v2/docker/snapshot`, `GET /api/v2/docker/logs`

- [ ] **Step 1: Write the failing test for docker collector**

```javascript
// tests/docker.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { getDockerSnapshot, getDockerLogs } = require('../src/collectors/docker');

test('getDockerSnapshot returns valid schema even if Docker is stopped or missing', async () => {
  const snap = await getDockerSnapshot();
  assert.ok(typeof snap.available === 'boolean');
  assert.ok(Array.isArray(snap.containers));
  assert.ok(typeof snap.total === 'number');
  assert.ok(typeof snap.running === 'number');
});

test('getDockerLogs validates container ID against injection', async () => {
  await assert.rejects(async () => {
    await getDockerLogs('invalid; rm -rf /');
  }, /Invalid container identifier/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/docker.test.js`
Expected: FAIL

- [ ] **Step 3: Implement `src/collectors/docker.js`**

Implement `getDockerSnapshot()` parsing `docker ps -a` and `docker stats --no-stream`, handling Docker-not-installed / daemon stopped gracefully. Implement `getDockerLogs()` with strict regex identifier validation.

- [ ] **Step 4: Register collector in `scheduler.js` and add endpoints in `server.js`**

- [ ] **Step 5: Run tests and verify they pass**

Run: `node --test tests/docker.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/collectors/docker.js src/core/scheduler.js src/server.js tests/docker.test.js
git commit -m "feat: implement docker snapshot collector and logs endpoint"
```

---

### Task 3: System Health Port Scanner Refactoring

**Files:**
- Modify: `src/collectors/system.js:290-330`
- Test: `tests/systemPorts.test.js`

**Interfaces:**
- Modifies: `getListeningPorts(): Promise<Array<{ name: string, port: number, host: string, listening: boolean }>>`
- Replaces hardcoded Ollama & Dev API ports with dynamically detected TCP listening ports via system sockets / `ss -tlpn` / configurable list.

- [ ] **Step 1: Write test verifying `getListeningPorts` does not output hardcoded UNBOUND Ollama ports when Ollama is absent**

- [ ] **Step 2: Run test to verify failure/behavior**

- [ ] **Step 3: Update `src/collectors/system.js` to dynamically inspect listening sockets with standard fallback**

- [ ] **Step 4: Run test to verify passing**

- [ ] **Step 5: Commit**

```bash
git add src/collectors/system.js tests/systemPorts.test.js
git commit -m "refactor: eliminate hardcoded ollama ports in system health collector"
```

---

### Task 4: Leaflet Map Tile Fix in Traffic Analytics

**Files:**
- Modify: `src/client/components/TrafficAnalyticsView.jsx:20-40`
- Modify: `src/client/index.css`

**Interfaces:**
- Replaces CARTO tile URL with OpenStreetMap tiles: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`.
- Adds `.cyber-map-tiles` CSS rule in `index.css` with dark cyber filter:
  `filter: brightness(0.6) invert(1) contrast(3) hue-rotate(200deg) saturate(0.3) brightness(0.7);`
- In Leaflet `tileLayer`: sets `className: 'cyber-map-tiles'`, `attribution: '&copy; OpenStreetMap contributors'`.

- [ ] **Step 1: Update `src/client/index.css` with cyber map filter styling**
- [ ] **Step 2: Update `TrafficAnalyticsView.jsx` to use keyless OSM tiles with custom className**
- [ ] **Step 3: Build frontend with `npm run build` to ensure clean compilation**
- [ ] **Step 4: Commit**

```bash
git add src/client/components/TrafficAnalyticsView.jsx src/client/index.css
git commit -m "fix: replace watermarked CARTO map tiles with keyless cyber OpenStreetMap"
```

---

### Task 5: Dedicated Docker View (`DockerView.jsx`) & Cleaned Systemd / PM2 Views

**Files:**
- Create: `src/client/components/DockerView.jsx`
- Modify: `src/client/components/ServicesView.jsx:1-120` (remove embedded PM2 fleet, make pure Systemd supervisor)

**Interfaces:**
- `DockerView`: Accepts `dockerData`, `onRefresh`. Displays container cards, container table, status badges, port bindings, and log viewer drawer.
- `ServicesView`: Pure systemd unit status and journalctl viewer.

- [ ] **Step 1: Create `src/client/components/DockerView.jsx`**
- [ ] **Step 2: Clean `src/client/components/ServicesView.jsx` to focus purely on Systemd**
- [ ] **Step 3: Verify build with `npm run build`**
- [ ] **Step 4: Commit**

```bash
git add src/client/components/DockerView.jsx src/client/components/ServicesView.jsx
git commit -m "feat: create DockerView component and clean ServicesView into pure systemd"
```

---

### Task 6: Dynamic Navigation & View Routing in `Sidebar.jsx` & `App.jsx`

**Files:**
- Modify: `src/client/components/Sidebar.jsx`
- Modify: `src/client/App.jsx`

**Interfaces:**
- `Sidebar`: Receives `capabilities` prop.
  - Renders `Docker Containers` under `CONTAINERS & RUNTIMES` only if `capabilities.docker.available`.
  - Renders `PM2 Fleet` only if `capabilities.pm2.available`.
  - Renders `Systemd Services` (always).
  - Renders `Ollama AI` only if `capabilities.ollama.available`.
- `App.jsx`:
  - Fetches `/api/v2/system/capabilities` on load and during sync.
  - Fetches `/api/v2/docker/snapshot` when active tab is `docker`.
  - Routes active tabs: `system`, `processes`, `docker`, `pm2`, `services`, `ollama`, `backups`, `traffic`, `troubleshooting`.
  - Fallback: If current tab becomes unavailable, falls back to `system`.

- [ ] **Step 1: Update `Sidebar.jsx` to dynamically render tabs according to capabilities**
- [ ] **Step 2: Update `App.jsx` to manage capabilities state, docker data, and active view switching**
- [ ] **Step 3: Run `npm run build` and run complete test suite `npm test`**
- [ ] **Step 4: Commit**

```bash
git add src/client/components/Sidebar.jsx src/client/App.jsx
git commit -m "feat: wire dynamic capabilities navigation and docker view into main app"
```

---

### Task 7: Full System Verification & Regression Suite

**Files:**
- Run: `npm test`
- Run: `npm run build`
- Verify: Full API suite passes, bundle builds without errors.

- [ ] **Step 1: Run full unit test suite**
- [ ] **Step 2: Build frontend distribution artifacts**
- [ ] **Step 3: Commit any final cleanup**
