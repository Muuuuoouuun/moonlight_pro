'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { attachRendererRecovery, RETRY_DELAYS_MS, HEALTHY_RESET_MS } = require('./pet-renderer-recovery');
const { createElectronDouble, useElectron } = require('./test-support/electron-double');

function fixture() {
  let time = 0, sequence = 0, reloads = 0, destroyed = false;
  const pending = new Map(), queued = new Map(), delays = [], logs = [];
  const win = new EventEmitter(), contents = new EventEmitter();
  win.petSurface = 'panel';
  win.webContents = contents;
  win.isDestroyed = () => destroyed;
  contents.reload = () => { reloads++; contents.emit('did-start-loading'); };
  const timers = {
    setTimer(fn, delay) {
      const id = ++sequence;
      pending.set(id, { fn, at: time + delay }); queued.set(id, fn); delays.push(delay);
      return id;
    },
    clearTimer(id) { pending.delete(id); },
  };
  const recovery = attachRendererRecovery(win, { ...timers, log: value => logs.push(value) });
  return {
    win, contents, pending, queued, delays, logs, recovery,
    reloads: () => reloads,
    crash(reason = 'crashed') { contents.emit('render-process-gone', {}, { reason }); },
    loaded() { contents.emit('did-finish-load'); },
    start() { contents.emit('did-start-loading'); },
    destroy() { destroyed = true; win.emit('closed'); },
    advance(ms) {
      const until = time + ms;
      for (;;) {
        const next = [...pending].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [id, timer] = next; pending.delete(id); time = timer.at; timer.fn();
      }
      time = until;
    },
  };
}

test('repeated renderer failure stops after four delayed attempts instead of looping forever', () => {
  const f = fixture();
  for (const delay of RETRY_DELAYS_MS) {
    f.crash('oom');
    f.advance(delay - 1);
    assert.equal(f.recovery.snapshot().pending, true);
    f.advance(1);
  }
  for (let i = 0; i < 60; i++) f.crash('oom');
  f.advance(600000);
  assert.equal(f.reloads(), 4);
  assert.deepEqual(f.delays, [1000, 2000, 4000, 8000]);
  assert.equal(f.recovery.snapshot().state, 'blocked');
  assert.equal(f.logs.filter(line => line.includes('budget exhausted')).length, 1);
  f.recovery.dispose();
});

test('a burst coalesces to one pending reload and does not spend extra attempts', () => {
  const f = fixture();
  for (let i = 0; i < 10; i++) f.crash();
  assert.equal(f.pending.size, 1);
  assert.equal(f.recovery.snapshot().attempts, 0);
  f.advance(1000);
  assert.equal(f.reloads(), 1);
  assert.equal(f.recovery.snapshot().attempts, 1);
  f.recovery.dispose();
});

test('only sustained successful loading resets the budget; a quick load/crash keeps backoff', () => {
  const f = fixture();
  f.crash(); f.advance(1000); f.loaded(); f.advance(HEALTHY_RESET_MS - 1);
  f.crash();
  assert.equal(f.pending.size, 1);
  assert.equal(f.delays.at(-1), 2000);
  f.advance(2000); f.loaded(); f.advance(HEALTHY_RESET_MS);
  assert.equal(f.recovery.snapshot().attempts, 0);
  f.crash();
  assert.equal(f.delays.at(-1), 1000);
  f.recovery.dispose();
});

test('blocked window needs manual load and a healthy interval before automatic recovery resumes', () => {
  const f = fixture();
  for (const delay of RETRY_DELAYS_MS) { f.crash(); f.advance(delay); }
  f.crash();
  f.advance(HEALTHY_RESET_MS * 2);
  assert.equal(f.recovery.snapshot().state, 'blocked', 'elapsed time without a successful load is not recovery');
  f.start(); f.loaded(); f.advance(HEALTHY_RESET_MS - 1);
  assert.equal(f.recovery.snapshot().state, 'blocked');
  f.advance(1);
  assert.equal(f.recovery.snapshot().state, 'ready');
  f.crash(); f.advance(1000);
  assert.equal(f.reloads(), 5);
  f.recovery.dispose();
});

test('clean exit cancels pending recovery without creating a replacement timer', () => {
  const f = fixture();
  f.crash(); f.crash('clean-exit'); f.advance(10000);
  assert.equal(f.reloads(), 0);
  assert.equal(f.pending.size, 0);
  f.recovery.dispose();
});

test('manual navigation cancels a queued retry and stale callback cannot reload again', () => {
  const f = fixture();
  f.crash();
  const late = f.queued.get(1);
  f.start(); f.loaded(); late(); f.advance(10000);
  assert.equal(f.reloads(), 0);
  assert.equal(f.recovery.snapshot().pending, false);
  f.recovery.dispose();
});

test('late load completion after crash cannot cancel recovery or reset its budget', () => {
  const f = fixture();
  f.start(); f.crash(); f.loaded();
  assert.equal(f.recovery.snapshot().pending, true);
  assert.equal(f.recovery.snapshot().healthyPending, false);
  f.advance(1000);
  assert.equal(f.reloads(), 1);
  f.recovery.dispose();
});

test('failed or restarted load clears the healthy interval including its queued callback', () => {
  for (const event of ['did-fail-load', 'did-start-loading']) {
    const f = fixture();
    f.crash(); f.advance(1000); f.loaded();
    const late = [...f.queued.values()].at(-1);
    f.contents.emit(event); late(); f.advance(HEALTHY_RESET_MS);
    assert.equal(f.recovery.snapshot().attempts, 1);
    f.recovery.dispose();
  }
});

test('closed or destroyed contents dispose timers/listeners and fence already queued callbacks', () => {
  for (const event of ['closed', 'destroyed']) {
    const f = fixture();
    f.crash();
    const late = f.queued.get(1);
    if (event === 'closed') f.destroy(); else f.contents.emit('destroyed');
    late(); f.advance(600000); f.crash();
    assert.equal(f.reloads(), 0);
    assert.equal(f.pending.size, 0);
    assert.equal(f.contents.listenerCount('render-process-gone'), 0);
    assert.equal(f.recovery.snapshot().state, 'closed');
    f.recovery.dispose();
  }
});

test('reload exception blocks further retries rather than escaping the timer', () => {
  const f = fixture();
  f.contents.reload = () => { throw new Error('synthetic unavailable renderer'); };
  f.crash(); f.advance(1000); f.crash(); f.advance(100000);
  assert.equal(f.recovery.snapshot().state, 'blocked');
  assert.equal(f.recovery.snapshot().attempts, 1);
  assert.equal(f.pending.size, 0);
  f.recovery.dispose();
});

test('window factories attach independent recovery controllers on both platform branches', () => {
  const E = createElectronDouble({ userData: '/synthetic-unused' }), restore = useElectron(E);
  const file = require.resolve('./pet-windows');
  delete require.cache[file];
  try {
    const { createWindowFactory } = require(file);
    const windows = ['win32', 'darwin'].map(platform => createWindowFactory({ platform, macGlass: null }).panel());
    assert.notEqual(windows[0].petRendererRecovery, windows[1].petRendererRecovery);
    for (const win of windows) {
      assert.equal(win.webContents.listenerCount('render-process-gone'), 1);
      assert.equal(win.opts.webPreferences.sandbox, true);
      assert.equal(win.opts.webPreferences.contextIsolation, true);
      assert.equal(win.opts.webPreferences.nodeIntegration, false);
      win.destroy();
      assert.equal(win.petRendererRecovery.snapshot().state, 'closed');
    }
  } finally { delete require.cache[file]; restore(); }
});
