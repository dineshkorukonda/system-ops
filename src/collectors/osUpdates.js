const { runCommand } = require('../utils/exec');

async function getOsUpdatesSnapshot() {
  if (process.platform === 'win32') {
    return {
      available: false,
      platform: 'win32',
      pendingCount: 0,
      packages: [],
    };
  }

  const aptRes = await runCommand('apt', ['list', '--upgradable'], 8000);
  if (!aptRes.success) {
    return {
      available: false,
      platform: process.platform,
      pendingCount: 0,
      packages: [],
      error: aptRes.stderr || 'apt list unavailable',
    };
  }

  const lines = (aptRes.stdout || '')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('Listing'));

  const packages = lines.slice(0, 20).map((line) => {
    const parts = line.split(/\s+/);
    return {
      name: parts[0]?.split('/')[0] || line,
      line: line.trim(),
    };
  });

  return {
    available: true,
    platform: process.platform,
    pendingCount: lines.length,
    packages,
    securityHint: lines.some((l) => /security/i.test(l)),
    lastChecked: new Date().toISOString(),
  };
}

module.exports = {
  getOsUpdatesSnapshot,
};
