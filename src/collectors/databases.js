const net = require('net');
const { runCommand } = require('../utils/exec');

function probePort(port, host = '127.0.0.1', timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => { socket.destroy(); resolve(false); });
    socket.connect(port, host);
  });
}

async function checkPostgres(port = 5432) {
  const listening = await probePort(port);
  if (!listening) {
    return { engine: 'postgresql', available: false, port, listening: false };
  }

  const ready = await runCommand('pg_isready', ['-h', '127.0.0.1', '-p', String(port)], 2500);
  let version = null;
  const verRes = await runCommand('psql', ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-tAc', 'SELECT version()'], 3000);
  if (verRes.success && verRes.stdout.trim()) {
    version = verRes.stdout.trim().split('\n')[0].slice(0, 80);
  }

  return {
    engine: 'postgresql',
    available: true,
    port,
    listening: true,
    acceptingConnections: ready.success,
    statusText: ready.success ? 'Accepting connections' : (ready.stderr || 'Port open, not accepting'),
    version,
  };
}

async function checkRedis(port = 6379) {
  const listening = await probePort(port);
  if (!listening) {
    return { engine: 'redis', available: false, port, listening: false };
  }

  const ping = await runCommand('redis-cli', ['-p', String(port), 'ping'], 2500);
  const infoRes = await runCommand('redis-cli', ['-p', String(port), 'INFO', 'memory'], 2500);

  let usedMemoryHuman = null;
  let connectedClients = null;
  if (infoRes.success) {
    const memMatch = infoRes.stdout.match(/used_memory_human:([^\r\n]+)/);
    const clientsMatch = infoRes.stdout.match(/connected_clients:(\d+)/);
    if (memMatch) usedMemoryHuman = memMatch[1].trim();
    if (clientsMatch) connectedClients = parseInt(clientsMatch[1], 10);
  }

  return {
    engine: 'redis',
    available: true,
    port,
    listening: true,
    responding: ping.success && ping.stdout.trim().toUpperCase() === 'PONG',
    usedMemoryHuman,
    connectedClients,
    statusText: ping.success ? 'PONG' : 'Port open, no redis-cli response',
  };
}

async function checkMysql(port = 3306) {
  const listening = await probePort(port);
  if (!listening) {
    return { engine: 'mysql', available: false, port, listening: false };
  }

  const ping = await runCommand('mysqladmin', ['ping', '-h', '127.0.0.1', '-P', String(port)], 3000);

  return {
    engine: 'mysql',
    available: true,
    port,
    listening: true,
    responding: ping.success && /alive/i.test(ping.stdout),
    statusText: ping.success ? (ping.stdout.trim() || 'Responding') : 'Port open, mysqladmin unavailable',
  };
}

async function getDatabaseSnapshot() {
  const pgPort = parseInt(process.env.POSTGRES_PORT, 10) || 5432;
  const redisPort = parseInt(process.env.REDIS_PORT, 10) || 6379;
  const mysqlPort = parseInt(process.env.MYSQL_PORT, 10) || 3306;

  const [postgresql, redis, mysql] = await Promise.all([
    checkPostgres(pgPort),
    checkRedis(redisPort),
    checkMysql(mysqlPort),
  ]);

  const engines = [postgresql, redis, mysql].filter((e) => e.available);

  return {
    timestamp: new Date().toISOString(),
    count: engines.length,
    engines: { postgresql, redis, mysql },
    summary: engines.map((e) => ({
      engine: e.engine,
      port: e.port,
      statusText: e.statusText || (e.listening ? 'Listening' : 'Not detected'),
    })),
  };
}

module.exports = {
  getDatabaseSnapshot,
  checkPostgres,
  checkRedis,
  checkMysql,
};
