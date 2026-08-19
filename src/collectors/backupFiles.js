const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

function runCommand(file, args, timeoutMs = 5000) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        return resolve({ success: false, error, stdout: stdout || '', stderr: stderr || '' });
      }
      return resolve({ success: true, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

function getBackupDir() {
  return process.env.BACKUP_DIR || '/var/backups/postgres';
}

/**
 * List backup files in the backup directory
 */
async function listBackupFiles() {
  const backupDir = getBackupDir();

  if (!fs.existsSync(backupDir)) {
    return {
      success: false,
      backupDir,
      error: `Backup directory '${backupDir}' does not exist.`,
      files: []
    };
  }

  try {
    const entries = fs.readdirSync(backupDir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      if (entry.isFile()) {
        const fullPath = path.join(backupDir, entry.name);
        try {
          const stats = fs.statSync(fullPath);
          files.push({
            name: entry.name,
            size: stats.size,
            mtime: stats.mtime
          });
        } catch (e) {
          // ignore unstatable file
        }
      }
    }

    // Sort newest first
    files.sort((a, b) => new Date(b.mtime) - new Date(a.mtime));

    return {
      success: true,
      backupDir,
      files
    };
  } catch (err) {
    return {
      success: false,
      backupDir,
      error: err.message,
      files: []
    };
  }
}

/**
 * Get resolved absolute file path for download with security checks against directory traversal
 */
function getBackupFilePath(filename) {
  if (!filename || typeof filename !== 'string') {
    throw new Error('Filename is required');
  }

  // Prevent path traversal
  const safeFilename = path.basename(filename);
  if (safeFilename !== filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new Error('Invalid filename format');
  }

  const backupDir = path.resolve(getBackupDir());
  const targetPath = path.resolve(backupDir, safeFilename);

  // Security check: ensure target path is strictly within backup directory
  if (!targetPath.startsWith(backupDir + path.sep) && targetPath !== backupDir) {
    throw new Error('Access denied: File outside backup directory');
  }

  if (!fs.existsSync(targetPath)) {
    throw new Error(`File '${safeFilename}' not found`);
  }

  return targetPath;
}

module.exports = {
  getBackupDir,
  listBackupFiles,
  getBackupFilePath
};
