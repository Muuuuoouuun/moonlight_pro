import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { GURU_CARDS } from './index.ts';
import { guidanceSourceExcerpt, guidanceSourcePrompt, SOURCE_PROMPT_MAX_CHARS } from './source-prompt.js';

const doc = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
const between = (prompt) => prompt.slice(prompt.indexOf('<<<원문 시작>>>\n') + '<<<원문 시작>>>\n'.length, prompt.indexOf('\n<<<원문 끝>>>'));

test('every Guru card resolves to a verbatim excerpt of its own source document', () => {
  for (const card of GURU_CARDS) {
    const excerpt = guidanceSourceExcerpt(card.id);
    assert.ok(excerpt, card.id);
    assert.ok(excerpt.text.trim().length > 0, card.id);
    // 원문 그대로 — 요약·재작성이 끼면 이 부분 문자열 검사가 깨진다.
    assert.ok(doc(excerpt.entry.docPath).includes(excerpt.text), `${card.id} is not a verbatim slice`);
    assert.ok(excerpt.text.length <= SOURCE_PROMPT_MAX_CHARS, card.id);
  }
});

test('a card sends its whole chapter and names the section it points to, not a one-line summary', () => {
  const meddic = guidanceSourceExcerpt('sales-meddic');
  assert.equal(meddic.scope, 'entry');
  assert.match(meddic.heading.text, /MEDDIC/);
  assert.ok(meddic.text.includes(meddic.heading.text), 'the focus section is inside the excerpt');
  assert.equal(meddic.text, doc(meddic.entry.docPath).split('\n').slice(meddic.entry.startLine - 1, meddic.entry.endLine).join('\n').replace(/\s+$/, ''));
  assert.match(guidanceSourcePrompt('sales-meddic'), /카드가 가리키는 절: 기법 4: Qualification — MEDDIC 프레임워크/);

  // 장 제목 자체를 가리키는 카드(Carnegie)도 제목 한 줄이 아니라 장 전체를 받는다.
  const carnegie = guidanceSourceExcerpt('sales-carnegie-listen');
  assert.ok(carnegie.text.length > 2000, `only ${carnegie.text.length} chars`);
  assert.match(carnegie.text, /How to Win Friends/);
  for (const card of GURU_CARDS) assert.ok(guidanceSourceExcerpt(card.id).text.length > 800, card.id);
});

test('a chapter over the cap falls back to the card section with subtitle-aware bounds', () => {
  const voss = guidanceSourceExcerpt('sales-voss-feasibility', { maxChars: 1500 });
  assert.equal(voss.scope, 'section');
  // "### 핵심 프레임워크 3" 바로 아래의 같은 수준 부제에서 끊지 않는다.
  assert.match(voss.text, /^### 핵심 프레임워크 3: \*\*Calibrated Questions\*\*\n### "보정된 질문/);
  assert.match(voss.text, /Voss의 핵심 발견/);
});

test('the prompt block carries location, the guard and the untouched original between markers', () => {
  const prompt = guidanceSourcePrompt('sales-carnegie-listen');
  const excerpt = guidanceSourceExcerpt('sales-carnegie-listen');
  assert.match(prompt, /^\[플레이북 원문 — 운영자가 고른 카드의 출처, 글자 그대로\]/);
  assert.match(prompt, /docs\/sales-guru-knowledge-base\.md\) \d+–\d+줄/);
  assert.match(prompt, /인용문·수치·성과 주장·사례 문구를 답변에 옮기거나 사실처럼 말하지 마십시오/);
  assert.match(prompt, /원전\(책·강연\)이 아닙니다/);
  assert.match(prompt, /원장 사실이 아닙니다/);
  assert.equal(between(prompt), excerpt.text);
});

test('an adapted card keeps its application limit next to the original', () => {
  const prompt = guidanceSourcePrompt('sales-cardone-own-effort');
  assert.match(prompt, /응용 범위: .*반복 접촉·압박이나 성과 보장을 권하지 않음/);
  assert.match(prompt, /압박식 설득·클로징이나 반복 접촉을 권하는 기법이 있어도 권하지 마십시오/);
});

test('a long section is cut at a line boundary and says how much was left out', () => {
  const excerpt = guidanceSourceExcerpt('sales-meddic', { maxChars: 400 });
  assert.equal(excerpt.scope, 'section');
  assert.equal(excerpt.truncated, true);
  assert.ok(excerpt.text.length <= 400);
  assert.ok(doc(excerpt.entry.docPath).includes(`${excerpt.text}\n`), 'cut mid-line');
  const prompt = guidanceSourcePrompt('sales-meddic', { maxChars: 400 });
  assert.match(prompt, /원문 [\d,]+자 중 앞 [\d,]+자만 담았습니다/);
});

test('unknown ids and weekly Legend cards never produce an excerpt', () => {
  assert.equal(guidanceSourcePrompt('invented-card'), '');
  assert.equal(guidanceSourcePrompt('legend-buffett'), '');
  assert.equal(guidanceSourcePrompt(''), '');
  assert.equal(guidanceSourcePrompt(undefined), '');
});
