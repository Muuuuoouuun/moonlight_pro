import assert from 'node:assert/strict';
import test from 'node:test';

import { createMinIntervalGate } from './min-interval-gate.js';

test('createMinIntervalGate allows the first call before any mark()', () => {
  let now = 0;
  const gate = createMinIntervalGate(20000, () => now);
  assert.equal(gate.allow(), true);
});

test('createMinIntervalGate rejects a call inside the window after mark()', () => {
  let now = 0;
  const gate = createMinIntervalGate(20000, () => now);
  gate.mark();
  now = 19999;
  assert.equal(gate.allow(), false);
});

test('createMinIntervalGate allows a call once minMs has fully elapsed', () => {
  let now = 0;
  const gate = createMinIntervalGate(20000, () => now);
  gate.mark();
  now = 20000;
  assert.equal(gate.allow(), true);
});
