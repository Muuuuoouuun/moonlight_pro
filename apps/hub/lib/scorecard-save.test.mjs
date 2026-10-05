import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildScorecardSave, createScorecardSaver, readScorecardObjective, readScorecardSave, scorecardSaveMessage, writeScorecardSave } from './scorecard-save.js';
import { validateGoalCommand } from '@com-moon/goal-contracts';
import { validateJournalInput } from './journal.js';

function harness(options = {}) {
  const objective = { id: randomUUID(), scope: 'personal', title: '합성 목표', description: '기존 설명', status: 'active', revision: 1, ...options.objective };
  const input = { objective: { ...objective }, draft: { retro: '  원문 😀\n두 번째 줄  ', change: 'offer' }, body: '  원문 😀\n두 번째 줄  \n최종 점수 0.35', ...options.input };
  let stored = options.stored || null, current = true;
  const sent = [], updates = [], receipts = new Map(), journals = new Map(), counts = { journal: 0, link: 0, archive: 0 };
  const controls = { lose: null, fail: null, malformed: null, persistFail: null, hold: null };
  const fetchImpl = async (url, init) => {
    const request = JSON.parse(init.body);
    const step = url === '/api/hub/journal' ? 'journal' : request.action === 'link_entity' ? 'link' : 'archive';
    sent.push({ step, request });
    if (controls.hold) await controls.hold;
    const failed = controls.fail?.(step, request);
    if (failed) return { ok: false, status: 409, json: async () => failed };
    if (step === 'journal' && !validateJournalInput(request).ok) return { ok: false, status: 400, json: async () => ({ status: 'invalid-input', error: 'invalid-input' }) };
    const id = step === 'journal' ? request.requestId : request.commandId;
    let data = receipts.get(id);
    if (!data) {
      counts[step]++;
      if (step === 'journal') {
        assert.equal(request.noteMeta.scope, objective.scope);
        const entry = { id: request.entryId, body: request.body, title: request.title, occurredAt: request.occurredAt, revision: 1, noteMeta: request.noteMeta, contexts: [] };
        journals.set(entry.id, entry); data = { status: 'saved', entry };
      } else {
        assert.equal(validateGoalCommand(request).ok, true);
        assert.equal(request.expectedRevision, objective.revision);
        objective.revision++;
        if (step === 'archive') Object.assign(objective, request.input);
        data = { status: 'saved', persisted: true, commandId: request.commandId, replayed: false,
          entity: step === 'link' ? { ...request.input, linked: true, revision: objective.revision } : { ...objective } };
      }
      receipts.set(id, data);
    } else data = step === 'journal' ? { ...data, status: 'duplicate' } : { ...data, replayed: true };
    if (controls.lose?.(step, request)) throw new Error('synthetic lost response');
    return { ok: true, status: 200, json: async () => controls.malformed?.(step, data) || data };
  };
  const dependencies = { get: () => stored, persist: value => { if (controls.persistFail?.(value)) throw Error('synthetic quota'); stored = structuredClone(value); },
    update: value => updates.push(value), isCurrent: () => current, fetchImpl, readObjective: async () => ({ ...objective }) };
  return { input, objective, controls, sent, updates, counts, journals, create: () => createScorecardSaver(dependencies),
    stored: () => stored, navigate: () => { current = false; } };
}

test('personal scorecard links the exact acknowledged journal ID and archives only status', async () => {
  const h = harness();
  assert.equal((await h.create().run(h.input)).state, 'saved');
  assert.deepEqual(h.counts, { journal: 1, link: 1, archive: 1 });
  assert.equal(h.sent[1].request.input.entityId, [...h.journals.keys()][0]);
  assert.deepEqual(h.sent[2].request.input, { id: h.objective.id, status: 'archived' });
  assert.equal(h.journals.values().next().value.body, h.input.body);
  assert.equal(h.stored().draft.retro, h.input.draft.retro);
});

