package processes

import (
	"bufio"
	"fmt"
	"os"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/dineshkorukonda/system-ops/go-collector/internal/format"
)

type Process struct {
	PID          int     `json:"pid"`
	PPID         int     `json:"ppid,omitempty"`
	User         string  `json:"user"`
	CPUPercent   float64 `json:"cpuPercent"`
	MemPercent   float64 `json:"memPercent"`
	VSZBytes     uint64  `json:"vszBytes"`
	RSSBytes     uint64  `json:"rssBytes"`
	FormattedRSS string  `json:"formattedRss"`
	State        string  `json:"state"`
	Command      string  `json:"command"`
	Args         string  `json:"args"`
}

type Result struct {
	SortBy    string    `json:"sortBy"`
	Limit     int       `json:"limit"`
	Total     int       `json:"total"`
	Processes []Process `json:"processes"`
}

var (
	mu                sync.Mutex
	prevPidTicks      = make(map[int]uint64)
	prevTotalSystemCPU uint64
	prevSampleTime    int64
	uidCache          = make(map[int]string)
)

func Sample(limit int, sortBy string) Result {
	if limit <= 0 {
		limit = 50
	}
	if sortBy != "mem" {
		sortBy = "cpu"
	}

	mu.Lock()
	defer mu.Unlock()

	currentSystemCPU := readSystemCpuTotal()
	currentSampleTime := nowMillis()
	systemCpuDelta := currentSystemCPU - prevTotalSystemCPU
	if systemCpuDelta == 0 {
		systemCpuDelta = 1
	}

	cpuCount := runtime.NumCPU()
	if cpuCount <= 0 {
		cpuCount = 1
	}
	totalHostMem := readTotalMemory()
	if totalHostMem == 0 {
		totalHostMem = 1
	}

	currentPidMap := make(map[int]uint64)
	processes := make([]Process, 0)

	entries, err := os.ReadDir("/proc")
	if err != nil {
		return emptyResult(sortBy, limit)
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		if name == "" || name[0] < '0' || name[0] > '9' {
			continue
		}
		pid, err := strconv.Atoi(name)
		if err != nil {
			continue
		}

		stat, err := parseProcStat(pid)
		if err != nil {
			continue
		}

		status := parseProcStatus(pid)
		cmdline := readCmdline(pid)
		totalProcTicks := stat.UTime + stat.STime
		currentPidMap[pid] = totalProcTicks

		cpuPercent := 0.0
		if prevTicks, ok := prevPidTicks[pid]; ok && systemCpuDelta > 0 && prevSampleTime > 0 {
			procTicksDelta := totalProcTicks - prevTicks
			if procTicksDelta > 0 {
				cpuPercent = minFloat(100*float64(cpuCount), round1((float64(procTicksDelta)/float64(systemCpuDelta))*100*float64(cpuCount)))
			}
		}

		memPercent := minFloat(100, round1((float64(status.RSSBytes)/float64(totalHostMem))*100))
		command := stat.Comm
		if command == "" {
			command = "unknown"
		}
		args := cmdline
		if args == "" {
			args = command
		}

		processes = append(processes, Process{
			PID:          pid,
			PPID:         stat.PPID,
			User:         resolveUsername(status.UID),
			CPUPercent:   cpuPercent,
			MemPercent:   memPercent,
			VSZBytes:     status.VSZBytes,
			RSSBytes:     status.RSSBytes,
			FormattedRSS: format.FormatBytes(status.RSSBytes),
			State:        stat.State,
			Command:      command,
			Args:         args,
		})
	}

	prevPidTicks = currentPidMap
	prevTotalSystemCPU = currentSystemCPU
	prevSampleTime = currentSampleTime

	if sortBy == "mem" {
		sort.Slice(processes, func(i, j int) bool {
			return processes[i].RSSBytes > processes[j].RSSBytes
		})
	} else {
		sort.Slice(processes, func(i, j int) bool {
			return processes[i].CPUPercent > processes[j].CPUPercent
		})
	}

	total := len(processes)
	if total > limit {
		processes = processes[:limit]
	}

	return Result{
		SortBy:    sortBy,
		Limit:     limit,
		Total:     total,
		Processes: processes,
	}
}

