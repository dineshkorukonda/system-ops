const { runCommand } = require('../utils/exec');

function parseCertbotCertificates(stdout) {
  const certs = [];
  const blocks = (stdout || '').split(/\n(?=Certificate Name:)/);

  for (const block of blocks) {
    const nameMatch = block.match(/Certificate Name:\s*(.+)/);
    if (!nameMatch) continue;

    const domainsMatch = block.match(/Domains:\s*(.+)/);
    const expiryMatch = block.match(/Expiry Date:\s*(.+?)\s*\(/);
    const pathMatch = block.match(/Certificate Path:\s*(.+)/);

    const expiryText = expiryMatch ? expiryMatch[1].trim() : null;
    const expiryDate = expiryText ? new Date(expiryText) : null;
    const daysRemaining = expiryDate && !Number.isNaN(expiryDate.getTime())
      ? Math.floor((expiryDate - Date.now()) / (1000 * 60 * 60 * 24))
      : null;

    certs.push({
      name: nameMatch[1].trim(),
      domains: domainsMatch
        ? domainsMatch[1].trim().split(/\s+/).filter(Boolean)
        : [],
      expiryDate: expiryDate ? expiryDate.toISOString() : null,
      formattedExpiry: expiryDate
        ? expiryDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
        : null,
      daysRemaining,
      certPath: pathMatch ? pathMatch[1].trim() : null,
      valid: daysRemaining === null ? null : daysRemaining > 0,
    });
  }

  return certs;
}

async function getCertbotSnapshot() {
  const which = await runCommand('which', ['certbot'], 1500);
  if (!which.success || !which.stdout.trim()) {
    return { available: false, installed: false, certificates: [], timerActive: false };
  }

  const [certRes, timerRes] = await Promise.all([
    runCommand('sudo', ['-n', 'certbot', 'certificates'], 8000),
    runCommand('systemctl', ['is-active', 'certbot.timer'], 2000),
  ]);

  let certificates = [];
  if (certRes.success) {
    certificates = parseCertbotCertificates(certRes.stdout);
  } else {
    const fallback = await runCommand('certbot', ['certificates'], 8000);
    if (fallback.success) {
      certificates = parseCertbotCertificates(fallback.stdout);
    }
  }

  const timerActive = timerRes.success && timerRes.stdout.trim() === 'active';

  return {
    available: certificates.length > 0 || certRes.success || timerActive,
    installed: true,
    timerActive,
    certificateCount: certificates.length,
    certificates,
    renewHint: 'sudo certbot renew --dry-run',
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  getCertbotSnapshot,
  parseCertbotCertificates,
};
