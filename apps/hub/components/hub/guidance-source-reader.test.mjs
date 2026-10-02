import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GURU_CARDS, LEGEND_CARDS } from '@com-moon/guru-guidance';
import * as library from '@com-moon/guru-guidance/source-library';
import {
  GuidanceSourceReader,
  SourceReaderView,
  allSectionKeys,
  buildEntryView,
  buildReaderModel,
  defaultOpenKeys,
  loadSourceLibrary,
  provenanceText,
  toggleOpenKey,
} from './guidance-source-reader.jsx';

const source = readFileSync(new URL('./guidance-source-reader.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('./guidance-source-reader.css', import.meta.url), 'utf8');
const card = id => [...GURU_CARDS, ...LEGEND_CARDS].find(item => item.id === id);
const render = props => renderToStaticMarkup(React.createElement(GuidanceSourceReader, { library, ...props }));
const expandedStates = html => [...html.matchAll(/class="source-reader__toggle hub-row" aria-expanded="(true|false)"/g)].map(match => match[1]);
const decode = text => text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

test('the library loads lazily through a dynamic import, never a static one', async () => {
  assert.match(source, /import\('@com-moon\/guru-guidance\/source-library'\)/);
  assert.doesNotMatch(source, /^import[^\n]*source-library/m, 'no static import of the full originals');
  const first = loadSourceLibrary();
  assert.equal(loadSourceLibrary(), first, 'one request per page, reused by every reader');
  const loaded = await first;
  assert.equal(typeof loaded.resolveCardSource, 'function');
  assert.ok(loaded.SOURCE_ENTRIES.length > 90);
});

test('while loading, the reader says so honestly instead of showing old or partial text', () => {
  const html = renderToStaticMarkup(React.createElement(GuidanceSourceReader, { card: card('sales-gap'), label: 'Keenan · GAP Selling', loadLibrary: () => new Promise(() => {}) }));
  assert.match(html, /data-status="loading"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /role="status" aria-busy="true" aria-label="원문 불러오는 중"/);
  assert.match(html, /data-truth="loading"/);
  assert.match(html, /aria-label="Keenan · GAP Selling 원문"/);
  assert.doesNotMatch(html, /원문 그대로/);
});

test('a failed load shows a plain error with a retry, never an empty success', () => {
  const html = renderToStaticMarkup(React.createElement(SourceReaderView, { status: 'error', model: null, label: 'Keenan', onRetry: () => {} }));
  assert.match(html, /role="alert"/);
  assert.match(html, /data-truth="error"[^>]*>[\s\S]*원문을 불러오지 못했습니다/);
  assert.match(html, /<button[^>]*>다시 불러오기<\/button>/);
  assert.doesNotMatch(html, /원문 그대로|찾지 못했습니다/);
});

test('a card opens its person chapter with provenance, an honesty label, a contents list and the first section open', () => {
  const entry = library.getPersonSource('zig-ziglar');
  const html = render({ card: card('sales-ziglar-help'), onClose: () => {} });
  assert.match(html, /data-status="ready"/);
  assert.ok(decode(html).includes(`원문 그대로 · 세일즈 구루 완전 정복 플레이북 ${entry.startLine}–${entry.endLine}줄 · ${entry.charCount.toLocaleString('ko-KR')}자`));
  assert.match(html, /data-certainty="unknown" aria-label="확정도: 확인 필요"/);
  assert.match(html, /원전 대조 일부 · 인용·수치는 확인 전/);
  assert.match(html, /<summary>확인 범위<\/summary>/);
  assert.match(html, /기준 · Guru 참고 자료 출처 점검 — 2026-09-24/);
  assert.doesNotMatch(html, /docs\/[\w./-]+\.md/, 'repository paths stay off the screen');
  assert.match(html, /<nav class="source-reader__toc" aria-label="Zig Ziglar 목차">/);
  for (const title of ['📖 핵심 철학 &amp; 마인드셋', '📚 책 요약 &amp; 프레임워크', '🎯 실전 기법 &amp; 스크립트', '🔑 Ziglar 핵심 공식 요약']) {
    assert.ok(html.includes(title), title);
  }
  assert.deepEqual(expandedStates(html), ['true', 'false', 'false', 'false']);
  assert.match(html, /You can have everything in life you want/, 'the open section shows the verbatim text');
  assert.doesNotMatch(html, /Porcupine Technique/, 'closed sections are not rendered until opened');
  assert.match(html, /<h5 id="[^"]+" class="source-reader__title" tabindex="-1">🏆 올타임 레전드 Vol\.1 — Zig Ziglar<\/h5>/);
  assert.match(html, /<h6 class="source-reader__section-heading"><button/);
  assert.doesNotMatch(html, /<h[12][\s>]/);
  assert.match(html, /<button[^>]*>원문 닫기<\/button>/);
  assert.match(html, /<button[^>]*>모두 펼치기<\/button>/);
});

test('a card whose section lives in another chapter says where it is and opens that section', () => {
  const html = render({ card: card('sales-meddic') });
  assert.match(html, /이 카드의 근거 절은 Aaron Ross 원문 안에 있습니다\./);
  assert.deepEqual(expandedStates(html), ['false', 'false', 'false', 'true', 'false'], '실전 기법 & 스크립트 holds MEDDIC');
  const meddic = library.resolveCardSource(card('sales-meddic')).heading;
  assert.match(html, new RegExp(`id="[^"]+-l${meddic.line}" class="source-md__heading" tabindex="-1">기법 4: <strong>Qualification — MEDDIC 프레임워크</strong>`));
  assert.doesNotMatch(render({}), /data-status="ready"[\s\S]*원문 그대로/, 'no source → no text');
});

test('the weekly Legend opens its 2026-09-12 long card and 2026-09-21 micro-card by card id', () => {
  const buffett = card('legend-buffett');
  const html = render({ card: { ...buffett, source: { ...buffett.source, path: 'moved/elsewhere.ts' } }, headingLevel: 4 });
  const [longCard, microCard] = library.getLegendSources('buffett');
  assert.ok(decode(html).includes(`원문 그대로 · Legend 9인 — 가치관과 판단 기준 개발안 ${longCard.startLine}–${longCard.endLine}줄`));
  assert.ok(decode(html).includes(`원문 그대로 · Council · Mentor · Guru · Legend 통합 운영 체계 및 고도화 지침 ${microCard.startLine}–${microCard.endLine}줄`));
  assert.ok(html.indexOf(longCard.title) < html.indexOf(microCard.title.replace(/&/g, '&amp;')), 'long card first');
  assert.equal((html.match(/출처 점검 전 · 인용·수치는 확인 전/g) || []).length, 2);
  assert.match(html, /<h4 id="[^"]+" class="source-reader__title"/);
  assert.match(html, /1996년 주주서한/);
  assert.match(html, /능력 범위/);
  assert.doesNotMatch(html, /source-reader__toc|모두 펼치기/, 'single-section cards need no contents list');
  const feynman = render({ card: card('legend-feynman') });
  assert.equal((feynman.match(/class="source-reader__entry"/g) || []).length, 1, 'no 09-12 long card exists for Feynman');
});

test('people without a card, explicit entries, card ids and a focus heading all work without page context', () => {
  const hormozi = render({ personId: 'alex-hormozi' });
  assert.match(hormozi, /02\. Alex Hormozi/);
  assert.match(hormozi, /콘텐츠 스토리텔링 인물 심층 분해 v2/);
  assert.match(hormozi, /원전 대조 일부 · 인용·수치는 확인 전/);
  const byId = render({ cardId: 'sales-gap' });
  assert.match(byId, /테크\/SaaS 구루 Vol\.3 — Keenan/);
  const explicit = render({ entryIds: ['marketing.comparison', 'missing.entry'] });
  assert.equal((explicit.match(/class="source-reader__entry"/g) || []).length, 1, 'unknown ids are skipped, not invented');
  assert.match(explicit, /<h5 id="[^"]+" class="source-reader__title" tabindex="-1">4\. 세 구루 비교 분석<\/h5>/);
  const focused = render({ personId: 'chris-voss', focusHeading: 'Mirroring' });
  const voss = library.getPersonSource('chris-voss');
  const mirroring = library.findSourceHeading([voss], 'Mirroring').heading;
  assert.equal(mirroring.text, '핵심 프레임워크 6: **Mirroring**');
  const view = buildEntryView(voss);
  const holder = view.sections.findIndex(section => mirroring.line >= section.heading.line && mirroring.line <= section.endLine);
  assert.equal(view.sections[holder].heading.text, '📚 책 요약 & 프레임워크');
  const states = expandedStates(focused);
  assert.equal(states[holder], 'true');
  assert.equal(states.filter(state => state === 'true').length, 1, 'the focused section opens instead of the first');
  assert.match(focused, new RegExp(`id="[^"]+-l${mirroring.line}" class="source-md__heading" tabindex="-1">핵심 프레임워크 6: <strong>Mirroring</strong>`));
  const missing = render({ card: { id: 'x', kind: 'guru', personId: 'nobody', source: { path: 'docs/none.md', title: '없는 플레이북', section: '없음' } } });
  assert.match(missing, /연결된 원문을 찾지 못했습니다 · 없는 플레이북/);
  assert.doesNotMatch(missing, /docs\/none\.md/);
});

test('open-state helpers back the section toggles and 모두 펼치기/접기', () => {
  const model = buildReaderModel(library, { card: card('sales-meddic') });
  const all = allSectionKeys(model);
  assert.equal(all.length, 5);
  assert.deepEqual(defaultOpenKeys(model), [all[3]]);
  assert.deepEqual(toggleOpenKey([all[3]], all[0]), [all[3], all[0]]);
  assert.deepEqual(toggleOpenKey([all[3]], all[3]), []);
  const allOpen = renderToStaticMarkup(React.createElement(SourceReaderView, { status: 'ready', model, openKeys: all, onToggle: () => {}, onToggleAll: () => {} }));
  assert.deepEqual(expandedStates(allOpen), ['true', 'true', 'true', 'true', 'true']);
  assert.match(allOpen, /<button[^>]*>모두 접기<\/button>/);
  assert.match(allOpen, /Predictable Revenue System/);
  const closed = renderToStaticMarkup(React.createElement(SourceReaderView, { status: 'ready', model, openKeys: [] }));
  assert.equal((closed.match(/class="source-reader__body" hidden=""/g) || []).length, 5);
  assert.ok(provenanceText(model.entries[0]).startsWith('원문 그대로 · 세일즈 구루 완전 정복 플레이북 '));
});

test('entry views keep every line: intro subtitles stay visible and legend cards are all body', () => {
  for (const entry of library.SOURCE_ENTRIES.filter(item => item.kind === 'person')) {
    const view = buildEntryView(entry);
    const pieces = [view.intro?.markdown ?? '', ...view.sections.map(section => section.markdown)].join('\n');
    const body = entry.markdown.split('\n').slice(1).filter(line => line.trim() && !/^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(line));
    for (const line of body) {
      if (view.sections.some(section => `${'#'.repeat(section.heading.level)} ${section.heading.text}` === line)) continue;
      assert.ok(pieces.includes(line), `${entry.id}: ${line.slice(0, 60)}`);
    }
  }
  const girard = buildEntryView(library.getPersonSource('joe-girard'));
  assert.match(girard.intro.markdown, /기네스북이 인정한 역사상 최고의 세일즈맨/);
  const socrates = buildEntryView(library.getSourceEntry('legend-values.socrates'));
  assert.equal(socrates.sections.length, 0);
  assert.match(socrates.intro.markdown, /\*\*원전 근거:\*\*/);
});

test('reading stays read-only and follows the Hub primitives, heading and motion contracts', () => {
  assert.doesNotMatch(source, /\bfetch\s*\(|work_order|approval|onGuidanceAsk|notify/i);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML\s*[=:{]|onMouseEnter|onMouseLeave/);
  assert.match(source, /import \{ Button, CertaintyBadge, Skeleton, TruthBadge \} from '\.\/hub-primitives'/);
  assert.match(source, /<CertaintyBadge state="unknown" label="확인 필요" \/>/);
  assert.match(source, /aria-expanded=\{open\}/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(render({ card: card('sales-gap'), headingLevel: 1 }), /<h[12][\s>]/, 'a caller cannot lift the reader to h1/h2');
});

test('reader styles use tokens, 1px lines and readable sizes, and scroll wide content in place', () => {
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(rules, /#[\da-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
  for (const [, width] of rules.matchAll(/border(?:-(?:top|bottom|left|right))?:\s*(\d+)px/g)) assert.equal(width, '1');
  for (const [, value] of rules.matchAll(/border(?:-(?:top|bottom|left|right))?:\s*1px (?:solid|dashed|dotted) ([^;]+);/g)) assert.match(value.trim(), /^var\(--line(?:-soft|-strong)?\)$/);
  for (const [, size] of rules.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(size) >= 10.5, `font-size ${size}px`);
  assert.match(rules, /\.source-md\s*\{[^}]*font-size:\s*15px;[^}]*line-height:\s*1\.8;/);
  assert.match(rules, /\.source-md__table-wrap\s*\{[^}]*max-width:\s*100%;[^}]*overflow-x:\s*auto;/);
  assert.match(rules, /\.source-md__code\s*\{[^}]*max-width:\s*100%;[^}]*overflow-x:\s*auto;/);
  assert.match(rules, /\.source-reader\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/);
  assert.match(rules, /\.source-reader__toggle\s*\{[^}]*min-height:\s*44px;/);
  assert.match(rules, /\.source-reader__chevron\s*\{[^}]*transition:\s*transform var\(--dur-hover\) var\(--ease-hub\);/);
  assert.match(rules, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.source-reader__chevron\s*\{\s*transition:\s*none;/);
});
