const { runCommand } = require('../utils/exec');
const { formatBytes } = require('../utils/formatters');

/**
 * Validate container ID or name to prevent command injection
 */
function isValidContainerId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_\-\.]+$/.test(id);
}

/**
 * Collect full Docker container snapshot & stats.
 * Gracefully handles Docker being stopped, permission issues, or missing.
 */
async function getDockerSnapshot() {
  const emptySnapshot = {
    available: false,
    total: 0,
    running: 0,
    exited: 0,
    paused: 0,
    memoryFormatted: '0 B',
    containers: [],
    updatedAt: new Date().toISOString()
  };

  try {
    // 1. List all containers (running & stopped) in JSON format
    const psRes = await runCommand(
      'docker',
      ['ps', '-a', '--format', '{{json .}}'],
      3500
    );

    if (!psRes.success || !psRes.stdout) {
      return emptySnapshot;
    }

    const lines = psRes.stdout.trim().split('\n').filter(Boolean);
    const rawContainers = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line.trim());
        rawContainers.push(parsed);
      } catch (e) {
        // Ignore malformed line
      }
    }

    if (rawContainers.length === 0) {
      return {
        ...emptySnapshot,
        available: true
      };
    }

    // 2. Fetch resource stats for running containers
    const statsMap = new Map();
    try {
      const statsRes = await runCommand(
        'docker',
        ['stats', '--no-stream', '--format', '{{json .}}'],
        3500
      );
      if (statsRes.success && statsRes.stdout) {
        const statLines = statsRes.stdout.trim().split('\n').filter(Boolean);
        for (const sLine of statLines) {
          try {
            const sParsed = JSON.parse(sLine.trim());
            const id = (sParsed.ID || sParsed.Container || '').trim();
            const name = (sParsed.Name || '').trim();
            const cpu = sParsed.CPUPerc || '--';
            const mem = sParsed.MemUsage || '--';
            if (id) statsMap.set(id, { cpu, mem });
            if (name) statsMap.set(name, { cpu, mem });
          } catch (e) {}
        }
      }
    } catch (e) {
      // Non-fatal if stats fail
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
        cpu: stats.cpu || (state === 'running' ? '0.0%' : '--'),
        memory: stats.mem || (state === 'running' ? '--' : '--')
      };
    });

    return {
      available: true,
      total: containers.length,
      running,
      exited,
      paused,
      memoryFormatted: `${running} running`,
      containers,
      updatedAt: new Date().toISOString()
    };
  } catch (err) {
    return emptySnapshot;
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

  const res = await runCommand(
    'docker',
    ['logs', '--tail', String(lineCount), containerId],
    4000
  );

  const output = (res.stdout || '') + (res.stderr ? (res.stdout ? '\n' : '') + res.stderr : '');

  return {
    success: res.success,
    containerId,
    output: output.trim() || 'No logs recorded for this container.'
  };
}

module.exports = {
  getDockerSnapshot,
  getDockerLogs,
  isValidContainerId
};
