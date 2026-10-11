const { spawn } = require('node:child_process');
const { commandStarted } = require('../core/runtimeDiagnostics');
const { collectionSignal } = require('../core/collectionContext');

function runCommand(file, args, timeoutMs = 5000) {
  return new Promise(resolve => {
    const signal = collectionSignal();
    if (signal?.aborted) return resolve({ success: false, stdout: '', stderr: 'Collection cancelled', code: 'ABORT_ERR' });
    const complete = commandStarted();
    const limit = 256 * 1024;
    let stdout = '', stderr = '', failed = null;
    let child;
    let timer;
    const kill = reason => {
      failed = reason;
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch { child.kill('SIGKILL'); }
    };
    const abort = () => kill('Collection cancelled');
    try { child = spawn(file, args, { windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) { complete(false); return resolve({ success: false, stdout, stderr: error.message, code: error.code }); }
    timer = setTimeout(() => kill('Command timeout'), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', data => { stdout += data.toString(); if (Buffer.byteLength(stdout) > limit) { stdout = stdout.slice(0, limit); kill('Command output limit exceeded'); } });
    child.stderr.on('data', data => { stderr += data.toString(); if (Buffer.byteLength(stderr) > limit) { stderr = stderr.slice(0, limit); kill('Command output limit exceeded'); } });
    child.on('error', error => { failed = error.message; });
    child.on('close', code => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      const success = !failed && code === 0;
      complete(success);
      resolve({ success, stdout, stderr: failed || stderr, code });
    });
  });
}
module.exports = { runCommand };
