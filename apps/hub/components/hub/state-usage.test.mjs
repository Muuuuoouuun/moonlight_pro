import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = (name) => readFileSync(new URL(`./pages/${name}.jsx`, import.meta.url), 'utf8');

test('decision certainty uses the shared geometry-based badge', () => {
  const source = page('work');
  assert.match(source, /import \{[^}]*CertaintyBadge[^}]*\} from "\.\.\/hub-primitives"/s);
  assert.match(source, /<CertaintyBadge\s+state=\{d\.status === 'Committed' \? 'confirmed' : 'unknown'\}/);
});

test('automation status uses lifecycle semantics instead of decorative status colors', () => {
  const source = page('automations');
  assert.match(source, /<LifecycleBadge state=\{automationLifecycle\(a\.status\)\} label=\{a\.status\}/);
  assert.doesNotMatch(source, /const sTone = \{ Active: 'success', Paused: 'warning', Error: 'danger' \}/);
});

test('category-only badges are neutral across work lanes, follow-ups, segments and commands', () => {
  assert.match(page('my-work'), /const LANE_TONE = \{ task: 'neutral', deal: 'neutral', event: 'neutral' \}/);
  assert.match(page('followups'), /const ACT_TONE = Object\.fromEntries\(Object\.keys\(ACT_ICON\)\.map\(\(key\) => \[key, "neutral"\]\)\)/);
  assert.match(page('segments'), /const STAGE_TONE = \{ New: 'neutral', Contact: 'neutral', Qualified: 'neutral', Lost: 'neutral' \}/);
  assert.doesNotMatch(page('evolution-settings'), /dest: '[^']+',\s+tone: '(?:info|warning|success|danger)'/);
});

test('overview charts use a monochrome Moonstone scale and reserve danger for blocked work', () => {
  const source = page('overview');
  assert.match(source, /blocked: 'var\(--danger\)'/);
  assert.match(source, /\{ key: 'decisions', label: '결정', color: 'var\(--moon-500\)'/);
  assert.match(source, /\{ key: 'content', label: '발행', color: 'var\(--fg-dim\)'/);
  assert.doesNotMatch(source, /blocked: 'var\(--warning\)'/);
});

test('urgent rails stay one pixel while non-urgent timing remains neutral', () => {
  const myWork = page('my-work');
  const followups = page('followups');
  assert.match(myWork, /item\.bucket === 'overdue' \? 'inset 1px 0 0 var\(--danger\)'/);
  assert.match(followups, /BUCKET_STRIPE = \{ overdue: "var\(--danger\)" \}/);
  assert.doesNotMatch(followups, /inset 2px 0 0/);
});

test('follow-up truth never turns a failed read into preview or a proven empty state', () => {
  const source = page('followups');
  assert.match(source, /<SyncBadge state=\{state\.syncState\} \/>/);
  assert.match(source, /state\.syncState === "error" \? \(\s*<EmptyState[\s\S]*?title="활동 기록을 읽지 못했습니다"/);
  assert.match(source, /stage && <Badge tone="neutral" size="xs" variant="outline">\{stage\.label\}<\/Badge>/);
});

// 2026-09-04 회귀 방어. `8a8bcbc`가 허브 read 라우트의 실패를 HTTP 200 + status:"error"
// 봉투로 통일하면서, `!r.ok`만 보던 첫 화면 승인 큐가 read 실패를 "승인 대기 없음"으로
// 위장하게 됐다(`d920e76`이 막으려던 오독의 재발). 봉투 방향은 프로젝트 계약이므로
// 라우트를 502로 되돌리지 않고, 소비자 양쪽이 봉투를 읽는 것을 여기서 고정한다.
const hubRoute = (path) => readFileSync(new URL(`../../app/api/hub/${path}`, import.meta.url), 'utf8');

test('approval queue read failure is never rendered as an empty queue', () => {
  // 라우트: 실패는 200 + status:"error"다. 502 회귀 금지.
  const route = hubRoute('work-orders/route.js');
  assert.match(route, /status: summary\.source === "error" \? "error" : "ok"/);
  assert.match(route, /status: orders\.source === "error" \? "error" : "ok"/);
  assert.doesNotMatch(route, /\{ status: 502 \}/);

  // 소비자 양쪽: HTTP 상태가 아니라 봉투를 읽는다.
  for (const name of ['daily-brief', 'agents']) {
    const source = page(name);
    assert.match(
      source,
      /\.then\(async \(r\) => \(\{ ok: r\.ok, d: await r\.json\(\)\.catch\(\(\) => null\) \}\)\)/,
      `${name}: work-orders 응답을 봉투로 읽지 않는다`,
    );
    assert.match(source, /if \(!ok \|\| !d \|\| d\.status === 'error'/, `${name}: status 봉투 가드 없음`);
  }

  // 첫 화면: !r.ok 단독 감지기로 되돌아가지 않는다.
  assert.doesNotMatch(page('daily-brief'), /if \(!r\.ok\) throw new Error\(`work-orders/);
});
