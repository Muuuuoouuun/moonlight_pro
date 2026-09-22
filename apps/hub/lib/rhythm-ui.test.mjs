import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const rhythmUi = await import("./rhythm-ui.js").catch(() => ({}));
const workSource = await readFile(
  new URL("../components/hub/pages/work.jsx", import.meta.url),
  "utf8",
);

test("Rhythm filters an explicit project exactly and leaves the unscoped view complete", () => {
  assert.equal(typeof rhythmUi.filterRhythmRows, "function");
  const rows = [
    { id: "r-1", projectId: "project-1", weeks: [0, 0, 0, 0, 0, 0, 1], streak: 1 },
    { id: "r-2", projectId: "project-2", weeks: [0, 0, 0, 0, 0, 1, 0], streak: 0 },
    { id: "r-3", projectId: null, weeks: [0, 0, 0, 0, 0, 0, 0], streak: 0 },
  ];

  assert.deepEqual(rhythmUi.filterRhythmRows(rows, "project-1"), [rows[0]]);
  assert.deepEqual(rhythmUi.filterRhythmRows(rows, null), rows);
  assert.deepEqual(rhythmUi.filterRhythmRows(rows, ""), rows);
  assert.deepEqual(rhythmUi.filterRhythmRows(rows, "missing"), []);
});

test("Rhythm summary is recalculated only from the filtered rows", () => {
  assert.equal(typeof rhythmUi.summarizeRhythmRows, "function");
  const summary = rhythmUi.summarizeRhythmRows([
    { name: "Daily focus", weeks: [0, 0, 0, 0, 0, 0, 1], streak: 4 },
  ]);

  assert.deepEqual(summary, {
    ritualsCompletedThisWeek: 1,
    ritualsTotalThisWeek: 1,
    longestStreak: 4,
    longestStreakRitual: "Daily focus",
  });
});

test("partial Rhythm progress is observational and never exposed as a determinate progressbar", () => {
  assert.equal(typeof rhythmUi.getRhythmProgressProps, "function");

  assert.deepEqual(
    rhythmUi.getRhythmProgressProps({ partial: false, completed: 3, total: 5 }),
    {
      role: "progressbar",
      "aria-label": "이번 주 완료한 리추얼",
      "aria-valuemin": 0,
      "aria-valuemax": 5,
      "aria-valuenow": 3,
      "aria-valuetext": "3 / 5",
    },
  );
  assert.deepEqual(
    rhythmUi.getRhythmProgressProps({ partial: true, completed: 3, total: 5 }),
    {
      role: "status",
      "aria-label": "일부 기록에서 관측된 이번 주 리추얼 완료 3 / 5",
    },
  );
});

test("durable check payload preserves identity without trusting the browser date", () => {
  assert.equal(typeof rhythmUi.toLocalDateKey, "function");
  assert.equal(typeof rhythmUi.buildRhythmCheckPayload, "function");
  const local = new Date(2026, 6, 17, 23, 45, 0);

  assert.equal(rhythmUi.toLocalDateKey(local), "2026-07-17");
  assert.deepEqual(
    rhythmUi.buildRhythmCheckPayload({
      projectId: "project-1",
      ritualKey: "daily-focus",
      checkType: "morning",
      name: " Daily focus ",
    }, { now: local, note: "  오늘의 핵심 완료  " }),
    {
      projectId: "project-1",
      ritualKey: "daily-focus",
      checkType: "morning",
      name: "Daily focus",
      note: "오늘의 핵심 완료",
      status: "done",
    },
  );
});

test("saved and duplicate responses require a successful ledger refetch before bitmap changes", () => {
  assert.equal(typeof rhythmUi.resolveRhythmCheckResult, "function");
  const saved = rhythmUi.resolveRhythmCheckResult({
    responseOk: true,
    httpStatus: 201,
    data: { status: "saved" },
  });
  const duplicate = rhythmUi.resolveRhythmCheckResult({
    responseOk: true,
    httpStatus: 200,
    data: { status: "duplicate" },
  });

  assert.equal(saved.kind, "saved");
  assert.equal(saved.durable, true);
  assert.equal(saved.shouldRefetch, true);
  assert.equal(duplicate.kind, "duplicate");
  assert.equal(duplicate.durable, true);
  assert.equal(duplicate.shouldRefetch, true);
});

