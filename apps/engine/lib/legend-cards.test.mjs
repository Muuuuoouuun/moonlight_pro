import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  LEGEND_IDS,
  LEGEND_MICRO_CARDS as LIBRARY_MICRO_CARDS,
} from '@com-moon/guru-guidance';
import {
  LEGEND_MICRO_CARDS,
  getLegendCard,
  getAllLegendCards,
  formatLegendMicroCard,
  formatLegendTriad,
} from './legend-cards.ts';

const CORE_9_IDS = [
  'socrates',
  'einstein',
  'lincoln',
  'theodore-roosevelt',
  'franklin-roosevelt',
  'jobs',
  'bezos',
  'buffett',
  'chouinard',
];

const EXTENSION_5_IDS = [
  'feynman',
  'deming',
  'drucker',
  'ostrom',
  'epictetus',
];

const PERSUASION_2_IDS = [
  'carnegie',
  'hill',
];

const ALL_16_IDS = [...CORE_9_IDS, ...EXTENSION_5_IDS, ...PERSUASION_2_IDS];

const VALID_CATEGORIES = new Set([
  'philosophy',
  'science',
  'management',
  'governance',
  'resilience',
]);

const REQUIRED_FIELDS = [
  'id',
  'name',
  'nameKo',
  'category',
  'coreValue',
  'acceptableCost',
  'pivotCondition',
  'piercingQuestion',
  'boundaryCondition',
  'sourceCitation',
];

const ONE_SENTENCE_FIELDS = [
  'coreValue',
  'acceptableCost',
  'pivotCondition',
  'piercingQuestion',
  'boundaryCondition',
];

describe('Legend Micro-Cards Completeness', () => {
  it('contains exactly 16 legend cards in total', () => {
    const allCards = getAllLegendCards();
    assert.equal(allCards.length, 16);
    assert.equal(Object.keys(LEGEND_MICRO_CARDS).length, 16);
  });

  it('contains all 9 core legends', () => {
    for (const id of CORE_9_IDS) {
      const card = getLegendCard(id);
      assert.ok(card, `Core legend card ${id} must exist`);
      assert.equal(card.id, id);
    }
  });

  it('contains all 5 extension legends', () => {
    for (const id of EXTENSION_5_IDS) {
      const card = getLegendCard(id);
      assert.ok(card, `Extension legend card ${id} must exist`);
      assert.equal(card.id, id);
    }
  });

  it('contains all 2 persuasion & influence legends (Carnegie and Hill)', () => {
    for (const id of PERSUASION_2_IDS) {
      const card = getLegendCard(id);
      assert.ok(card, `Persuasion legend card ${id} must exist`);
      assert.equal(card.id, id);
    }
  });

  it('returns undefined for non-existent IDs', () => {
    assert.equal(getLegendCard('unknown-legend'), undefined);
    assert.equal(getLegendCard(''), undefined);
  });
});

describe('Legend Micro-Cards Field Constraints & Brevity', () => {
  it('every card has non-null, non-empty, valid fields', () => {
    for (const id of ALL_16_IDS) {
      const card = getLegendCard(id);
      assert.ok(card, `Card ${id} should be found`);

      for (const field of REQUIRED_FIELDS) {
        const val = card[field];
        assert.ok(val !== null && val !== undefined, `${id}.${field} must not be null/undefined`);
        assert.equal(typeof val, 'string', `${id}.${field} must be a string`);
        assert.ok(val.trim().length > 0, `${id}.${field} must not be empty`);
      }

      assert.ok(VALID_CATEGORIES.has(card.category), `${id} category "${card.category}" must be valid`);
      assert.equal(card.id, id, `card.id must match key ${id}`);
    }
  });

  it('one-sentence fields satisfy single-sentence brevity and formatting constraints', () => {
    for (const id of ALL_16_IDS) {
      const card = getLegendCard(id);

      for (const field of ONE_SENTENCE_FIELDS) {
        const text = card[field];

        // 1. No internal newlines
        assert.ok(!text.includes('\n'), `${id}.${field} must not contain newlines`);
        assert.ok(!text.includes('\r'), `${id}.${field} must not contain carriage returns`);

        // 2. Length must be concise (between 10 and 160 characters)
        assert.ok(
          text.length >= 10 && text.length <= 160,
          `${id}.${field} length (${text.length}) must be between 10 and 160 characters`
        );

        // 3. No multiple sentences delimited by period/question mark followed by space and clause start
        const multipleSentenceMatch = text.match(/[.?!]\s+[가-힣A-Z]/);
        assert.equal(
          multipleSentenceMatch,
          null,
          `${id}.${field} should be exactly 1 sentence, but found potential split: "${multipleSentenceMatch?.[0]}" in "${text}"`
        );

        // 4. Ends with sentence-terminating punctuation or quote
        assert.ok(
          /[.?!)"']$/.test(text.trim()),
          `${id}.${field} must end with sentence-closing punctuation: "${text}"`
        );
      }
    }
  });
});

