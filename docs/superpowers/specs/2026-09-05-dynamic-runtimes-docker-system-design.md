# Dynamic Runtime Detection, Docker Subsystem, & Dashboard Modernization

## Overview & Background
System-Ops was initially designed for a dedicated freelance server running PM2 and local Ollama models. On general developer VPS environments, setups vary widely: some run Docker containers, some use PM2, some run only Systemd units, and most do not run Ollama. 

This design transitions System-Ops into a self-adaptive operations dashboard that dynamically discovers available host runtimes (Docker, PM2, Ollama, Systemd), presents dedicated monitoring views for detected systems, refactors System Health to focus strictly on host-level infrastructure, and resolves the map tile API watermark in Traffic Analytics.

---

## 1. Capabilities Discovery Subsystem

### 1.1 Detection Engine (`src/collectors/capabilities.js`)
A lightweight, non-blocking probe that checks for the presence and activity of major runtimes:
- **Docker**:
  - Probes `docker ps -q` or Docker socket accessibility with a 2.5s timeout.
  - Returns `{ available: boolean, count: number, running: number }`.
- **PM2**:
  - Inspects user PM2 sockets or runs non-blocking user process discovery.
  - Returns `{ available: boolean, count: number }`.
- **Ollama**:
  - Probes `systemctl status ollama`, `which ollama`, or listening port `11434`.
  - Returns `{ available: boolean, running: boolean }`.
- **Systemd**:
  - Returns `{ available: true, count: number }`.

### 1.2 Endpoint & State Caching
- Endpoint: `GET /api/v2/system/capabilities`
- Registered in `scheduler.js` with periodic cache refresh in `stateStore` (`capabilities`).
- Included in the initial app bootstrap payload so the UI renders the correct navigation structure instantly on load.

---

## 2. Dynamic Navigation Structure

### 2.1 Sidebar Hierarchy
- **OVERVIEW & CORE** (Always visible)
  - `System Health` (`system`) — Host metrics, memory, disks, dynamic listening ports.
  - `Process Monitor` (`processes`) — Linux proc-based process tree.
- **CONTAINERS & RUNTIMES** (Dynamically conditioned)
  - `Docker Containers` (`docker`) — **Visible only if `capabilities.docker.available === true`**.
  - `PM2 Fleet` (`pm2`) — **Visible only if `capabilities.pm2.available === true`**.
  - `Systemd Services` (`services`) — Dedicated Systemd unit supervision (clean, without PM2 mixed in).
  - `Ollama AI` (`ollama`) — **Visible only if `capabilities.ollama.available === true`**.
- **STORAGE & TRAFFIC** (Always visible)
  - `Backups & Dumps` (`backups`)
  - `Traffic Analytics` (`traffic`)
- **HELP & SYSTEM** (Always visible)
  - `Troubleshooting` (`troubleshooting`)

---

## 3. Docker Subsystem

### 3.1 Backend Collector (`src/collectors/docker.js`)
- `getDockerSnapshot()`:
  - Executes `docker ps -a --format '{{json .}}'` with a 3.5s timeout.
  - Extracts: Container ID, Names, Image, Status, State (`running`, `exited`, `paused`), Created, Ports.
  - Executes `docker stats --no-stream --format '{{json .}}'` to obtain memory and CPU utilization per container.
  - Formats output with total counts, running counts, and formatted memory.
- `getDockerLogs(containerId, lines = 100)`:
  - Sanitizes `containerId` (`/^[a-zA-Z0-9_\-\.]+$/`).
  - Executes `docker logs --tail <lines> <containerId>` with a 3s timeout.
  - Returns sanitized log text.

### 3.2 Backend Endpoints (`src/server.js`)
- `GET /api/v2/docker/snapshot`: Protected endpoint returning cached/fresh Docker snapshot.
- `GET /api/v2/docker/logs`: Protected & rate-limited endpoint returning container logs.

### 3.3 Frontend Component (`DockerView.jsx`)
- **Summary Cards**: Total Containers, Running, Exited, Total Memory consumed by Docker.
- **Container Table**:
  - Columns: Name, ID, Image, State/Status badge (Green for Running, Red/Neutral for Exited), Port bindings, CPU %, Memory.
  - Action: Quick `LOGS` button to inspect stdout/stderr.
- **Integrated Terminal Log Drawer**:
  - Live log display for selected container.
  - Search filter input, 100/250/500 line selector, and Clipboard Copy button.

---

## 4. PM2 & Systemd Separation

- **`Pm2FleetView.jsx`**: Promoted to a dedicated tab under `CONTAINERS & RUNTIMES`. Shows PM2 auto-discovered fleet across users (`deploy`, `root`, etc.), restart counts, CPU/RAM, uptime, and app logs.
- **`ServicesView.jsx`**: Streamlined into a pure Systemd service supervisor. Displays Systemd unit statuses, active sub-states, PID, memory consumption, and unit journalctl viewer.

---

## 5. Host System Health Refactoring

- **Dynamic Listening Ports (`src/collectors/system.js`)**:
  - Eliminate hardcoded `Ollama API (11434)` and `Dev API (8100)`.
  - Dynamically inspect active listening TCP ports using `ss -tlpn` (or Linux `/proc/net/tcp`), mapping known port numbers (e.g. 22: SSH, 80/443: Web/Nginx, 9080: System-Ops, 5432: PostgreSQL, Docker forwards).
  - Provide fallback to configured port list via `MONITORED_PORTS` env var.
- **Pure Host Focus**: Keep System Health focused on CPU, RAM, Swap, Disks, Host information, and core supervisor states.

---

## 6. Traffic Analytics Map Tile Fix

### 6.1 Issue
CARTO basemaps (`https://{s}.basemaps.cartocdn.com/dark_all/...`) require an API key and now render a watermark overlay reading `API KEY REQUIRED carto.com/basemaps/apikey` across all map tiles.

### 6.2 Solution
- Replace tile layer source in `TrafficAnalyticsView.jsx` with standard OpenStreetMap tiles:
  `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`
- Apply dark cyber theme filter to the Leaflet tile layer CSS class:
  ```css
  .cyber-map-tiles {
    filter: brightness(0.6) invert(1) contrast(3) hue-rotate(200deg) saturate(0.3) brightness(0.7);
  }
  ```
- Result: 100% key-free, reliable, permanently free, dark theme consistent with the rest of System-Ops.

---

## 7. Verification & Testing Plan

1. **Collector Tests**:
   - Verify `getCapabilities()` accurately detects presence/absence of Docker, PM2, and Ollama.
   - Verify `getDockerSnapshot()` properly falls back gracefully when Docker is stopped or not installed.
   - Verify `getListeningPorts()` retrieves open ports without hardcoded unbonded ports.
2. **Frontend Build & Render**:
   - Run `npm run build` (Vite build) to confirm JSX compiles with zero errors.
   - Test dynamic sidebar rendering with different capability configurations.
   - Inspect Leaflet map in `TrafficAnalyticsView` to confirm tiles load clearly with no watermark.
