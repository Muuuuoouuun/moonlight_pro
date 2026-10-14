import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FEATURE_GATES } from './feature-gates.js';
import { toCheckItem } from './check-items/catalog.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

// 운영자 결정 D3(2026-10-07): 운영자 확정 전에 들어온 세 기능은 10/14·11월 판정까지 운영 화면에서 닫는다.
// 판정이 나면 feature-gates.js의 값과 이 단언을 같은 커밋에서 바꾼다.
test('운영 제외 게이트는 셋 다 닫혀 있다 — 운영자 판정 전', () => {
  assert.deepEqual(FEATURE_GATES, { officeWorkBreakdown: false, checkItemUnblock: false, decisionJournal: false });
  assert.ok(Object.isFrozen(FEATURE_GATES));
});

const blocked = {
  id: 'work-blocked-p1', title: '프로젝트 C — 막힘', tone: 'neutral',
  subject: { type: 'project', id: 'p1', name: '프로젝트 C', blockerKind: 'decision' },
  unblock: { updatedAt: '2026-10-01T01:00:00.000Z', delivery: { blocker: '대표 승인 대기', blockerKind: 'decision' } },
};

test('카드 계약은 기본값으로 모든 끝내기를 싣고, 운영 게이트를 넘기면 막힘 풀기와 결정으로 남기기만 빠진다', () => {
  const open = toCheckItem(blocked);
  assert.deepEqual(open.outcomes.map((o) => o.key), ['unblock-decision', 'unblock-resolved', 'task', 'snooze']);
  assert.ok(open.links.some((link) => link.action === 'decision'));

  const gated = toCheckItem(blocked, { gates: FEATURE_GATES });
  assert.deepEqual(gated.outcomes.map((o) => o.key), ['open', 'task', 'snooze'], '막힌 프로젝트는 프로젝트 열기로 돌아간다');
  assert.ok(!gated.links.some((link) => link.action === 'decision'));
  assert.deepEqual(gated.unblock, blocked.unblock, '데이터는 그대로, 카드 모양만 바뀐다');
  assert.equal(gated.signalKey, open.signalKey, '같은 신호는 같은 키 — 영수증 억제가 어긋나지 않는다');
});

test('운영 호출처만 게이트를 넘긴다 — daily-brief 라우트, 프로젝트 상세, 회의 결정 수집', () => {
  assert.match(read('../app/api/hub/daily-brief/route.js'), /toCheckItem\(signal, \{ gates: FEATURE_GATES \}\)/);
  assert.match(read('../components/hub/pages/project-detail-panel.jsx'), /\{FEATURE_GATES\.checkItemUnblock && onUnblocked && /);
  assert.match(read('../app/api/hub/journal/meeting-review/route.js'), /FEATURE_GATES\.decisionJournal && input\?\.action === 'review'/);
});

test('오피스 업무 나누기·자동 진행은 진입점 넷이 모두 게이트 뒤에 있다', () => {
  const council = read('../components/hub/pages/office-council.jsx');
  assert.match(council, /if \(!FEATURE_GATES\.officeWorkBreakdown \|\| locked \|\| breakdown\?\.status === 'loading'\) return;/);
  assert.match(council, /if \(!FEATURE_GATES\.officeWorkBreakdown \|\| locked \|\| officeBreakdowns\.get\(scope\)\?\.status !== 'applied'\) return;/);
  assert.match(council, /const breakdownTools = FEATURE_GATES\.officeWorkBreakdown \? <>/);
  assert.match(council, /\{breakdownOpen && FEATURE_GATES\.officeWorkBreakdown \? <OfficeBreakdownDrawer /);
  assert.match(council, /\{FEATURE_GATES\.officeWorkBreakdown \? <Button [^\n]*'업무 나누기'\}<\/Button> : null\}/);
});

test('결정 일지 이름은 사이드바 탭·⌘K·탑바에서 같은 게이트를 읽는다', () => {
  for (const [path, pattern] of [
    ['../components/hub/hub-nav.js', /label: FEATURE_GATES\.decisionJournal \? '결정 일지' : 'Decisions', path: 'dashboard\/work\/decisions'/],
    ['../components/hub/hub-data.js', /label: FEATURE_GATES\.decisionJournal \? '결정 일지' : 'Decisions', icon: 'decisions'/],
    ['../components/hub/hub-topbar.jsx', /'decisions': FEATURE_GATES\.decisionJournal \? '결정 일지' : 'Decisions'/],
  ]) assert.match(read(path), pattern, path);
});