describe('Legend Micro-Cards Formatting Helpers', () => {
  it('formatLegendMicroCard formats card into a concise prompt chunk under 6 lines', () => {
    for (const id of ALL_16_IDS) {
      const formatted = formatLegendMicroCard(id);
      assert.ok(formatted.length > 0, `Formatted output for ${id} should not be empty`);

      const lines = formatted.split('\n');
      assert.ok(
        lines.length < 6,
        `Formatted card for ${id} must have under 6 lines, but has ${lines.length} lines`
      );
      assert.equal(lines.length, 5, `Formatted card for ${id} should be exactly 5 lines`);

      const card = getLegendCard(id);
      assert.ok(formatted.includes(card.nameKo), `Formatted output must include Korean name for ${id}`);
      assert.ok(formatted.includes(card.name), `Formatted output must include English name for ${id}`);
      assert.ok(formatted.includes(card.coreValue), `Formatted output must include coreValue for ${id}`);
      assert.ok(formatted.includes(card.acceptableCost), `Formatted output must include acceptableCost for ${id}`);
      assert.ok(formatted.includes(card.pivotCondition), `Formatted output must include pivotCondition for ${id}`);
      assert.ok(formatted.includes(card.piercingQuestion), `Formatted output must include piercingQuestion for ${id}`);
      assert.ok(formatted.includes(card.boundaryCondition), `Formatted output must include boundaryCondition for ${id}`);
    }
  });

  it('formatLegendMicroCard returns empty string for unknown card ID', () => {
    assert.equal(formatLegendMicroCard('non-existent'), '');
  });

  it('formatLegendTriad combines multiple cards into a multi-perspective prompt block', () => {
    const triadIds = ['jobs', 'bezos', 'chouinard'];
    const triadFormatted = formatLegendTriad(triadIds);

    assert.ok(triadFormatted.length > 0, 'Triad output should not be empty');

    const blocks = triadFormatted.split('\n\n');
    assert.equal(blocks.length, 3, 'Triad should contain 3 distinct card blocks separated by double newline');

    for (const id of triadIds) {
      const card = getLegendCard(id);
      assert.ok(triadFormatted.includes(card.nameKo), `Triad should include ${card.nameKo}`);
      assert.ok(triadFormatted.includes(card.coreValue), `Triad should include coreValue of ${id}`);
    }
  });

  it('formatLegendTriad handles empty and invalid IDs gracefully', () => {
    assert.equal(formatLegendTriad([]), '');
    assert.equal(formatLegendTriad(['unknown-1', 'unknown-2']), '');

    const mixed = formatLegendTriad(['socrates', 'invalid-id', 'feynman']);
    const blocks = mixed.split('\n\n');
    assert.equal(blocks.length, 2, 'Triad should filter out invalid cards and retain valid ones');
    assert.ok(mixed.includes('소크라테스'));
    assert.ok(mixed.includes('리처드 파인만'));
  });

  it('never treats object prototype keys as Legend ids', () => {
    for (const id of ['constructor', '__proto__', 'toString']) {
      assert.equal(getLegendCard(id), undefined, id);
      assert.equal(formatLegendMicroCard(id), '', id);
    }
    assert.equal(formatLegendTriad(['constructor', 'hasOwnProperty']), '');
  });
});

describe('Legend Micro-Cards Single Source', () => {
  it('serves the shared guru-guidance library text, not a local copy', () => {
    assert.equal(LEGEND_MICRO_CARDS, LIBRARY_MICRO_CARDS);
    assert.deepEqual(getAllLegendCards().map((card) => card.id), [...LEGEND_IDS]);
    assert.deepEqual([...LEGEND_IDS].sort(), [...ALL_16_IDS].sort());
  });

  it('gives the model a Bezos and Drucker card without percentage rules', () => {
    const block = formatLegendTriad(['bezos', 'drucker']);
    assert.doesNotMatch(block, /70%|퍼센트|지금 당장/);
    assert.match(formatLegendMicroCard('bezos'), /되돌릴 수 있고 손실을 감당할 수 있는 문이라면/);
    for (const card of getAllLegendCards()) {
      assert.doesNotMatch(card.pivotCondition, /\d+\s*%|퍼센트/, card.id);
    }
  });

  it('keeps persona-chat lenses Guru-only, since Legend lives only as the weekly card', () => {
    const route = readFileSync(new URL('../app/api/ai/persona-chat/route.ts', import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
    assert.doesNotMatch(route, /LEGEND_LENSES/);
    const start = route.indexOf('const GURU_LENSES');
    const block = route.slice(start, route.indexOf('\n};', start));
    const lenses = [...block.matchAll(/^ {2}([a-z]+): \{\n\s+nameKo: "([^"]+)",\n\s+rule: "([^"]+)",/gm)]
      .map(([, id, nameKo, rule]) => ({ id, nameKo, rule }));
    // agent-layer-direction §2.1 ⑧ — Legend 인물(잡스·베이조스·쉬나드·소크라테스 등)은 렌즈로 쓰지 않는다.
    assert.deepEqual(lenses.map((lens) => lens.id), ['voss', 'ogilvy', 'godin', 'rackham', 'goldratt']);
    for (const lens of lenses) assert.ok(!LEGEND_IDS.includes(lens.id), lens.id);
    for (const lens of lenses) assert.doesNotMatch(lens.rule, /\d+\s*%/, lens.id);
    const ogilvy = lenses.find((lens) => lens.id === 'ogilvy');
    assert.doesNotMatch(ogilvy.rule, /헤드라인이 80%/);
    assert.match(ogilvy.rule, /인쇄 광고/);
    // 09-24 출처 점검: SPIN은 고정 순서가 아니라 네 가지 질문 유형이다.
    const rackham = lenses.find((lens) => lens.id === 'rackham');
    assert.doesNotMatch(rackham.rule, /->/);
    assert.match(rackham.rule, /정해진 순서가 아니라/);
    // 프로토타입 키(constructor 등)는 렌즈로 받지 않는다.
    assert.match(route, /Object\.hasOwn\(GURU_LENSES, payload\.lens\)/);
  });
});
