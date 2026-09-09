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

function getUpdateStatus() {
  const lock = readLock();
  let running = false;
  let exitCode = null;

  if (lock) {
    try {
      process.kill(lock.pid, 0);
      running = true;
    } catch {
      running = false;
      if (fs.existsSync(LOCK_FILE)) {
        const logContent = fs.existsSync(UPDATE_LOG)
          ? fs.readFileSync(UPDATE_LOG, 'utf8')
          : '';
        exitCode = logContent.includes('Deployment Complete!') ? 0 : 1;
        clearLock();
      }
    }
  }

  let lastRunAt = null;
  if (fs.existsSync(UPDATE_LOG)) {
    lastRunAt = fs.statSync(UPDATE_LOG).mtime.toISOString();
  }

  return {
    running,
    exitCode,
    logTail: tailLog(200),
    lastRunAt,
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
  const logStream = fs.openSync(UPDATE_LOG, 'a');
  const header = `\n=== Update started at ${new Date().toISOString()} on ${os.hostname()} ===\n`;
  fs.writeSync(logStream, header);

  const isWindows = process.platform === 'win32';
  const cmd = isWindows ? 'bash' : 'sudo';
  const args = isWindows
    ? [DEPLOY_SCRIPT]
    : ['bash', DEPLOY_SCRIPT];

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
    clearLock();
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
  LOCK_FILE,
  UPDATE_LOG,
};
