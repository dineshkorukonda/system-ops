const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const { collectPm2Snapshot, getPm2Logs } = require('../plugins/superpowers/skills/pm2_discovery');
async function main() {
  const user = os.userInfo().username;
  process.env[`PM2_PATH_${user.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`] = process.env.PM2_FIXTURE_PATH;
  const snapshot = await collectPm2Snapshot();
  assert.equal(snapshot.totalProcesses, 3);
  assert.equal(snapshot.onlineCount, 3);
  assert.equal(snapshot.allUsers.length, 3);
  assert.equal(snapshot.failedUserCount, 1);
  assert.equal(snapshot.incomplete, true);
  const own = snapshot.allUsers.find(entry => entry.user === user);
  assert.equal(own.processes.length, 2);
  assert.equal(own.processes[0].name, own.processes[1].name);
  assert.notEqual(own.processes[0].pm_id, own.processes[1].pm_id);
  const logs = await getPm2Logs(user, String(own.processes[0].pm_id), 20);
  assert.match(logs.output, /fixture-one/);
  const root = snapshot.allUsers.find(entry => entry.user === 'root');
  const rootLogs = await getPm2Logs('root', String(root.processes[0].pm_id), 20);
  assert.match(rootLogs.output, /fixture-root/);
  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync('artifacts/pm2-fixture.json', JSON.stringify({ timestamp: new Date().toISOString(),
    machine: { platform: process.platform, kernel: os.release(), node: process.version },
    totalProcesses: snapshot.totalProcesses, onlineCount: snapshot.onlineCount, failedUserCount: snapshot.failedUserCount,
    users: snapshot.allUsers.map(entry => ({ user: entry.user, error: entry.error,
      processes: entry.processes.map(proc => ({ id: proc.pm_id, name: proc.name, status: proc.status, pid: proc.pid })) })),
    logsVerified: ['own app by numeric ID', 'root app through restricted helper'],
    limitations: ['Disposable Ubuntu fixture; no production host was accessed.'] }, null, 2));
  console.log('PASS: real PM2 daemons across two users, duplicate names, failed user visibility, exact app logs');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
