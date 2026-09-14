const fs = require('fs');
const path = require('path');
const os = require('os');
const { formatBytes } = require('../utils/formatters');
const { runCommand } = require('../utils/exec');
const goCollectorClient = require('../services/goCollectorClient');

/**
 * Pure /proc Linux Process Sampler
 *
 * Reads:
 * - /proc/stat (Total system CPU ticks for delta calculation)
 * - /proc/[pid]/stat (utime, stime, starttime, state, ppid)
 * - /proc/[pid]/status (Uid, VmRSS, VmSize)
 * - /proc/[pid]/cmdline (arguments)
 * - /proc/[pid]/comm (command name)
 *
 * Maintains CPU deltas between samples without spawning `ps`.
 */

// Cached CPU time per PID from previous sample: { [pid]: { utime, stime, totalSystemTime } }
let prevPidCpuMap = new Map();
let prevTotalSystemCpu = 0;
let prevSampleTime = 0;

// User cache mapping UID -> username
const uidCache = new Map();

/**
 * Resolve username from UID using /etc/passwd cache
 */
function resolveUsername(uid) {
  if (uid === 0) return 'root';
  if (uidCache.has(uid)) return uidCache.get(uid);

  try {
    if (fs.existsSync('/etc/passwd')) {
      const content = fs.readFileSync('/etc/passwd', 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        const parts = line.split(':');
        if (parts.length >= 3) {
          const uName = parts[0];
          const uId = parseInt(parts[2], 10);
          uidCache.set(uId, uName);
        }
      }
      if (uidCache.has(uid)) return uidCache.get(uid);
    }
  } catch (e) {}

  const fallback = `uid:${uid}`;
  uidCache.set(uid, fallback);
  return fallback;
}

/**
 * Read system-wide total CPU ticks from /proc/stat
 */
function getSystemCpuTotal() {
  try {
    const stat = fs.readFileSync('/proc/stat', 'utf8');
    const firstLine = stat.split('\n')[0];
    if (firstLine.startsWith('cpu ')) {
      const parts = firstLine.trim().split(/\s+/).slice(1);
      return parts.reduce((acc, val) => acc + (parseInt(val, 10) || 0), 0);
    }
  } catch (e) {}
  return 0;
}

/**
 * Read the real CPU count from /proc/cpuinfo (counts "processor" entries).
 * os.cpus() is unreliable in containers/VMs — it can return a cgroup-limited
 * subset rather than the number of CPUs visible to the kernel scheduler.
 */
function getHostCpuCount() {
  try {
    if (fs.existsSync('/proc/cpuinfo')) {
      const content = fs.readFileSync('/proc/cpuinfo', 'utf8');
      const count = (content.match(/^processor\s*:/gm) || []).length;
      if (count > 0) return count;
    }
  } catch (e) {}
  return os.cpus().length || 1;
}

/**
 * Read system uptime in clock ticks from /proc/uptime (seconds × HZ).
 * Used to compute per-process age for lifetime-average CPU fallback.
 * Returns uptime in seconds (float) or 0 on failure.
 */
function getHostUptimeSec() {
  try {
    const content = fs.readFileSync('/proc/uptime', 'utf8');
    return parseFloat(content.split(' ')[0]) || 0;
  } catch (e) {
    return os.uptime();
  }
}

/**
 * Parse /proc/[pid]/stat safely (comm can contain spaces and parentheses).
 */
function parseProcStat(content) {
  const openParen = content.indexOf('(');
  const closeParen = content.lastIndexOf(')');

  if (openParen === -1 || closeParen === -1 || closeParen <= openParen) {
    return null;
  }

  const pid = parseInt(content.substring(0, openParen).trim(), 10);
  const comm = content.substring(openParen + 1, closeParen);
  const rest = content.substring(closeParen + 1).trim().split(/\s+/);

  const state = rest[0];
  const ppid = parseInt(rest[1], 10) || 0;
  const utime = parseInt(rest[11], 10) || 0;
  const stime = parseInt(rest[12], 10) || 0;
  const starttime = parseInt(rest[19], 10) || 0;

  return { pid, comm, state, ppid, utime, stime, starttime };
}

/**
 * Parse /proc/[pid]/status for Uid, VmRSS, VmSize.
 */
