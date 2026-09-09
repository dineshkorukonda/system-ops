/**
 * Production entrypoint — logs fatal startup errors to stderr (journalctl).
 */
function fatal(label, err) {
  const detail = err && (err.stack || err.message || String(err));
  console.error(`[FATAL] ${label}:`, detail);
  process.exit(1);
}

process.on('uncaughtException', (err) => fatal('Uncaught exception', err));
process.on('unhandledRejection', (reason) => fatal('Unhandled rejection', reason));

try {
  require('./server.js');
} catch (err) {
  fatal('Failed to load server', err);
}
