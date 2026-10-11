const { execFile } = require('child_process');
const { commandStarted } = require('../core/runtimeDiagnostics');

/**
 * Execute command with execFile securely.
 */
function runCommand(file, args, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const complete = commandStarted();
    execFile(file, args, { timeout: timeoutMs }, (error, stdout, stderr) => {
      complete(!error);
      if (error) {
        resolve({ success: false, stdout: stdout || '', stderr: stderr || error.message, code: error.code });
      } else {
        resolve({ success: true, stdout: stdout || '', stderr: stderr || '', code: 0 });
      }
    });
  });
}

module.exports = {
  runCommand
};