function parseProcStatus(content) {
  const lines = content.split('\n');
  let uid = 0;
  let rssBytes = 0;
  let vszBytes = 0;

  for (const line of lines) {
    if (line.startsWith('Uid:')) {
      const parts = line.split(/\s+/);
      uid = parseInt(parts[1], 10) || 0;
    } else if (line.startsWith('VmRSS:')) {
      const parts = line.split(/\s+/);
      rssBytes = (parseInt(parts[1], 10) || 0) * 1024;
    } else if (line.startsWith('VmSize:')) {
      const parts = line.split(/\s+/);
      vszBytes = (parseInt(parts[1], 10) || 0) * 1024;
    }
  }

  return { uid, rssBytes, vszBytes };
}

/**
 * Collect process list directly from Linux /proc
 */
async function sampleProcLinux(options = {}) {
  const limit = parseInt(options.limit, 10) || 50;
  const sortBy = options.sortBy === 'mem' ? 'mem' : 'cpu';

  const currentSystemCpu = getSystemCpuTotal();
  const currentSampleTime = Date.now();
  const systemCpuDelta = Math.max(1, currentSystemCpu - prevTotalSystemCpu);
  const timeDeltaSec = prevSampleTime > 0 ? (currentSampleTime - prevSampleTime) / 1000 : 1;
  const totalHostMem = os.totalmem() || 1;
  const cpuCount = getHostCpuCount();

  // Clock ticks per second (CLK_TCK). On virtually all modern Linux systems this is 100.
  // We use /proc/uptime (seconds) and /proc/[pid]/stat starttime (ticks) to compute process age.
  const HZ = 100;
  const hostUptimeSec = getHostUptimeSec();

  const currentPidMap = new Map();
  const processes = [];

  try {
    const entries = fs.readdirSync('/proc');

    for (const entry of entries) {
      // Check if entry name is purely numeric (PID)
      if (entry.charCodeAt(0) < 48 || entry.charCodeAt(0) > 57) continue;
      const pid = parseInt(entry, 10);
      if (isNaN(pid)) continue;

      const procDir = `/proc/${pid}`;
      try {
        const statContent = fs.readFileSync(`${procDir}/stat`, 'utf8');
        const stat = parseProcStat(statContent);
        if (!stat) continue;

        let status = { uid: 0, rssBytes: 0, vszBytes: 0 };
        try {
          const statusContent = fs.readFileSync(`${procDir}/status`, 'utf8');
          status = parseProcStatus(statusContent);
        } catch (e) {}

        let cmdline = '';
        try {
          const cmdlineRaw = fs.readFileSync(`${procDir}/cmdline`);
          cmdline = cmdlineRaw.toString('utf8').replace(/\0/g, ' ').trim();
        } catch (e) {}

        const totalProcTicks = stat.utime + stat.stime;
        currentPidMap.set(pid, { totalTicks: totalProcTicks });

        // Calculate CPU %
        let cpuPercent = 0;
        const prev = prevPidCpuMap.get(pid);
        if (prev && systemCpuDelta > 0) {
          // Normal delta path: accurate inter-poll measurement
          const procTicksDelta = totalProcTicks - prev.totalTicks;
          if (procTicksDelta > 0) {
            // Percent relative to all cores (can exceed 100% on multi-core; capped at cpuCount*100)
            cpuPercent = Math.min(100 * cpuCount, Math.round(((procTicksDelta / systemCpuDelta) * 100 * cpuCount) * 10) / 10);
          }
        } else if (!prev && totalProcTicks > 0 && hostUptimeSec > 0) {
          // First-sample fallback: use process lifetime average instead of returning 0.
          // procesAgeSec = time since boot minus the tick-offset at which the process started.
          const processAgeSec = hostUptimeSec - (stat.starttime / HZ);
          if (processAgeSec > 0.5) {
            // lifetime avg = total cpu ticks / (age * HZ * cpuCount) expressed as percent
            const lifetimeAvg = (totalProcTicks / (processAgeSec * HZ * cpuCount)) * 100;
            cpuPercent = Math.min(100 * cpuCount, Math.round(lifetimeAvg * 10) / 10);
          }
        }

        const memPercent = Math.min(100, Math.round(((status.rssBytes / totalHostMem) * 100) * 10) / 10);
        const user = resolveUsername(status.uid);
        const command = stat.comm || 'unknown';
        const fullArgs = cmdline || command;

        processes.push({
          pid,
          ppid: stat.ppid,
          user,
          cpuPercent,
          memPercent,
          vszBytes: status.vszBytes,
          rssBytes: status.rssBytes,
          formattedRss: formatBytes(status.rssBytes),
          state: stat.state,
          command,
          args: fullArgs
        });
      } catch (e) {
        // Process might have terminated between readdir and readFileSync - expected on Linux
      }
    }
  } catch (err) {
    return null;
  }

  // Update history state
  prevPidCpuMap = currentPidMap;
  prevTotalSystemCpu = currentSystemCpu;
  prevSampleTime = currentSampleTime;

  // Sort
  if (sortBy === 'mem') {
    processes.sort((a, b) => b.rssBytes - a.rssBytes);
  } else {
    processes.sort((a, b) => b.cpuPercent - a.cpuPercent);
  }

  return {
    sortBy,
    limit,
    total: processes.length,
    processes: processes.slice(0, limit)
  };
}

