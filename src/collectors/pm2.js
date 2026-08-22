// Wrapper collector delegating to Superpowers PM2 discovery plugin
const pm2Discovery = require('../../plugins/superpowers/skills/pm2_discovery');

module.exports = {
  // UI expects getPm2Snapshot
  getPm2Snapshot: pm2Discovery.collectPm2Snapshot,
  // Optional helpers
  getPm2Logs: pm2Discovery.getPm2Logs,
  getPm2Users: pm2Discovery.getPm2Users,
  clearPm2Cache: pm2Discovery.clearPm2Cache,
  runPm2Command: pm2Discovery.runPm2Command,
};
