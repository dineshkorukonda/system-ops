# Collector execution limits

The scheduler staggers startup by 200 ms, starts critical collectors first, and schedules each next run after completion. It never waits for every integration before scheduling host refreshes. Two collectors may run at once; optional integrations use at most one slot, reserving capacity for host monitoring. Busy cycles are skipped rather than queued without bound.

Each run has a 15-second deadline. Cancellation propagates through the async collection context into command execution, Go/Ollama HTTP calls and TCP/TLS probes. Linux command processes use their own process group; timeout/abort kills that group and waits for close. Stdout and stderr are capped at 256 KiB each. Failed collectors retry at 2x, 4x and at most 8x their interval. Disabling or shutting down aborts active work and clears timers.

A deadline marks collection failed but retains its concurrency slot until the underlying work settles. An adapter that ignores cancellation cannot spawn overlapping retries. Synchronous CPU work cannot be preempted by an AbortSignal and must bound its own work; traffic parsing uses explicit byte/line limits. Windows command cancellation kills the direct process only; Linux is the supported production target. Read diagnostics for actual duration, skipped runs, errors, concurrency and command counts.