for (const step of ['journal', 'link', 'archive']) {
  test(`${step} response loss and ten reconstructed retries keep one mutation and identical request`, async () => {
    const h = harness(); h.controls.lose = value => value === step;
    for (let attempt = 0; attempt < 10; attempt++) {
      const result = await h.create().run({ ...h.input, body: '새 입력으로 바꿔도 기존 요청 보존', draft: { retro: '보존할 원문', change: '' } });
      assert.equal(result.state, 'unknown');
    }
    const requests = h.sent.filter(value => value.step === step).map(value => value.request);
    assert.equal(requests.length, 10);
    for (const request of requests) assert.deepEqual(request, requests[0]);
    assert.equal(h.counts[step], 1);
    h.controls.lose = null;
    assert.equal((await h.create().run(h.input)).state, 'saved');
    assert.deepEqual(h.counts, { journal: 1, link: 1, archive: 1 });
    assert.equal(h.stored().draft.retro, '보존할 원문');
  });
}

for (const step of ['link', 'archive']) {
  test(`${step} definitive failure resumes remaining steps with a fresh revision and preserves prior acknowledgements`, async () => {
    const h = harness(); let failed = false;
    h.controls.fail = value => value === step && !failed && (failed = true) ? { status: 'conflict', persisted: false, error: 'stale-revision' } : null;
    const first = await h.create().run(h.input);
    assert.equal(first.state, 'conflict');
    assert.equal(h.counts.journal, 1); assert.equal(first.done.journal, true);
    assert.equal(first.requests[step], null);
    h.objective.revision++;
    h.objective.title = '다른 창의 새 제목'; h.objective.description = '다른 창의 새 설명';
    assert.equal((await h.create().run(h.input)).state, 'saved');
    assert.deepEqual(h.counts, { journal: 1, link: 1, archive: 1 });
    assert.equal(h.objective.title, '다른 창의 새 제목'); assert.equal(h.objective.description, '다른 창의 새 설명');
    assert.equal(h.sent.filter(value => value.step === 'journal').length, 1);
  });
}

test('blank optional retrospective sends only archive and mandatory personal retrospective sends nothing', async () => {
  const h = harness({ input: { draft: { retro: '   ', change: '' }, body: '' } });
  assert.equal((await h.create().run({ ...h.input, retroRequired: true })).state, 'error');
  assert.equal(h.sent.length, 0); assert.equal(h.stored(), null);
  assert.equal((await h.create().run(h.input)).state, 'saved');
  assert.deepEqual(h.counts, { journal: 0, link: 0, archive: 1 });
});

test('company archive with no retrospective never writes or links a personal journal', async () => {
  const h = harness({ objective: { scope: 'company' }, input: { draft: { retro: '', change: '' }, body: '' } });
  assert.equal((await h.create().run(h.input)).state, 'saved');
  assert.deepEqual(h.counts, { journal: 0, link: 0, archive: 1 });
});

test('company retrospective preserves company scope without linking a personal-only journal source', async () => {
  const h = harness({ objective: { scope: 'company' } });
  assert.equal((await h.create().run(h.input)).state, 'saved');
  assert.deepEqual(h.counts, { journal: 1, link: 0, archive: 1 });
  assert.equal([...h.journals.values()][0].noteMeta.scope, 'company');
  assert.doesNotMatch(scorecardSaveMessage(h.stored()), /목표 연결도/);
});

test('browser recovery persistence failure prevents every mutation', async () => {
  const h = harness(); h.controls.persistFail = () => true;
  assert.equal((await h.create().run(h.input)).state, 'error');
  assert.equal(h.sent.length, 0); assert.equal(h.stored(), null);
});

test('failure to persist a journal acknowledgement replays its prior request without another memo', async () => {
  const h = harness(); h.controls.persistFail = value => value.done.journal;
  assert.equal((await h.create().run(h.input)).state, 'unknown');
  assert.equal(h.stored().uncertain.journal, true); assert.equal(h.counts.journal, 1);
  h.controls.persistFail = null;
  assert.equal((await h.create().run(h.input)).state, 'saved');
  assert.deepEqual(h.counts, { journal: 1, link: 1, archive: 1 });
});

