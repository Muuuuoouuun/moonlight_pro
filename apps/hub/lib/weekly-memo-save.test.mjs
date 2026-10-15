import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createWeeklyMemoSaver, readWeeklyMemoSave, writeWeeklyMemoSave } from './weekly-memo-save.js';
import { validateGoalCommand } from '@com-moon/goal-contracts';
import { validateJournalInput } from './journal.js';

function harness(options = {}) {
  const objective = { id: randomUUID(), scope: 'personal', title: '합성 목표', status: 'active', revision: 1, ...options.objective };
  const input = { objective, week: '2026-10-05', weekLabel: '10/5 주', body: '  합성 주간 메모 😀\n다음 행동  ' };
  let stored = null, current = true;
  const sent = [], updates = [], receipts = new Map(), counts = { journal: 0, link: 0 };
  const controls = { lose: null, malformed: null, persistFail: null, fail: null, hold: null };
  const dependencies = {
    get: () => stored,
    persist: value => { if (controls.persistFail?.(value)) throw Error('quota'); stored = structuredClone(value); },
    update: value => updates.push(value), isCurrent: () => current, readObjective: async () => ({ ...objective }),
    fetchImpl: async (url, init) => {
      const request = JSON.parse(init.body), step = url === '/api/hub/journal' ? 'journal' : 'link';
      sent.push({ step, request });
      if (controls.hold) await controls.hold;
      const rejected = controls.fail?.(step);
      if (rejected) return { ok: false, json: async () => rejected };
      const id = step === 'journal' ? request.requestId : request.commandId;
      let data = receipts.get(id);
      if (!data) {
        counts[step]++;
        if (step === 'journal') {
          assert.equal(validateJournalInput(request).ok, true);
          data = { status: 'saved', entry: { id: request.entryId, revision: 1, body: request.body, title: request.title, occurredAt: request.occurredAt, noteMeta: request.noteMeta } };
        } else {
          assert.equal(validateGoalCommand(request).ok, true);
          objective.revision++;
          data = { status: 'saved', persisted: true, commandId: request.commandId, entity: { ...request.input, linked: true, revision: objective.revision } };
        }
        receipts.set(id, data);
      } else data = { ...data, ...(step === 'journal' ? { status: 'duplicate' } : { replayed: true }) };
      if (controls.lose?.(step)) throw Error('lost acknowledgement');
      return { ok: true, json: async () => controls.malformed?.(step, data) || data };
    },
  };
  return { input, objective, sent, updates, counts, controls, create: () => createWeeklyMemoSaver(dependencies), stored: () => stored, navigate: () => { current = false; } };
}

