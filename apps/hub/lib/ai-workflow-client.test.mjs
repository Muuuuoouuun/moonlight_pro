import assert from "node:assert/strict";
import { test } from "node:test";
import { createAdviceTaskWriter, parseExtractedActions, buildDailyDispatchContext } from "./ai-workflow-client.js";

const id = "11111111-1111-4111-8111-111111111111";
const json = (data, status = 200) => Response.json(data, { status });

test("AI task creation waits for a matching durable receipt and keeps the ID on retry", async () => {
  const bodies = [];
  let round = 0;
  const writer = createAdviceTaskWriter({ createId: () => id, fetchImpl: async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    round += 1;
    if (round === 1) return json({ status: "preview" }, 202);
    if (round === 2) return json({ status: "saved", task: { id: "other" } });
    if (round === 3) throw new Error("response lost after write");
    return json({ status: "duplicate", task: { id } });
  } });
  const input = { key: "memo-action", title: "견적 보내기" };
  for (let i = 0; i < 3; i++) assert.equal((await writer.save(input)).state, "error");
  assert.deepEqual(await writer.save(input), { state: "saved", id });
  assert.deepEqual(await writer.save(input), { state: "saved", id });
  assert.equal(bodies.length, 4, "a saved suggestion cannot create another task");
  assert.ok(bodies.every(body => body.id === id));
});

test("concurrent AI task clicks share one request and preserve only explicit relationships", async () => {
  let finish;
  let calls = 0;
  let body;
  const writer = createAdviceTaskWriter({ createId: () => id, fetchImpl: (_url, init) => {
    calls += 1;
    body = JSON.parse(init.body);
    return new Promise(resolve => { finish = resolve; });
  } });
  const input = { key: "deal-advice", title: "  다음 연락  ", dealId: id };
  const first = writer.save(input);
  const second = writer.save(input);
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(body.title, "다음 연락");
  assert.equal(body.dealId, id);
  assert.equal(body.projectId, null, "a deal ID is not a project ID");
  finish(json({ status: "saved", entity: { id } }));
  assert.equal((await first).state, "saved");
});

test("synchronous transport failures remain retryable and invalid AI titles never POST", async () => {
  let calls = 0;
  const writer = createAdviceTaskWriter({ createId: () => id, fetchImpl: () => { calls++; throw new Error("offline"); } });
  assert.equal((await writer.save({ key: "x", title: "" })).state, "error");
  assert.equal((await writer.save({ key: "x", title: "x".repeat(301) })).state, "error");
  assert.equal(calls, 0);
  await writer.save({ key: "x", title: "재시도" });
  await writer.save({ key: "x", title: "재시도" });
  assert.equal(calls, 2);
});

test("action extraction strips classification and ignores headings, prose and duplicate actions", () => {
  const parsed = parseExtractedActions("1. 📌 [1줄 핵심 요약]: 고객 후속\n2. 📋 [추출된 다음 행동 (Action Items)]:\n- 🎯 [분류: Task] 견적 보내기 (내일)\n- 🎯 [분류: Task] 견적 보내기 (내일)\n- [추천 원장] Tasks\n3. 💡 [Moonlight 추천 연결]:\n- 🎯 [분류: Idea] 후속 콘텐츠 정리");
  assert.equal(parsed.summary, "고객 후속");
  assert.deepEqual(parsed.actions.map(action => action.title), ["견적 보내기 (내일)", "후속 콘텐츠 정리"]);
  assert.equal(parseExtractedActions(null).actions.length, 0);
});

test("daily briefing preserves actual customer actions, agenda, caps and source truth", () => {
  const context = buildDailyDispatchContext({
    now: new Date("2026-09-21T09:00:00Z"),
    sourceState: "partial",
    dailyFocus: {
      urgentKa: { state: "error", item: { name: "stale KA" } },
      focusCustomers: { state: "live", items: [{ name: "고객", nextAction: "견적 확인", dueLabel: "오늘까지", reason: "기한 도래" }] },
      todayAgenda: { state: "preview", items: [{ title: "stale agenda" }] },
    },
    taskToday: { state: "partial", items: [{ title: "대기 작업", status: "blocked", lane: "waiting", dueAt: "2026-09-25" }], counts: { total: 12 }, hiddenCount: 11, streak: { todayDoneCount: 3 } },
    signals: [{ title: "신호", summary: "실제 사유", tone: "neutral" }],
  });
  assert.equal(context.hour, 18);
  assert.equal(context.isEvening, true);
  assert.deepEqual(context.urgentKa, { state: "error" });
  assert.deepEqual(context.todayAgenda, { state: "preview" });
  assert.equal(context.focusCustomers.items[0].nextAction, "견적 확인");
  assert.equal(context.tasks.items[0].lane, "waiting");
  assert.equal(context.tasks.hiddenCount, 11);
  assert.equal(context.tasks.completedTodayCount, 3);
  assert.equal(context.signals[0].summary, "실제 사유");
  assert.match(context.limitations, /완료 항목의 제목과 내일 일정은 조회하지 않았습니다/);
});

test("daily briefing does not pass failed task or signal reads as current facts", () => {
  const context = buildDailyDispatchContext({ sourceState: "error", taskToday: { state: "error", items: [{ title: "stale" }] }, signals: [{ title: "stale" }] });
  assert.deepEqual(context.tasks, { state: "error" });
  assert.deepEqual(context.signals, []);
});