/**
 * Cross-platform sampler entrypoint.
 * Uses pure /proc on Linux (0 child processes spawned).
 * Falls back to PowerShell on Windows dev environment.
 */
async function sampleProcesses(options = {}) {
  const limit = parseInt(options.limit, 10) || 50;
  const sortBy = options.sortBy === 'mem' ? 'mem' : 'cpu';

  const goResult = await goCollectorClient.getProcesses({ limit, sortBy });
  if (goResult && Array.isArray(goResult.processes)) {
    return goResult;
  }

  // 1. Linux fast path: /proc inspection (Zero subprocesses)
  if (fs.existsSync('/proc/stat') && fs.existsSync('/proc/1')) {
    const procResult = await sampleProcLinux(options);
    if (procResult && procResult.processes.length > 0) {
      return procResult;
    }
  }

  // 2. Windows Dev Fallback (PowerShell JSON)
  const isWin = os.platform() === 'win32';
  if (isWin) {
    const psWin = await runCommand('powershell', [
      '-NoProfile',
      '-Command',
      `Get-Process | Sort-Object -Property ${sortBy === 'mem' ? 'WorkingSet64' : 'CPU'} -Descending | Select-Object -First ${limit} -Property Id, ProcessName, CPU, WorkingSet64 | ConvertTo-Json`
    ], 3000);

    if (psWin.success && psWin.stdout) {
      try {
        const rawJson = psWin.stdout.trim();
        if (rawJson) {
          const parsed = JSON.parse(rawJson);
          const arr = Array.isArray(parsed) ? parsed : [parsed];
          const processes = arr.filter(Boolean).map(p => {
            const rss = p.WorkingSet64 || 0;
            return {
              pid: p.Id || 0,
              user: os.userInfo().username || 'system',
              cpuPercent: Math.round((p.CPU || 0) * 10) / 10,
              memPercent: 0,
              vszBytes: rss,
              rssBytes: rss,
              formattedRss: formatBytes(rss),
              state: 'R',
              command: p.ProcessName || 'Unknown',
              args: p.ProcessName || 'Unknown'
            };
          });

          return {
            sortBy,
            limit,
            total: processes.length,
            processes
          };
        }
      } catch (e) {}
    }
  }

  // 3. ps fallback if /proc was somehow not mountable
  const sortFlag = sortBy === 'mem' ? '-%mem' : '-%cpu';
  const psRes = await runCommand('ps', ['-eo', 'pid,user,%cpu,%mem,vsz,rss,stat,comm,args', `--sort=${sortFlag}`], 3000);
  if (psRes.success && psRes.stdout) {
    const lines = psRes.stdout.trim().split('\n');
    const processes = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(/\s+/);
      if (parts.length >= 9) {
        const pid = parseInt(parts[0], 10);
        const user = parts[1];
        const cpuPercent = parseFloat(parts[2]) || 0;
        const memPercent = parseFloat(parts[3]) || 0;
        const vszBytes = (parseInt(parts[4], 10) || 0) * 1024;
        const rssBytes = (parseInt(parts[5], 10) || 0) * 1024;
        const state = parts[6];
        const command = parts[7];
        const args = parts.slice(8).join(' ');

        if (!isNaN(pid)) {
          processes.push({
            pid,
            user,
            cpuPercent,
            memPercent,
            vszBytes,
            rssBytes,
            formattedRss: formatBytes(rssBytes),
            state,
            command,
            args: args || command
          });
        }
      }
    }

    return {
      sortBy,
      limit,
      total: processes.length,
      processes: processes.slice(0, limit)
    };
  }

  return {
    sortBy,
    limit,
    total: 0,
    processes: []
  };
}

module.exports = {
  sampleProcesses,
  sampleProcLinux,
  parseProcStat,
  parseProcStatus
};
