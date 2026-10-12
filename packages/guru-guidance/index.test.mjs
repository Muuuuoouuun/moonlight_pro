import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import * as guidance from './index.ts';
import {
  GURU_CARDS,
  LEGEND_CARDS,
  LEGEND_IDS,
  LEGEND_LIBRARY,
  LEGEND_LIBRARY_VERSION,
  LEGEND_MICRO_CARDS,
  getLegendEntry,
  guidanceDailyWindow,
  guidancePeriodKey,
  guidanceRotationIndex,
  isLegendId,
  listGuidanceCards,
  selectGuidanceCard,
  guidancePromptFrame,
  toLegendMicroCard,
} from './index.ts';

const { listGuidancePeople, listGuidanceCardsForPerson, referencedPriorCardId } = guidance;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const readDoc = path => readFileSync(resolve(repoRoot, path), 'utf8').replace(/\r\n?/g, '\n');
const RUNTIME_FIELDS = [
  'id', 'name', 'nameKo', 'category', 'coreValue', 'acceptableCost',
  'pivotCondition', 'piercingQuestion', 'boundaryCondition', 'sourceCitation',
];
// 10:00 Seoul on the Monday `week` weeks after 2026-09-21.
const seoulMonday = week => new Date(Date.parse('2026-09-21T01:00:00Z') + week * 7 * 86_400_000);

test('Guru catalogue covers each practice domain with attributable source sections', () => {
  assert.deepEqual([...new Set(GURU_CARDS.map(card => card.domain))].sort(), ['content', 'marketing', 'sales']);
  for (const domain of ['sales', 'marketing', 'content']) {
    assert.ok(GURU_CARDS.filter(card => card.domain === domain).length >= 5, `${domain} needs enough reviewed views for three daily slots`);
  }
  for (const card of [...GURU_CARDS, ...LEGEND_CARDS]) {
    assert.ok(card.id && card.person && card.frame && card.text && card.useWhen && card.question);
    assert.ok(card.source.title && card.source.section);
    assert.ok(existsSync(resolve(repoRoot, card.source.path)), card.source.path);
    assert.doesNotMatch(card.text, /\d+\s*%|“.*”/, `unverified claim or quotation in ${card.id}`);
  }
  assert.equal(new Set([...GURU_CARDS, ...LEGEND_CARDS].map(card => card.id)).size, GURU_CARDS.length + LEGEND_CARDS.length);
});

test('every advice prompt carries the reviewed non-use boundary from its infographic summary', () => {
  const summaries = [
    'apps/hub/content/guru/infographics-sales.json',
    'apps/hub/content/guru/infographics-other.json',
  ].flatMap(path => JSON.parse(readFileSync(resolve(repoRoot, path), 'utf8')));
  const byId = new Map(summaries.map(summary => [summary.id, summary]));
  for (const card of [...GURU_CARDS, ...LEGEND_CARDS]) {
    const boundary = byId.get(card.id)?.boundary;
    assert.ok(boundary, `${card.id}: reviewed boundary is missing`);
    assert.equal(card.boundary, boundary, `${card.id}: card and reading summary disagree`);
    assert.match(guidancePromptFrame(card.id), /적용하지 않을 조건:/);
    assert.ok(guidancePromptFrame(card.id).includes(boundary), `${card.id}: mentor lost the boundary`);
  }
});

test('sales person shelf includes every named playbook mentor plus MEDDIC creator', () => {
  assert.equal(typeof listGuidancePeople, 'function');
  const people = listGuidancePeople({ domain: 'sales' });
  assert.equal(people.length, 13);
  assert.deepEqual(new Set(people.map(person => person.name)), new Set([
    'Zig Ziglar', 'Dale Carnegie', 'Napoleon Hill', 'Joe Girard', 'Brian Tracy',
    'Grant Cardone', 'Jordan Belfort', 'Neil Rackham', 'Chris Voss',
    'Aaron Ross', 'Jason Lemkin', 'Keenan', 'Dick Dunkel',
  ]));
  assert.ok(people.every(person => person.id && person.domains.includes('sales')));
  assert.deepEqual(people.map(person => person.name),
    [...people.map(person => person.name)].sort((a, b) => a.localeCompare(b, 'en')));
});

