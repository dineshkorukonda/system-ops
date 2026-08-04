const { execFile } = require('child_process');
const fs = require('fs');

/**
 * Run shell command via execFile.
 */
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

/**
 * Parse LOG_SOURCES from environment or fallback default.
 * Example format: LOG_SOURCES=pg-backup:/var/log/pg-backup.log:200,journal:postgresql:100
 */
function parseLogSourcesConfig() {
  const envStr = process.env.LOG_SOURCES || 'pg-backup:/var/log/pg-backup.log:200,journal:postgresql:100';
  const entries = envStr.split(',').map(s => s.trim()).filter(Boolean);

  const sources = [];

  entries.forEach((entry, idx) => {
    const parts = entry.split(':');
    if (parts.length < 2) return;

    let id, type, target, defaultLines;

    if (parts.length === 4) {
      // Format: id:type:target:defaultLines (e.g. pg-backup:file:/var/log/pg-backup.log:200)
      id = parts[0].trim();
      type = parts[1].trim();
      target = parts[2].trim();
      defaultLines = parseInt(parts[3], 10) || 100;
    } else if (parts.length === 3) {
      // Check if parts[0] is 'journal' or 'file' (e.g. journal:postgresql:100) or id:target:lines
      if (parts[0] === 'journal' || parts[0] === 'file') {
        type = parts[0].trim();
        target = parts[1].trim();
        id = `${type}-${target}`;
        defaultLines = parseInt(parts[2], 10) || 100;
      } else {
        id = parts[0].trim();
        target = parts[1].trim();
        defaultLines = parseInt(parts[2], 10) || 100;
        type = (target.startsWith('/') || target.endsWith('.log')) ? 'file' : 'journal';
      }
    } else if (parts.length === 2) {
      id = parts[0].trim();
      target = parts[1].trim();
      defaultLines = 100;
      type = (target.startsWith('/') || target.endsWith('.log')) ? 'file' : 'journal';
    }

    const name = id.replace(/[-_]/g, ' ').toUpperCase();

    sources.push({
      id,
      name,
      type,
      target,
      defaultLines
    });
  });

  if (sources.length === 0) {
    // Default fallback
    sources.push(
      { id: 'pg-backup', name: 'PG BACKUP', type: 'file', target: '/var/log/pg-backup.log', defaultLines: 200 },
      { id: 'postgresql', name: 'POSTGRESQL JOURNAL', type: 'journal', target: 'postgresql', defaultLines: 100 }
    );
  }

  return sources;
}

/**
 * Heuristics to detect PostgreSQL backup status from log content.
 */
function analyzeBackupHeuristics(logContent) {
  if (!logContent || typeof logContent !== 'string') {
    return {
      status: 'unknown',
      badgeClass: 'warn',
      message: 'No log content to analyze',
      lastSuccess: null,
      lastFailure: null
    };
  }

  const lines = logContent.split('\n').filter(Boolean);
  let lastSuccess = null;
  let lastFailure = null;

  // Regex patterns for PostgreSQL backup analysis
  const successRegex = /BACKUP OK|BACKUP SUCCESS|SUCCESS|completed|pg_dump.*completed|archive dump completed|backup completed/i;
  const failureRegex = /ERROR|FAILED|FATAL|pg_dump: error|backup failed|permission denied/i;
  const timestampRegex = /(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})/;

  // Iterate backwards through recent lines
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const matchTime = line.match(timestampRegex);
    const ts = matchTime ? matchTime[1] : null;

    if (!lastSuccess && successRegex.test(line)) {
      lastSuccess = ts || 'Recent line matching success pattern';
    }
    if (!lastFailure && failureRegex.test(line)) {
      lastFailure = ts || 'Recent line matching error pattern';
    }
  }

  if (lastSuccess && (!lastFailure || lines.join('\n').lastIndexOf(lastSuccess) > lines.join('\n').lastIndexOf(lastFailure))) {
    return {
      status: 'success',
      badgeClass: 'ok',
      message: 'Latest backup completed successfully',
      lastSuccess,
      lastFailure
    };
  } else if (lastFailure) {
    return {
      status: 'failure',
      badgeClass: 'err',
      message: 'Backup error or failure detected in recent logs',
      lastSuccess,
      lastFailure
    };
  }

  return {
    status: 'unknown',
    badgeClass: 'warn',
    message: 'No explicit backup status pattern found in recent logs',
    lastSuccess,
    lastFailure
  };
}

