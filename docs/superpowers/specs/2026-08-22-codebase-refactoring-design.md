# Design Specification: Codebase Quality & Centralized Utility Refactoring

## 1. Objectives
Refactor repetitive helper functions (`runCommand` and `formatBytes`) duplicated across 5 modules (`backupFiles.js`, `logSources.js`, `pm2.js`, `system.js`, `systemService.js`) into dedicated utility modules under `src/utils/`.

## 2. Architecture & Modular Boundaries

### 2.1 Utility Modules (`src/utils/`)
- **`src/utils/exec.js`**:
  ```js
  const { execFile } = require('child_process');

  function runCommand(file, args, timeoutMs = 5000) {
    return new Promise((resolve) => {
      execFile(file, args, { timeout: timeoutMs }, (error, stdout, stderr) => {
        if (error) {
          resolve({ success: false, stdout: stdout || '', stderr: stderr || error.message, code: error.code });
        } else {
          resolve({ success: true, stdout: stdout || '', stderr: stderr || '', code: 0 });
        }
      });
    });
  }

  module.exports = { runCommand };
  ```

- **`src/utils/formatters.js`**:
  ```js
  function formatBytes(bytes) {
    if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
  }

  module.exports = { formatBytes };
  ```

### 2.2 Refactored Imports
Replace duplicate definitions in:
- `src/collectors/backupFiles.js`
- `src/collectors/logSources.js`
- `src/collectors/pm2.js`
- `src/collectors/system.js`
- `src/services/systemService.js`
- `src/services/ollamaService.js`

## 3. Verification & Test Plan
- Create unit test file `tests/utils.test.js` to test `runCommand` and `formatBytes`.
- Ensure all existing 9 unit tests continue passing (`npm test`).