test('double submit shares one promise and late response after navigation cannot advance or publish', async () => {
  const h = harness(); let release; h.controls.hold = new Promise(resolve => { release = resolve; });
  const saver = h.create(), first = saver.run(h.input), second = saver.run(h.input);
  assert.equal(first, second); assert.equal(h.sent.length, 1);
  const updates = h.updates.length; h.navigate(); release();
  assert.equal((await first).state, 'stale');
  assert.equal(h.updates.length, updates); assert.equal(h.sent.length, 1);
  assert.equal(h.stored().uncertain.journal, true);
});

test('completed logical save cannot produce another journal or archive on stale refresh', async () => {
  const h = harness(); assert.equal((await h.create().run(h.input)).state, 'saved');
  const requests = h.sent.length;
  assert.equal((await h.create().run({ ...h.input, body: '다른 본문' })).state, 'saved');
  assert.equal(h.sent.length, requests);
});

for (const step of ['journal', 'link', 'archive']) {
  test(`malformed ${step} success is unknown and never advances another step`, async () => {
    const h = harness(); h.controls.malformed = (value, data) => value === step ? { ...data, ...(step === 'journal' ? { entry: { ...data.entry, id: randomUUID() } } : { commandId: randomUUID() }) } : null;
    assert.equal((await h.create().run(h.input)).state, 'unknown');
    assert.equal(h.stored().done[step], false); assert.equal(h.stored().uncertain[step], true);
    assert.equal(h.sent.at(-1).step, step);
  });
}

test('HTTP 200 journal error envelope cannot be mistaken for a saved memo', async () => {
  const h = harness(); h.controls.malformed = step => step === 'journal' ? { status: 'error', entry: null } : null;
  assert.equal((await h.create().run(h.input)).state, 'unknown');
  assert.deepEqual(h.sent.map(value => value.step), ['journal']);
});

test('a journal acknowledgement with foreign scope stays unknown and cannot link or archive', async () => {
  const h = harness(); h.controls.malformed = (step, data) => step === 'journal' ? { ...data, entry: { ...data.entry, noteMeta: { ...data.entry.noteMeta, scope: 'company' } } } : null;
  assert.equal((await h.create().run(h.input)).state, 'unknown');
  assert.deepEqual(h.sent.map(value => value.step), ['journal']);
  assert.equal(h.stored().done.journal, false);
});

test('unavailable goal read after a saved journal keeps the acknowledgement and original text', async () => {
  const h = harness(); let stored = null, journalWrites = 0;
  const saver = createScorecardSaver({ get: () => stored, persist: value => { stored = structuredClone(value); },
    fetchImpl: async (_url, init) => { journalWrites++; const request = JSON.parse(init.body); return { ok: true, json: async () => ({ status: 'saved', entry: { id: request.entryId, body: request.body, occurredAt: request.occurredAt, revision: 1, noteMeta: request.noteMeta } }) }; },
    readObjective: async () => { throw Error('synthetic read error'); } });
  const result = await saver.run(h.input);
  assert.equal(result.state, 'error'); assert.equal(result.done.journal, true);
  assert.equal(result.draft.retro, h.input.draft.retro);
  assert.match(scorecardSaveMessage(result), /회고 메모는 저장됐습니다/);
  assert.equal((await saver.run(h.input)).state, 'error');
  assert.equal(journalWrites, 1); assert.equal(stored.done.journal, true);
});

test('scope and objective mismatch in restored state send no requests', async () => {
  const h = harness(); await h.create().run(h.input);
  const result = await h.create().run({ ...h.input, objective: { ...h.input.objective, scope: 'company' } });
  assert.equal(result.state, 'error'); assert.equal(h.sent.length, 3);
});

