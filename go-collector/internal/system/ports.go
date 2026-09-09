package system

import (
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"
	"time"
)

type PortTarget struct {
	Name string
	Port int
}

type PortStatus struct {
	Name       string `json:"name"`
	Port       int    `json:"port"`
	Host       string `json:"host"`
	Listening  bool   `json:"listening"`
	StatusText string `json:"statusText"`
}

func GetListeningPorts(targets []PortTarget) []PortStatus {
	results := make([]PortStatus, 0, len(targets))
	for _, target := range targets {
		results = append(results, checkPortListener(target.Name, target.Port, "127.0.0.1"))
	}
	return results
}

func checkPortListener(name string, port int, host string) PortStatus {
	address := net.JoinHostPort(host, strconv.Itoa(port))
	conn, err := net.DialTimeout("tcp", address, 1500*time.Millisecond)
	if err == nil {
		conn.Close()
		return PortStatus{
			Name:       name,
			Port:       port,
			Host:       host,
			Listening:  true,
			StatusText: fmt.Sprintf("Listening on %s:%d", host, port),
		}
	}

	return PortStatus{
		Name:       name,
		Port:       port,
		Host:       host,
		Listening:  false,
		StatusText: fmt.Sprintf("Not listening (%v)", err),
	}
}

func ResolvePortTargets() []PortTarget {
	if monitored := os.Getenv("MONITORED_PORTS"); monitored != "" {
		targets := make([]PortTarget, 0)
		for _, item := range strings.Split(monitored, ",") {
			parts := strings.Split(strings.TrimSpace(item), ":")
			if len(parts) < 2 {
				continue
			}
			port, err := strconv.Atoi(strings.TrimSpace(parts[1]))
			if err != nil {
				continue
			}
			targets = append(targets, PortTarget{
				Name: strings.TrimSpace(parts[0]),
				Port: port,
			})
		}
		return targets
	}

	port := 9080
	if envPort := os.Getenv("PORT"); envPort != "" {
		if parsed, err := strconv.Atoi(envPort); err == nil {
			port = parsed
		}
	}

	sshPort := 22
	if envSSH := os.Getenv("SSH_PORT"); envSSH != "" {
		if parsed, err := strconv.Atoi(envSSH); err == nil {
			sshPort = parsed
		}
	}

	targets := []PortTarget{
		{Name: "System Ops (Self)", Port: port},
		{Name: "Web (HTTP)", Port: 80},
		{Name: "Web (HTTPS)", Port: 443},
		{Name: "SSH", Port: sshPort},
	}

	if os.Getenv("OLLAMA_PORT") != "" || os.Getenv("ENABLE_OLLAMA") == "true" {
		ollamaPort := 11434
		if envOllama := os.Getenv("OLLAMA_PORT"); envOllama != "" {
			if parsed, err := strconv.Atoi(envOllama); err == nil {
				ollamaPort = parsed
			}
		}
		targets = append(targets, PortTarget{Name: "Ollama API", Port: ollamaPort})
	}

	return targets
}
