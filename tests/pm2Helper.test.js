const { test } = require('node:test');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

test('native PM2 helper switches away from a private caller directory for cross-user reads', {
  skip: process.platform !== 'linux' || process.getuid() !== 0 || !fs.existsSync('/usr/bin/python3'),
}, () => {
  execFileSync('/usr/bin/python3', [path.join(__dirname, 'fixtures/pm2-helper-cwd.py'),
    path.join(__dirname, '../scripts/pm2-read.sh')], { stdio: 'pipe', timeout: 10000 });
});
