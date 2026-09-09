const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const https = require('https');
const { runCommand } = require('../utils/exec');
const { DATA_DIR } = require('./settingsService');

const INSTALL_DIR = process.env.INSTALL_DIR || path.join(__dirname, '../../');
const DEPLOY_SCRIPT = path.join(INSTALL_DIR, 'scripts/deploy.sh');
const LOCK_FILE = path.join(DATA_DIR, '.update.lock');
const UPDATE_LOG = path.join(DATA_DIR, 'update.log');
const UPDATE_RESULT = path.join(DATA_DIR, 'update-result.json');
const GITHUB_REPO = process.env.GITHUB_REPO || 'dineshkorukonda/system-ops';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const LOCK_TIMEOUT_MS = 10 * 60 * 1000;
const CACHE_TTL_MS = 60 * 60 * 1000;

let versionCache = null;
let versionCacheAt = 0;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getCurrentVersion() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(INSTALL_DIR, 'package.json'), 'utf8')
    );
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function parseVersion(version) {
  const match = String(version).replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return [0, 0, 0];
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

function isNewerVersion(current, latest) {
  const a = parseVersion(current);
  const b = parseVersion(latest);
  for (let i = 0; i < 3; i++) {
    if (b[i] > a[i]) return true;
    if (b[i] < a[i]) return false;
  }
  return false;
}

function detectInstallType() {
  const hasDeploy = fs.existsSync(DEPLOY_SCRIPT);
  const hasGit = fs.existsSync(path.join(INSTALL_DIR, '.git'));
  if (hasDeploy && hasGit) return 'systemd';
  if (fs.existsSync(path.join(INSTALL_DIR, 'docker-compose.yml'))) return 'docker';
  return 'unknown';
}

function githubApiGet(apiPath) {
  return new Promise((resolve, reject) => {
    const url = `https://api.github.com/repos/${GITHUB_REPO}${apiPath}`;
    const req = https.get(
      url,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'system-ops-updater',
        },
        timeout: 10000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode === 404) {
            return reject(new Error('NOT_FOUND'));
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`GitHub API returned ${res.statusCode}`));
          }
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('GitHub API request timed out'));
    });
  });
}

async function getLocalGitCommit() {
  const res = await runCommand('git', ['rev-parse', 'HEAD'], 3000);
  if (res.success && res.stdout.trim()) {
    return res.stdout.trim();
  }
  return null;
}

async function fetchLatestRelease() {
  const data = await githubApiGet('/releases/latest');
  return {
    latest: (data.tag_name || '').replace(/^v/, ''),
    releaseUrl: data.html_url || '',
    releaseNotes: (data.body || '').slice(0, 500),
    publishedAt: data.published_at || null,
    remoteCommit: null,
    source: 'github-release',
  };
}

async function fetchLatestFromMain() {
  const [pkgData, commitData] = await Promise.all([
    githubApiGet(`/contents/package.json?ref=${GITHUB_BRANCH}`),
    githubApiGet(`/commits/${GITHUB_BRANCH}`),
  ]);

  const pkgJson = JSON.parse(
    Buffer.from(pkgData.content, 'base64').toString('utf8')
  );

  const message = (commitData.commit?.message || '').split('\n')[0].slice(0, 200);
  const sha = commitData.sha || '';

  return {
    latest: (pkgJson.version || '0.0.0').replace(/^v/, ''),
    releaseUrl: `https://github.com/${GITHUB_REPO}/commits/${GITHUB_BRANCH}`,
    releaseNotes: message ? `Latest on ${GITHUB_BRANCH}: ${message}` : '',
    publishedAt: commitData.commit?.committer?.date || null,
    remoteCommit: sha,
    source: 'main-branch',
  };
}

/**
 * Check GitHub for updates. Tries formal releases first, then falls back to main branch.
 */
async function fetchLatestVersionInfo() {
  try {
    return await fetchLatestRelease();
  } catch (err) {
    if (err.message !== 'NOT_FOUND') {
      throw err;
    }
  }

  return fetchLatestFromMain();
}