test("preview and transport failures remain explicitly unsaved", () => {
  const preview = rhythmUi.resolveRhythmCheckResult({
    responseOk: true,
    httpStatus: 202,
    data: { status: "preview", message: "Preview only" },
  });
  const httpError = rhythmUi.resolveRhythmCheckResult({
    responseOk: false,
    httpStatus: 502,
    data: { status: "error", error: "ledger read failed" },
  });
  const networkError = rhythmUi.resolveRhythmCheckResult({
    error: new Error("offline"),
  });

  assert.equal(preview.kind, "preview");
  assert.equal(preview.durable, false);
  assert.equal(preview.shouldRefetch, false);
  assert.match(preview.message, /저장되지|Preview/i);
  assert.equal(httpError.kind, "error");
  assert.equal(httpError.durable, false);
  assert.equal(httpError.shouldRefetch, false);
  assert.match(httpError.message, /ledger read failed/);
  assert.equal(networkError.kind, "error");
  assert.match(networkError.message, /offline/);
});

test("mutation state clears pending on failure, preserves bitmap, and ignores stale results", () => {
  assert.equal(typeof rhythmUi.beginRhythmCheck, "function");
  assert.equal(typeof rhythmUi.finishRhythmCheck, "function");
  const initial = {
    latestAttemptByRitual: {},
    pendingByRitual: {},
    feedbackByRitual: {},
    confirmedWeeks: { "ritual-1": [0, 0, 0, 0, 0, 0, 0] },
  };
  const first = rhythmUi.beginRhythmCheck(initial, "ritual-1", "attempt-1");
  const second = rhythmUi.beginRhythmCheck(first, "ritual-1", "attempt-2");
  const stale = rhythmUi.finishRhythmCheck(second, "ritual-1", "attempt-1", {
    kind: "saved",
    durable: true,
    shouldRefetch: true,
    message: "saved",
  });

  assert.strictEqual(stale, second);
  assert.equal(stale.pendingByRitual["ritual-1"], true);
  assert.deepEqual(stale.confirmedWeeks["ritual-1"], [0, 0, 0, 0, 0, 0, 0]);

  const failed = rhythmUi.finishRhythmCheck(second, "ritual-1", "attempt-2", {
    kind: "error",
    durable: false,
    shouldRefetch: false,
    message: "저장되지 않았습니다.",
  });
  assert.equal(failed.pendingByRitual["ritual-1"], undefined);
  assert.equal(failed.feedbackByRitual["ritual-1"].kind, "error");
  assert.deepEqual(failed.confirmedWeeks["ritual-1"], [0, 0, 0, 0, 0, 0, 0]);
});

test("slugifyRitualName lowercases, keeps Hangul, and never returns empty", () => {
  assert.equal(typeof rhythmUi.slugifyRitualName, "function");
  assert.equal(rhythmUi.slugifyRitualName("Morning Stretch!"), "morning-stretch");
  assert.equal(rhythmUi.slugifyRitualName("아침 스트레칭"), "아침-스트레칭");
  assert.equal(rhythmUi.slugifyRitualName("  --  "), "ritual");
  assert.equal(rhythmUi.slugifyRitualName(""), "ritual");
  assert.equal(rhythmUi.slugifyRitualName(null), "ritual");
});

test("buildRhythmDefinePayload derives a readable-but-unique ritualKey and normalizes fields", () => {
  assert.equal(typeof rhythmUi.buildRhythmDefinePayload, "function");
  const payload = rhythmUi.buildRhythmDefinePayload({
    id: "11112222-3333-4444-5555-666677778888",
    name: "  Morning Stretch  ",
    checkType: "MORNING",
    projectId: "  proj-1  ",
  });
  assert.equal(payload.ritualKey, "morning-stretch-11112222");
  assert.equal(payload.name, "Morning Stretch");
  assert.equal(payload.checkType, "morning");
  assert.equal(payload.projectId, "proj-1");

  const unscoped = rhythmUi.buildRhythmDefinePayload({ id: "id-1", name: "Focus", checkType: "" });
  assert.equal(unscoped.checkType, "morning");
  assert.equal(unscoped.projectId, null);
});

