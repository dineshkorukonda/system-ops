# Reproducing resource measurements

Run on a disposable Ubuntu machine with Node 24, a built frontend, and no production credentials. The runner creates its own data/log directory, random credentials, port and server process, then removes only that temporary directory.

```sh
npm ci
npm run build
node scripts/resource-baseline.js
```

Default: five scenarios, 20 seconds warmup and 120 seconds measurement each. For a representative idle budget use `BASELINE_SCENARIOS=idle BASELINE_SECONDS=1800`. For a soak use `BASELINE_SCENARIOS=traffic BASELINE_SECONDS=86400`. Override `BASELINE_OUTPUT` to preserve before/after reports. CI runs shorter smoke measurements and uploads the raw JSON; those establish reproducibility, not a production resource guarantee.

The report records the commit, OS/kernel, CPU models, total RAM, runtime, configuration, per-second process samples, collector durations/errors, command counts, cumulative process CPU and event-loop delay. CPU is percent of one logical CPU. RSS adds the app and live descendants; one-second sampling misses short-lived subprocess peaks. The Node-only workload does not include a separately managed Go service. Browser memory and rendering are excluded; five viewers use authenticated HTTP requests.

All workloads run with a missing Ollama endpoint and the reference machine's available integrations. The failing-integrations scenario explicitly records that environment; it is not a separate network-timeout injection. Five viewers request every five seconds. Traffic produces 1,000 unique paths/IPs/agents per second; rotation renames the file once after 5,000 lines. Report `generatedLogLines` separately from the collector's accepted/dropped counts. Inspect both before drawing conclusions.

Compare on the same machine, with identical configuration and durations. Do not compare WSL, containers, and native Ubuntu as though they were equivalent. A 24-hour report must contain 24 hours of actual samples. Uptime requires external probes; successful app requests cannot prove availability during host outages.
