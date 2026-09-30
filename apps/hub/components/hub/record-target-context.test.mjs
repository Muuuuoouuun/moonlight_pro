import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { RecordTargetContext, readTargetActivities } from "./record-target-context.jsx";
import { followupPromise } from "../../lib/sales-os/record-queue.js";

// 2026-09-30 넓은 기록창 ④(Q-CR2 · 권장) — 오늘 연락에서 연 기록창의 읽기 칸. 고객 드로어와 같은 길로 읽는다.

const source = readFileSync(new URL("./record-target-context.jsx", import.meta.url), "utf8");
const formSource = readFileSync(new URL("./contact-record-form.jsx", import.meta.url), "utf8");
const text = (html) => html.replace(/<[^>]+>/g, "");
const TARGET = { kind: "lead", id: "lead-1", companyId: "co-1", name: "읽기 칸 고객" };
const render = (props = {}) => renderToStaticMarkup(React.createElement(RecordTargetContext, { target: TARGET, today: "2026-09-30", ...props }));
const answer = (body, { ok = true } = {}) => async () => ({ ok, json: async () => body });

test("the activity read names a failure as a failure — never as an empty list", async () => {
  const rows = [{ id: "a1", type: "call", msg: "견적 검토 통화" }];
  assert.deepEqual(await readTargetActivities("companyId=co-1", answer({ status: "live", activities: rows })), { sync: "live", activities: rows });
  // 허브 read 계약: 실패도 HTTP 200 + status:"error"다 — !ok만 보면 "기록 없음"으로 위장된다.
  assert.deepEqual(await readTargetActivities("companyId=co-1", answer({ status: "error", activities: [] })), { sync: "error", activities: [] });
  assert.deepEqual(await readTargetActivities("companyId=co-1", answer({ status: "live", activities: rows }, { ok: false })), { sync: "error", activities: [] });
  assert.deepEqual(await readTargetActivities("companyId=co-1", async () => { throw new Error("offline"); }), { sync: "error", activities: [] });
  assert.deepEqual(await readTargetActivities("companyId=co-1", async () => ({ ok: true, json: async () => { throw new Error("not json"); } })), { sync: "error", activities: [] });
  assert.deepEqual(await readTargetActivities("companyId=co-1", answer(null)), { sync: "error", activities: [] });
  // 연결 전(202 preview)은 실패가 아니라 미연결이다.
  assert.deepEqual(await readTargetActivities("companyId=co-1", answer({ status: "preview", activities: [] })), { sync: "preview", activities: [] });
  // 목록이 아닌 답은 빈 목록으로 읽는다(던지지 않는다).
  assert.deepEqual(await readTargetActivities("leadId=x", answer({ status: "live" })), { sync: "live", activities: [] });
});

test("the read goes through the customer drawer's path and is skipped for an unsaved customer", async () => {
  const calls = [];
  const fetchImpl = async (...args) => { calls.push(args); return { ok: true, json: async () => ({ status: "live", activities: [] }) }; };
  await readTargetActivities("companyId=co-1", fetchImpl);
  assert.deepEqual(calls, [["/api/hub/revenue/activity?companyId=co-1", { cache: "no-store" }]]);
  // 저장된 고객이 아니면(질의 없음) 읽지 않는다.
  assert.deepEqual(await readTargetActivities("", fetchImpl), { sync: "preview", activities: [] });
  assert.equal(calls.length, 1);
  // 질의는 고객 드로어와 같은 조인 규칙(회사 우선)이 만든다 — 새 읽기 라우트는 없다.
  assert.match(source, /const query = recordActivityQuery\(target\);/);
  assert.equal((source.match(/\/api\/hub\//g) || []).length, 2, "주석 한 곳 + 읽기 한 곳 — 활동 읽기 길 하나뿐이다");
  // 연결 메모도 고객 드로어와 같은 조회다(리드 · 계약 고객의 uuid 문맥, 3건).
  assert.match(source, /const memoEnabled = \(target\?\.kind === "lead" \|\| target\?\.kind === "account"\) && isCanonicalUuid\(target\?\.id\);/);
  assert.match(source, /useMemoSearch\(memoQuery, \{ enabled: memoEnabled \}\)/);
  assert.match(source, /&limit=3`/);
});

test("while it reads the column shows a skeleton — and never blocks the writing pane", () => {
  const html = render({ promise: followupPromise({ promiseText: "견적서 보내기" }, { todayKey: "2026-09-30", promiseKey: "2026-10-02" }) });
  // 읽기 칸 — 읽기만. 약속은 호출처가 이미 아는 것이라 읽기를 기다리지 않고 선다.
  assert.match(html, /^<aside class="record-ctx" aria-label="읽기 칸 고객 · 읽기만">/);
  assert.match(html, /<p class="record-ctx__what">견적서 보내기<\/p>/);
  // 첫 그리기는 읽는 중이다 — "기록 없음"이 아니라 Skeleton.
  assert.match(html, /class="hub-skeleton"/);
  assert.match(html, /기록 불러오는 중/);
  assert.doesNotMatch(text(html), /아직 기록이 없어요|읽지 못했어요/);
  // 이 칸은 쓰기 칸과 따로 선다 — 폼은 이 파일을 모르고, 껍데기는 읽기 칸을 받아 옆에 놓기만 한다.
  assert.doesNotMatch(formSource, /record-target-context/);
  assert.match(formSource, /\{context\(effectiveTarget\)\}/);
  // 늦게 온 앞 요청의 답이 새 읽기를 덮지 않는다.
  assert.match(source, /readTargetActivities\(query\)\.then\(\(next\) => \{ if \(requestRef\.current === requestId\) setState\(next\); \}\);/);
  assert.match(source, /return \(\) => \{ requestRef\.current \+= 1; \};/);
  // 읽기 상태는 고객 드로어와 같은 규칙(recordContextTruth)이 말한다 — 다시 읽기는 읽지 못한 쪽만.
  assert.match(source, /truth=\{recordContextTruth\(\{ actSync: sync, memoEnabled, memoStatus: memos\.status \}\)\}/);
  assert.match(source, /onRetry=\{\(which\) => \(which === "memos" \? memos\.refresh\(\) : reload\(\)\)\}/);
});

test("a customer outside the list has an unknown promise — the column says so instead of 'not decided'", () => {
  const html = render({ promise: null });
  assert.match(html, /<p class="record-ctx__what" data-muted="true">여기서는 약속을 알 수 없어요<\/p>/);
  assert.match(html, /<p class="record-ctx__when">목록에 없는 고객이에요 · 고객 탭에서 확인해요<\/p>/);
  assert.doesNotMatch(text(html), /아직 정하지 않았어요/);
  // 이 사람에게 이미 고른 제안 팁은 이유만 보인다(버튼 없음 — 한 사람에 팁 하나).
  const tipped = render({ promise: null, tipReason: "우려 반응 뒤 닷새째 정리가 없어요" });
  assert.match(text(tipped), /우려 반응 뒤 닷새째 정리가 없어요/);
  // 이 창에는 '고객 정보로'가 없다 — 다섯 줄을 넘는 기록은 고객 탭에서 본다.
  assert.match(source, /elsewhere="고객 탭"/);
});