test('goal revision read rejects error, preview, malformed and foreign scope before mutation', async () => {
  const objective = { id: randomUUID(), scope: 'personal' };
  for (const data of [{ status: 'error', objectives: [{ ...objective, revision: 1 }] }, { status: 'preview', objectives: [{ ...objective, revision: 1 }] },
    { status: 'live', objectives: [{ ...objective, scope: 'company', revision: 1 }] }, { status: 'live', objectives: [{ ...objective, revision: 1.5 }] }]) {
    await assert.rejects(readScorecardObjective(objective, async () => ({ ok: true, json: async () => data })));
  }
});

test('recovery store separates company and personal IDs and reports unreadable storage', () => {
  const rows = new Map(), storage = { getItem: key => rows.get(key), setItem: (key, value) => rows.set(key, value) };
  const objective = { id: randomUUID(), scope: 'personal', title: '복구 목표' }, input = { objective, draft: { retro: '원문', change: '' }, body: '원문' };
  const value = buildScorecardSave(input);
  writeScorecardSave(objective, value, storage);
  assert.deepEqual(readScorecardSave(objective, storage), value);
  assert.equal(readScorecardSave({ ...objective, scope: 'company' }, storage), null);
  assert.throws(() => writeScorecardSave(objective, value, { setItem: () => { throw Error('quota'); } }));
  rows.set([...rows.keys()][0], '{'); assert.throws(() => readScorecardSave(objective, storage));
});

test('partial success and unknown copy distinguishes the completed step and exact retry', async () => {
  const h = harness(); h.controls.lose = step => step === 'archive';
  const state = await h.create().run(h.input);
  assert.match(scorecardSaveMessage(state), /회고 메모는 저장됐습니다/);
  assert.match(scorecardSaveMessage(state), /목표 연결도 완료됐습니다/);
  assert.match(scorecardSaveMessage(state), /목표 보관.*같은 요청/);
  assert.doesNotMatch(scorecardSaveMessage(state), /채점을 저장했습니다/);
});

test('scorecard UI keeps frozen text selectable, retry visible and foreign responses behind keyed identity', () => {
  const source = readFileSync(new URL('../components/hub/goal-scorecard.jsx', import.meta.url), 'utf8');
  assert.match(source, /ScorecardBody key=\{`\$\{props.objective.scope\}:\$\{props.objective.id\}`\}/);
  assert.match(source, /readOnly=\{frozen\}/);
  assert.match(source, /남은 저장 다시 확인/);
  assert.doesNotMatch(source, /entityType: 'journal_entries', entityId \}/);
});

for (const length of [200, 240, 300]) {
  test(`${length}-unit goal titles save a bounded journal title, full original name and original link`, async () => {
    const title = '가'.repeat(length), h = harness({ objective: { title } });
    assert.equal((await h.create().run(h.input)).state, 'saved');
    const journal = h.sent[0].request;
    assert.equal(journal.title.length, 200); assert.match(journal.title, /… · 채점 회고$/);
    assert.equal(journal.body, `목표: ${title}\n\n${h.input.body}`);
    assert.equal(h.stored().draft.retro, h.input.draft.retro);
    assert.equal(h.sent[1].request.input.objectiveId, h.objective.id);
    assert.deepEqual(h.counts, { journal: 1, link: 1, archive: 1 });
  });
}

for (const grapheme of ['😀', 'e\u0301', '👩🏽‍💻']) {
  test(`journal title truncation keeps the ${grapheme} grapheme whole at the UTF-16 limit`, async () => {
    const title = '가'.repeat(190) + grapheme + '마'.repeat(30), h = harness({ objective: { title } });
    assert.equal((await h.create().run(h.input)).state, 'saved');
    const journal = h.sent[0].request;
    assert.equal(journal.title, '가'.repeat(190) + '… · 채점 회고');
    assert.equal(journal.title.isWellFormed(), true); assert.ok(journal.title.length <= 200);
    assert.equal(journal.body, `목표: ${title}\n\n${h.input.body}`);
    const fits = '가'.repeat(191 - grapheme.length) + grapheme;
    const boundary = harness({ objective: { title: fits + '마'.repeat(30) } });
    assert.equal((await boundary.create().run(boundary.input)).state, 'saved');
    assert.equal(boundary.sent[0].request.title, fits + '… · 채점 회고');
    assert.equal(boundary.sent[0].request.title.length, 200);
  });
}