test("buildRhythmEditPayload only includes fields that actually changed, and always carries identity", () => {
  assert.equal(typeof rhythmUi.buildRhythmEditPayload, "function");
  const original = { ritualKey: "morning-stretch-abc", name: "Morning Stretch", checkType: "morning", projectId: "proj-1" };

  const noChange = rhythmUi.buildRhythmEditPayload(original, { ...original });
  assert.deepEqual(noChange, { ritualKey: "morning-stretch-abc", matchProjectId: "proj-1" });

  const renamed = rhythmUi.buildRhythmEditPayload(original, { ...original, name: "Sunrise Stretch" });
  assert.deepEqual(renamed, {
    ritualKey: "morning-stretch-abc",
    matchProjectId: "proj-1",
    name: "Sunrise Stretch",
  });

  const relinked = rhythmUi.buildRhythmEditPayload(original, { ...original, projectId: "" });
  assert.deepEqual(relinked, {
    ritualKey: "morning-stretch-abc",
    matchProjectId: "proj-1",
    projectId: null,
  });

  const retyped = rhythmUi.buildRhythmEditPayload(original, { ...original, checkType: "weekly" });
  assert.deepEqual(retyped, {
    ritualKey: "morning-stretch-abc",
    matchProjectId: "proj-1",
    checkType: "weekly",
  });
});

test("buildRhythmDeletePayload carries only the identity fields needed to find the routine's rows", () => {
  assert.equal(typeof rhythmUi.buildRhythmDeletePayload, "function");
  assert.deepEqual(
    rhythmUi.buildRhythmDeletePayload({ ritualKey: "morning-stretch-abc", projectId: "proj-1" }),
    { ritualKey: "morning-stretch-abc", matchProjectId: "proj-1" },
  );
  assert.deepEqual(
    rhythmUi.buildRhythmDeletePayload({ ritualKey: "evening-review-xyz", projectId: "" }),
    { ritualKey: "evening-review-xyz", matchProjectId: null },
  );
  assert.deepEqual(
    rhythmUi.buildRhythmDeletePayload({ ritualKey: "  morning  ", projectId: null }),
    { ritualKey: "morning", matchProjectId: null },
  );
});

