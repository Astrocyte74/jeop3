const { setTimeout: delay } = require('node:timers/promises');

function requestSignal(req, res) {
  const controller = new AbortController();
  const abort = () => {
    if (!res.writableEnded && !controller.signal.aborted) {
      controller.abort();
      console.log(`[${new Date().toISOString()}] AI Cancelled: ${req.path} | Type: ${req.body?.promptType || 'verification/retrieval'}`);
    }
  };
  req.once('aborted', abort);
  res.once('close', abort);
  res.once('finish', () => { req.off('aborted', abort); res.off('close', abort); });
  return controller.signal;
}
const timedSignal = (signal, ms = 120000) => signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);
const retryDelay = signal => delay(1500, undefined, { signal });
module.exports = { requestSignal, timedSignal, retryDelay };
