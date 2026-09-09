package main

import (
	"log"
	"os"

	"github.com/dineshkorukonda/system-ops/go-collector/internal/server"
)

func main() {
	if os.Getenv("ENABLE_GO_COLLECTOR") == "false" {
		log.Println("[go-collector] disabled via ENABLE_GO_COLLECTOR=false")
		return
	}

	srv := server.New()
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("[go-collector] fatal: %v", err)
	}
}
