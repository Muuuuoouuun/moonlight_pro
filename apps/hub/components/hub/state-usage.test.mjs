import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
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
  // 고객 연락의 레일은 2026-09-21부터 예산이 걸려 있다: 어긴 약속 상단 MAX_DANGER_RAILS개만
  // 레일을 받고 나머지는 시계 글리프 + 직접 라벨로 같은 사실을 말한다(§5.3 red budget).
  assert.match(followups, /boxShadow: rail \? "inset 1px 0 0 var\(--danger\)" : undefined/);
  assert.match(followups, /rail=\{group\.key === "missed" && index < MAX_DANGER_RAILS\}/);
  assert.match(followups, /item\.bucket === "overdue" && !rail/);
  assert.doesNotMatch(followups, /inset 2px 0 0/);
});

test('the follow-up queue puts broken promises first and folds the watch list away', () => {
  const groups = readFileSync(new URL('../../lib/sales-os/followup-groups.js', import.meta.url), 'utf8');
  const followups = page('followups');
  // 묶음 정의는 순수 모듈 하나 — 페이지가 저장소 모듈을 import하면 server-read/write가
  // 클라이언트 청크로 끌려온다.
  assert.match(groups, /key: "missed"[\s\S]*?key: "today"[\s\S]*?key: "rest"/);
  assert.match(followups, /groupFollowups\(visible\)/);
  // 정렬 축은 약속 날짜(bucket)이지 정체 일수가 아니다.
  assert.doesNotMatch(followups, /BUCKET_OPTIONS/);
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

// 2026-09-15. PMS 프로젝트 상태 칩이 페이지 지역 `statusTone`(색 이름 맵) + Badge에서
// ProjectStatusBadge → LifecycleBadge(의미 열거값)로 넘어갔다. 방어 대상 셋:
// (1) 색 이름 맵의 부활, (2) 페이지별 한국어 라벨 드리프트, (3) Blocked 외 상태의
// danger 상속. DESIGN.md §5.3 lifecycle · §8.2 state primitives.
// 호출처 개수는 파일 단위가 아니라 pages/ 전체 합으로 센다 — 뷰 분할 리팩터가
// projects.jsx에서 코드를 옮겨도 계약이 살아남아야 한다.
const pagesDir = new URL('./pages/', import.meta.url);
const allPageSources = readdirSync(pagesDir)
  .filter((name) => name.endsWith('.jsx'))
  .map((name) => readFileSync(new URL(name, pagesDir), 'utf8'))
  .join('\n');

test('PMS project status is declared by lifecycle enum, never by a page-level tone map', () => {
  const pms = page('project-pms-components');
  const projects = page('projects');
  const detail = page('project-detail-panel');

  // 어댑터가 정본이고 primitive를 감싼다 — 페이지는 의미만 선언한다(§8.2).
  assert.match(pms, /import \{ LifecycleBadge \} from "\.\.\/hub-primitives"/);
  assert.match(pms, /export function ProjectStatusBadge/);
  assert.match(
    pms,
    /<LifecycleBadge\s+state=\{projectLifecycleState\(status\)\}\s+label=\{projectStatusLabel\(status\)\}/,
    'ProjectStatusBadge는 LifecycleBadge에 열거값과 한국어 라벨을 함께 넘긴다',
  );

  // 6개 상태 전부가 열거값으로 선언되고, danger를 상속하는 건 Blocked 하나뿐이다(§5.3).
  const lifecycleMap = pms.slice(
    pms.indexOf('PROJECT_LIFECYCLE_STATE = {'),
    pms.indexOf('};', pms.indexOf('PROJECT_LIFECYCLE_STATE = {')),
  );
  assert.ok(lifecycleMap.length > 0);
  for (const entry of [
    /'In progress': 'active'/,
    /Review: 'active'/,
    /Planning: 'queued'/,
    /Backlog: 'queued'/,
    /Blocked: 'blocked'/,
    /Done: 'done'/,
  ]) {
    assert.match(lifecycleMap, entry);
  }
  assert.equal(
    (lifecycleMap.match(/'blocked'/g) || []).length,
    1,
    'danger를 상속하는 상태는 Blocked 하나뿐이다(§5.3 red-budget)',
  );
  assert.doesNotMatch(
    lifecycleMap,
    /'(?:danger|success|warning|info|neutral|moon|personal|company)'/,
    '열거값 자리에 Badge tone 색 이름이 들어오면 안 된다(§8.2 "semantic enums, not color names")',
  );

  // 눈에 보이는 한국어 라벨은 어댑터 한 곳에만 산다(§8.2 · §10 운영자 어휘).
  // LifecycleBadge가 같은 문구로 aria-label을 짜므로 접근성 이름도 여기 고정된다.
  // 반드시 라벨 사전 slice 안에서 검사한다 — 파일 전체를 스캔하면 '완료'·'검토'·'막힘'·
  // '백로그'가 같은 파일의 주석·다른 라벨에도 있어서 사전에서 지워도 통과한다(공회전).
  const labelMap = pms.slice(
    pms.indexOf('PROJECT_STATUS_LABEL_KO = {'),
    pms.indexOf('};', pms.indexOf('PROJECT_STATUS_LABEL_KO = {')),
  );
  assert.ok(labelMap.length > 0, 'PROJECT_STATUS_LABEL_KO 사전을 찾지 못했다');
  for (const [status, label] of [
    ['In progress', '작업 중'], ['Review', '검토'], ['Planning', '계획'],
    ['Blocked', '막힘'], ['Done', '완료'], ['Backlog', '백로그'],
  ]) {
    assert.match(
      labelMap,
      new RegExp(`['"]?${status}['"]?:\\s*['"]${label}['"]`),
      `상태 라벨 누락: ${status} → ${label} (영문 원본이 한글 옆에 그대로 렌더된다)`,
    );
  }

  // 페이지에는 상태→tone 맵도, 로컬 라벨 사전도, 프롭 배선도 남지 않는다.
  assert.doesNotMatch(projects, /const statusTone = /);
  assert.doesNotMatch(projects, /const STATUS_LABEL_KO = \{/);
  assert.doesNotMatch(projects, /statusTone=\{/);
  assert.doesNotMatch(detail, /statusTone/);

  // 네 호출처 전부 어댑터를 쓴다: List 행 · 완료/보관 · Timeline 기한미정 · 상세 패널.
  assert.equal(
    (allPageSources.match(/<ProjectStatusBadge status=\{p\.status\} \/>/g) || []).length,
    3,
    'PMS 목록형 상태 칩 3곳이 모두 어댑터를 거쳐야 한다',
  );
  assert.equal(
    (allPageSources.match(/<ProjectStatusBadge status=\{project\.status\} \/>/g) || []).length,
    1,
    '상세 패널 상태 칩도 어댑터를 거쳐야 한다',
  );
  // 상세 패널이 영문 원시 상태로 되돌아가지 않는다 — 옆 행은 한국어다.
  assert.doesNotMatch(detail, /size="xs">\{project\.status\}<\/Badge>/);
});

// DESIGN.md §15 2026-08-05(확정): AttentionRail은 미채택이고, 레일은 §8.1의
// inset 1px 인라인이 현행이다. Timeline 막대의 상태 스트라이프는 그 규칙을 따르고
// overdue일 때만 danger로 간다 — 6개 상태를 통째로 빨갛게 칠하는 primitive 교체는
// §5.3 red-budget 위반이므로 여기서 막는다.
test('PMS timeline keeps the inline 1px status stripe instead of adopting AttentionRail', () => {
  // 타임라인 렌더러는 project-timeline-view.jsx로 분리됐다 — 레일 계약은 그 파일이 진다.
  const timeline = page('project-timeline-view');
  const projects = page('projects');
  assert.match(projects, /\{view === 'timeline' && \(\s*<ProjectTimelineView/);
  assert.match(
    timeline,
    /const lineToken = item\.overdue \? 'var\(--danger-line\)' : \(STATUS_LINE_TOKEN\[p\.status\] \|\| 'var\(--line-strong\)'\)/,
  );
  assert.match(timeline, /boxShadow: `inset 1px 0 0 \$\{lineToken\}`/);
  assert.doesNotMatch(timeline, /inset (?:2|3)px 0 0/);
  assert.doesNotMatch(projects, /inset (?:2|3)px 0 0/);
  assert.doesNotMatch(timeline, /<AttentionRail/);
  assert.doesNotMatch(projects, /<AttentionRail/);
  // 중립 상태가 danger 토큰으로 새지 않는다. 토큰 맵은 project-view-constants.js가
  // 소유한다 — 뷰 분할에서 순수 상수·헬퍼가 그 모듈로 나갔다.
  const constants = readFileSync(new URL('./pages/project-view-constants.js', import.meta.url), 'utf8');
  const stripeMap = constants.slice(
    constants.indexOf('STATUS_LINE_TOKEN = {'),
    constants.indexOf('};', constants.indexOf('STATUS_LINE_TOKEN = {')),
  );
  assert.ok(stripeMap.length > 0);
  assert.equal((stripeMap.match(/var\(--danger/g) || []).length, 1, 'Blocked 하나만 danger 스트라이프다');
});
