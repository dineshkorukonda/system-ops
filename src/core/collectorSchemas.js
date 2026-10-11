// @ts-check
/** @typedef {{ uptime: Record<string, unknown>, memory: { totalBytes: number, usagePercent: number }, [key: string]: unknown }} SystemSnapshot */
/** @typedef {{ pid: number, rssBytes: number, cpuPercent: number|null, [key: string]: unknown }} ProcessSample */
/** @typedef {{ processes: ProcessSample[], [key: string]: unknown }} ProcessSnapshot */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function object(value) { return typeof value === 'object' && value !== null && !Array.isArray(value); }
/** @param {unknown} value @param {string} field @returns {asserts value is number} */
function nonnegative(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`Invalid collector schema: ${field}`);
}
/** @param {unknown} value @returns {asserts value is SystemSnapshot} */
function assertSystemSnapshot(value) {
  if (!object(value) || !object(value.uptime) || !object(value.memory)) throw new Error('Invalid collector schema: system');
  nonnegative(value.memory.totalBytes, 'memory.totalBytes');
  nonnegative(value.memory.usagePercent, 'memory.usagePercent');
  if (value.memory.usagePercent > 100) throw new Error('Invalid collector schema: memory.usagePercent');
  if (value.uptime.cpuPercent != null) { nonnegative(value.uptime.cpuPercent, 'uptime.cpuPercent');
    if (value.uptime.cpuPercent > 100) throw new Error('Invalid collector schema: uptime.cpuPercent'); }
}
/** @param {unknown} value @returns {asserts value is ProcessSnapshot} */
function assertProcessSnapshot(value) {
  if (!object(value) || !Array.isArray(value.processes) || value.processes.length > 500) throw new Error('Invalid collector schema: processes');
  for (const proc of value.processes) {
    if (!object(proc)) throw new Error('Invalid collector schema: process');
    nonnegative(proc.pid, 'process.pid'); nonnegative(proc.rssBytes, 'process.rssBytes');
    if (proc.cpuPercent != null) nonnegative(proc.cpuPercent, 'process.cpuPercent');
  }
}
module.exports = { assertSystemSnapshot, assertProcessSnapshot };
