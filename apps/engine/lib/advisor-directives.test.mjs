import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatValuesDirective,
  formatKnowledgeDirective,
  assembleDirectives,
  resolveDirectives,
  DEFAULT_OPERATOR_VALUES,
  DEFAULT_SALES_KNOWLEDGE,
  DEFAULT_BRAND_KNOWLEDGE,
} from './advisor-directives.ts';

test('formatValuesDirective formats core values, acceptable costs, and legend lenses', () => {
  const values = {
    coreValues: ['지적 정직성', '가역적 학습 속도'],
    acceptableCosts: ['단기 확신 포기'],
    tradeOffRules: ['신뢰 > 속도'],
    pivotConditions: ['반례 관찰 시 수정'],
    legendIds: ['socrates', 'bezos'],
  };

  const output = formatValuesDirective(values);
  assert.ok(output.includes('[가치관 지침 (Values Directives)]'));
  assert.ok(output.includes('지적 정직성'));
  assert.ok(output.includes('단기 확신 포기'));
  assert.ok(output.includes('신뢰 > 속도'));
  assert.ok(output.includes('소크라테스'));
  assert.ok(output.includes('제프 베이조스'));
});

test('formatValuesDirective returns empty string for empty or null inputs', () => {
  assert.equal(formatValuesDirective(null), '');
  assert.equal(formatValuesDirective({}), '');
});

test('formatKnowledgeDirective formats domain, facts, playbooks, rules, and retrieved snippets', () => {
  const knowledge = {
    domain: 'classin-sales',
    facts: ['ClassIn B2B 교육 영업'],
    playbooks: ['Keenan GAP 4층'],
    rules: ['CRM push 금지'],
    forbidden: ['혁신적 버즈워드 금지'],
    retrievedSnippets: [
      { id: 'sn-1', title: '고객 미팅 메모', snippet: '학원장이 계약 일정을 10월로 희망함' },
    ],
  };

  const output = formatKnowledgeDirective(knowledge);
  assert.ok(output.includes('[도메인 지식 지침 (Knowledge Directives)]'));
  assert.ok(output.includes('classin-sales'));
  assert.ok(output.includes('ClassIn B2B 교육 영업'));
  assert.ok(output.includes('Keenan GAP 4층'));
  assert.ok(output.includes('CRM push 금지'));
  assert.ok(output.includes('혁신적 버즈워드 금지'));
  assert.ok(output.includes('고객 미팅 메모'));
});

test('formatKnowledgeDirective returns empty string for empty or null inputs', () => {
  assert.equal(formatKnowledgeDirective(null), '');
  assert.equal(formatKnowledgeDirective({}), '');
});

test('assembleDirectives combines both values and knowledge blocks', () => {
  const config = {
    values: { coreValues: ['지적 정직성'] },
    knowledge: { facts: ['핵심 팩트'] },
  };
  const assembled = assembleDirectives(config);
  assert.ok(assembled.includes('[가치관 지침 (Values Directives)]'));
  assert.ok(assembled.includes('[도메인 지식 지침 (Knowledge Directives)]'));
  assert.ok(assembled.includes('지적 정직성'));
  assert.ok(assembled.includes('핵심 팩트'));
});

test('resolveDirectives returns default domain values and knowledge when context is empty', () => {
  const salesDirectives = resolveDirectives('sales-mentor', null, {});
  assert.equal(salesDirectives.knowledge?.domain, 'classin-sales');
  assert.deepEqual(salesDirectives.values?.coreValues, DEFAULT_OPERATOR_VALUES.coreValues);
  assert.deepEqual(salesDirectives.knowledge?.facts, DEFAULT_SALES_KNOWLEDGE.facts);

  const brandDirectives = resolveDirectives('brand-mentor', null, {});
  assert.equal(brandDirectives.knowledge?.domain, 'personal-brand');
  assert.deepEqual(brandDirectives.knowledge?.facts, DEFAULT_BRAND_KNOWLEDGE.facts);
});

test('resolveDirectives honors explicit overrides from payload or context', () => {
  const customValues = { coreValues: ['단 하나의 본질 집중'] };
  const customKnowledge = { facts: ['시나브로 론칭 준비'] };

  const resolved = resolveDirectives('brand-mentor', { values: customValues }, { knowledge: customKnowledge });
  assert.deepEqual(resolved.values?.coreValues, ['단 하나의 본질 집중']);
  assert.deepEqual(resolved.knowledge?.facts, ['시나브로 론칭 준비']);
});
