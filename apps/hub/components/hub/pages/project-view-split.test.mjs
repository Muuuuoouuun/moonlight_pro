import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (name) => readFile(new URL(`./${name}`, import.meta.url), "utf8");

const projectsSource = await read("projects.jsx");
const constantsSource = await read("project-view-constants.js");
const timelineSource = await read("project-timeline-view.jsx");
const todosSource = await read("project-todos-view.jsx");
const boardSource = await read("project-board-view.jsx");

const BORDER_PROPS = ["border", "borderTop", "borderRight", "borderBottom", "borderLeft"];

const VIEW_FILES = [
  ["project-timeline-view.jsx", timelineSource],
  ["project-todos-view.jsx", todosSource],
  ["project-board-view.jsx", boardSource],
];

// JSX 인라인 스타일 값은 항상 따옴표/백틱으로 감싸여 있다. 값을 통째로 캡처해야
// 규칙을 실제로 검사할 수 있다 — 값 문자 클래스에서 따옴표를 제외하면 매치가
// `border: `에서 끊겨 테스트가 준수 코드에서 실패한다.
function cssValues(source, property) {
  // 선언 하나가 리터럴을 여러 개 가질 수 있다 — `borderBottom: cond ? 'a' : 'none'`.
  // 따옴표가 `prop:` 바로 뒤에 온다고 가정하면 삼항 값이 통째로 검사에서 빠진다
  // (project-timeline-view.jsx가 실제로 그 모양이다). 선언 span을 먼저 잘라낸 뒤
  // 그 안의 모든 리터럴을 값으로 돌려준다.
  const out = [];
  for (const m of source.matchAll(new RegExp(`\\b${property}:`, "g"))) {
    let depth = 0;
    let quote = null;
    let span = "";
    for (let i = m.index + m[0].length; i < source.length; i += 1) {
      const ch = source[i];
      if (quote) {
        if (ch === "\\") { span += ch + source[i + 1]; i += 1; continue; }
        if (ch === quote) quote = null;
        span += ch;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === "`") { quote = ch; span += ch; continue; }
      if ("([{".includes(ch)) depth += 1;
      else if (")]}".includes(ch)) { if (depth === 0) break; depth -= 1; }
      else if (ch === "," && depth === 0) break;
      span += ch;
    }
    for (const lit of span.matchAll(/(['"`])([^'"`]*)\1/g)) {
      out.push({ decl: `${m[0]} ${span.trim()}`, value: lit[2] });
    }
  }
  return out;
}

// 마운트가 넘기는 prop — 아래 두 test가 같은 목록을 본다. test 사이 상태를 넘기지
// 않도록 모듈 스코프에 둔다 (test 실행 순서에 의존하면 조용히 통과할 수 있다).
const MOUNTS = [
    ["ProjectTimelineView", "project-timeline-view.jsx", /\{view === 'timeline' && \(\s*<ProjectTimelineView([\s\S]*?)\/>/, [
      "projects={projects}", "timeline={projectTimeline}", "searchParams={searchParams}",
      "pathname={pathname}", "selectedProjectId={selectedProjectId}", "brands={brands}",
      "brandByKey={brandByKey}", "onCreateProject={() => createProject()}",
    ]],
    ["ProjectTodosView", "project-todos-view.jsx", /\{view === 'todos' && canWriteTasks && \(\s*<ProjectTodosView([\s\S]*?)\/>/, [
      "items={taskExecution.items}", "projectById={projectById}", "brands={brands}",
      "brandByKey={brandByKey}", "pendingTaskIds={pendingTaskIds}", "prioTone={prioTone}",
      "onToggleTodo={toggleTodo}", "onEditTodo={editTodo}", "onCreateTodo={createTodoForSection}",
      "onResetFilters={resetTaskFilters}",
    ]],
    ["ProjectBoardView", "project-board-view.jsx", /\{view === 'board' && canWriteTasks && \(\s*<ProjectBoardView([\s\S]*?)\/>/, [
      "visibleColumns={visibleColumns}", "todos={todos}", "drag={drag}",
      "pendingTaskIds={pendingTaskIds}", "selectedId={kbSelection.selectedId}", "prioTone={prioTone}",
      "onDragChange={setDrag}", "onMoveCard={moveCard}", "onCreateCard={createBoardCard}",
      "onOpenTask={setMemoTaskId}", "onOpenProject={openProjectDetail}",
    ]],
];

const MOUNT_PROP_NAMES = new Map(
  MOUNTS.map(([, file, , props]) => [file, props.map(p => p.slice(0, p.indexOf("=")))]),
);

test("projects.jsx mounts each extracted leaf view with its full prop surface", () => {
  for (const [name, , mountRe, props] of MOUNTS) {
    assert.match(projectsSource, new RegExp(`import \\{ ${name} \\} from`));
    const mount = projectsSource.match(mountRe);
    assert.ok(mount, `${name} 마운트 배선이 있어야 한다`);
    for (const prop of props) {
      assert.ok(mount[1].includes(prop), `${name}: ${prop} 누락 — 분리된 뷰가 조용히 빈 화면이 된다`);
    }
  }
});

test("each extracted view declares exactly the props its mount site passes", () => {
  for (const [name, source] of VIEW_FILES) {
    const signature = source.match(/export function Project\w+\(\{([\s\S]*?)\}\)/);
    assert.ok(signature, `${name}: 구조분해 prop 시그니처가 있어야 한다`);
    const declared = signature[1].split(",").map(s => s.trim()).filter(Boolean);
    // 이름값을 실제로 한다: 선언한 prop 집합과 마운트가 넘기는 집합이 정확히 같아야 한다.
    // 한쪽만 이름을 바꾸면 조용히 undefined가 흘러 CTA가 no-op이 된다.
    const mount = MOUNT_PROP_NAMES.get(name);
    assert.ok(mount, `${name}: 마운트 prop 목록이 등록돼야 한다`);
    assert.deepEqual(
      [...declared].sort(),
      [...mount].sort(),
      `${name}: 선언 prop과 마운트 prop이 어긋났다 — 한쪽만 rename하면 조용히 undefined가 흐른다`,
    );
    // 지역 관례(디자인 시스템 규칙 아님): prop 12개를 넘으면 잘못된 seam의 신호다.
    // table 뷰(37개 바인딩)를 이 파일들로 끌어오지 말 것 — 진짜 상태 리팩터가 필요하다.
    assert.ok(declared.length <= 12, `${name}: prop ${declared.length}개 — seam을 다시 보라`);
    for (const prop of declared) {
      assert.match(prop, /^[a-zA-Z]\w*$/, `${name}: 기본값·나머지 매개변수 금지 (${prop})`);
    }
  }
});

test("extracted views hold no hooks — parent keeps every piece of state", () => {
  for (const [name, source] of VIEW_FILES) {
    assert.doesNotMatch(source, /React\.use(State|Effect|Ref|Reducer|Memo|Callback|LayoutEffect)/, `${name}`);
    assert.doesNotMatch(source, /\buse[A-Z]\w*\(/, `${name}: 훅 호출 금지 (순수 이동 계약)`);
  }
});

test("project-view-constants owns the moved keys and projects.jsx never redefines them", () => {
  const owned = [
    "EMPTY_ALL_BRAND", "PROJECT_VIEW_OPTIONS", "STATUS_LINE_TOKEN",
    "PROJECT_CATEGORIES", "BRAND_OWNED_CATEGORY", "CONTAINER_CATEGORY_OPTIONS",
    "FOLDER_STORAGE_KEY", "IDLE_OPEN_KEY", "SIDEBAR_HIDDEN_KEY", "BRAND_SECTION_KEY",
    "LIST_STATUS_GROUPS", "FOLDER_ORDER_KEY", "BRAND_ORDER_KEY", "EMPTY_CONTAINER_KEY",
    "TODO_TIME_SECTIONS", "SUMMARY_FILTER_LABELS", "DETAIL_FOCUSABLE",
  ];
  for (const key of owned) {
    assert.match(constantsSource, new RegExp(`export const ${key}\\b`), `${key} export 누락`);
    assert.doesNotMatch(projectsSource, new RegExp(`^const ${key}\\b`, "m"), `${key}가 projects.jsx에 재정의됐다`);
  }
  for (const fn of ["isTerminalProject", "compareProjectsByDue", "seoulDayKey", "todoTimeSection",
                    "computeMovedOrder", "slugifyContainer", "buildLocalContainer", "normalizeProjectView"]) {
    assert.match(constantsSource, new RegExp(`export function ${fn}\\b`), `${fn} export 누락`);
    assert.doesNotMatch(projectsSource, new RegExp(`^function ${fn}\\b`, "m"), `${fn}가 projects.jsx에 재정의됐다`);
  }
  // 한국어 상태 라벨 사전은 project-pms-components 한 곳에만 산다 (DESIGN.md §8.1·§8.2).
  assert.doesNotMatch(constantsSource, /\bSTATUS_LABEL_KO\b/);
  // 모듈 가변 캐시는 옮기지 않는다 — projects.jsx가 계속 소유해야 한다.
  // (상수 모듈에는 가변 모듈 스코프 바인딩 자체가 없어야 한다. 주석 언급은 허용.)
  assert.match(projectsSource, /let projectsLedgerCache = null;/);
  assert.doesNotMatch(constantsSource, /projectsLedgerCache\s*=/);
  assert.doesNotMatch(constantsSource, /^(?:let|var)\s/m);
  // 상수 모듈은 React를 끌어오지 않는다 (node --test에서 직접 실행 가능해야 한다).
  assert.doesNotMatch(constantsSource, /from ["']react["']/);
  // 분리된 뒤 죽은 import가 남지 않는다 — 허브에는 lint가 없어 조용히 쌓인다.
  assert.doesNotMatch(projectsSource, /buildTimelineItemAriaLabel/);
  assert.doesNotMatch(projectsSource, /mergeTimelineProjectQuery/);
  assert.doesNotMatch(projectsSource, /\bSTATUS_LINE_TOKEN\b/);
  assert.doesNotMatch(projectsSource, /\btodoTimeSection\b/);
  assert.doesNotMatch(projectsSource, /<Badge\b/);
});

test("extracted views obey the token, border, hover and motion contracts", () => {
  for (const [name, source] of VIEW_FILES) {
    // DESIGN.md §5.2 / CLAUDE.md UI 체크 — 페이지 안 하드코딩 색 금지.
    assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}\b/, `${name}: 하드코딩 hex`);
    assert.doesNotMatch(source, /\b(?:rgba?|oklch|hsla?)\(/, `${name}: 하드코딩 색 함수`);
    // DESIGN.md §5.2 — 보더는 항상 1px + --line* 토큰 (또는 상태 스트라이프 토큰 변수).
    const borders = BORDER_PROPS.flatMap(prop => cssValues(source, prop));
    for (const { decl, value } of borders) {
      if (/^(?:none|0|1px solid transparent)$/.test(value)) continue;
      assert.match(value, /^1px solid /, `${name}: ${decl}`);
      assert.match(
        value,
        /var\(--(line|line-soft|line-strong|danger-line)\)|\$\{lineToken\}/,
        `${name}: ${decl}`,
      );
    }
    // DESIGN.md §8.1 — hover는 CSS 클래스만. 새 JS hover 핸들러 금지.
    assert.doesNotMatch(source, /onMouseEnter|onMouseLeave|onMouseOver|onMouseOut/, `${name}: JS hover`);
    // DESIGN.md §9 — 페이지 안 raw ms 리터럴 금지, 모션은 토큰만.
    assert.doesNotMatch(source, /\b\d+(?:\.\d+)?ms\b/, `${name}: raw ms 리터럴`);
    for (const { decl, value } of cssValues(source, "transition")) {
      // §9는 진입/퇴장 곡선에만 --ease-hub를 요구한다. duration은 언제나 토큰이어야 한다.
      assert.match(value, /var\(--dur-(hover|enter|panel|overlay)\)/, `${name}: ${decl}`);
    }
    // DESIGN.md §11 — 포커스/선택 outline은 --moon-300 1px.
    for (const { decl, value } of cssValues(source, "outline")) {
      assert.equal(value, "1px solid var(--moon-300)", `${name}: ${decl}`);
    }
  }
  // 회귀 방어: 추출 자체가 동작한다(따옴표를 값에서 빼면 매치가 `border: `에서 끊긴다).
  // todos 뷰에는 border 선언이 없으므로 파일별이 아니라 세 파일 합으로 센다.
  assert.ok(
    VIEW_FILES.flatMap(([, src]) => BORDER_PROPS.flatMap(prop => cssValues(src, prop))).length >= 4,
    "border 선언 추출 실패 — 정규식을 의심하라",
  );
  // 회귀 방어: 보드 카드의 j/k 커서 링이 실제로 추출·검사되고 있다.
  assert.deepEqual(
    cssValues(boardSource, "outline").map(v => v.value),
    ["1px solid var(--moon-300)"],
  );
  // 회귀 방어: 타임라인 막대의 상태 스트라이프 보더가 실제로 추출·검사되고 있다.
  assert.ok(
    cssValues(timelineSource, "border").some(v => v.value.includes("${lineToken}")),
    "타임라인 마커 보더가 추출되지 않았다 — 정규식을 의심하라",
  );
});

test("extracted views compose primitives instead of re-implementing them", () => {
  // DESIGN.md §8 — SegmentedControl / EmptyState / Checkbox / Drawer / EditDrawer 인라인 재구현 금지.
  for (const [name, source] of VIEW_FILES) {
    assert.doesNotMatch(source, /<input\s+type=["']checkbox["']/, `${name}: raw checkbox`);
    assert.doesNotMatch(source, /role=["']dialog["']/, `${name}: 인라인 오버레이`);
    assert.doesNotMatch(source, /role=["']tablist["']/, `${name}: 인라인 세그먼트 토글`);
  }
  // 각 뷰의 빈 상태는 EmptyState 프리미티브 + 다음 행동 CTA여야 한다 (§8.1).
  for (const [name, source] of [["project-timeline-view.jsx", timelineSource],
                                ["project-todos-view.jsx", todosSource]]) {
    assert.match(source, /<EmptyState/, `${name}`);
    // CTA가 둘 이상이면 fragment로 감싼다(백로그 뷰 선례: 필터 초기화 + 작업 추가).
    assert.match(source, /action=\{(?:<>\s*)?<Button/, `${name}: 빈 상태에 CTA 필수`);
  }
  assert.match(todosSource, /<Checkbox[\s\S]{0,320}label=\{/, "to-dos 체크박스는 label prop 필수 (§11)");
  // §8.1 클릭 가능한 div 3종 세트.
  for (const [name, source] of VIEW_FILES) {
    const divButtons = (source.match(/role="button"/g) || []).length;
    if (divButtons === 0) continue;
    assert.equal((source.match(/tabIndex=\{0\}/g) || []).length, divButtons, `${name}: tabIndex 누락`);
    assert.ok((source.match(/onKeyDown=/g) || []).length >= divButtons, `${name}: Enter/Space 핸들러 누락`);
  }
  // §5.3 lifecycle — 상태 칩은 어댑터를 거친다. 페이지가 tone 색 이름을 고르지 않는다.
  assert.match(timelineSource, /<ProjectStatusBadge status=\{p\.status\} \/>/);
});

// 2026-09-20 입력 동선 — 할 일 생성이 드로어에서 같은 값을 다시 입력하게 만들던 왕복을
// 없앤 계약. 시드 경로가 사라지면 구간 CTA가 다시 "기한 없음"만 만들고, Council 제안
// 제목은 다시 조용히 버려진다.
test("to-dos 구간 헤더 생성은 그 구간의 기한을 초안에 시드한다", () => {
  assert.match(todosSource, /const TODO_SECTION_SEED = \{/);
  for (const [section, days] of [["오늘", "0"], ["내일", "1"], ["이번 주", "7"]]) {
    assert.match(
      todosSource,
      new RegExp(`'${section}': \\{ days: ${days},`),
      `${section} 구간 기한 시드 누락`,
    );
  }
  assert.match(todosSource, /'기한 없음': \{ days: null,/);
  // 지난 날짜를 새로 만드는 동선은 없다 — '기한 지남'·'이후'는 시드 대상이 아니다.
  assert.doesNotMatch(todosSource, /'기한 지남': \{ days:/);
  assert.match(projectsSource, /const createTodoForSection = React\.useCallback\(\(dueAt\)/);
  assert.match(projectsSource, /createTodo\(null, 'todo', \{ dueAt: dueAt \|\| '' \}\)/);
});

test("createTodo는 호출처가 넘긴 seed를 초안에 반영한다", () => {
  assert.match(projectsSource, /createTodo = React\.useCallback\(\(projectId = null, initialStatus = 'todo', seed = null\)/);
  assert.match(projectsSource, /\.\.\.\(seed && typeof seed === 'object' \? seed : null\)/);
  // Council 위젯은 제목을 넘긴다 — 2번째 인자(initialStatus)에 실으면 조용히 버려진다.
  assert.match(projectsSource, /createTodo\(councilWidgetProject\.id, 'todo', \{ title: String\(title \|\| ''\)\.trim\(\) \}\)/);
});
