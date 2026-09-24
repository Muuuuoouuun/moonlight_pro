import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BRAND_OWNED_CATEGORY,
  CONTAINER_CATEGORY_OPTIONS,
  LIST_STATUS_GROUPS,
  PROJECT_CATEGORIES,
  PROJECT_VIEW_OPTIONS,
  STATUS_LINE_TOKEN,
  SUMMARY_FILTER_LABELS,
  TODO_TIME_SECTIONS,
  buildLocalContainer,
  compareProjectsByDue,
  computeMovedOrder,
  isTerminalProject,
  normalizeProjectView,
  seoulDayKey,
  slugifyContainer,
  todoTimeSection,
} from "./project-view-constants.js";

// projects.jsx에서 분리되기 전까지 이 헬퍼들은 실행 커버리지가 0이었다 —
// node --test가 .jsx를 파싱하지 못해 모든 PMS 테스트가 소스 문자열 매칭이었다.

test("normalizeProjectView accepts the sidebar's `tasks` wording and falls back to tree", () => {
  assert.equal(normalizeProjectView("tasks"), "todos");
  assert.equal(normalizeProjectView("todos"), "todos");
  assert.equal(normalizeProjectView("timeline"), "timeline");
  assert.equal(normalizeProjectView("board"), "board");
  assert.equal(normalizeProjectView("backlog"), "backlog");
  assert.equal(normalizeProjectView("memos"), "memos");
  assert.equal(normalizeProjectView("table"), "table");
  assert.equal(normalizeProjectView("nope"), "tree");
  assert.equal(normalizeProjectView(""), "tree");
  assert.equal(normalizeProjectView(null), "tree");
  assert.equal(normalizeProjectView(undefined), "tree");
  // 세그먼트 컨트롤의 모든 키가 해석 가능해야 한다 (DESIGN.md §8.1 뷰 토글 계약).
  for (const option of PROJECT_VIEW_OPTIONS) {
    assert.equal(normalizeProjectView(option.key), option.key);
  }
});

test("isTerminalProject covers every terminal status case-insensitively and tolerates junk", () => {
  assert.equal(isTerminalProject({ statusKey: "completed" }), true);
  assert.equal(isTerminalProject({ statusKey: "Archived" }), true);
  assert.equal(isTerminalProject({ statusKey: "CANCELLED" }), true);
  assert.equal(isTerminalProject({ statusKey: "active" }), false);
  assert.equal(isTerminalProject({ statusKey: "blocked" }), false);
  assert.equal(isTerminalProject({}), false);
  assert.equal(isTerminalProject(null), false);
  assert.equal(isTerminalProject(undefined), false);
});

test("compareProjectsByDue sorts by imminence and parks undated rows at the tail (Q116·Q120)", () => {
  const rows = [
    { id: "none-a" },
    { id: "late", dueAt: "2026-03-01T00:00:00Z" },
    { id: "none-b", dueAt: "" },
    { id: "soon", dueAt: "2026-01-01T00:00:00Z" },
    { id: "bad", dueAt: "not-a-date" },
  ];
  assert.deepEqual(
    [...rows].sort(compareProjectsByDue).map(r => r.id),
    ["soon", "late", "none-a", "none-b", "bad"],
  );
  // 무기한끼리는 기록 순서 유지 (Array.prototype.sort는 stable).
  assert.equal(compareProjectsByDue({ dueAt: "" }, { dueAt: null }), 0);
  assert.ok(compareProjectsByDue({ dueAt: "2026-01-02" }, { dueAt: "2026-01-01" }) > 0);
  assert.equal(compareProjectsByDue({ dueAt: "2026-01-01" }, {}), -1);
  assert.equal(compareProjectsByDue({}, { dueAt: "2026-01-01" }), 1);
});

