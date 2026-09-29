import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const mod = await import("./record-candidates.jsx");
const source = await readFile(new URL("./record-candidates.jsx", import.meta.url), "utf8");
const { RecordCandidates, RecordCandidatesView, resolveRecordCandidate, postRecordCandidateAction } = mod;

const NOW = Date.parse("2026-09-24T08:05:00Z"); // KST 17:05
const kst = (local) => new Date(`${local}+09:00`).toISOString();
const view = (props) => renderToStaticMarkup(React.createElement(RecordCandidatesView, { now: NOW, onNavigate: () => {}, ...props }));

const meeting = {
  id: "calendar:lead:22222222-2222-4222-8222-222222222222:evt-1", source: "calendar", channel: "meeting",
  occurredAt: kst("2026-09-23T14:00:00"), durationSec: null, text: null, promiseHint: null, title: "정우학원 상담", confidence: "guess",
  customer: { key: "lead:22222222-2222-4222-8222-222222222222", kind: "lead", id: "22222222-2222-4222-8222-222222222222", name: "정우학원", org: null, person: null },
};
const call = {
  id: "phone:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", source: "phone", channel: "call", occurredAt: kst("2026-09-24T14:32:00"), durationSec: 252,
  text: null, promiseHint: null, count: 1,
  customer: { key: "lead:33333333-3333-4333-8333-333333333333", kind: "lead", id: "33333333-3333-4333-8333-333333333333", name: "리드인 독서논술", org: null, person: "이수진 대표" },
};
const kakao = {
  id: "phone:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", source: "phone", channel: "kakao", occurredAt: kst("2026-09-24T17:05:00"), durationSec: null,
  text: "다음 주 화요일 4시에 체험 수업 가능할까요?", count: 1,
  promiseHint: { title: "다음 주 화요일 4시에 체험 수업 가능할까요", dueAt: "2026-09-29T16:00:00+09:00", label: "9/29(화) 16:00" },
  customer: { key: null, kind: null, id: null, name: "박서연", org: "서연영어", person: "박서연" },
};

test("loading draws skeleton rows under the section eyebrow, never an empty state", () => {
  const html = view({ status: "loading" });
  assert.match(html, /기록할까요/);
  assert.match(html, /class="hub-skeleton"/);
  assert.doesNotMatch(html, /data-empty/);
  // SSR 첫 렌더(읽기 전)도 로딩이다.
  assert.match(renderToStaticMarkup(React.createElement(RecordCandidates, {})), /class="hub-skeleton"/);
});

test("error names the failure with a retry; preview says the connection is missing; live-and-empty renders nothing", () => {
  const error = view({ status: "error", message: "기록 후보를 불러오지 못했어요.", onRetry: () => {} });
  assert.match(error, /data-truth="error"/);
  assert.match(error, /role="alert"/);
  assert.match(error, /다시 불러오기/);
  const preview = view({ status: "preview" });
  assert.match(preview, /data-truth="preview"/);
  assert.match(preview, /Preview · 연결 필요/);
  assert.equal(view({ status: "live", candidates: [] }), "");
  // 일부 실패는 0건이어도 숨기지 않는다.
  const partial = view({ status: "partial", candidates: [], message: "읽지 못한 곳: 캘린더 — 지금 보이는 것보다 후보가 더 있을 수 있어요." });
  assert.match(partial, /data-truth="partial"/);
  assert.match(partial, /읽지 못한 곳: 캘린더/);
});

test("rows speak the mockup sentences with the right escape hatches per source", () => {
  const html = view({ status: "live", candidates: [kakao, call, meeting], discardedToday: 14 });
  assert.match(html, /캘린더 · 갤럭시/);
  assert.match(html, /<span class="num"[^>]*>3<\/span>/);
  // 캘린더: 미팅 — 기록이 없어요 + 취소·노쇼 + 고객 아님
  assert.match(html, /어제 14:00<\/span> <a href="\/dashboard\/revenue\/customers\?customer=lead%3A22222222[^"]*"[^>]*>정우학원<\/a> 미팅 — 기록이 없어요/);
  assert.match(html, /취소·노쇼/);
  assert.match(html, /고객 아님/);
  // 통화: 사람 이름 + 조사 + 분
  assert.match(html, />이수진 대표<\/a>와 4분 통화/);
  assert.match(html, /리드인 독서논술 · 갤럭시 통화 기록/);
  // 카톡 + 약속 후보: [약속으로] + 버림, 고객 키가 없으면 링크가 아니다
  assert.match(html, /<b[^>]*>박서연<\/b> 카톡/);
  assert.match(html, /약속 후보 9\/29\(화\) 16:00/);
  assert.match(html, /약속으로/);
  assert.equal((html.match(/>버림</g) || []).length, 2);
  assert.equal((html.match(/기록 남기기/g) || []).length, 2);
  // 출처 글리프는 접근 가능한 이름을 가진다
  assert.match(html, /role="img" aria-label="캘린더 일정"/);
  assert.match(html, /role="img" aria-label="카톡"/);
  assert.match(html, /고객이 아닌 연락 <span class="num">14<\/span>건은 오늘 내용 없이 버렸어요/);
});

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });

test("resolve posts the candidate id and folds the save envelope honestly", async () => {
  let sent;
  globalThis.fetch = async (url, options) => { sent = { url, body: JSON.parse(options.body) }; return Response.json({ status: "saved", count: 2 }); };
  assert.deepEqual(await resolveRecordCandidate(call.id), { ok: true, status: "saved" });
  assert.equal(sent.url, "/api/hub/record-candidates");
  assert.deepEqual(sent.body, { id: call.id, action: "resolve" });

  globalThis.fetch = async () => Response.json({ status: "accepted" });
  assert.equal((await resolveRecordCandidate(meeting.id)).ok, true);
  globalThis.fetch = async () => Response.json({ status: "preview", saved: false }, { status: 202 });
  assert.deepEqual(await resolveRecordCandidate(call.id), { ok: false, status: "preview", message: "Preview · 연결 필요 — 저장되지 않았어요" });
  globalThis.fetch = async () => Response.json({ status: "conflict", message: "이미 기록한 후보예요." }, { status: 409 });
  assert.deepEqual(await resolveRecordCandidate(call.id), { ok: false, status: "conflict", message: "이미 기록한 후보예요." });
  globalThis.fetch = async () => { throw new Error("offline"); };
  assert.deepEqual(await resolveRecordCandidate(call.id), { ok: false, status: "failed", message: "offline" });
  globalThis.fetch = async (url, options) => { sent = JSON.parse(options.body); return Response.json({ status: "saved" }); };
  await postRecordCandidateAction(meeting.id, "dismiss", "cancelled");
  assert.deepEqual(sent, { id: meeting.id, action: "dismiss", reason: "cancelled" });
});

test("the component keeps the hub contracts: envelope reads, tokens only, toast after server ack", () => {
  assert.match(source, /d\?\.status/);
  assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}\b|oklch\(|rgba?\(/);
  assert.doesNotMatch(source, /onMouseEnter|onMouseLeave/);
  assert.doesNotMatch(source, /\d+ms|cubic-bezier/);
  // 되돌리기 토스트는 저장 확인 뒤에만(실패면 행을 되살리고 오류 토스트).
  assert.match(source, /if \(!result\.ok\) \{\s*hide\(candidate\.id, false\);\s*toast\.error/);
  assert.doesNotMatch(source, /SyncBadge/);
});
