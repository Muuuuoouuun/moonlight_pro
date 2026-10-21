import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  activeSchedule, bodyWritten, buildFlow, buildPlanSave, deriveStage, flowWeek, formatOutline, isReadyToMake,
  pickableCards, PLAN_FIELDS, planCount, planSaveConfirmed, publishedDays, resolveContentView, studioHref,
} from './content-flow.js';

const item = (patch = {}) => ({ id: 'c1', title: '한 줄', sourceIdea: '한 줄', sourceUrl: null, brief: {}, status: 'idea', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', ...patch });
const threads = (body, patch = {}) => ({ id: 'v1', contentId: 'c1', type: 'threads_post', body, ...patch });

test('view param falls back to 만들기 for unknown or missing values', () => {
  assert.equal(resolveContentView(null), 'make');
  assert.equal(resolveContentView('kanban'), 'make');
  assert.equal(resolveContentView('board'), 'board');
  assert.equal(resolveContentView('list'), 'list');
});

test('plan fields keep the six BRIEF_FIELDS with the core message first', () => {
  assert.deepEqual(PLAN_FIELDS.map((field) => field.key), ['message', 'audience', 'purpose', 'angle', 'evidence', 'ending']);
  assert.equal(planCount({ message: ' 한 문장 ', audience: '', angle: '  ' }), 1);
  assert.equal(planCount(undefined), 0);
});

test('바로 가능 needs a reference link or a memo beyond the title line, with no scoring', () => {
  assert.equal(isReadyToMake(item()), false, 'a one-line capture is only its title');
  assert.equal(isReadyToMake(item({ sourceIdea: '한 줄\n두 번째 줄에 재료' })), true);
  assert.equal(isReadyToMake(item({ sourceUrl: 'https://example.com/a' })), true);
  assert.equal(isReadyToMake(item({ sourceIdea: '' })), false);
});

test('a body counts as written only past the captured memo; cards and shorts need an entry', () => {
  assert.equal(bodyWritten(threads('한 줄'), '한 줄'), false);
  assert.equal(bodyWritten(threads(''), '한 줄'), false);
  assert.equal(bodyWritten(threads('새로 쓴 첫 줄'), '한 줄'), true);
  assert.equal(bodyWritten({ type: 'card_news', body: '{"slides":[]}' }), false);
  assert.equal(bodyWritten({ type: 'card_news', body: '{"slides":[{"title":"표지"}]}' }), true);
  assert.equal(bodyWritten({ type: 'reels_script', body: '' }), false);
  assert.equal(bodyWritten({ type: 'reels_script', body: '{not json' }), true, 'unreadable structure is still something written');
  assert.equal(bodyWritten(null), false);
});

test('stage mapping derives 계획 without a migration', () => {
  assert.equal(deriveStage(item(), [threads('한 줄')]), 'idea');
  assert.equal(deriveStage(item({ brief: { message: '핵심' } }), [threads('한 줄')]), 'plan');
  assert.equal(deriveStage(item({ brief: { evidence: '들여올 때 붙은 자료' } }), [threads('한 줄')]), 'idea', 'evidence alone is material, not a plan');
  assert.equal(deriveStage(item({ brief: { audience: '강사', evidence: '자료' } }), [threads('한 줄')]), 'plan');
  // 기획 저장은 담은 메모가 본문이라 idea → draft로 올라간다 — 본문을 안 썼으니 여전히 계획이다.
  assert.equal(deriveStage(item({ status: 'draft', brief: { message: '핵심' } }), [threads('한 줄')]), 'plan');
  assert.equal(deriveStage(item({ status: 'draft' }), [threads('한 줄'), { id: 'v2', contentId: 'c1', type: 'card_news', body: '{"slides":[{"title":"a"}]}' }]), 'make');
  assert.equal(deriveStage(item({ status: 'draft' }), []), 'make', 'unread variants trust the stored status');
  assert.equal(deriveStage(item({ status: 'review' }), [threads('x')]), 'polish');
  assert.equal(deriveStage(item({ status: 'scheduled' }), [threads('x')]), 'ship');
  assert.equal(deriveStage(item({ status: 'draft' }), [threads('x')], { state: 'scheduled' }), 'ship', 'a live schedule means 발행 대기');
  assert.equal(deriveStage(item({ status: 'published' }), [threads('x')], { state: 'missed' }), 'published');
});

test('the live schedule prefers 놓침, then 올릴 차례, then the earliest 예약; dead rows are ignored', () => {
  const rows = [
    { contentId: 'c1', state: 'scheduled', scheduledAt: '2026-10-22T10:00:00Z' },
    { contentId: 'c1', state: 'scheduled', scheduledAt: '2026-10-21T10:00:00Z' },
    { contentId: 'c1', state: 'published', scheduledAt: '2026-10-20T10:00:00Z' },
    { contentId: 'c2', state: 'missed', scheduledAt: '2026-10-20T10:00:00Z' },
  ];
  assert.equal(activeSchedule(rows, 'c1').scheduledAt, '2026-10-21T10:00:00Z');
  assert.equal(activeSchedule([...rows, { contentId: 'c1', state: 'missed', scheduledAt: '2026-10-23T00:00:00Z' }], 'c1').state, 'missed');
  assert.equal(activeSchedule(rows, 'c3'), null);
});

test('buildFlow lanes cards, drops published, and sorts each lane', () => {
  const items = [
    item({ id: 'a', createdAt: '2026-10-01T00:00:00Z' }),
    item({ id: 'b', createdAt: '2026-10-05T00:00:00Z' }),
    item({ id: 'p', brief: { audience: '강사' }, updatedAt: '2026-10-10T00:00:00Z' }),
    item({ id: 's1', status: 'draft' }), item({ id: 's2', status: 'draft' }),
    item({ id: 'done', status: 'published' }),
  ];
  const variants = [{ id: 'x1', contentId: 's1', type: 'threads_post', body: '본문' }, { id: 'x2', contentId: 's2', type: 'reels_script', body: '{"scenes":[{"spoken":"훅"}]}' }];
  const schedules = [
    { contentId: 's1', state: 'scheduled', scheduledAt: '2026-10-22T00:00:00Z' },
    { contentId: 's2', state: 'missed', scheduledAt: '2026-10-23T00:00:00Z' },
  ];
  const lanes = buildFlow({ items, variants, schedules });
  assert.deepEqual(lanes.idea.map((card) => card.item.id), ['b', 'a'], 'ideas: newest captured first');
  assert.deepEqual(lanes.plan.map((card) => card.item.id), ['p']);
  assert.deepEqual(lanes.ship.map((card) => card.item.id), ['s2', 's1'], '놓침 first');
  assert.deepEqual(lanes.ship[0].formats.map((format) => format.label), ['쇼츠']);
  assert.ok(!Object.values(lanes).flat().some((card) => card.item.id === 'done'));
  assert.deepEqual(pickableCards(lanes).map((card) => card.item.id), ['p', 'b', 'a'], '고르기: 아이디어 + 계획, 최근 손댄 순');
});

test('thread outline: first line, three link slots, closing — the captured memo alone is an empty skeleton', () => {
  const empty = formatOutline('threads', threads('메모'), '메모');
  assert.deepEqual(empty.rows.map((row) => row.label), ['첫 줄', '연결 글 1', '연결 글 2', '연결 글 3', '마무리']);
  assert.equal(empty.written, 0);
  const full = formatOutline('threads', threads('첫\n\n둘\n\n셋\n\n넷\n\n다섯\n\n끝'), '메모');
  assert.deepEqual(full.rows.map((row) => row.label), ['첫 줄', '연결 글 1', '연결 글 2', '연결 글 3', '연결 글 4', '마무리']);
  assert.equal(full.rows.at(-1).text, '끝');
  assert.equal(full.written, 6);
  assert.equal(full.rows[0].meta, '1자');
  assert.equal(formatOutline('threads', null).written, 0);
});

test('shorts outline maps scenes onto 훅 · 문제 · 전환 · 해결 · 마무리 and sums only written seconds', () => {
  const variant = { type: 'reels_script', body: JSON.stringify({ scenes: [{ spoken: '훅 대사', duration: 3 }, { visual: '화면만', duration: 9 }, { duration: 30 }] }) };
  const outline = formatOutline('shorts', variant);
  assert.deepEqual(outline.rows.map((row) => row.label), ['훅', '문제', '전환', '해결', '마무리']);
  assert.deepEqual(outline.rows.slice(0, 3).map((row) => row.text), ['훅 대사', '화면만', '']);
  assert.equal(outline.rows[0].meta, '3초');
  assert.deepEqual(outline.measure, { value: 12, of: 60, unit: '초' });
  const long = formatOutline('shorts', { type: 'reels_script', body: JSON.stringify({ scenes: Array.from({ length: 6 }, (_, i) => ({ spoken: `s${i}` })) }) });
  assert.equal(long.rows[5].label, '장면 6');
});

test('card outline runs 표지 to 마지막 장 and grows with the slides', () => {
  assert.deepEqual(formatOutline('card', null).rows.map((row) => row.label), ['표지', '장 2', '장 3', '장 4', '마지막 장']);
  const six = formatOutline('card', { type: 'card_news', body: JSON.stringify({ slides: Array.from({ length: 6 }, (_, i) => ({ title: `t${i}` })) }) });
  assert.deepEqual(six.rows.map((row) => row.label), ['표지', '장 2', '장 3', '장 4', '장 5', '마지막 장']);
  assert.equal(six.written, 6);
});

test('week cells: 발행 wins over 예약, today and future are shape only', () => {
  const now = Date.parse('2026-10-21T03:00:00Z'); // 수요일 낮(KST)
  const rows = [
    { state: 'published', atMs: Date.parse('2026-10-19T01:00:00Z') },
    { state: 'scheduled', atMs: Date.parse('2026-10-19T05:00:00Z') },
    { state: 'scheduled', atMs: Date.parse('2026-10-22T10:00:00Z') },
    { state: 'missed', atMs: Date.parse('2026-10-20T10:00:00Z') },
  ];
  const week = flowWeek(rows, now);
  assert.deepEqual(week.map((day) => day.label), ['월', '화', '수', '목', '금', '토', '일']);
  assert.equal(week[0].done, true); assert.equal(week[0].scheduled, false);
  assert.equal(week[1].done || week[1].scheduled, false, '놓침 is not a publish day');
  assert.equal(week[2].today, true);
  assert.equal(week[3].scheduled, true); assert.equal(week[3].future, true);
  assert.equal(publishedDays(week), 1);
  assert.match(week[3].aria, /목요일 예약/);
});

test('studio links keep the chosen result when there is one', () => {
  assert.equal(studioHref('c 1'), '/dashboard/content/studio?item=c%201');
  assert.equal(studioHref('c1', 'v1'), '/dashboard/content/studio?item=c1&variant=v1');
});

const detail = {
  status: 'live',
  item: { id: 'c1', workspace_id: 'w', title: '제목', source_idea: '메모', updated_at: '2026-10-21T00:00:00.000001Z', meta: { primary_variant_id: 'v1', brief: { audience: '강사' } } },
  variants: [{ id: 'v1', content_id: 'c1', variant_type: 'threads_post', channel: 'threads', body: '메모', updated_at: '2026-10-21T00:00:01Z' }],
};

test('plan save sends only the edited brief keys on the existing workflow save, versioned from a fresh read', () => {
  const command = buildPlanSave(detail, { message: '핵심 한 문장', audience: '강사', title: '바뀌면 안 됨' }, 'req-1');
  assert.deepEqual(command, {
    action: 'save', requestId: 'req-1', contentId: 'c1', variantId: 'v1',
    expectedItemUpdatedAt: '2026-10-21T00:00:00.000001Z', expectedVariantUpdatedAt: '2026-10-21T00:00:01Z',
    item: { brief: { message: '핵심 한 문장', audience: '강사' } }, variant: {}, checkpoint: false,
  });
  assert.equal(buildPlanSave(detail, {}, 'req-2'), null, 'nothing to send');
  assert.equal(buildPlanSave({ ...detail, variants: [] , item: { ...detail.item, meta: {} } }, { message: 'x' }, 'r'), null, 'no result to version against → Studio');
  assert.throws(() => buildPlanSave({ item: null, variants: [] }, { message: 'x' }, 'r'));
});

test('plan save is confirmed only when the response carries the sent values', () => {
  const command = buildPlanSave(detail, { message: '핵심' }, 'r');
  assert.equal(planSaveConfirmed({ status: 'saved', item: { id: 'c1', meta: { brief: { message: '핵심', audience: '강사' } } } }, command), true);
  assert.equal(planSaveConfirmed({ status: 'duplicate', item: { id: 'c1', meta: { brief: { message: '핵심' } } } }, command), true);
  assert.equal(planSaveConfirmed({ status: 'saved', item: { id: 'c1', meta: { brief: { message: '다른 값' } } } }, command), false);
  assert.equal(planSaveConfirmed({ status: 'preview' }, command), false);
  assert.equal(planSaveConfirmed({ status: 'conflict', item: { id: 'c1', meta: { brief: { message: '핵심' } } } }, command), false);
});
