import assert from 'node:assert/strict';
import test from 'node:test';
let scheduledWeeklyCaptures;try { ({scheduledWeeklyCaptures}=await import('./reports-schedule.js')); } catch {}
test('weekly capture runs on KST Monday/Thursday mornings with a stable period identity',()=>{
  assert.equal(typeof scheduledWeeklyCaptures,'function');
  assert.deepEqual(scheduledWeeklyCaptures(new Date('2026-09-27T22:00:00Z')),[]);
  const mon=scheduledWeeklyCaptures(new Date('2026-09-27T23:30:00Z'));
  assert.equal(mon.length,1);assert.equal(mon[0].scope,'personal');assert.equal(mon[0].periodStart,'2026-09-21');assert.equal(mon[0].periodEnd,'2026-09-27');
  assert.deepEqual(mon,scheduledWeeklyCaptures(new Date('2026-09-28T04:30:00Z')));
  const thu=scheduledWeeklyCaptures(new Date('2026-09-30T23:30:00Z'));assert.equal(thu[0].scope,'company');assert.equal(thu[0].periodEnd,'2026-09-30');
  assert.deepEqual(scheduledWeeklyCaptures(new Date('2026-09-29T23:30:00Z')),[]);
});
