const { runDocker, socketExists, buildDockerError } = require('../utils/dockerExec');

/**
 * Validate container ID or name to prevent command injection
 */
function isValidContainerId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_\-\.]+$/.test(id);
}

function parseJsonLines(stdout) {
  if (!stdout || !stdout.trim()) return [];
  const items = [];
  for (const line of stdout.trim().split('\n')) {
    if (!line.trim()) continue;
    try {
      items.push(JSON.parse(line.trim()));
    } catch {
      // skip malformed line
    }
  }
  return items;
}

function emptySnapshot(overrides = {}) {
  return {
    available: false,
    daemonReachable: false,
    permissionIssue: false,
    usedSudo: false,
    error: null,
    hint: null,
    total: 0,
    running: 0,
    exited: 0,
    paused: 0,
    networkCount: 0,
    memoryFormatted: '0 B',
    containers: [],
    networks: [],
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Collect Docker networks
 */
async function getDockerNetworks() {
  const res = await runDocker(['network', 'ls', '--format', '{{json .}}'], 3500);
  if (!res.success) {
    return { networks: [], error: buildDockerError(res) };
  }

  const raw = parseJsonLines(res.stdout);
  const networks = raw.map((n) => ({
    id: (n.ID || '').substring(0, 12),
    name: n.Name || '--',
    driver: n.Driver || '--',
    scope: n.Scope || 'local',
    ipv6: n.IPv6 === 'true' || n.IPv6 === true,
    internal: n.Internal === 'true' || n.Internal === true,
    labels: n.Labels || '',
  }));

  return { networks, usedSudo: res.usedSudo };
}

/**
 * Collect full Docker container snapshot & stats.
 * Gracefully handles Docker being stopped, permission issues, or missing.
 */
async function getDockerSnapshot() {
  try {
    const psRes = await runDocker(['ps', '-a', '--format', '{{json .}}'], 3500);

    if (!psRes.success) {
      const errInfo = buildDockerError(psRes);
      const hasSocket = socketExists();
      return emptySnapshot({
        available: hasSocket,
        daemonReachable: false,
        permissionIssue: errInfo.permissionIssue,
        usedSudo: psRes.usedSudo,
        error: errInfo.error,
        hint: errInfo.hint,
      });
    }

    const rawContainers = parseJsonLines(psRes.stdout);
    const networkResult = await getDockerNetworks();
    const networks = networkResult.networks || [];

    if (rawContainers.length === 0) {
      return {
        ...emptySnapshot({
          available: true,
          daemonReachable: true,
          usedSudo: psRes.usedSudo || networkResult.usedSudo,
          networkCount: networks.length,
          networks,
        }),
      };
    }

    const statsMap = new Map();
    try {
      const statsRes = await runDocker(['stats', '--no-stream', '--format', '{{json .}}'], 3500);
      if (statsRes.success && statsRes.stdout) {
        for (const sParsed of parseJsonLines(statsRes.stdout)) {
          const id = (sParsed.ID || sParsed.Container || '').trim();
          const name = (sParsed.Name || '').trim();
          const cpu = sParsed.CPUPerc || '--';
          const mem = sParsed.MemUsage || '--';
          if (id) statsMap.set(id, { cpu, mem });
          if (name) statsMap.set(name, { cpu, mem });
        }
      }
    } catch {
      // non-fatal
    }

    let running = 0;
    let exited = 0;
    let paused = 0;

    const containers = rawContainers.map((c) => {
      const id = (c.ID || '').substring(0, 12);
      const name = (c.Names || '').replace(/^\//, '');
      const image = c.Image || '--';
      const state = (c.State || '').toLowerCase();
      const status = c.Status || '--';
      const ports = c.Ports || '--';
      const created = c.CreatedAt || c.RunningFor || '--';
      const networks = c.Networks || '';

      if (state === 'running') running++;
      else if (state === 'paused') paused++;
      else exited++;

      const stats = statsMap.get(id) || statsMap.get(name) || {};

      return {
        id,
        name,
        image,
        state,
        status,
        ports,
        created,
        networks,
        cpu: stats.cpu || (state === 'running' ? '0.0%' : '--'),
        memory: stats.mem || '--',
      };
    });

    return {
      available: true,
      daemonReachable: true,
      permissionIssue: false,
      usedSudo: psRes.usedSudo || networkResult.usedSudo,
      error: null,
      hint: null,
      total: containers.length,
      running,
      exited,
      paused,
      networkCount: networks.length,
      memoryFormatted: `${running} running`,
      containers,
      networks,
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    return emptySnapshot({
      error: err.message,
      hint: 'Run: sudo bash /opt/system-ops/scripts/debug-docker.sh',
    });
  }
}

/**
 * Fetch logs for a specific container
 */
async function getDockerLogs(containerId, lines = 100) {
  if (!isValidContainerId(containerId)) {
    throw new Error('Invalid container identifier');
  }

  const lineCount = Math.min(Math.max(parseInt(lines, 10) || 100, 10), 1000);

  const res = await runDocker(['logs', '--tail', String(lineCount), containerId], 4000);

  const output = (res.stdout || '') + (res.stderr ? (res.stdout ? '\n' : '') + res.stderr : '');

  return {
    success: res.success,
    containerId,
    output: output.trim() || (res.success ? 'No logs recorded for this container.' : 'Failed to fetch container logs.'),
    error: res.success ? null : buildDockerError(res).error,
  };
}

module.exports = {
  getDockerSnapshot,
  getDockerLogs,
  getDockerNetworks,
  isValidContainerId,
};