test("Rhythm source wires create/edit/delete through /api/routine with a shared EditDrawer", () => {
  assert.match(workSource, /fetch\(['"]\/api\/routine['"]/);
  assert.match(workSource, /method:\s*['"]PATCH['"]/);
  assert.match(workSource, /method:\s*['"]DELETE['"]/);
  assert.match(workSource, /buildRhythmDefinePayload\(/);
  assert.match(workSource, /buildRhythmEditPayload\(/);
  assert.match(workSource, /buildRhythmDeletePayload\(/);
  assert.match(workSource, /onDelete=\{deleteRitual\}/);
  assert.match(workSource, /deletedRitualIdentities/);
  assert.match(workSource, /createRitual/);
  assert.match(workSource, /새 루틴/);
  assert.match(workSource, /연결 프로젝트/);
  assert.match(workSource, /setEditRitualId/);
  assert.match(workSource, /role="button"/);
});

test("Rhythm source keeps project context, durable feedback, and mobile scroll semantics", () => {
  assert.match(workSource, /searchParams\.get\(['"]project['"]\)/);
  assert.match(workSource, /filterRhythmRows\(/);
  assert.match(workSource, /rhythmState/);
  assert.match(workSource, /rhythmPartial/);
  assert.match(workSource, /rhythmTruncatedSources/);
  assert.match(workSource, /rhythmState === ['"]partial['"]/);
  assert.match(workSource, /getRhythmProgressProps\(/);
  assert.match(workSource, /rhythmPartial\s*\?\s*\([\s\S]*관측 \{completed\} \/ \{total\}[\s\S]*:\s*\([\s\S]*<Progress value=\{percent\}/);
  assert.match(workSource, /일부 기록/);
  assert.match(workSource, /routine_checks/);
  assert.match(workSource, /fetch\(['"]\/api\/routine\/check['"]/);
  assert.match(workSource, /method:\s*['"]POST['"]/);
  assert.match(workSource, /await\s+retry\(\)/);
  assert.match(workSource, /aria-live=["']polite["']/);
  assert.match(workSource, /disabled=\{[^}]*pending/);
  assert.match(workSource, /프로젝트로 돌아가기/);
  assert.match(workSource, /projectHref/);
  assert.match(workSource, /aria-label=\{`\$\{r\.projectName\s*\?\s*`\$\{r\.projectName\}\s*·\s*`\s*:\s*['"]['"]\}\$\{r\.name\} 체크인 저장`\}/);
  assert.match(workSource, /className=["']hub-rhythm-scroll["']/);
  assert.match(workSource, /aria-label=\{`최근 7일 체크 기록:/);
  assert.doesNotMatch(workSource, /checkedRituals/);
});

test("sortRitualsByTimeOfDay prioritizes rituals according to current time", () => {
  const rituals = [
    { id: "e1", checkType: "evening", name: "저녁 회고" },
    { id: "m1", checkType: "morning", name: "아침 스트레칭" },
    { id: "d1", checkType: "midday", name: "낮 산책" },
  ];

  // 오전 9시 테스트
  const morningSorted = rhythmUi.sortRitualsByTimeOfDay(rituals, new Date("2026-07-15T09:00:00"));
  assert.equal(morningSorted[0].checkType, "morning");
  assert.equal(morningSorted[0].isTimeRecommended, true);

  // 오후 2시 테스트
  const middaySorted = rhythmUi.sortRitualsByTimeOfDay(rituals, new Date("2026-07-15T14:00:00"));
  assert.equal(middaySorted[0].checkType, "midday");
  assert.equal(middaySorted[0].isTimeRecommended, true);

  // 저녁 8시 테스트
  const eveningSorted = rhythmUi.sortRitualsByTimeOfDay(rituals, new Date("2026-07-15T20:00:00"));
  assert.equal(eveningSorted[0].checkType, "evening");
  assert.equal(eveningSorted[0].isTimeRecommended, true);
});

test("computeWeeklyRhythmMatrix produces 7-day focus and outcome dataset", () => {
  const matrix = rhythmUi.computeWeeklyRhythmMatrix({
    rituals: [{ id: "r1", weeks: [1, 0, 1, 1, 0, 1, 1] }],
    todos: [{ id: "t1", status: "done", done: true, completedAt: "2026-07-15T10:00:00Z" }],
    now: new Date("2026-07-15T12:00:00Z"),
    timeZone: "Asia/Seoul",
  });

  assert.equal(matrix.length, 7);
  assert.ok(matrix[6].focusHours > 0);
  assert.ok(matrix[6].outcomes > 0);
  assert.equal(matrix[6].tasksDone, 1);
});

test("computeWeeklyRhythmMatrix reads no activity as zero, not a baseline", () => {
  const matrix = rhythmUi.computeWeeklyRhythmMatrix({
    rituals: [],
    todos: [{ id: "t-edited", status: "done", done: true, updatedAt: "2026-07-15T10:00:00Z" }],
    now: new Date("2026-07-15T12:00:00Z"),
    timeZone: "Asia/Seoul",
  });

  assert.equal(matrix.length, 7);
  for (const day of matrix) {
    assert.equal(day.focusHours, 0);
    assert.equal(day.outcomes, 0);
    assert.equal(day.tasksDone, 0);
    assert.equal(day.label, "기록 없음");
  }
});

test("weekly target accepts only integers 1-7 and defaults by check type", () => {
  assert.equal(rhythmUi.normalizeTargetPerWeek(3), 3);
  assert.equal(rhythmUi.normalizeTargetPerWeek("5"), 5);
  assert.equal(rhythmUi.normalizeTargetPerWeek(0), null);
  assert.equal(rhythmUi.normalizeTargetPerWeek(100), null);
  assert.equal(rhythmUi.normalizeTargetPerWeek(2.5), null);
  assert.equal(rhythmUi.normalizeTargetPerWeek(""), null);
  assert.equal(rhythmUi.defaultTargetPerWeek("weekly"), 1);
  assert.equal(rhythmUi.defaultTargetPerWeek("morning"), 7);

  const weekly = rhythmUi.buildRhythmDefinePayload({ id: "abc", name: "주간 리뷰", checkType: "weekly", targetPerWeek: 0 });
  assert.equal(weekly.targetPerWeek, 1);
  assert.equal(weekly.category, "general");
  const explicit = rhythmUi.buildRhythmDefinePayload({ id: "abc", name: "러닝", checkType: "morning", category: "health", targetPerWeek: 3 });
  assert.equal(explicit.targetPerWeek, 3);
  assert.equal(explicit.category, "health");

  const original = { ritualKey: "run", projectId: null, name: "러닝", checkType: "morning", category: "health", targetPerWeek: 3 };
  assert.equal("targetPerWeek" in rhythmUi.buildRhythmEditPayload(original, { ...original, targetPerWeek: 0 }), false);
  assert.equal(rhythmUi.buildRhythmEditPayload(original, { ...original, targetPerWeek: 4 }).targetPerWeek, 4);
  assert.equal(rhythmUi.buildRhythmEditPayload(original, { ...original, category: "work" }).category, "work");
});

test("무효한 주간 목표는 조용히 버려지지 않고 이름이 붙은 입력 오류가 된다", () => {
  const original = { ritualKey: "run", projectId: null, name: "러닝", checkType: "morning", category: "health", targetPerWeek: 3 };

  // 범위 밖·빈 칸(숫자 필드가 0으로 바꾼다)은 payload에서 빠지므로 반드시 먼저 막아야 한다.
  assert.deepEqual(rhythmUi.invalidRhythmEditFields(original, { ...original, targetPerWeek: 9 }), ["targetPerWeek"]);
  assert.deepEqual(rhythmUi.invalidRhythmEditFields(original, { ...original, targetPerWeek: 0 }), ["targetPerWeek"]);
  assert.deepEqual(rhythmUi.invalidRhythmEditFields(original, { ...original, targetPerWeek: 2.5 }), ["targetPerWeek"]);

  // 유효한 변경·무변경·다른 필드만 바뀐 편집은 막지 않는다.
  assert.deepEqual(rhythmUi.invalidRhythmEditFields(original, { ...original, targetPerWeek: 4 }), []);
  assert.deepEqual(rhythmUi.invalidRhythmEditFields(original, { ...original }), []);
  assert.deepEqual(rhythmUi.invalidRhythmEditFields(original, { ...original, name: "러닝 30분" }), []);

  // 저장된 값 자체가 범위 밖인 낡은 행에서 이름만 고치는 편집은 막다른 길이 되면 안 된다.
  const legacy = { ...original, targetPerWeek: 9 };
  assert.deepEqual(rhythmUi.invalidRhythmEditFields(legacy, { ...legacy, name: "러닝 30분" }), []);

  assert.match(rhythmUi.RHYTHM_INVALID_FIELD_MESSAGES.targetPerWeek, /1~7/);
});

test("Rhythm 편집은 무효 입력을 PATCH 전에 막고 드로어에 원인을 돌려준다", () => {
  assert.match(workSource, /invalidRhythmEditFields\(original, editingRitual\)/);
  assert.match(workSource, /RHYTHM_INVALID_FIELD_MESSAGES/);
  // 가드가 payload 조립보다 앞에 있어야 무음 저장 경로가 사라진다.
  assert.ok(
    workSource.indexOf("invalidRhythmEditFields(original, editingRitual)")
      < workSource.indexOf("buildRhythmEditPayload(original, editingRitual)"),
    "invalid-field guard must run before the PATCH payload is built",
  );
});

test("summarizeRitualsByCategory sums check-ins against each ritual's weekly target", () => {
  const summary = rhythmUi.summarizeRitualsByCategory([
    { category: "health", targetPerWeek: 3, checkType: "morning", weeks: [1, 0, 1, 0, 0, 0, 1] },
    { category: "health", checkType: "weekly", weeks: [0, 0, 0, 0, 0, 0, 1] },
    { category: "unknown", checkType: "evening", weeks: [0, 0, 0, 0, 0, 0, 0] },
  ]);

  assert.deepEqual(summary.map((c) => c.category), ["health", "general"]);
  assert.equal(summary[0].count, 2);
  assert.equal(summary[0].completedThisWeek, 4);
  assert.equal(summary[0].targetThisWeek, 4);
  assert.equal(summary[1].targetThisWeek, 7);
});
