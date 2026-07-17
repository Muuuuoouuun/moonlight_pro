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