test('person metadata links every Guru card to a stable person and method', () => {
  const names = new Map();
  for (const card of GURU_CARDS) {
    assert.ok(card.personId && card.personName && card.methodLabel, card.id);
    assert.match(card.personId, /^[a-z]+(?:-[a-z]+)*$/, card.id);
    const prior = names.get(card.personId);
    if (prior) assert.equal(card.personName, prior, card.id);
    names.set(card.personId, card.personName);
  }
  assert.ok(listGuidancePeople().some(person => person.id === 'donald-miller' &&
    person.domains.includes('marketing') && person.domains.includes('content')));
});

test('manual person browsing keeps reviewed cards excluded from scheduled rotation', () => {
  assert.equal(typeof listGuidanceCardsForPerson, 'function');
  for (const personId of [
    'dick-dunkel', 'neil-rackham', 'chris-voss',
    'napoleon-hill', 'joe-girard', 'grant-cardone', 'jordan-belfort', 'jason-lemkin',
  ]) {
    const cards = listGuidanceCardsForPerson(personId);
    assert.ok(cards.length >= 1, personId);
    assert.ok(cards.every(card => card.personId === personId && card.rotationEligible === false), personId);
  }
  assert.deepEqual(listGuidanceCardsForPerson('unknown-person'), []);
  assert.ok(listGuidanceCardsForPerson('donald-miller').some(card => card.domain === 'marketing'));
  assert.ok(listGuidanceCardsForPerson('donald-miller').some(card => card.domain === 'content'));
  assert.ok(listGuidanceCards({ cadence: 'daily', domain: 'sales' }).some(card => card.personId === 'napoleon-hill'));
  for (let day = 0; day < 30; day++) {
    for (const hour of [0, 5, 10]) {
      const now = new Date(Date.UTC(2026, 8, 24 + day, hour));
      for (const contextKey of [undefined, 'sales:new', 'sales:active', 'sales:dormant']) {
        const card = selectGuidanceCard({ cadence: 'daily', domain: 'sales', contextKey, now });
        assert.notEqual(card.rotationEligible, false, card.id);
      }
    }
  }
});

test('broad customer segments rotate only advice that needs no unobserved deal event', () => {
  const broadlyApplicable = new Set([
    'sales-gap', 'sales-ziglar-help', 'sales-carnegie-listen', 'sales-tracy-needs',
  ]);
  const stages = ['sales:new', 'sales:active', 'sales:dormant'];
  const selectedByContext = new Map();
  for (let day = 0; day < 30; day++) {
    const slots = [0, 5, 10].map(hour => new Date(Date.UTC(2026, 8, 24 + day, hour)));
    for (const contextKey of [undefined, 'sales:unknown', ...stages]) {
      const selected = slots.map(now => selectGuidanceCard({ cadence: 'daily', domain: 'sales', contextKey, now }));
      assert.equal(new Set(selected.map(card => card.id)).size, 3, contextKey ?? 'shelf');
      assert.ok(selected.every(card => broadlyApplicable.has(card.id) ||
        (contextKey === 'sales:new' && card.id === 'sales-ross-fit')),
      contextKey ?? 'shelf');
      const seen = selectedByContext.get(contextKey) ?? new Set();
      selected.forEach(card => seen.add(card.id));
      selectedByContext.set(contextKey, seen);
    }
  }
  for (const id of broadlyApplicable) {
    const card = GURU_CARDS.find(item => item.id === id);
    assert.deepEqual(card?.contexts, stages, id);
  }
  assert.equal(GURU_CARDS.find(card => card.id === 'sales-ross-fit')?.requiresMatchedContext, true);
  assert.ok(selectedByContext.get('sales:new').has('sales-ross-fit'));
  assert.ok(!selectedByContext.get(undefined).has('sales-ross-fit'));
  assert.ok(!selectedByContext.get('sales:unknown').has('sales-ross-fit'));
  assert.ok(!selectedByContext.get('sales:active').has('sales-ross-fit'));
  assert.ok(!selectedByContext.get('sales:dormant').has('sales-ross-fit'));
});

test('Harry Dry first-line checklist links to his direct primary post', () => {
  const card = GURU_CARDS.find(item => item.id === 'content-three-tests');
  assert.equal(card?.source.url,
    'https://www.linkedin.com/posts/harrydry_three-tests-for-any-line-you-write-activity-7219696153288683521-ao7k');
});