async function getVersionInfo(forceRefresh = false) {
  const current = getCurrentVersion();
  const installType = detectInstallType();
  const localCommit = await getLocalGitCommit();
  const now = Date.now();

  let release = null;
  let checkError = null;

  if (!forceRefresh && versionCache && now - versionCacheAt < CACHE_TTL_MS) {
    release = versionCache;
  } else {
    try {
      release = await fetchLatestVersionInfo();
      versionCache = release;
      versionCacheAt = now;
    } catch (err) {
      checkError = err.message;
      release = versionCache || {
        latest: null,
        releaseUrl: '',
        releaseNotes: '',
        publishedAt: null,
        remoteCommit: null,
        source: null,
      };
    }
  }

  const latest = release.latest;
  const versionUpdate = latest ? isNewerVersion(current, latest) : false;
  const commitUpdate = Boolean(
    release.remoteCommit &&
    localCommit &&
    release.remoteCommit !== localCommit
  );
  const updateAvailable = versionUpdate || commitUpdate;

  return {
    current,
    latest,
    updateAvailable,
    versionUpdate,
    commitUpdate,
    releaseUrl: release.releaseUrl,
    releaseNotes: release.releaseNotes,
    publishedAt: release.publishedAt,
    installType,
    checkError,
    checkedAt: new Date().toISOString(),
    source: release.source || null,
    currentCommit: localCommit ? localCommit.slice(0, 7) : null,
    latestCommit: release.remoteCommit ? release.remoteCommit.slice(0, 7) : null,
  };
}

function readLock() {
  if (!fs.existsSync(LOCK_FILE)) return null;
  try {
    const lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
    const age = Date.now() - new Date(lock.startedAt).getTime();
    if (age > LOCK_TIMEOUT_MS) {
      fs.unlinkSync(LOCK_FILE);
      return null;
    }
    return lock;
  } catch {
    return null;
  }
}

function writeLock(pid) {
  ensureDataDir();
  fs.writeFileSync(
    LOCK_FILE,
    JSON.stringify({ pid, startedAt: new Date().toISOString() }),
    'utf8'
  );
}

function clearLock() {
  if (fs.existsSync(LOCK_FILE)) {
    fs.unlinkSync(LOCK_FILE);
  }
}

function tailLog(maxLines = 200) {
  if (!fs.existsSync(UPDATE_LOG)) return '';
  const content = fs.readFileSync(UPDATE_LOG, 'utf8');
  const lines = content.split('\n');
  return lines.slice(-maxLines).join('\n');
}

function readFullLog() {
  if (!fs.existsSync(UPDATE_LOG)) return '';
  return fs.readFileSync(UPDATE_LOG, 'utf8');
}

function extractLastUpdateSession(logContent) {
  const log = logContent || '';
  const marker = '=== Update started at ';
  const lastIdx = log.lastIndexOf(marker);
  if (lastIdx === -1) return log;
  return log.slice(lastIdx);
}

function parseLogOutcome(logContent) {
  const log = extractLastUpdateSession(logContent);

  if (log.includes('Deployment Complete!')) {
    return {
      phase: 'success',
      success: true,
      failed: false,
      message: 'Update complete. The service has been restarted — refresh this page to load the new version.',
      needsRefresh: true,
    };
  }

  const buildFailed = log.includes('Deployment FAILED')
    || log.includes('ERROR: npm ci failed')
    || log.includes('ERROR: npm run build failed');

  const permissionError = /EACCES: permission denied|errno -13|EPERM: operation not permitted/i.test(log);

  if (buildFailed || permissionError) {
    const hint = permissionError
      ? 'Permission error during build. Click Update now again — deploy now auto-fixes ownership. If it persists, SSH in and run: sudo chown -R ops:ops /opt/system-ops && sudo bash scripts/deploy.sh'
      : 'Build step failed. Check the update log below, then retry.';
    return {
      phase: 'failed',
      success: false,
      failed: true,
      message: hint,
      needsRefresh: false,
    };
  }

  if (log.includes('health check FAILED')) {
    return {
      phase: 'failed',
      success: false,
      failed: true,
      message: 'Deploy finished but the service did not become healthy. Check logs, then refresh and retry.',
      needsRefresh: false,
    };
  }

  const finishMatch = log.match(/Update finished with exit code (\d+)/);
  if (finishMatch) {
    const code = parseInt(finishMatch[1], 10);
    if (code === 0) {
      return {
        phase: 'success',
        success: true,
        failed: false,
        message: 'Update complete. Refresh this page to load the new version.',
        needsRefresh: true,
      };
    }
    return {
      phase: 'failed',
      success: false,
      failed: true,
      message: `Update exited with code ${code}. See the log below for details.`,
      needsRefresh: false,
    };
  }

  return {
    phase: 'failed',
    success: false,
    failed: true,
    message: 'Update ended unexpectedly. See the log below.',
    needsRefresh: false,
  };
}

