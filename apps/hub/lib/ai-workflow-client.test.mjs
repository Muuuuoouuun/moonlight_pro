import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createAdviceTaskWriter,
  parseExtractedActions,
  buildDailyDispatchContext,
  buildWeeklySummaryText,
  extractWeeklyExperiment,
  parseContactOutcomeExtraction,
} from "./ai-workflow-client.js";

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

test("buildWeeklySummaryText builds structured fact summary for personal and company scopes", () => {
  const personalReport = {
    periodStart: "2026-09-14",
    periodEnd: "2026-09-20",
    stats: { doneTasks: 8, publishes: 2, contacts: 5, personalDeals: 1 },
    goals: { objectives: [{ title: "B2B 파일럿 3건 성사", status: "active" }] },
    highlights: [{ kind: "won", label: "아카데미 연간 라이선스" }],
  };
  const pText = buildWeeklySummaryText(personalReport, "personal");
  assert.match(pText, /개인 주간 실적 팩트 \(2026-09-14 ~ 2026-09-20\)/);
  assert.match(pText, /완료 할 일: 8건/);
  assert.match(pText, /발행: 2건/);
  assert.match(pText, /CRM 연락: 5건/);
  assert.match(pText, /개인 딜: 1건/);
  assert.match(pText, /B2B 파일럿 3건 성사/);
  assert.match(pText, /Won: 아카데미 연간 라이선스/);

  const companyReport = {
    periodStart: "2026-09-14",
    periodEnd: "2026-09-20",
    stats: { contacts: 14, newDeals: 3, modifiedOpenDeals: 5, wonDeals: 2 },
    goals: { objectives: [{ title: "ClassIn 신규 파트너 5곳 확보", status: "active" }] },
    highlights: [],
  };
  const cText = buildWeeklySummaryText(companyReport, "company");
  assert.match(cText, /회사\(ClassIn\) 주간 실적 팩트/);
  assert.match(cText, /CRM 연락: 14건/);
  assert.match(cText, /신규 딜: 3건/);
  assert.match(cText, /수정된 진행 딜: 5건/);
  assert.match(cText, /성사일 확인된 딜: 2건/);
  assert.match(cText, /ClassIn 신규 파트너 5곳 확보/);

  assert.equal(buildWeeklySummaryText(null, "personal"), "");
});

test("extractWeeklyExperiment parses experiment titles from council outputs", () => {
  const sample1 = `
1. 📊 [이번 주 실행 팩트 요약]
완료 8건, 연락 5건 진행됨.

2. 🔍 [냉철한 병목 및 패턴 진단]
미접촉 리드 3건이 5일 이상 체류 중.

3. 🎯 [다음 주 Council 조언: 단 1가지 가역적 실험]
📌 다음 주 단 1가지 실험: [신규 학원장 3곳 15분 티타임 콜]
완료 기준: 수요일까지 3통화 완료 및 반응 기록
`;
  assert.equal(
    extractWeeklyExperiment(sample1),
    "다음 주 실험: 신규 학원장 3곳 15분 티타임 콜"
  );

  const sample2 = `
📌 추천 태스크: [미접촉 리드 5건 리드마그넷 발송]
`;
  assert.equal(
    extractWeeklyExperiment(sample2),
    "미접촉 리드 5건 리드마그넷 발송"
  );

  assert.equal(extractWeeklyExperiment("단순 일반 텍스트 조언"), null);
  assert.equal(extractWeeklyExperiment(null), null);
});

test("parseContactOutcomeExtraction parses Korean formatted customer contact outcomes", () => {
  const sample = `
[분석 결과]
- [채널]: 카카오톡
- [고객 반응]: 긍정
- [1줄 요약]: 이번 주 금요일까지 표준 견적서 송부 요청, 가격 할인 문의
- [다음 액션]: 할인 정책 반영 견적서 발송
- [다음 일정]: 2026-09-25
- [기약 없음]: 아니오
`;
  const result = parseContactOutcomeExtraction(sample);
  assert.equal(result.kind, "kakao");
  assert.equal(result.reaction, "positive");
  assert.equal(result.summary, "이번 주 금요일까지 표준 견적서 송부 요청, 가격 할인 문의");
  assert.equal(result.nextAction, "할인 정책 반영 견적서 발송");
  assert.equal(result.nextAt, "2026-09-25");
  assert.equal(result.dormant, false);
});

test("parseContactOutcomeExtraction handles English keys, relative dates, and dormant signals", () => {
  const sampleDormant = `
channel: call
reaction: rejected
summary: 당분간 예산 동결로 도입 계획 취소됨
next action: 없음
기약 없음: 예
`;
  const resDormant = parseContactOutcomeExtraction(sampleDormant);
  assert.equal(resDormant.kind, "call");
  assert.equal(resDormant.reaction, "rejected");
  assert.equal(resDormant.summary, "당분간 예산 동결로 도입 계획 취소됨");
  assert.equal(resDormant.nextAction, "");
  assert.equal(resDormant.dormant, true);

  const baseDate = new Date("2026-09-22T06:00:00Z"); // 2026-09-22 15:00 KST
  const sampleRelative = `
[채널]: 미팅
[반응]: 우려
[요약]: 도입 일정에 대한 우려가 있어 레퍼런스 공유 필요
[다음 행동]: 유사 학원 도입 사례집 송부
[다음 일정]: 내일
`;
  const resRelative = parseContactOutcomeExtraction(sampleRelative, baseDate);
  assert.equal(resRelative.kind, "meeting");
  assert.equal(resRelative.reaction, "concern");
  assert.equal(resRelative.nextAction, "유사 학원 도입 사례집 송부");
  assert.equal(resRelative.nextAt, "2026-09-23");
  assert.equal(resRelative.dormant, false);

  // Edge cases: null or empty
  assert.deepEqual(parseContactOutcomeExtraction(null), {
    kind: null,
    reaction: null,
    summary: "",
    nextAction: "",
    nextAt: "",
    dormant: false,
  });
  assert.deepEqual(parseContactOutcomeExtraction(""), {
    kind: null,
    reaction: null,
    summary: "",
    nextAction: "",
    nextAt: "",
    dormant: false,
  });
});


