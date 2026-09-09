const { runCommand } = require('../utils/exec');

async function getUfwStatus() {
  const which = await runCommand('which', ['ufw'], 1500);
  if (!which.success || !which.stdout.trim()) {
    return { available: false, active: false };
  }

  const status = await runCommand('sudo', ['-n', 'ufw', 'status', 'verbose'], 3000);
  if (!status.success) {
    const fallback = await runCommand('ufw', ['status'], 3000);
    if (!fallback.success) {
      return { available: true, active: false, error: 'Cannot read UFW status (sudo may be required)' };
    }
    return parseUfwOutput(fallback.stdout);
  }

  return parseUfwOutput(status.stdout);
}

function parseUfwRuleLine(line) {
  const trimmed = (line || '').trim();
  const match = trimmed.match(/^(\S+)\s+(ALLOW|DENY|REJECT)\s+IN\s+(\S+)(?:\s+#\s*(.+))?/i);
  if (!match) return { raw: trimmed };

  const portSpec = match[1].replace(/\(.*\)/, '').trim();
  const commentMatch = match[1].match(/\(([^)]+)\)/);
  const label = match[4]?.trim() || commentMatch?.[1] || guessPortLabel(portSpec);

  return {
    raw: trimmed,
    port: portSpec,
    action: match[2].toUpperCase(),
    from: match[3],
    label,
    allowed: match[2].toUpperCase() === 'ALLOW',
  };
}

function guessPortLabel(portSpec) {
  const port = String(portSpec).split('/')[0];
  const map = {
    '22': 'SSH (remote login)',
    '80': 'Website HTTP',
    '443': 'Website HTTPS',
    '9090': 'VersionGate API',
  };
  return map[port] || 'Custom service';
}

function parseUfwOutput(stdout) {
  const lines = (stdout || '').split('\n');
  const statusLine = lines.find((l) => /Status:/i.test(l)) || '';
  const active = /Status:\s*active/i.test(statusLine);
  const defaultIncoming = lines.find((l) => /Default:/i.test(l) && /incoming/i.test(l)) || null;
  const defaultOutgoing = lines.find((l) => /Default:/i.test(l) && /outgoing/i.test(l)) || null;

  const ruleLines = lines.filter((l) => /ALLOW|DENY|REJECT/i.test(l) && !/Default:/i.test(l));
  const parsedRules = ruleLines.map(parseUfwRuleLine);
  const allowRules = parsedRules.filter((r) => r.allowed);

  let incomingPolicy = 'unknown';
  if (defaultIncoming) {
    if (/deny/i.test(defaultIncoming)) incomingPolicy = 'block-by-default';
    else if (/allow/i.test(defaultIncoming)) incomingPolicy = 'allow-by-default';
  }

  return {
    available: true,
    active,
    defaultPolicy: defaultIncoming ? defaultIncoming.replace(/^\s*/, '') : null,
    incomingPolicy,
    outgoingPolicy: defaultOutgoing ? defaultOutgoing.replace(/^\s*/, '') : null,
    ruleCount: ruleLines.length,
    allowCount: allowRules.length,
    rules: ruleLines.slice(0, 20).map((l) => l.trim()),
    parsedRules: parsedRules.slice(0, 20),
    summary: active
      ? `Firewall is ON. ${allowRules.length} port(s) open to the internet; everything else incoming is blocked.`
      : 'Firewall is installed but turned off — your server is not filtering incoming connections.',
  };
}

async function getFail2banStatus() {
  const which = await runCommand('which', ['fail2ban-client'], 1500);
  if (!which.success || !which.stdout.trim()) {
    return { available: false, active: false, jails: [] };
  }

  const status = await runCommand('sudo', ['-n', 'fail2ban-client', 'status'], 3000);
  if (!status.success) {
    return { available: true, active: false, error: 'fail2ban installed but status unavailable' };
  }

  const jailMatch = status.stdout.match(/Jail list:\s*(.+)/i);
  const jailNames = jailMatch
    ? jailMatch[1].split(',').map((j) => j.trim()).filter(Boolean)
    : [];

  const jails = [];
  for (const jail of jailNames.slice(0, 8)) {
    const jailStatus = await runCommand('sudo', ['-n', 'fail2ban-client', 'status', jail], 2500);
    if (!jailStatus.success) continue;

    const bannedMatch = jailStatus.stdout.match(/Currently banned:\s*(\d+)/i);
    const failedMatch = jailStatus.stdout.match(/Currently failed:\s*(\d+)/i);
    const totalBannedMatch = jailStatus.stdout.match(/Total banned:\s*(\d+)/i);
    const ipListMatch = jailStatus.stdout.match(/Banned IP list:\s*(.+)/i);
    const bannedIps = ipListMatch
      ? ipListMatch[1].trim().split(/\s+/).filter((ip) => /^\d/.test(ip))
      : [];

    jails.push({
      name: jail,
      label: jail === 'sshd' ? 'SSH login attacks' : jail,
      currentlyBanned: bannedMatch ? parseInt(bannedMatch[1], 10) : 0,
      currentlyFailed: failedMatch ? parseInt(failedMatch[1], 10) : 0,
      totalBanned: totalBannedMatch ? parseInt(totalBannedMatch[1], 10) : 0,
      bannedIps: bannedIps.slice(0, 20),
    });
  }

  const totalBanned = jails.reduce((sum, j) => sum + j.currentlyBanned, 0);
  const totalFailed = jails.reduce((sum, j) => sum + j.currentlyFailed, 0);
  const allBannedIps = jails.flatMap((j) => j.bannedIps || []);

  return {
    available: true,
    active: jailNames.length > 0,
    jailCount: jailNames.length,
    totalBanned,
    totalFailed,
    bannedIps: allBannedIps.slice(0, 30),
    summary: totalBanned > 0
      ? `Blocking ${totalBanned} suspicious IP address${totalBanned === 1 ? '' : 'es'} right now (failed login / brute-force attempts).`
      : jailNames.length > 0
        ? 'Attack blocker is running. No IPs are blocked right now — that is normal when nobody is attacking.'
        : 'Attack blocker not installed.',
    jails,
  };
}

async function getSecuritySnapshot() {
  const [ufw, fail2ban] = await Promise.all([getUfwStatus(), getFail2banStatus()]);

  return {
    timestamp: new Date().toISOString(),
    ufw,
    fail2ban,
    available: ufw.available || fail2ban.available,
  };
}

module.exports = {
  getSecuritySnapshot,
  getUfwStatus,
  getFail2banStatus,
  parseUfwOutput,
  parseUfwRuleLine,
};
