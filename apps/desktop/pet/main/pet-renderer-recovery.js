'use strict';

// Per-window crash budget. A load event alone is not recovery: only a minute
// without a new load/failure earns a fresh budget. No write or session retry.
const RETRY_DELAYS_MS = Object.freeze([1000, 2000, 4000, 8000]);
const HEALTHY_RESET_MS = 60000;

function attachRendererRecovery(win, { log = () => {}, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const contents = win.webContents;
  let attempts = 0;
  let state = 'ready';
  let retryTimer = null;
  let healthyTimer = null;
  let disposed = false;
  let loading = false;
  const alive = () => !disposed && !win.isDestroyed()
    && !(typeof contents.isDestroyed === 'function' && contents.isDestroyed());
  const cancelRetry = () => {
    if (retryTimer) clearTimer(retryTimer.id);
    retryTimer = null;
  };
  const cancelHealthy = () => {
    if (healthyTimer) clearTimer(healthyTimer.id);
    healthyTimer = null;
  };
  const stop = (reason) => {
    state = 'blocked';
    log(`pet:${win.petSurface || 'window'} renderer recovery stopped (${reason}); reload manually or restart the app`);
  };
  const onGone = (_event, details) => {
    log(`pet:${win.petSurface || 'window'} renderer gone ${details && details.reason}`);
    loading = false;
    cancelHealthy();
    if (!alive()) return;
    if (details && details.reason === 'clean-exit') {
      cancelRetry();
      if (state !== 'blocked') state = 'idle';
      return;
    }
    if (state === 'blocked' || retryTimer) return;
    if (attempts >= RETRY_DELAYS_MS.length) {
      stop('retry budget exhausted');
      return;
    }
    const delay = RETRY_DELAYS_MS[attempts];
    const pending = { id: null };
    retryTimer = pending;
    state = 'scheduled';
    pending.id = setTimer(() => {
      // A cleared callback may already be queued. Identity fences prevent it
      // from reloading after manual navigation, healthy load or destruction.
      if (retryTimer !== pending) return;
      retryTimer = null;
      if (!alive()) return;
      attempts += 1;
      state = 'reloading';
      log(`pet:${win.petSurface || 'window'} renderer recovery ${attempts}/${RETRY_DELAYS_MS.length}`);
      try { contents.reload(); } catch { stop('reload unavailable'); }
    }, delay);
    pending.id?.unref?.();
  };
  const onLoading = () => {
    if (!alive()) return;
    cancelRetry();
    cancelHealthy();
    loading = true;
    if (state !== 'blocked') state = 'loading';
  };
  const onFailed = () => {
    loading = false;
    cancelHealthy();
    if (state !== 'blocked') state = 'failed';
  };
  const onLoaded = () => {
    if (!alive() || !loading) return;
    loading = false;
    cancelRetry();
    cancelHealthy();
    if (state !== 'blocked') state = 'ready';
    if (!attempts && state !== 'blocked') return;
    const pending = { id: null };
    healthyTimer = pending;
    pending.id = setTimer(() => {
      if (healthyTimer !== pending) return;
      healthyTimer = null;
      if (!alive()) return;
      attempts = 0;
      state = 'ready';
      log(`pet:${win.petSurface || 'window'} renderer recovery budget reset after healthy load`);
    }, HEALTHY_RESET_MS);
    pending.id?.unref?.();
  };
  function dispose() {
    if (disposed) return;
    disposed = true;
    state = 'closed';
    cancelRetry();
    cancelHealthy();
    contents.removeListener('render-process-gone', onGone);
    contents.removeListener('did-start-loading', onLoading);
    contents.removeListener('did-finish-load', onLoaded);
    contents.removeListener('did-fail-load', onFailed);
    contents.removeListener('destroyed', dispose);
    win.removeListener('closed', dispose);
  }
  contents.on('render-process-gone', onGone);
  contents.on('did-start-loading', onLoading);
  contents.on('did-finish-load', onLoaded);
  contents.on('did-fail-load', onFailed);
  contents.once('destroyed', dispose);
  win.once('closed', dispose);
  return {
    dispose,
    snapshot: () => ({ state, attempts, pending: Boolean(retryTimer), healthyPending: Boolean(healthyTimer) }),
  };
}

module.exports = { attachRendererRecovery, RETRY_DELAYS_MS, HEALTHY_RESET_MS };
