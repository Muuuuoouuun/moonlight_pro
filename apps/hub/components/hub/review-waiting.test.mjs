import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// "AI는 끝냈고 내가 볼 것" 묶음 — docs/superpowers/specs/2026-09-26-open-ai-tools-borrowed-concepts-plan.md
// §4 11-2. 공용 컴포넌트 하나(review-waiting.jsx)를 오늘 화면·Office 하단 두 곳이 그대로 마운트한다.
// 상태 표시는 기존 프리미티브(LifecycleBadge·TruthBadge·Skeleton)만 쓰고, 0건이면 아무것도
// 그리지 않는다(표면 예산 — DESIGN.md §5.3 lifecycle·§8.1·§11).
const component = readFileSync(new URL('./review-waiting.jsx', import.meta.url), 'utf8');
const dailyBrief = readFileSync(new URL('./pages/daily-brief.jsx', import.meta.url), 'utf8');
const officeCouncil = readFileSync(new URL('./pages/office-council.jsx', import.meta.url), 'utf8');
const hubApp = readFileSync(new URL('./hub-app.jsx', import.meta.url), 'utf8');

test('ReviewWaitingList renders nothing for a zero-item live result — no empty-state card', () => {
  assert.match(component, /if \(!items\.length\) return null;/);
  // "빈 상태 카드로 자리 차지 금지" — EmptyState를 zero-item 분기에 쓰지 않는다.
  assert.doesNotMatch(component, /EmptyState/);
});

test('ReviewWaitingList uses the shared loading/preview/error primitives, never a bespoke banner', () => {
  assert.match(component, /import \{ Skeleton, TruthBadge, LifecycleBadge \} from '\.\/hub-primitives';/);
  assert.match(component, /status === 'loading'[\s\S]{0,40}<Skeleton/);
  assert.match(component, /status === 'preview'[\s\S]{0,260}<TruthBadge state="preview" \/>/);
  assert.match(component, /status === 'error'[\s\S]{0,260}<TruthBadge state="error" \/>/);
  // read 실패 봉투 계약: d.status === 'error'를 직접 읽는다(!r.ok 단독 판정 금지).
  assert.match(component, /if \(!ok \|\| !d \|\| d\.status === 'error'\)/);
});

test('ReviewWaitingList declares waiting lifecycle with the "확인 대기" reason, never a color-only cue', () => {
  assert.match(component, /<LifecycleBadge state="waiting" reason="확인 대기" \/>/);
  // 색으로 분류·빨강 금지 — danger 토큰을 쓰지 않는다.
  assert.doesNotMatch(component, /--danger/);
  assert.doesNotMatch(component, /#[0-9a-fA-F]{3,8}\b|rgba?\(/);
});

test('rows deep-link to the existing task drawer route, matching work.jsx\'s own convention', () => {
  assert.match(component, /export function reviewWaitingTaskHref\(taskId\) \{\s*return `dashboard\/work\/my\?task=\$\{encodeURIComponent\(taskId\)\}`;/);
  assert.match(component, /role="button"/);
  assert.match(component, /tabIndex=\{0\}/);
  assert.match(component, /onKeyDown=\{\(event\) => \{/);
  assert.match(component, /className="hub-row"/);
});

test('daily-brief.jsx mounts the shared component with a single import + mount line (low-conflict footprint)', () => {
  assert.match(dailyBrief, /import \{ ReviewWaitingList \} from "\.\.\/review-waiting";/);
  assert.match(dailyBrief, /<ReviewWaitingList onNavigate=\{onNavigate\} \/>/);
  // 새 지역 컴포넌트를 daily-brief.jsx 안에 다시 구현하지 않는다.
  assert.doesNotMatch(dailyBrief, /function ReviewWaiting/);
});

test('office-council.jsx mounts the shared component next to the existing 7-day usage line, no new panel', () => {
  assert.match(officeCouncil, /import \{ ReviewWaitingList \} from '\.\.\/review-waiting';/);
  assert.match(officeCouncil, /<OfficeUsageLine refreshKey=\{session\.turns\.length\} \/>\s*<ReviewWaitingList onNavigate=\{onNavigate\} \/>/);
  assert.match(officeCouncil, /export function OfficeCouncil\(\{ scope = 'all', onNavigate \}\)/);
});

test('hub-app.jsx threads navigate into OfficeCouncil so the review-waiting deep link works', () => {
  assert.match(hubApp, /'dashboard\/agents\/office-council': \(n, notifications, scope\) => <OfficeCouncil scope=\{scope\} onNavigate=\{n\} \/>,/);
});

test('surface budget: neither mount site adds a new Button, Card, or panel wrapper around the bundle', () => {
  for (const [name, source, anchor] of [
    ['daily-brief.jsx', dailyBrief, '<ReviewWaitingList onNavigate={onNavigate} />'],
    ['office-council.jsx', officeCouncil, "<ReviewWaitingList onNavigate={onNavigate} />"],
  ]) {
    const at = source.indexOf(anchor);
    assert.ok(at >= 0, `${name}: mount line not found`);
    const before = source.slice(Math.max(0, at - 80), at);
    const after = source.slice(at + anchor.length, at + anchor.length + 80);
    assert.doesNotMatch(before + after, /<Button|<Card|<SectionTitle/, `${name}: no sibling panel/button introduced around the mount`);
  }
});
