package system

import (
	"os"
	"strings"
	"time"
)

type Snapshot struct {
	Timestamp string       `json:"timestamp"`
	Uptime    UptimeInfo   `json:"uptime"`
	Memory    MemoryInfo   `json:"memory"`
	Swap      SwapInfo     `json:"swap"`
	Disk      []DiskEntry  `json:"disk"`
	Services  []ServiceUnit `json:"services"`
	Ports     []PortStatus `json:"ports"`
}

func GetSnapshot() Snapshot {
	uptime := GetUptimeAndLoad()
	memory, swap := GetMemoryAndSwap()

	return Snapshot{
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Uptime:    uptime,
		Memory:    memory,
		Swap:      swap,
		Disk:      GetDiskUsage(resolveDiskPaths()),
		Services:  GetSystemdUnits(resolveSystemdUnits()),
		Ports:     GetListeningPorts(ResolvePortTargets()),
	}
}

func resolveDiskPaths() []string {
	envPaths := os.Getenv("DISK_PATHS")
	if envPaths == "" {
		envPaths = "/,/var"
	}

	seen := make(map[string]bool)
	paths := make([]string, 0)
	for _, p := range strings.Split(envPaths, ",") {
		p = strings.TrimSpace(p)
		if p == "" || seen[p] {
			continue
		}
		seen[p] = true
		paths = append(paths, p)
	}
	return paths
}

func resolveSystemdUnits() []string {
	envUnits := os.Getenv("SYSTEMD_UNITS")
	if envUnits == "" {
		envUnits = "system-ops"
	}

	units := make([]string, 0)
	for _, unit := range strings.Split(envUnits, ",") {
		unit = strings.TrimSpace(unit)
		if unit != "" {
			units = append(units, unit)
		}
	}
	return units
}
