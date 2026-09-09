package system

import (
	"os"
	"strconv"
	"strings"

	"github.com/dineshkorukonda/system-ops/go-collector/internal/format"
)

type MemoryInfo struct {
	TotalBytes         uint64 `json:"totalBytes"`
	UsedBytes          uint64 `json:"usedBytes"`
	AvailableBytes     uint64 `json:"availableBytes"`
	FormattedTotal     string `json:"formattedTotal"`
	FormattedUsed      string `json:"formattedUsed"`
	FormattedAvailable string `json:"formattedAvailable"`
	UsagePercent       int    `json:"usagePercent"`
}

type SwapInfo struct {
	TotalBytes     uint64 `json:"totalBytes"`
	UsedBytes      uint64 `json:"usedBytes"`
	FreeBytes      uint64 `json:"freeBytes"`
	FormattedTotal string `json:"formattedTotal"`
	FormattedUsed  string `json:"formattedUsed"`
	FormattedFree  string `json:"formattedFree"`
	UsagePercent   int    `json:"usagePercent"`
}

func GetMemoryAndSwap() (MemoryInfo, SwapInfo) {
	info := readMemInfo()

	total := info["MemTotal"]
	available := info["MemAvailable"]
	if available == 0 {
		available = info["MemFree"]
	}
	used := total - available
	memPercent := 0
	if total > 0 {
		memPercent = int((used * 100) / total)
	}

	swapTotal := info["SwapTotal"]
	swapFree := info["SwapFree"]
	swapUsed := swapTotal - swapFree
	swapPercent := 0
	if swapTotal > 0 {
		swapPercent = int((swapUsed * 100) / swapTotal)
	}

	memory := MemoryInfo{
		TotalBytes:         total,
		UsedBytes:          used,
		AvailableBytes:     available,
		FormattedTotal:     format.FormatBytes(total),
		FormattedUsed:      format.FormatBytes(used),
		FormattedAvailable: format.FormatBytes(available),
		UsagePercent:       memPercent,
	}

	swap := SwapInfo{
		TotalBytes:     swapTotal,
		UsedBytes:      swapUsed,
		FreeBytes:      swapFree,
		FormattedTotal: format.FormatBytes(swapTotal),
		FormattedUsed:  format.FormatBytes(swapUsed),
		FormattedFree:  format.FormatBytes(swapFree),
		UsagePercent:   swapPercent,
	}

	return memory, swap
}

func readMemInfo() map[string]uint64 {
	result := make(map[string]uint64)
	data, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return result
	}

	for _, line := range strings.Split(string(data), "\n") {
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		fields := strings.Fields(strings.TrimSpace(parts[1]))
		if len(fields) == 0 {
			continue
		}
		kb, err := strconv.ParseUint(fields[0], 10, 64)
		if err != nil {
			continue
		}
		result[key] = kb * 1024
	}

	return result
}
