import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activityAxis, activityDateTicks } from './overview-activity.js';

test('activity axes leave headroom and use whole, evenly spaced count labels', () => {
  const cases = [
    [0, { max: 2, step: 1, ticks: [0, 1, 2] }],
    [1, { max: 2, step: 1, ticks: [0, 1, 2] }],
    [2, { max: 3, step: 1, ticks: [0, 1, 2, 3] }],
    [3, { max: 4, step: 2, ticks: [0, 2, 4] }],
    [7, { max: 10, step: 5, ticks: [0, 5, 10] }],
  ];
  for (const [maximum, expected] of cases) {
    assert.deepEqual(activityAxis(maximum), expected, `maximum ${maximum}`);
  }
});

test('activity axes contain every count without rounding a midpoint away from its gridline', () => {
  for (const maximum of [4, 5, 6, 8, 9, 11, 13, 25, 47, 101, 1_000, 10_000]) {
    const axis = activityAxis(maximum);
    assert.ok(axis.max >= maximum, `axis ${axis.max} must contain ${maximum}`);
    assert.ok(Number.isInteger(axis.max), `maximum ${maximum}: axis upper bound is a whole count`);
    assert.ok(Number.isInteger(axis.step) && axis.step > 0, `maximum ${maximum}: positive whole-count interval`);
    assert.equal(axis.ticks[0], 0, `maximum ${maximum}: baseline remains zero`);
    assert.equal(axis.ticks.at(-1), axis.max, `maximum ${maximum}: upper gridline equals its label`);
    for (let i = 0; i < axis.ticks.length; i += 1) {
      assert.ok(Number.isInteger(axis.ticks[i]), `maximum ${maximum}: tick ${i} is a whole count`);
      if (i > 0) assert.equal(axis.ticks[i] - axis.ticks[i - 1], axis.step, `maximum ${maximum}: grid spacing ${i}`);
    }
  }
});

test('activity axes reject unreadable and invalid counts instead of displaying them as zero', () => {
  for (const maximum of [null, undefined, NaN, Infinity, -Infinity, -1, -100]) {
    assert.throws(() => activityAxis(maximum), RangeError, `invalid maximum ${String(maximum)}`);
  }
});

test('activity date labels preserve both endpoints in the 7, 14 and 30 day windows', () => {
  const cases = [
    [0, []],
    [1, [0]],
    [7, [0, 2, 4, 6]],
    [14, [0, 4, 8, 13]],
    [30, [0, 10, 20, 29]],
  ];
  for (const [length, expected] of cases) {
    const ticks = activityDateTicks(length);
    assert.ok(ticks instanceof Set, `length ${length}: labels are unique indices`);
    assert.deepEqual([...ticks], expected, `length ${length}`);
  }
});

test('activity date labels stay sparse and in range for any nonempty window', () => {
  for (let length = 1; length <= 120; length += 1) {
    const ticks = activityDateTicks(length);
    assert.ok(ticks instanceof Set, `length ${length}: returns a Set`);
    assert.ok(ticks.size <= 4, `length ${length}: at most four labels`);
    assert.ok(ticks.has(0), `length ${length}: first date is included`);
    assert.ok(ticks.has(length - 1), `length ${length}: last date is included`);
    for (const index of ticks) {
      assert.ok(Number.isInteger(index) && index >= 0 && index < length, `length ${length}: valid index ${index}`);
    }
  }
});
