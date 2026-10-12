const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const {
  isNewerVersion,
  getCurrentVersion,
  detectInstallType,
  parseLogOutcome,
  extractLastUpdateSession,
} = require('../src/services/updateService');

test('isNewerVersion compares semver correctly', () => {
  assert.strictEqual(isNewerVersion('2.0.0', '2.1.0'), true);
  assert.strictEqual(isNewerVersion('2.1.0', '2.0.0'), false);
  assert.strictEqual(isNewerVersion('2.0.0', '2.0.0'), false);
  assert.strictEqual(isNewerVersion('1.9.9', '2.0.0'), true);
  assert.strictEqual(isNewerVersion('2.0.0', 'v2.1.0'), true);
});

test('getCurrentVersion reads package.json version', () => {
  const version = getCurrentVersion();
  assert.ok(/^\d+\.\d+\.\d+/.test(version));
});

test('parseLogOutcome detects success and failure from deploy log', () => {
  const success = parseLogOutcome('===\n  Deployment Complete!\n===');
  assert.strictEqual(success.phase, 'success');
  assert.strictEqual(success.needsRefresh, true);

  const failed = parseLogOutcome('ERROR: npm run build failed\nEACCES: permission denied');
  assert.strictEqual(failed.phase, 'failed');
  assert.strictEqual(failed.needsRefresh, false);

  const exitOk = parseLogOutcome('=== Update finished with exit code 0 ===');
  assert.strictEqual(exitOk.phase, 'success');
});

test('parseLogOutcome uses only the last update session in the log', () => {
  const log = [
    '=== Update started at old ===',
    'EACCES: permission denied',
    'ERROR: npm run build failed',
    '=== Update finished with exit code 1 ===',
    '=== Update started at new ===',
    '  Deployment Complete!',
    '=== Update finished with exit code 0 ===',
  ].join('\n');
  assert.strictEqual(parseLogOutcome(log).phase, 'success');
  assert.ok(extractLastUpdateSession(log).includes('Deployment Complete!'));
  assert.ok(!extractLastUpdateSession(log).includes('ERROR: npm run build failed'));
});

test('detectInstallType identifies local dev install', () => {
  const type = detectInstallType();
  assert.ok(['systemd', 'docker', 'unknown'].includes(type));
});

test('fetchLatestFromMain parses GitHub package and commit responses without relying on network quotas', async (t) => {
  const { EventEmitter } = require('node:events');
  t.mock.method(require('node:https'), 'get', (url, options, callback) => {
    const request = new EventEmitter(); request.destroy = () => {};
    queueMicrotask(() => {
      const response = new EventEmitter(); response.statusCode = 200; callback(response);
      const body = url.includes('/contents/') ? { content: Buffer.from(JSON.stringify({ version: '2.1.0' })).toString('base64') }
        : { sha: 'fixture-commit', commit: { message: 'fixture update', committer: { date: '2026-10-12T00:00:00Z' } } };
      response.emit('data', JSON.stringify(body)); response.emit('end');
    });
    return request;
  });
  const { fetchLatestFromMain } = require('../src/services/updateService');
  const info = await fetchLatestFromMain();
  assert.ok(info.latest, 'should return a version string');
  assert.ok(/^\d+\.\d+\.\d+/.test(info.latest));
  assert.strictEqual(info.source, 'main-branch');
  assert.ok(info.remoteCommit, 'should include remote commit sha');
});

test('dashboard update uses the allowed sudo script and atomic-release outcome markers',()=>{
  const {updateLaunchArgs,parseLogOutcome}=require('../src/services/updateService');
  assert.deepStrictEqual(updateLaunchArgs('/opt/system-ops/scripts/deploy.sh'),['-n','/usr/bin/bash','/opt/system-ops/scripts/deploy.sh','--background']);
  assert.strictEqual(parseLogOutcome('=== Update successful: abc ===').phase,'success');
  assert.strictEqual(parseLogOutcome('=== Update failed: readiness rollback ===').phase,'failed');
});
test('update worker is launched in a separate fixed systemd unit with durable logs',()=>{
  const {launchUpdate}=require('../src/services/updateLauncher');let command;
  const root=path.resolve('/opt/system-ops'),dataDir=path.join(root,'data'),script=path.join(root,'scripts','atomic-release.js');
  const result=launchUpdate({root,dataDir,script,execute:(file,args)=>{command={file,args};}});
  assert.strictEqual(result.queued,true);assert.strictEqual(command.file,'systemd-run');
  assert.ok(command.args.includes('--unit=system-ops-update'));assert.ok(command.args.includes(`--property=StandardOutput=append:${path.join(dataDir,'update.log')}`));
  assert.ok(command.args.includes('--setenv=SYSTEM_OPS_UPDATE_UNIT=1'));assert.ok(!command.args.includes('-c'));
});
