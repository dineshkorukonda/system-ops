const { AsyncLocalStorage } = require('node:async_hooks');
const context = new AsyncLocalStorage();
const collectionSignal = () => context.getStore()?.signal;
function combinedSignal(signal) {
  const inherited = collectionSignal();
  return inherited && signal ? AbortSignal.any([inherited, signal]) : inherited || signal;
}
function bindCancellation(resource) {
  const signal = collectionSignal();
  if (!signal) return;
  const abort = () => resource.destroy(new Error('Collection cancelled'));
  if (signal.aborted) abort();
  else { signal.addEventListener('abort', abort, { once: true });
    resource.once('close', () => signal.removeEventListener('abort', abort)); }
}
module.exports = { context, collectionSignal, combinedSignal, bindCancellation };