/**
 * List configured log sources.
 */
function getLogSourcesList() {
  return parseLogSourcesConfig();
}

/**
 * Fetch log tail for a specific source ID.
 */
async function getLogSourceTail(sourceId, requestedLines = null) {
  const sources = parseLogSourcesConfig();
  const source = sources.find(s => s.id === sourceId) || sources[0];

  if (!source) {
    return {
      id: sourceId,
      error: `Log source '${sourceId}' not found`
    };
  }

  const lines = Math.min(Math.max(parseInt(requestedLines, 10) || source.defaultLines, 10), 500);

  let output = '';
  let exists = true;
  let errorMsg = null;

  if (source.type === 'file') {
    // 1. Try direct tail
    let tailRes = await runCommand('tail', ['-n', String(lines), source.target]);
    
    // 2. Try with sudo -n tail if direct tail fails
    if (!tailRes.success) {
      tailRes = await runCommand('sudo', ['-n', 'tail', '-n', String(lines), source.target]);
    }

    if (tailRes.success) {
      output = tailRes.stdout || 'Log file is empty.';
    } else {
      const errLower = (tailRes.stderr || '').toLowerCase();
      if (errLower.includes('no such file') || (!fs.existsSync(source.target) && !errLower.includes('permission denied') && !errLower.includes('password is required'))) {
        output = `[WARN] Log file '${source.target}' does not exist or is unreadable.`;
        exists = false;
      } else if (errLower.includes('password is required') || errLower.includes('terminal is required')) {
        output = `[WARN] Passwordless sudo required to read log file '${source.target}'.\nPlease check /etc/sudoers.d/system-ops permissions.`;
        errorMsg = tailRes.stderr;
      } else {
        output = `[WARN] Permission denied or failed to read log file '${source.target}'.\nDetails: ${tailRes.stderr}`;
        errorMsg = tailRes.stderr;
      }
    }
  } else if (source.type === 'journal') {
    // Journalctl unit logs
    let journalRes = await runCommand('journalctl', [
      '-u', source.target,
      '-n', String(lines),
      '--no-pager',
      '-o', 'short-iso'
    ]);

    if (!journalRes.success) {
      journalRes = await runCommand('sudo', [
        '-n',
        'journalctl',
        '-u', source.target,
        '-n', String(lines),
        '--no-pager',
        '-o', 'short-iso'
      ]);
    }

    if (journalRes.success) {
      output = journalRes.stdout || 'No journal entries found for unit.';
    } else {
      const errLower = (journalRes.stderr || '').toLowerCase();
      if (errLower.includes('password is required') || errLower.includes('terminal is required')) {
        output = `[WARN] Passwordless sudo required for journalctl unit '${source.target}'.\nPlease check /etc/sudoers.d/system-ops permissions.`;
      } else {
        output = `[WARN] Failed to fetch journalctl logs for unit '${source.target}'.\nDetails: ${journalRes.stderr}`;
      }
      errorMsg = journalRes.stderr;
    }
  }

  const backupStatus = analyzeBackupHeuristics(output);

  return {
    id: source.id,
    name: source.name,
    type: source.type,
    target: source.target,
    lines: lines,
    exists: exists,
    output: output,
    backupStatus: backupStatus,
    error: errorMsg
  };
}

module.exports = {
  getLogSourcesList,
  getLogSourceTail,
  analyzeBackupHeuristics
};
