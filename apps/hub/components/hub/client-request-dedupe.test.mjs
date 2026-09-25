import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

test('useAnchorCounts aborts its in-flight followups fetch on unmount', () => {
  const sidebar = source('hub-sidebar.jsx');
  assert.match(sidebar, /function useAnchorCounts\(\) \{[\s\S]*?const controller = new AbortController\(\);/);
  assert.match(sidebar, /fetch\('\/api\/hub\/followups', \{ cache: 'no-store', signal: controller\.signal \}\)/);
  assert.match(sidebar, /return \(\) => \{ active = false; controller\.abort\(\); \};/);
});

test('inquiry notifications gate the focus listener and keep the interval + change-event paths', () => {
  const src = source('inquiry-notifications.jsx');
  assert.match(src, /import \{ createMinIntervalGate \} from '\.\/min-interval-gate';/);
  assert.match(src, /const gate = createMinIntervalGate\(20000\);/);
  // load() marks the gate on every call, including the initial mount load.
  assert.match(src, /const load = async \(\) => \{\s*gate\.mark\(\);/);
  // focus goes through a named handler that consults the gate, not load() directly.
  assert.match(src, /const onFocus = \(\) => \{ if \(gate\.allow\(\)\) load\(\); \};/);
  assert.match(src, /window\.addEventListener\('focus', onFocus\);/);
  assert.doesNotMatch(src, /window\.addEventListener\('focus', load\)/);
  assert.match(src, /window\.removeEventListener\('focus', onFocus\)/);
  // Unchanged paths: 60s poll gated by document.hidden, and the immediate
  // 'moonlight:inquiries-changed' refresh — neither goes through the gate.
  assert.match(src, /setInterval\(\(\) => \{ if \(!document\.hidden\) load\(\); \}, 60000\);/);
  assert.match(src, /window\.addEventListener\('moonlight:inquiries-changed', load\);/);
  assert.match(src, /window\.removeEventListener\('moonlight:inquiries-changed', load\);/);
});