test('weekly memo links the exact saved journal ID and never archives the objective', async () => {
  const h = harness();
  assert.equal((await h.create().run(h.input)).state, 'saved');
  assert.deepEqual(h.counts, { journal: 1, link: 1 });
  assert.equal(h.sent[1].request.input.entityId, h.sent[0].request.entryId);
  assert.equal(h.sent[0].request.noteMeta.scope, 'personal');
  assert.equal(h.sent[0].request.noteMeta.kind, 'learning');
  assert.equal(h.objective.status, 'active');
});
test('PostgreSQL timestamp formatting still acknowledges the identical journal instant', async () => {
  const h = harness(); h.controls.malformed = (step, data) => step === 'journal'
    ? { ...data, entry: { ...data.entry, occurredAt: data.entry.occurredAt.replace('Z', '+00:00') } } : data;
  assert.equal((await h.create().run(h.input)).state, 'saved');
  assert.deepEqual(h.counts, { journal: 1, link: 1 });
});
for (const step of ['journal', 'link']) {
  test(`${step} lost ACK and reconstructed retries retain identical payloads and one mutation`, async () => {
    const h = harness(); h.controls.lose = value => value === step;
    for (let i = 0; i < 5; i++) assert.equal((await h.create().run({ ...h.input, body: `changed ${i}` })).state, 'unknown');
    const requests = h.sent.filter(row => row.step === step).map(row => row.request);
    assert.equal(requests.length, 5);
    requests.forEach(request => assert.deepEqual(request, requests[0]));
    assert.equal(h.counts[step], 1);
    h.controls.lose = null;
    assert.equal((await h.create().run(h.input)).state, 'saved');
    assert.deepEqual(h.counts, { journal: 1, link: 1 });
  });
}
for (const field of ['status', 'id', 'body', 'scope']) {
  test(`journal ACK with wrong ${field} stays unknown and cannot begin a link`, async () => {
    const h = harness(); h.controls.malformed = (step, data) => step !== 'journal' ? data : field === 'status' ? { ...data, status: undefined }
      : { ...data, entry: { ...data.entry, ...(field === 'id' ? { id: randomUUID() } : field === 'body' ? { body: 'wrong body' } : { noteMeta: { ...data.entry.noteMeta, scope: 'company' } }) } };
    assert.equal((await h.create().run(h.input)).state, 'unknown');
    assert.equal(h.counts.link, 0); assert.equal(h.stored().done.journal, false);
  });
}
test('link conflict re-reads its revision without creating another journal', async () => {
  const h = harness(); h.controls.fail = step => step === 'link' ? { status: 'conflict', persisted: false } : null;
  assert.equal((await h.create().run(h.input)).state, 'conflict');
  assert.equal(h.stored().done.journal, true); assert.equal(h.stored().requests.link, null);
  h.objective.revision++; h.controls.fail = null;
  assert.equal((await h.create().run(h.input)).state, 'saved');
  assert.deepEqual(h.counts, { journal: 1, link: 1 });
});
test('unavailable storage prevents the first POST, and failed post-ACK persistence safely replays', async () => {
  const h = harness(); h.controls.persistFail = () => true;
  assert.equal((await h.create().run(h.input)).state, 'error'); assert.equal(h.sent.length, 0);
  h.controls.persistFail = value => value.done.journal;
  assert.equal((await h.create().run(h.input)).state, 'unknown'); assert.equal(h.counts.journal, 1);
  h.controls.persistFail = null;
  assert.equal((await h.create().run(h.input)).state, 'saved'); assert.deepEqual(h.counts, { journal: 1, link: 1 });
});
test('double submits share the same promise and navigating away prevents further writes or UI updates', async () => {
  const h = harness(); let release; h.controls.hold = new Promise(resolve => { release = resolve; });
  const saver = h.create(), first = saver.run(h.input);
  assert.equal(saver.run(h.input), first);
  const count = h.updates.length; h.navigate(); release();
  assert.equal((await first).state, 'stale'); assert.equal(h.updates.length, count); assert.equal(h.counts.link, 0);
  assert.equal(h.stored().uncertain.journal, true);
});
test('long unicode titles fit the journal contract and company/empty capture cannot write', async () => {
  const h = harness({ objective: { title: '😀'.repeat(140) } });
  assert.equal((await h.create().run(h.input)).state, 'saved');
  assert.ok(h.sent[0].request.title.length <= 200);
  for (const scope of ['company', 'bad']) { const other = harness({ objective: { scope } }); assert.equal((await other.create().run(other.input)).state, 'error'); assert.equal(other.sent.length, 0); }
  const blank = harness(); assert.equal((await blank.create().run({ ...blank.input, body: ' ' })).state, 'error'); assert.equal(blank.sent.length, 0);
});
test('recovery storage isolates scope, goal and week, validates malformed records and supports clearing', async () => {
  const h = harness(); await h.create().run(h.input);
  const data = new Map(), storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  writeWeeklyMemoSave(h.objective, h.input.week, h.stored(), storage);
  assert.deepEqual(readWeeklyMemoSave(h.objective, h.input.week, storage), h.stored());
  assert.equal(readWeeklyMemoSave(h.objective, '2026-10-12', storage), null);
  data.set([...data.keys()][0], '{broken'); assert.throws(() => readWeeklyMemoSave(h.objective, h.input.week, storage));
  writeWeeklyMemoSave(h.objective, h.input.week, null, storage); assert.equal(data.size, 0);
});