function writeUpdateResult(result) {
  ensureDataDir();
  fs.writeFileSync(
    UPDATE_RESULT,
    JSON.stringify({ ...result, finishedAt: new Date().toISOString() }),
    'utf8'
  );
}

function readUpdateResult() {
  if (!fs.existsSync(UPDATE_RESULT)) return null;
  try {
    return JSON.parse(fs.readFileSync(UPDATE_RESULT, 'utf8'));
  } catch {
    return null;
  }
}

function finalizeUpdateFromLog(exitCode = null) {
  const outcome = parseLogOutcome(readFullLog());
  if (exitCode !== null && exitCode !== 0 && outcome.phase === 'success') {
    outcome.phase = 'failed';
    outcome.success = false;
    outcome.failed = true;
    outcome.needsRefresh = false;
    outcome.message = `Update exited with code ${exitCode}. See the log below.`;
  }
  writeUpdateResult(outcome);
  clearLock();
  return outcome;
}

function getUpdateStatus() {
  const lock = readLock();
  let running = false;

  if (lock) {
    try {
      process.kill(lock.pid, 0);
      running = true;
    } catch {
      running = false;
      if (fs.existsSync(LOCK_FILE)) {
        finalizeUpdateFromLog();
      }
    }
  }

  let lastRunAt = null;
  if (fs.existsSync(UPDATE_LOG)) {
    lastRunAt = fs.statSync(UPDATE_LOG).mtime.toISOString();
  }

  const saved = readUpdateResult();
  const phase = running ? 'running' : (saved?.phase || 'idle');

  return {
    running,
    phase,
    success: Boolean(saved?.success),
    failed: Boolean(saved?.failed),
    message: running
      ? 'Update in progress. The dashboard may disconnect briefly while the service restarts.'
      : (saved?.message || null),
    needsRefresh: Boolean(!running && saved?.needsRefresh),
    exitCode: saved?.success ? 0 : (saved?.failed ? 1 : null),
    logTail: tailLog(200),
    lastRunAt,
    finishedAt: saved?.finishedAt || null,
    startedAt: lock?.startedAt || null,
  };
}

function startUpdate() {
  const existing = readLock();
  if (existing) {
    try {
      process.kill(existing.pid, 0);
      return { success: false, error: 'An update is already in progress' };
    } catch {
      clearLock();
    }
  }

  if (!fs.existsSync(DEPLOY_SCRIPT)) {
    return {
      success: false,
      error: 'deploy.sh not found. Updates are only supported on systemd/git installs.',
    };
  }

  ensureDataDir();
  if (fs.existsSync(UPDATE_RESULT)) {
    fs.unlinkSync(UPDATE_RESULT);
  }
  const logStream = fs.openSync(UPDATE_LOG, 'a');
  const header = `\n=== Update started at ${new Date().toISOString()} on ${os.hostname()} ===\n`;
  fs.writeSync(logStream, header);

  const isWindows = process.platform === 'win32';
  const opsUser = process.env.OPS_USER || 'ops';
  const cmd = isWindows ? 'bash' : 'sudo';
  const args = isWindows
    ? [DEPLOY_SCRIPT]
    : [
      'bash',
      '-c',
      `chown -R ${opsUser}:${opsUser} "${INSTALL_DIR}" 2>/dev/null; exec bash "${DEPLOY_SCRIPT}"`,
    ];

  const child = spawn(cmd, args, {
    cwd: INSTALL_DIR,
    detached: true,
    stdio: ['ignore', logStream, logStream],
    env: { ...process.env, INSTALL_DIR },
  });

  child.unref();
  writeLock(child.pid);

  child.on('exit', (code) => {
    try {
      fs.writeSync(logStream, `\n=== Update finished with exit code ${code} ===\n`);
      fs.closeSync(logStream);
    } catch {
      // process may have already closed
    }
    finalizeUpdateFromLog(code);
  });

  return { success: true, pid: child.pid };
}

module.exports = {
  getCurrentVersion,
  getVersionInfo,
  getUpdateStatus,
  startUpdate,
  isNewerVersion,
  detectInstallType,
  fetchLatestFromMain,
  parseLogOutcome,
  extractLastUpdateSession,
  LOCK_FILE,
  UPDATE_LOG,
  UPDATE_RESULT,
};