test('a long company goal keeps its full name and company scope without creating a personal link', async () => {
  const h = harness({ objective: { title: '회사'.repeat(150), scope: 'company' } });
  assert.equal((await h.create().run(h.input)).state, 'saved');
  assert.equal(h.sent[0].request.noteMeta.scope, 'company');
  assert.equal(h.sent[0].request.body, `목표: ${h.objective.title}\n\n${h.input.body}`);
  assert.deepEqual(h.counts, { journal: 1, link: 0, archive: 1 });
});

test('invalid fresh input never freezes a durable intent and corrected input can save', async () => {
  for (const input of [{ body: '가'.repeat(20001) }, { body: '  ' }, { draft: { retro: '가'.repeat(4001), change: '' } },
    { draft: { retro: '원문', change: 'unknown' } }, { objective: { id: 'invalid', scope: 'personal', title: '목표' } }]) {
    const h = harness({ input });
    assert.equal((await h.create().run(h.input)).state, 'error');
    assert.equal(h.stored(), null); assert.equal(h.sent.length, 0);
    const corrected = { ...h.input, objective: { ...h.objective }, draft: { retro: '원문', change: '' }, body: '원문' };
    assert.equal((await h.create().run(corrected)).state, 'saved');
  }
  const h = harness();
  assert.equal(buildScorecardSave(h.input, { makeId: () => 'invalid' }).state, 'error');
  assert.equal(buildScorecardSave(h.input, { now: () => 'invalid' }).state, 'error');
  assert.equal(buildScorecardSave({ ...h.input, objective: { ...h.objective, title: '가'.repeat(300) }, body: '  ' }).state, 'error');
});

test('a definitively rejected legacy title is repaired with its original IDs, name and retrospective', async () => {
  const h = harness({ objective: { title: '가'.repeat(240) } }), legacy = buildScorecardSave(h.input);
  legacy.requests.journal.title = h.objective.title + ' · 채점 회고'; legacy.requests.journal.body = h.input.body;
  Object.assign(legacy, { state: 'error', step: 'journal', error: 'invalid-input', uncertain: { journal: false } });
  const restored = harness({ objective: h.objective, stored: legacy });
  assert.equal((await restored.create().run({ ...restored.input, body: '새 본문', objective: { ...h.objective, title: '새 목표명' } })).state, 'saved');
  const journal = restored.sent[0].request;
  assert.equal(journal.requestId, legacy.requests.journal.requestId); assert.equal(journal.entryId, legacy.requests.journal.entryId);
  assert.equal(journal.body, `목표: ${h.objective.title}\n\n${h.input.body}`);
  assert.equal(restored.stored().draft.retro, legacy.draft.retro);
});

test('an uncertain legacy title remains immutable after invalid-input and reconstructed retries', async () => {
  const h = harness({ objective: { title: '가'.repeat(300) } }), legacy = buildScorecardSave(h.input);
  legacy.requests.journal.title = h.objective.title + ' · 채점 회고'; legacy.requests.journal.body = h.input.body;
  Object.assign(legacy, { state: 'unknown', step: 'journal', uncertain: { journal: true } });
  const restored = harness({ objective: h.objective, stored: legacy });
  let conflicts = 0;
  restored.controls.fail = step => step === 'journal' && conflicts++ === 0 ? { status: 'conflict', error: 'request-id-reused' } : null;
  for (let attempt = 0; attempt < 3; attempt++) {
    assert.equal((await restored.create().run({ ...restored.input, body: '변경 불가' })).state, 'unknown');
    assert.deepEqual(restored.sent[attempt].request, legacy.requests.journal);
    assert.equal(restored.stored().uncertain.journal, true);
  }
  assert.deepEqual(restored.counts, { journal: 0, link: 0, archive: 0 });
});
