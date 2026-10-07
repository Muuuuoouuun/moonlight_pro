import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { SIGNAL_TARGETS } from './signal-targets.js';

test('every decision emitted by the daily brief API has a destination in both home views', () => {
  const route = readFileSync(new URL('../app/api/hub/daily-brief/route.js', import.meta.url), 'utf8');
  const actions = [...route.matchAll(/action\("[^\"]+",\s*"([^\"]+)"/g)].map(match => match[1]);
  assert.ok(actions.length > 10, 'the producer action contract must be inspected');
  for (const action of actions) assert.ok(SIGNAL_TARGETS[action]?.startsWith('dashboard/'), `missing destination: ${action}`);
  assert.equal(SIGNAL_TARGETS.write, 'dashboard/content/studio');
  assert.equal(SIGNAL_TARGETS.review, 'dashboard/automations/runs');
  assert.equal(SIGNAL_TARGETS.decision, 'dashboard/work/decisions?new=decision');
});

test('both home views consume the shared map and never mark a signal handled by navigating', () => {
  // 확인할 것 스펙 §4.1 — 화면을 여는 버튼은 끝냄이 아니다. 홈의 컴포넌트 상태 숨김(setResolved)과
  // 오늘 화면의 localStorage "오늘 처리함"(useBriefDecision)은 저장 없이 항목을 지웠다.
  for (const name of ['home', 'daily-brief']) {
    const source = readFileSync(new URL(`../components/hub/pages/${name}.jsx`, import.meta.url), 'utf8');
    assert.match(source, /import \{[^}]*\bSIGNAL_TARGETS\b[^}]*\} from ['"]@\/lib\/signal-targets['"]/);
    assert.doesNotMatch(source, /const SIGNAL_TARGETS\s*=/);
    assert.doesNotMatch(source, /setResolved|useBriefDecision|hub:brief-decisions|오늘 처리함/);
    assert.doesNotMatch(source, /결정 큐|대기 결정/);
  }
});

test('no signal action leads to the life-routine Rhythm page or nowhere', () => {
  // 리듬은 2026-09-23부터 기도·청소 같은 생활 루틴 화면이다 — `오늘 보류`·`Rhythm 보기`가 그리로 갔다.
  for (const [key, target] of Object.entries(SIGNAL_TARGETS)) {
    assert.ok(!target.startsWith('dashboard/work/rhythm'), `${key} must not point at Rhythm`);
    assert.notEqual(target, 'dashboard/daily-brief', `${key} must not be a no-op destination`);
  }
  const route = readFileSync(new URL('../app/api/hub/daily-brief/route.js', import.meta.url), 'utf8');
  assert.doesNotMatch(route, /"오늘 보류"|"리마인드 초안"|"Rhythm 보기"/);
  assert.doesNotMatch(route, /work-decision-missing/, '결정 기록 0건을 재촉하는 신호는 의례였다');
});