type procStat struct {
	Comm  string
	State string
	PPID  int
	UTime uint64
	STime uint64
}

type procStatus struct {
	UID      int
	RSSBytes uint64
	VSZBytes uint64
}

func parseProcStat(pid int) (procStat, error) {
	data, err := os.ReadFile(fmt.Sprintf("/proc/%d/stat", pid))
	if err != nil {
		return procStat{}, err
	}

	content := string(data)
	openParen := strings.Index(content, "(")
	closeParen := strings.LastIndex(content, ")")
	if openParen == -1 || closeParen == -1 || closeParen <= openParen {
		return procStat{}, fmt.Errorf("invalid stat")
	}

	rest := strings.Fields(content[closeParen+1:])
	if len(rest) < 20 {
		return procStat{}, fmt.Errorf("invalid stat fields")
	}

	return procStat{
		Comm:  content[openParen+1 : closeParen],
		State: rest[0],
		PPID:  atoiDefault(rest[1], 0),
		UTime: parseUint(rest[11]),
		STime: parseUint(rest[12]),
	}, nil
}

func parseProcStatus(pid int) procStatus {
	status := procStatus{}
	data, err := os.ReadFile(fmt.Sprintf("/proc/%d/status", pid))
	if err != nil {
		return status
	}

	scanner := bufio.NewScanner(strings.NewReader(string(data)))
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "Uid:") {
			fields := strings.Fields(line)
			if len(fields) > 1 {
				status.UID = atoiDefault(fields[1], 0)
			}
		} else if strings.HasPrefix(line, "VmRSS:") {
			fields := strings.Fields(line)
			if len(fields) > 1 {
				kb := parseUint(fields[1])
				status.RSSBytes = kb * 1024
			}
		} else if strings.HasPrefix(line, "VmSize:") {
			fields := strings.Fields(line)
			if len(fields) > 1 {
				kb := parseUint(fields[1])
				status.VSZBytes = kb * 1024
			}
		}
	}

	return status
}

func readCmdline(pid int) string {
	data, err := os.ReadFile(fmt.Sprintf("/proc/%d/cmdline", pid))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(strings.ReplaceAll(string(data), "\x00", " "))
}

func readSystemCpuTotal() uint64 {
	data, err := os.ReadFile("/proc/stat")
	if err != nil {
		return 0
	}
	lines := strings.Split(string(data), "\n")
	if len(lines) == 0 || !strings.HasPrefix(lines[0], "cpu ") {
		return 0
	}
	fields := strings.Fields(lines[0])[1:]
	total := uint64(0)
	for _, field := range fields {
		total += parseUint(field)
	}
	return total
}

func readTotalMemory() uint64 {
	data, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return 0
	}
	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, "MemTotal:") {
			fields := strings.Fields(line)
			if len(fields) > 1 {
				kb := parseUint(fields[1])
				return kb * 1024
			}
		}
	}
	return 0
}

func resolveUsername(uid int) string {
	if uid == 0 {
		return "root"
	}
	if user, ok := uidCache[uid]; ok {
		return user
	}

	data, err := os.ReadFile("/etc/passwd")
	if err == nil {
		for _, line := range strings.Split(string(data), "\n") {
			parts := strings.Split(line, ":")
			if len(parts) < 3 {
				continue
			}
			parsedUID, err := strconv.Atoi(parts[2])
			if err == nil {
				uidCache[parsedUID] = parts[0]
			}
		}
		if user, ok := uidCache[uid]; ok {
			return user
		}
	}

	fallback := fmt.Sprintf("uid:%d", uid)
	uidCache[uid] = fallback
	return fallback
}

func emptyResult(sortBy string, limit int) Result {
	return Result{
		SortBy:    sortBy,
		Limit:     limit,
		Total:     0,
		Processes: []Process{},
	}
}

func parseUint(value string) uint64 {
	parsed, err := strconv.ParseUint(value, 10, 64)
	if err != nil {
		return 0
	}
	return parsed
}

func atoiDefault(value string, fallback int) int {
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func nowMillis() int64 {
	return time.Now().UnixMilli()
}

func round1(value float64) float64 {
	return float64(int(value*10+0.5)) / 10
}

func minFloat(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}