test('new sales mentor cards use primary sources and distinguish Moonlight applications', () => {
  for (const personId of [
    'zig-ziglar', 'dale-carnegie', 'napoleon-hill', 'joe-girard',
    'brian-tracy', 'grant-cardone', 'jordan-belfort', 'jason-lemkin',
  ]) {
    const card = listGuidanceCardsForPerson(personId).find(item => item.domain === 'sales');
    assert.ok(card, personId);
    assert.match(card.source.url ?? '', /^https:\/\//, personId);
    assert.equal(card.source.application, 'adapted', personId);
    assert.match(guidancePromptFrame(card.id), /Moonlight 응용/, personId);
    assert.doesNotMatch(`${card.frame} ${card.text} ${card.question}`, /\d+\s*%|반드시|무조건|보장/, personId);
  }
});

test('reviewed cards distinguish source ideas from Moonlight applications', () => {
  const cards = [...GURU_CARDS, ...LEGEND_CARDS];
  for (const id of ['content-hook', 'legend-buffett']) {
    assert.equal(cards.find(card => card.id === id)?.source.application, 'adapted');
    assert.match(guidancePromptFrame(id), /Moonlight 응용/);
  }
  assert.equal(cards.find(card => card.id === 'legend-carnegie')?.source.url, 'https://www.dalecarnegie.com/en/culture');
  assert.match(cards.find(card => card.id === 'marketing-smallest-market')?.person ?? '', /고객군/);
});

test('Seoul Guru windows change at 09:00, 14:00, and 19:00, with evening held overnight', () => {
  const justBeforeMorning = new Date('2026-09-23T23:59:59Z');
  const morning = new Date('2026-09-24T00:00:00Z');
  const afternoon = new Date('2026-09-24T05:00:00Z');
  const evening = new Date('2026-09-24T10:00:00Z');
  const overnight = new Date('2026-09-24T15:00:00Z');
  assert.deepEqual(guidanceDailyWindow(justBeforeMorning), {
    key: '2026-09-23@2', date: '2026-09-23', slot: 2,
    label: '저녁', nextAt: '2026-09-24T00:00:00.000Z',
  });
  assert.deepEqual(guidanceDailyWindow(morning), {
    key: '2026-09-24@0', date: '2026-09-24', slot: 0,
    label: '오전', nextAt: '2026-09-24T05:00:00.000Z',
  });
  assert.equal(guidanceDailyWindow(afternoon).key, '2026-09-24@1');
  assert.equal(guidanceDailyWindow(evening).key, '2026-09-24@2');
  assert.equal(guidanceDailyWindow(overnight).key, '2026-09-24@2');
  assert.equal(guidancePeriodKey('daily', overnight), '2026-09-25', 'calendar date stays available separately');
});

test('Guru rotation is stable inside each window and shows three different cards per domain each day', () => {
  const slots = [
    new Date('2026-09-24T00:00:00Z'),
    new Date('2026-09-24T05:00:00Z'),
    new Date('2026-09-24T10:00:00Z'),
  ];
  for (const domain of ['sales', 'marketing', 'content']) {
    const ids = slots.map(now => selectGuidanceCard({ cadence: 'daily', domain, now }).id);
    assert.equal(new Set(ids).size, 3, domain);
    assert.equal(
      selectGuidanceCard({ cadence: 'daily', domain, now: new Date('2026-09-24T04:59:59Z') }).id,
      ids[0],
    );
  }
});

test('weekly Legend selection changes only at the Seoul Monday boundary', () => {
  const sunday = new Date('2026-09-27T14:59:00Z');
  const monday = new Date('2026-09-27T15:00:00Z');
  assert.notEqual(guidancePeriodKey('weekly', sunday), guidancePeriodKey('weekly', monday));
  assert.ok(LEGEND_CARDS.some(card => card.id === selectGuidanceCard({ cadence: 'weekly', now: monday }).id));
});

test('domain filtering and manual offset do not change another domain', () => {
  const now = new Date('2026-09-24T00:00:00Z');
  const sales = listGuidanceCards({ cadence: 'daily', domain: 'sales' });
  const marketing = listGuidanceCards({ cadence: 'daily', domain: 'marketing' });
  assert.ok(sales.length >= 2 && marketing.length >= 2);
  assert.ok(sales.every(card => card.domain === 'sales'));
  assert.notEqual(selectGuidanceCard({ cadence: 'daily', domain: 'sales', now, offset: 0 }).id,
    selectGuidanceCard({ cadence: 'daily', domain: 'sales', now, offset: 1 }).id);
  assert.equal(selectGuidanceCard({ cadence: 'daily', domain: 'marketing', now, offset: 0 }).id,
    selectGuidanceCard({ cadence: 'daily', domain: 'marketing', now, offset: 0 }).id);
});

test('selected frame names its source without turning a tip into a required action', () => {
  const frame = guidancePromptFrame('sales-meddic');
  assert.match(frame, /Dick Dunkel/);
  assert.match(frame, /검토가 길어지면/);
  assert.match(frame, /제안 후 내부 검토/);
  assert.match(frame, /이 카드의 추천 적용 상황\(Moonlight 편집 기준/);
  assert.doesNotMatch(frame, /적용할 때:/);
  assert.match(frame, /카드의 예시 질문/);
  assert.match(frame, /docs\/sales-guru-knowledge-base\.md/);
  assert.match(frame, /https:\/\/meddicc\.com\/resources\/who-created-meddic/);
  assert.match(frame, /원전 본문을 직접 읽은 것으로 주장하지/);
  assert.doesNotMatch(frame, /work_order|승인 큐|반드시.*다음/);
  assert.equal(guidancePromptFrame('missing-card'), '');
});

test('prior card source resolves only for an explicit follow-up reference within bounded chat history', () => {
  assert.equal(typeof referencedPriorCardId, 'function');
  const cardTurn = { question: '무엇을 물을까요?', answer: '현재 방식을 물어보세요.', guidanceId: 'sales-gap' };
  assert.equal(referencedPriorCardId('방금 Keenan 카드의 출처는?', [cardTurn]), 'sales-gap');
  assert.equal(referencedPriorCardId('방금 질문을 짧게 바꿔주세요.', [cardTurn]), 'sales-gap');
  assert.equal(referencedPriorCardId('이번 주 일정은?', [cardTurn]), null);
  assert.equal(referencedPriorCardId('그 카드 출처는?', [cardTurn, { question: '별개 일정', answer: '일정' }]), null);
  assert.equal(referencedPriorCardId('Keenan 카드 출처는?', [{ guidanceId: 'marketing-research' }]), null);
  assert.equal(referencedPriorCardId('Keenan 카드 출처는?', [cardTurn, {}, {}, {}]), null);
});

test('every published card has an HTTPS source, with editorial applications labeled separately', () => {
  const cards = [...GURU_CARDS, ...LEGEND_CARDS];
  for (const card of cards) {
    assert.match(card.source.url ?? '', /^https:\/\/[^\s]+$/, card.id);
  }
  assert.equal(cards.find(item => item.id === 'legend-carnegie')?.source.application, 'adapted');
});

test('screen context limits rotation to applicable cards without diagnosing a customer', () => {
  const slots = [0, 5, 10].map(hour => new Date(`2026-09-24T${String(hour).padStart(2, '0')}:00:00Z`));
  for (const [domain, contextKey] of [
    ['sales', 'sales:new'], ['sales', 'sales:active'], ['sales', 'sales:dormant'],
    ['marketing', 'marketing:audience-unrecorded'], ['marketing', 'marketing:promise-unrecorded'],
    ['content', 'content:idea'], ['content', 'content:draft'], ['content', 'content:review'],
  ]) {
    assert.ok(GURU_CARDS.filter(card => card.domain === domain && card.contexts?.includes(contextKey)).length >= 4, contextKey);
    const cards = slots.map(now => selectGuidanceCard({ cadence: 'daily', domain, contextKey, now }));
    assert.equal(new Set(cards.map(card => card.id)).size, 3, contextKey);
    assert.ok(cards.every(card => Array.isArray(card.contexts) && card.contexts.includes(contextKey)), contextKey);
    const nextMorning = selectGuidanceCard({ cadence: 'daily', domain, contextKey, now: new Date('2026-09-25T00:00:00Z') });
    assert.notEqual(nextMorning.id, cards[0].id, `${contextKey} should not replay the identical morning card each day`);
  }
  const invalid = selectGuidanceCard({ cadence: 'daily', domain: 'sales', contextKey: 'content:idea', now: slots[0] });
  assert.equal(invalid.id, selectGuidanceCard({ cadence: 'daily', domain: 'sales', now: slots[0] }).id);
});

test('Feynman card follows the cited integrity address rather than an unrelated explanation trick', () => {
  const card = LEGEND_CARDS.find(item => item.id === 'legend-feynman');
  assert.match(`${card?.frame} ${card?.text} ${card?.question}`, /불리한 근거|반례/);
  assert.doesNotMatch(`${card?.frame} ${card?.text} ${card?.question}`, /한 문장|전문 용어/);
});

test('the legend library is the one ordered source of all sixteen Council legends', () => {
  assert.deepEqual([...LEGEND_IDS], [
    'socrates', 'einstein', 'lincoln', 'theodore-roosevelt', 'franklin-roosevelt',
    'jobs', 'bezos', 'buffett', 'chouinard',
    'feynman', 'deming', 'drucker', 'ostrom', 'epictetus',
    'carnegie', 'hill',
  ]);
  assert.deepEqual(LEGEND_LIBRARY.map(entry => entry.id), [...LEGEND_IDS]);
  assert.deepEqual(Object.keys(LEGEND_MICRO_CARDS), [...LEGEND_IDS]);
  for (const entry of LEGEND_LIBRARY) {
    for (const field of RUNTIME_FIELDS) {
      assert.ok(typeof entry[field] === 'string' && entry[field].trim(), `${entry.id}.${field}`);
    }
    assert.ok(['philosophy', 'science', 'management', 'governance', 'resilience'].includes(entry.category), entry.id);
    assert.equal(entry.version, LEGEND_LIBRARY_VERSION);
    assert.match(entry.version, /^\d{4}-\d{2}-\d{2}\.\d+$/);
    assert.equal(entry.status, 'active');
    assert.equal(getLegendEntry(entry.id), entry);
    assert.deepEqual(Object.keys(LEGEND_MICRO_CARDS[entry.id]), RUNTIME_FIELDS);
    assert.deepEqual(LEGEND_MICRO_CARDS[entry.id], toLegendMicroCard(entry));
  }
  assert.equal(getLegendEntry('chouinard').category, 'management', 'the Engine category is canonical');
  assert.ok(Object.isFrozen(LEGEND_MICRO_CARDS) && Object.isFrozen(LEGEND_MICRO_CARDS.bezos));
  assert.ok(Object.isFrozen(LEGEND_LIBRARY) && Object.isFrozen(LEGEND_LIBRARY[0].originRefs[0]));
});

test('Legend ids are validated by exact library membership, never by object prototype keys', () => {
  for (const id of LEGEND_IDS) assert.equal(isLegendId(id), true, id);
  for (const value of ['constructor', '__proto__', 'toString', '', 'unknown', 'Bezos', null, undefined, 7, ['bezos']]) {
    assert.equal(isLegendId(value), false, String(value));
  }
  assert.equal(getLegendEntry('constructor'), undefined);
});

test('every legend links to the exact heading of its original card text', () => {
  const headings = new Map();
  const headingsOf = path => {
    if (!headings.has(path)) {
      headings.set(path, new Set(readDoc(path).split('\n').filter(line => /^#{1,6} /.test(line)).map(line => line.replace(/^#{1,6} /, ''))));
    }
    return headings.get(path);
  };
  const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  LEGEND_LIBRARY.forEach((entry, index) => {
    const micro = entry.originRefs.filter(ref => ref.kind === 'micro-card');
    const long = entry.originRefs.filter(ref => ref.kind === 'long-card');
    assert.equal(micro.length, 1, entry.id);
    assert.equal(micro[0].path, 'docs/superpowers/specs/2026-09-21-council-mentor-guru-legend-operating-framework.md');
    assert.match(micro[0].heading, new RegExp(`^${index + 1}\\. .+ \\(${escape(entry.name)}\\) — `), entry.id);
    assert.equal(long.length, index < 9 ? 1 : 0, `${entry.id}: only the core nine have a 09-12 long card`);
    if (long.length) {
      assert.equal(long[0].path, 'docs/superpowers/specs/2026-09-12-legend-values-persona-cards.md');
      assert.match(long[0].heading, new RegExp(`^3\\.${index + 1} `), entry.id);
    }
    for (const ref of entry.originRefs) {
      assert.ok(headingsOf(ref.path).has(ref.heading), `${entry.id}: ${ref.path} § ${ref.heading}`);
    }
  });
});

test('Legend source URLs are links the governing docs give, and Hill has none', () => {
  const docs = [
    'docs/superpowers/specs/2026-09-12-legend-values-persona-cards.md',
    'docs/superpowers/specs/2026-09-12-council-mentor-legend-evaluation-design.md',
    'docs/research/2026-09-24-guru-source-quality.md',
  ].map(readDoc).join('\n');
  for (const entry of LEGEND_LIBRARY) {
    assert.equal(new Set(entry.sourceUrls).size, entry.sourceUrls.length, entry.id);
    for (const url of entry.sourceUrls) {
      assert.match(url, /^https:\/\/\S+$/, entry.id);
      assert.ok(docs.includes(`](${url})`), `${entry.id}: ${url} is not a link in the governing docs`);
    }
    if (entry.id !== 'hill') assert.ok(entry.sourceUrls.length >= 1, entry.id);
  }
  assert.deepEqual(getLegendEntry('hill').sourceUrls, []);
});

test('Legend pivots and questions use observable events instead of made-up percentages', () => {
  for (const entry of LEGEND_LIBRARY) {
    assert.doesNotMatch(entry.pivotCondition, /\d+\s*%|퍼센트/, entry.id);
  }
  const bezos = getLegendEntry('bezos').piercingQuestion;
  assert.doesNotMatch(bezos, /\d+\s*%|퍼센트|지금 당장/);
  assert.match(bezos, /되돌릴 수 있고 손실을 감당할 수 있는/);
  assert.match(bezos, /무엇이 확인되면 멈추/);
  assert.doesNotMatch(getLegendEntry('drucker').piercingQuestion, /\d+\s*%|퍼센트/);
  const feynman = getLegendEntry('feynman');
  assert.doesNotMatch(Object.values(toLegendMicroCard(feynman)).join(' '), /초등학생|전문 용어/);
  assert.match(feynman.sourceCitation, /Cargo Cult Science/);
});

test('weekly Legend cards keep their ids and cite the shared library by legend id', () => {
  assert.deepEqual(LEGEND_CARDS.map(card => card.id), ['legend-buffett', 'legend-feynman', 'legend-carnegie']);
  for (const card of LEGEND_CARDS) {
    assert.equal(card.source.path, 'packages/guru-guidance/legend-library.ts', card.id);
    const entry = getLegendEntry(card.source.section);
    assert.ok(entry, card.id);
    assert.equal(card.id, `legend-${entry.id}`);
    assert.ok(card.person.startsWith(`${entry.name} · `), card.id);
    assert.ok(entry.sourceUrls.includes(card.source.url), card.id);
  }
});

test('weekly Legend keeps this and next week, then advances one card per Seoul week', () => {
  assert.deepEqual([0, 1, 2, 3].map(week => selectGuidanceCard({ cadence: 'weekly', now: seoulMonday(week) }).id),
    ['legend-carnegie', 'legend-buffett', 'legend-feynman', 'legend-carnegie']);
  assert.equal(selectGuidanceCard({ cadence: 'weekly', now: new Date('2026-09-27T15:00:00Z') }).id, 'legend-buffett', 'Monday 00:00 Seoul');
  assert.equal(selectGuidanceCard({ cadence: 'weekly', now: new Date('2026-10-04T14:59:00Z') }).id, 'legend-buffett', 'Sunday 23:59 Seoul');
  assert.equal(selectGuidanceCard({ cadence: 'weekly', now: seoulMonday(0), offset: 1 }).id, 'legend-buffett');
});

test('weekly rotation visits every card once per cycle for catalogues of 3, 7, 14 and 16', () => {
  for (const length of [3, 7, 14, 16]) {
    const indexes = Array.from({ length }, (_, week) => guidanceRotationIndex({ cadence: 'weekly', now: seoulMonday(week), length }));
    assert.equal(new Set(indexes).size, length, `${length} cards`);
    indexes.forEach((index, week) => {
      if (week) assert.equal(index, (indexes[week - 1] + 1) % length, `${length} cards, week ${week}`);
    });
    assert.equal(guidanceRotationIndex({ cadence: 'weekly', now: seoulMonday(length), length }), indexes[0], `${length}-card cycle repeats`);
    assert.equal(guidanceRotationIndex({ cadence: 'weekly', now: seoulMonday(0), offset: 1, length }), indexes[1]);
  }
  assert.throws(() => guidanceRotationIndex({ cadence: 'weekly', now: seoulMonday(0), length: 0 }), RangeError);
});

test('MEDDIC reference credits its origin and omits an unsupported win-rate multiplier', () => {
  const playbook = readFileSync(resolve(repoRoot, 'docs/sales-guru-knowledge-base.md'), 'utf8');
  const section = playbook.split('Qualification — MEDDIC 프레임워크')[1]?.split('## 🔑 Aaron Ross')[0] ?? '';
  assert.match(section, /Dick Dunkel/);
  assert.match(section, /Jack Napoli/);
  assert.doesNotMatch(section, /클로징률\s*3배/);
});