test("computeMovedOrder normalizes stale keys and inserts before the drop target", () => {
  // 빈 저장값 → 현재 키 순서를 기준으로 정규화한 뒤 이동.
  assert.deepEqual(computeMovedOrder([], ["a", "b", "c"], "c", "a"), ["c", "a", "b"]);
  // 사라진 키는 걷어내고, 새 키는 꼬리에 붙인다.
  assert.deepEqual(computeMovedOrder(["gone", "b", "a"], ["a", "b", "c"], "a", "b"), ["a", "b", "c"]);
  // 자기 자신에 드롭 → 정규화만, 순서 불변.
  assert.deepEqual(computeMovedOrder(["b", "a"], ["a", "b"], "a", "a"), ["b", "a"]);
  // 존재하지 않는 대상에 드롭 → 꼬리로.
  assert.deepEqual(computeMovedOrder([], ["a", "b"], "a", "zz"), ["b", "a"]);
  // 존재하지 않는 항목을 옮기려 하면 정규화 결과만 반환.
  assert.deepEqual(computeMovedOrder([], ["a", "b"], "zz", "a"), ["a", "b"]);
});

test("seoulDayKey pins the calendar day to Asia/Seoul regardless of runner TZ", () => {
  // 2026-09-15T16:00:00Z = 2026-09-16 01:00 KST → 서울 기준 다음 날.
  assert.equal(seoulDayKey("2026-09-15T16:00:00Z"), "2026-09-16");
  assert.equal(seoulDayKey("2026-09-15T00:00:00Z"), "2026-09-15");
  assert.equal(seoulDayKey(new Date("2026-09-15T14:59:00Z")), "2026-09-15");
  assert.equal(seoulDayKey("garbage"), null);
  assert.equal(seoulDayKey(""), null);
});

test("todoTimeSection buckets by Seoul calendar day and never marks a done task overdue", () => {
  const today = "2026-09-15";
  assert.equal(todoTimeSection({ dueAt: "2026-09-14T03:00:00Z" }, today), "기한 지남");
  // 완료된 할 일은 손실 상태가 아니다 (DESIGN.md §5.2 no-warning-by-default).
  assert.equal(todoTimeSection({ dueAt: "2026-09-14T03:00:00Z", done: true }, today), "오늘");
  assert.equal(todoTimeSection({ dueAt: "2026-09-15T03:00:00Z" }, today), "오늘");
  assert.equal(todoTimeSection({ dueAt: "2026-09-16T03:00:00Z" }, today), "내일");
  assert.equal(todoTimeSection({ dueAt: "2026-09-20T03:00:00Z" }, today), "이번 주");
  // 경계: diff === 7은 아직 '이번 주'다 (`if (diff <= 7)`).
  assert.equal(todoTimeSection({ dueAt: "2026-09-22T03:00:00Z" }, today), "이번 주");
  assert.equal(todoTimeSection({ dueAt: "2026-09-23T03:00:00Z" }, today), "이후");
  assert.equal(todoTimeSection({ dueAt: null }, today), "기한 없음");
  assert.equal(todoTimeSection({}, today), "기한 없음");
  assert.equal(todoTimeSection({ dueAt: "2026-09-16T03:00:00Z" }, null), "기한 없음");
  // 버킷 이름은 To-dos 뷰 섹션 목록과 정확히 일치해야 한다.
  for (const probe of [
    { dueAt: "2026-09-14T03:00:00Z" }, { dueAt: "2026-09-15T03:00:00Z" },
    { dueAt: "2026-09-16T03:00:00Z" }, { dueAt: "2026-09-20T03:00:00Z" },
    { dueAt: "2026-09-23T03:00:00Z" }, {},
  ]) {
    assert.ok(TODO_TIME_SECTIONS.includes(todoTimeSection(probe, today)));
  }
});

