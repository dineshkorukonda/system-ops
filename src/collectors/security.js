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

function parseUfwOutput(stdout) {
  const lines = (stdout || '').split('\n');
  const statusLine = lines.find((l) => /Status:/i.test(l)) || '';
  const active = /Status:\s*active/i.test(statusLine);
  const defaultIncoming = lines.find((l) => /Default:/i.test(l) && /incoming/i.test(l)) || null;

  const rules = lines.filter((l) => /ALLOW|DENY|REJECT/i.test(l) && !/Default:/i.test(l));

  return {
    available: true,
    active,
    defaultPolicy: defaultIncoming ? defaultIncoming.replace(/^\s*/, '') : null,
    ruleCount: rules.length,
    rules: rules.slice(0, 12).map((l) => l.trim()),
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
    jails.push({
      name: jail,
      currentlyBanned: bannedMatch ? parseInt(bannedMatch[1], 10) : 0,
      currentlyFailed: failedMatch ? parseInt(failedMatch[1], 10) : 0,
    });
  }

  const totalBanned = jails.reduce((sum, j) => sum + j.currentlyBanned, 0);

  return {
    available: true,
    active: jailNames.length > 0,
    jailCount: jailNames.length,
    totalBanned,
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
};
