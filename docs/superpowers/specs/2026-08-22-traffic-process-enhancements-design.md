# Design Specification: Traffic Analytics Enhancements & System Process Monitor

## 1. Overview & Objectives
This specification outlines the technical design for expanding system-ops capabilities in two key areas:
1. **Traffic Analytics Enhancements**: Extending the Nginx log parser to extract top requested endpoints/URLs, HTTP status code breakdown, bandwidth metrics, top visitor IP addresses, browser distribution, and hourly traffic distribution trends.
2. **System Process Monitor**: Adding a real-time process monitoring section under the System Health tab featuring CPU/Memory sorting, process filtering, and process resource stats.

## 2. Component Design & Interfaces

### 2.1 Backend Collectors

#### `src/collectors/trafficAnalytics.js`
- **Current Behavior**: Parses Nginx access log lines for host, device category, OS breakdown, GeoIP, and recent 15 visitors.
- **Enhanced Output Schema**:
  ```json
  {
    "summary": {
      "total_hits": 0,
      "total_mobile_hits": 0,
      "total_web_hits": 0,
      "total_bytes": 0,
      "unique_devices": 0,
      "domains": { ... }
    },
    "status_codes": {
      "2xx": 0,
      "3xx": 0,
      "4xx": 0,
      "5xx": 0
    },
    "top_endpoints": [
      { "path": "/api/v2/system/snapshot", "hits": 120, "host": "api.example.com" }
    ],
    "top_ips": [
      { "ip": "1.2.3.4", "hits": 45, "city": "London", "country": "GB" }
    ],
    "browsers": {
      "Chrome": 0,
      "Safari": 0,
      "Firefox": 0,
      "Edge": 0,
      "Other": 0
    },
    "hourly_distribution": [
      { "hour": "00:00", "hits": 12 }, ...
    ],
    "os_stats": { ... },
    "locations": [ ... ],
    "recent_visitors": [ ... ]
  }
  ```

#### `src/collectors/system.js`
- **New Function**: `getSystemProcesses({ limit = 30, sortBy = 'cpu' })`
- **Command**: Executes `ps -eo pid,user,%cpu,%mem,vsz,rss,stat,comm,args --sort=-%cpu` (or `-%mem`).
- **Output Schema**:
  ```json
  {
    "processes": [
      {
        "pid": 1234,
        "user": "ollama",
        "cpuPercent": 12.5,
        "memPercent": 8.4,
        "vszBytes": 524288000,
        "rssBytes": 209715200,
        "formattedRss": "200.00 MB",
        "state": "S",
        "command": "ollama",
        "args": "ollama serve"
      }
    ],
    "total": 120
  }
  ```

### 2.2 Server Endpoints (`src/server.js`)
- `GET /api/traffic-analytics`: Returns enriched traffic analytics structure.
- `GET /api/v2/system/processes`: Returns sorted, limited list of processes (`?limit=30&sort=cpu|mem`).

### 2.3 Frontend Interface (`public/index.html` & `public/js/app.js`)
- **Traffic Analytics Tab**:
  - Top Metric Cards updated with Bandwidth totals.
  - New UI card grid:
    - **Top Endpoints / Requested Paths** (Table with Host, Path, Hits).
    - **HTTP Status Code Distribution** (Status tags & progress bars for 2xx, 3xx, 4xx, 5xx).
    - **Top Visitor IPs** (IP, Location, Hit count).
    - **Browser & Agent Breakdown** (Donut / Bar representation of Chrome, Safari, Firefox, etc.).
- **System Health Tab**:
  - New **System Processes Monitor** card containing:
    - Search input field to filter processes instantly by PID, User, or Command.
    - Sort radio/select buttons (`% CPU` vs `% Memory`).
    - Responsive processes table showing PID, User, % CPU, % RAM, RSS Size, State, Command.

## 3. Semantic Commit & Pull Request Strategy
- All git commits will strictly adhere to Semantic Commits syntax:
  - `feat(traffic): enhance traffic analytics with endpoints, status codes, and bandwidth`
  - `feat(system): add process monitor collector and API endpoint`
  - `feat(ui): render traffic sections and live process table`
  - `test(system): add unit tests for traffic and process collectors`
- Branch: `feat/traffic-process-enhancements`
- Target PR branch: `main`
