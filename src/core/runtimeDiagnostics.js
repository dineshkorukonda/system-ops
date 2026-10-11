const { monitorEventLoopDelay, performance } = require('node:perf_hooks');

const delay = monitorEventLoopDelay({ resolution: 20 });
delay.enable();
const started = performance.now();
const initialCpu = process.cpuUsage();
const commands = { started: 0, active: 0, completed: 0, failed: 0, totalDurationMs: 0 };

function commandStarted() {
  commands.started++;
  commands.active++;
  const start = performance.now();
  return success => {
    commands.active--;
    commands.completed++;
    if (!success) commands.failed++;
    commands.totalDurationMs += performance.now() - start;
  };
}

function getRuntimeDiagnostics() {
  const cpu = process.cpuUsage(initialCpu);
  const elapsedMs = performance.now() - started;
  const ms = value => Number.isFinite(value) ? value / 1e6 : null;
  return {
    pid: process.pid,
    cpu: { userMicroseconds: cpu.user, systemMicroseconds: cpu.system,
      elapsedMs, averageOneCorePercent: (cpu.user + cpu.system) / (elapsedMs * 10) },
    eventLoopDelay: { unit: 'milliseconds', mean: ms(delay.mean), p95: ms(delay.percentile(95)),
      p99: ms(delay.percentile(99)), max: ms(delay.max) },
    commands: { ...commands },
  };
}

module.exports = { getRuntimeDiagnostics, commandStarted };
