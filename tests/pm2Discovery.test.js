const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parsePm2Json, collectPm2Snapshot, getPm2UserProcesses, runPm2Command } = require('../plugins/superpowers/skills/pm2_discovery');
test('PM2 parser accepts empty and prefixed lists and preserves separate cluster IDs', () => {
  assert.deepEqual(parsePm2Json('ops', '[]').processes, []);
  const data = parsePm2Json('ops', 'banner\n' + JSON.stringify([
    { name: 'same', pm_id: 0, pid: 1, monit: { memory: 1024, cpu: 0 }, pm2_env: { status: 'online' } },
    { name: 'same', pm_id: 1, pid: 2, monit: { memory: 2048, cpu: 10 }, pm2_env: { status: 'stopped' } },
  ]));
  assert.equal(data.processes.length, 2);
  assert.notEqual(data.processes[0].pm_id, data.processes[1].pm_id);
  assert.equal(data.processes[0].cpu, 0);
  assert.equal(data.processes[1].memory, 2048);
  assert.ok(parsePm2Json('ops', 'not json').error);
  assert.ok(parsePm2Json('ops', '[null]').error);
});
test('PM2 aggregate keeps failed users visible and totals all known apps without inventing missing ones', async () => {
  const snapshot = await collectPm2Snapshot({ userNames: ['good', 'denied'], collectUser: async user => user === 'denied'
    ? { user, processes: [], error: 'permission denied' }
    : { user, pm2Path: '/pm2', processes: [{ status: 'online', memory: 100 }, { status: 'stopped', memory: 200 }] } });
  assert.equal(snapshot.allUsers.length, 2);
  assert.equal(snapshot.failedUserCount, 1);
  assert.equal(snapshot.incomplete, true);
  assert.equal(snapshot.totalProcesses, 2);
  assert.equal(snapshot.totalMemory, 300);
});
test('PM2 rejects invalid users, relative binaries and mutation commands', async () => {
  assert.ok((await getPm2UserProcesses('root;touch')).error);
  assert.equal((await runPm2Command('ops', 'relative/path', 'jlist')).success, false);
  assert.equal((await runPm2Command('ops', '/bin/pm2', 'delete', ['all'])).success, false);
});
test('PM2 leaves an absent current-user daemon stopped', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'system-ops-pm2-test-'));
  const previous = process.env.PM2_HOME;
  process.env.PM2_HOME = home;
  try {
    const result = await getPm2UserProcesses(os.userInfo().username);
    assert.ok(result.error);
    assert.equal(result.pm2Path, null);
    assert.deepEqual(result.processes, []);
    assert.deepEqual(fs.readdirSync(home), []);
  } finally {
    if (previous === undefined) delete process.env.PM2_HOME; else process.env.PM2_HOME = previous;
    fs.rmdirSync(home);
  }
});
