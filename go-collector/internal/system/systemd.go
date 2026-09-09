package system

import (
	"context"
	"os/exec"
	"strings"
	"time"

	"github.com/dineshkorukonda/system-ops/go-collector/internal/format"
)

type ServiceUnit struct {
	Unit             string `json:"unit"`
	FullUnit         string `json:"fullUnit"`
	ActiveState      string `json:"activeState"`
	SubState         string `json:"subState"`
	IsActive         bool   `json:"isActive"`
	PID              int    `json:"pid"`
	MemoryBytes      uint64 `json:"memoryBytes"`
	FormattedMemory  string `json:"formattedMemory"`
}

func GetSystemdUnits(units []string) []ServiceUnit {
	if len(units) == 0 {
		return []ServiceUnit{}
	}

	fullNames := make([]string, 0, len(units))
	for _, unit := range units {
		if strings.HasSuffix(unit, ".service") {
			fullNames = append(fullNames, unit)
		} else {
			fullNames = append(fullNames, unit+".service")
		}
	}

	args := append([]string{
		"show",
	}, fullNames...)
	args = append(args, "-p", "Id,ActiveState,SubState,MainPID,MemoryCurrent,ExecMainStartTimestamp")

	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "systemctl", args...)
	output, err := cmd.Output()
	unitMap := make(map[string]ServiceUnit)
	if err == nil {
		blocks := strings.Split(string(output), "\n\n")
		for _, block := range blocks {
			block = strings.TrimSpace(block)
			if block == "" {
				continue
			}
			props := make(map[string]string)
			for _, line := range strings.Split(block, "\n") {
				idx := strings.Index(line, "=")
				if idx == -1 {
					continue
				}
				props[line[:idx]] = line[idx+1:]
			}

			id := props["Id"]
			if id == "" {
				continue
			}

			memory := parseUint(props["MemoryCurrent"])
			baseName := strings.TrimSuffix(id, ".service")
			unitMap[baseName] = ServiceUnit{
				Unit:            baseName,
				FullUnit:        id,
				ActiveState:     defaultString(props["ActiveState"], "unknown"),
				SubState:        defaultString(props["SubState"], "unknown"),
				IsActive:        props["ActiveState"] == "active",
				PID:             parseInt(props["MainPID"]),
				MemoryBytes:     memory,
				FormattedMemory: formatMemory(memory),
			}
		}
	}

	results := make([]ServiceUnit, 0, len(units))
	for _, unit := range units {
		baseName := strings.TrimSuffix(unit, ".service")
		if found, ok := unitMap[baseName]; ok {
			results = append(results, found)
			continue
		}
		results = append(results, ServiceUnit{
			Unit:            baseName,
			FullUnit:        baseName + ".service",
			ActiveState:     "unknown",
			SubState:        "stopped",
			IsActive:        false,
			PID:             0,
			MemoryBytes:     0,
			FormattedMemory: "N/A",
		})
	}

	return results
}

func formatMemory(memory uint64) string {
	if memory > 0 {
		return format.FormatBytes(memory)
	}
	return "N/A"
}

func defaultString(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
