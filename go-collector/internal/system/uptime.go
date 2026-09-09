package system

import (
	"fmt"
	"os"
	"runtime"
	"strconv"
	"strings"
)

type UptimeInfo struct {
	UptimeSeconds float64 `json:"uptimeSeconds"`
	UptimeText    string  `json:"uptimeText"`
	CPUs          int     `json:"cpus"`
	Load1m        string  `json:"load1m"`
	Load5m        string  `json:"load5m"`
	Load15m       string  `json:"load15m"`
	LoadPercent1m int     `json:"loadPercent1m"`
}

func formatUptimeText(seconds float64) string {
	total := int(seconds)
	days := total / 86400
	hours := (total % 86400) / 3600
	mins := (total % 3600) / 60

	parts := make([]string, 0, 3)
	if days > 0 {
		parts = append(parts, fmt.Sprintf("%d day%s", days, plural(days)))
	}
	if hours > 0 {
		parts = append(parts, fmt.Sprintf("%d hr%s", hours, plural(hours)))
	}
	parts = append(parts, fmt.Sprintf("%d min%s", mins, plural(mins)))
	return strings.Join(parts, ", ")
}

func plural(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}

func GetUptimeAndLoad() UptimeInfo {
	cpus := runtime.NumCPU()
	if cpus <= 0 {
		cpus = 1
	}

	uptimeSec := 0.0
	load1, load5, load15 := 0.0, 0.0, 0.0

	if data, err := os.ReadFile("/proc/uptime"); err == nil {
		fields := strings.Fields(string(data))
		if len(fields) > 0 {
			if parsed, err := strconv.ParseFloat(fields[0], 64); err == nil {
				uptimeSec = parsed
			}
		}
	}

	if data, err := os.ReadFile("/proc/loadavg"); err == nil {
		fields := strings.Fields(string(data))
		if len(fields) >= 3 {
			load1 = parseFloatDefault(fields[0], 0)
			load5 = parseFloatDefault(fields[1], 0)
			load15 = parseFloatDefault(fields[2], 0)
		}
	}

	loadPercent := int(min(100, (load1/float64(cpus))*100))

	return UptimeInfo{
		UptimeSeconds: uptimeSec,
		UptimeText:    formatUptimeText(uptimeSec),
		CPUs:          cpus,
		Load1m:        fmt.Sprintf("%.2f", load1),
		Load5m:        fmt.Sprintf("%.2f", load5),
		Load15m:       fmt.Sprintf("%.2f", load15),
		LoadPercent1m: loadPercent,
	}
}

func parseFloatDefault(value string, fallback float64) float64 {
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return fallback
	}
	return parsed
}

func min(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}