test("slugifyContainer produces a table-safe unique slug and falls back on Korean-only names", () => {
  assert.equal(slugifyContainer("New Brand", "abcdef1234"), "new-brand");
  assert.equal(slugifyContainer("  Mixed__Case!!  ", "x"), "mixed-case");
  // 한글만 있는 이름은 a-z0-9로 남는 게 없어 id 기반 대체 슬러그로 떨어진다.
  assert.equal(slugifyContainer("우리학원", "abcdef1234"), "c-abcdef12");
  assert.equal(slugifyContainer("", "abcdef1234"), "c-abcdef12");
  assert.equal(slugifyContainer(null, null), "c-");
});

test("buildLocalContainer shapes a preview row the container tree can place immediately", () => {
  const row = buildLocalContainer(
    { id: "id-1", name: "  우리학원 KA  ", orgScope: "classin", category: "ka-deal" },
    "c-id1",
  );
  assert.equal(row.key, "c-id1");
  assert.equal(row.id, "id-1");
  assert.equal(row.name, "우리학원 KA");
  assert.equal(row.kind, "brand");
  assert.equal(row.orgScope, "classin");
  assert.equal(row.category, "ka-deal");
  assert.equal(row.preview, true);
  // preview 행은 실데이터와 섞이지 않도록 모든 집계가 0이어야 한다 (CLAUDE.md 코드 규칙).
  assert.equal(row.projects, 0);
  assert.equal(row.tasks, 0);
  assert.equal(row.open, 0);
  assert.equal(row.changes, 0);
});

test("container categories exclude the brand-owned class from the create/edit options (2026-08-29)", () => {
  assert.ok(PROJECT_CATEGORIES.some(c => c.key === BRAND_OWNED_CATEGORY));
  assert.equal(CONTAINER_CATEGORY_OPTIONS.some(o => o.value === BRAND_OWNED_CATEGORY), false);
  assert.equal(CONTAINER_CATEGORY_OPTIONS.length, PROJECT_CATEGORIES.length - 1);
  for (const option of CONTAINER_CATEGORY_OPTIONS) {
    assert.equal(typeof option.value, "string");
    assert.equal(typeof option.label, "string");
  }
});

test("status stripes stay neutral line tokens and only Blocked inherits danger", () => {
  // DESIGN.md §5.3 lifecycle은 중립 — Moonstone은 current/selected 전용, 막힘만 danger.
  // 한국어 라벨의 정본은 project-pms-components의 PROJECT_STATUS_LABEL_KO다(§8.2) —
  // 이 모듈은 라벨 사전을 두 번째로 소유하지 않는다.
  assert.deepEqual(
    Object.keys(STATUS_LINE_TOKEN).sort(),
    ['Backlog', 'Blocked', 'Done', 'In progress', 'Planning', 'Review'],
  );
  for (const [status, token] of Object.entries(STATUS_LINE_TOKEN)) {
    assert.match(token, /^var\(--(line-strong|line-soft|danger-line)\)$/, `${status} → ${token}`);
  }
  assert.equal(STATUS_LINE_TOKEN.Blocked, "var(--danger-line)");
  assert.equal(
    Object.values(STATUS_LINE_TOKEN).filter(t => t.includes('danger')).length,
    1,
    'danger 스트라이프는 Blocked 하나뿐이다 (§5.3 red-budget)',
  );
  for (const group of LIST_STATUS_GROUPS) {
    assert.match(group.tone, /^var\(--[a-z-]+\)$/);
    assert.ok(group.label.length > 0);
  }
  assert.equal(
    LIST_STATUS_GROUPS.find(({ key }) => key === 'In progress')?.label,
    '진행 중',
    '프로젝트 진행 상태 그룹은 상세 배지와 같은 용어를 쓴다',
  );
  // 요약 필터 라벨 4칸은 project-pms-components의 PORTFOLIO_CELLS와 같은 키를 쓴다.
  assert.deepEqual(
    Object.keys(SUMMARY_FILTER_LABELS).sort(),
    ["active", "blockedOrOverdue", "dueSoon", "unmeasured"],
  );
});
