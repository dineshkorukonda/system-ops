package server

import (
	"bufio"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/dineshkorukonda/system-ops/go-collector/internal/format"
	"github.com/dineshkorukonda/system-ops/go-collector/internal/processes"
	"github.com/dineshkorukonda/system-ops/go-collector/internal/system"
)

type Server struct {
	addr string
}

func New() *Server {
	host := os.Getenv("GO_COLLECTOR_HOST")
	if host == "" {
		host = "127.0.0.1"
	}
	port := 9081
	if envPort := os.Getenv("GO_COLLECTOR_PORT"); envPort != "" {
		if parsed, err := strconv.Atoi(envPort); err == nil {
			port = parsed
		}
	}

	return &Server{
		addr: host + ":" + strconv.Itoa(port),
	}
}

func (s *Server) ListenAndServe() error {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/v1/system/snapshot", s.handleSystemSnapshot)
	mux.HandleFunc("/v1/processes", s.handleProcesses)
	mux.HandleFunc("/v1/diagnostics", s.handleDiagnostics)

	server := &http.Server{
		Addr:              s.addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("[go-collector] listening on http://%s", s.addr)
	return server.ListenAndServe()
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	writeJSON(w, map[string]bool{"ok": true})
}

func (s *Server) handleSystemSnapshot(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	if runtime.GOOS != "linux" {
		writeJSONError(w, http.StatusServiceUnavailable, "linux only")
		return
	}
	writeJSON(w, system.GetSnapshot())
}

func (s *Server) handleProcesses(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	if runtime.GOOS != "linux" {
		writeJSONError(w, http.StatusServiceUnavailable, "linux only")
		return
	}

	limit := 50
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	sortBy := r.URL.Query().Get("sort")
	if sortBy != "mem" {
		sortBy = "cpu"
	}

	writeJSON(w, processes.Sample(limit, sortBy))
}

func (s *Server) handleDiagnostics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}

	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)
	rssBytes := readSelfRSS()

	writeJSON(w, map[string]interface{}{
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"runtime":   "go",
		"goos":      runtime.GOOS,
		"uptimeSeconds": int(time.Since(startedAt).Seconds()),
		"memory": map[string]interface{}{
			"rssBytes":        rssBytes,
			"rssFormatted":    format.FormatBytes(rssBytes),
			"allocBytes":      memStats.Alloc,
			"allocFormatted":  format.FormatBytes(memStats.Alloc),
			"heapInuseBytes":  memStats.HeapInuse,
			"heapInuseFormatted": format.FormatBytes(memStats.HeapInuse),
			"sysBytes":        memStats.Sys,
			"sysFormatted":    format.FormatBytes(memStats.Sys),
			"numGC":           memStats.NumGC,
		},
	})
}

var startedAt = time.Now()

func readSelfRSS() uint64 {
	file, err := os.Open("/proc/self/status")
	if err != nil {
		return 0
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "VmRSS:") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			break
		}
		kb, err := strconv.ParseUint(fields[1], 10, 64)
		if err != nil {
			break
		}
		return kb * 1024
	}

	return 0
}

func writeJSON(w http.ResponseWriter, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	encoder := json.NewEncoder(w)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(payload); err != nil {
		log.Printf("[go-collector] json encode error: %v", err)
	}
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error": message,
	})
}

func writeMethodNotAllowed(w http.ResponseWriter) {
	writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
}

func IsLinuxHost() bool {
	return strings.EqualFold(runtime.GOOS, "linux")
}
