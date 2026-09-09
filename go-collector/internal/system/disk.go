package system

import (
	"context"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/dineshkorukonda/system-ops/go-collector/internal/format"
)

type DiskEntry struct {
	Path               string `json:"path"`
	Filesystem         string `json:"filesystem,omitempty"`
	MountPoint         string `json:"mountPoint,omitempty"`
	Exists             bool   `json:"exists"`
	Status             string `json:"status"`
	TotalBytes         uint64 `json:"totalBytes,omitempty"`
	UsedBytes          uint64 `json:"usedBytes,omitempty"`
	AvailableBytes     uint64 `json:"availableBytes,omitempty"`
	FormattedTotal     string `json:"formattedTotal"`
	FormattedUsed      string `json:"formattedUsed"`
	FormattedAvailable string `json:"formattedAvailable"`
	Percent            int    `json:"percent"`
}

func GetDiskUsage(paths []string) []DiskEntry {
	results := make([]DiskEntry, 0, len(paths))
	existing := make([]string, 0, len(paths))

	for _, p := range paths {
		if _, err := os.Stat(p); err != nil {
			results = append(results, DiskEntry{
				Path:               p,
				Exists:             false,
				Status:             "missing",
				FormattedTotal:     "N/A",
				FormattedUsed:      "N/A",
				FormattedAvailable: "N/A",
			})
			continue
		}
		existing = append(existing, p)
	}

	if len(existing) == 0 {
		return results
	}

	args := append([]string{"-B1"}, existing...)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "df", args...)
	output, err := cmd.Output()
	if err != nil {
		for _, p := range existing {
			results = append(results, DiskEntry{
				Path:               p,
				Exists:             true,
				Status:             "error",
				FormattedTotal:     "N/A",
				FormattedUsed:      "N/A",
				FormattedAvailable: "N/A",
			})
		}
		return results
	}

	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	for i := 1; i < len(lines); i++ {
		line := strings.TrimSpace(lines[i])
		if line == "" {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) < 6 {
			continue
		}

		total := parseUint(parts[1])
		used := parseUint(parts[2])
		avail := parseUint(parts[3])
		pct := parseInt(strings.TrimSuffix(parts[4], "%"))
		mountPoint := parts[5]

		matched := mountPoint
		for _, p := range existing {
			if p == mountPoint {
				matched = p
				break
			}
		}

		results = append(results, DiskEntry{
			Path:               matched,
			Filesystem:         parts[0],
			MountPoint:         mountPoint,
			Exists:             true,
			Status:             "ok",
			TotalBytes:         total,
			UsedBytes:          used,
			AvailableBytes:     avail,
			FormattedTotal:     format.FormatBytes(total),
			FormattedUsed:      format.FormatBytes(used),
			FormattedAvailable: format.FormatBytes(avail),
			Percent:            pct,
		})
	}

	return results
}

func parseUint(value string) uint64 {
	parsed, err := strconv.ParseUint(value, 10, 64)
	if err != nil {
		return 0
	}
	return parsed
}

func parseInt(value string) int {
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0
	}
	return parsed
}
