import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { RecordMemoPane, RecordMemoView } from "./record-memo-pane.jsx";
import { RecordSaveLine } from "./contact-record-form.jsx";
import * as journalClient from "../../lib/journal-client.js";
import { createJournalStore } from "../../lib/journal-browser-store.js";
import { claimContextMemoId, contextMemoKey, contextMemoStorageKey, releaseContextMemoId } from "../../lib/project-customer-context.js";
import { isCanonicalUuid } from "../../lib/uuid.js";
import { nextMemoSeed } from "../../lib/sales-os/record-memo.js";
import { buildNoteSave, initialMemoContexts } from "../../lib/journal-client.js";
import { recordMemoLine } from "../../lib/sales-os/record-memo.js";

const source = readFileSync(new URL("./record-memo-pane.jsx", import.meta.url), "utf8");
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const css = readFileSync(new URL("./record-window.css", import.meta.url), "utf8");
const text = (html) => html.replace(/<[^>]+>/g, "");

// 일지 메모 작성기(useMemoDocument)가 돌려주는 것의 모양 — 부른 것을 적어 둔다.
function memoModel(patch = {}) {
  const calls = [];
  const model = {
    ready: true, source: "live", busy: false, locked: false, pending: null, conflict: null, entry: null,
    saveState: "idle", message: "", localError: false,
    edit(change) { calls.push(["edit", change]); model.draft = { ...model.draft, ...change }; },
    save() { calls.push(["save", { ...model.draft }]); },
    retry() { calls.push(["retry"]); },
    chooseConflict(mine) { calls.push(["chooseConflict", mine]); },
    ...patch,
    draft: { id: "note-1", body: "", title: "", occurredAt: "2026-09-29T00:00:00.000Z", contexts: [], ...(patch.draft || {}) },
  };
  return { model, calls };
}
const render = (props = {}) => renderToStaticMarkup(React.createElement(RecordMemoView, props));
const written = (body, patch = {}) => memoModel({ draft: { body }, ...patch });
const bandOf = (html) => html.slice(html.indexOf('<div class="record-wide__band"'));
const primaryOf = (html) => html.match(/<button[^>]*hub-btn--primary[^>]*>.*?<\/button>/s)?.[0] || "";

test("memo mode is one large writing field and a save row — no channel, reaction or promise", () => {
  const { model } = memoModel();
  const html = render({ model });
  assert.match(html, /^<div class="record-wide__scroll">/);
  assert.ok(html.indexOf('class="record-wide__scroll"') < html.indexOf('class="record-wide__band"'), "저장 줄은 흐르는 칸 밖, 제자리 띠에");
  assert.match(html, /<label class="hub-label"[^>]*>메모<\/label>/);
  // 연락 기록의 자세히와 같은 긴 글쓰기 칸(16px · 1.8 · 16px 여백, --r-sm) — 열 줄에서 시작해 쓰는 만큼 길어진다.
  const field = html.match(/<textarea[^>]*>/)?.[0] || "";
  assert.match(field, /class="hub-input record-wide__detail"/);
  assert.match(field, /rows="10"/);
  assert.match(field, /maxLength="20000"/);
  assert.match(html, />0 \/ 20000</);
  // 가려진 동안('이 고객' 탭)은 재지 않고, 돌아온 순간과 배치가 바뀔 때(시트 ↔ 넓은 기록창) 다시 잰다.
  assert.match(code, /useGrowingDetail\(bodyRef, ready && !away, body, sheet\);/);
  assert.equal((html.match(/<textarea/g) || []).length, 1);
  assert.equal((html.match(/<input/g) || []).length, 0, "요약 · 다음 약속 · 날짜 칸이 없다");
  assert.doesNotMatch(html, /hub-seg|어떻게|반응|다음 약속|언제|요약 · 한 줄/);
  assert.match(html, /Moonlight에만 남아요 · 이 고객의 기록 줄에 ‘메모 · 연락 아님’으로 보여요/);
  // 띠 — 저장 줄만. 주 버튼은 하나다.
  const band = bandOf(html);
  assert.match(band, /^<div class="record-wide__band" role="group" aria-label="메모 저장"><div class="record-wide__save">/);
  assert.equal((html.match(/hub-btn--primary/g) || []).length, 1);
  assert.match(primaryOf(html), />메모 저장<kbd[^>]*>⌘↵<\/kbd><\/button>$/);
  assert.doesNotMatch(primaryOf(html), /disabled/);
  assert.match(band, /닫아도 이 탭에 초안으로 남아요/);
  assert.doesNotMatch(html, /var\(--danger\)|--success|--warning|--info/);
});

test("saving a memo goes through the journal writer only — no contact record, no promise, no last-contact write", () => {
  const { model, calls } = written("원장님은 숫자로 설명해야 움직이심");
  const saveRef = { current: null };
  render({ model, saveRef });
  const before = Date.now();
  saveRef.current();
  // 기록 시각을 지금으로 맞춘 뒤 작성기의 저장을 부른다 — 그게 전부다.
  assert.deepEqual(calls.map(([name]) => name), ["edit", "save"]);
  assert.deepEqual(Object.keys(calls[0][1]), ["occurredAt"]);
  assert.ok(Date.parse(calls[0][1].occurredAt) >= before, "빈 칸이 열려 있던 시각이 아니라 저장을 누른 시각");
  assert.equal(calls[1][1].body, "원장님은 숫자로 설명해야 움직이심");
  assert.deepEqual(Object.keys(calls[1][1]).sort(), ["body", "contexts", "id", "occurredAt", "title"], "약속 · 반응 · 채널 같은 칸은 메모에 없다");
  // 이 파일은 연락 기록의 길을 모른다 — RPC · 활동 · 고객 행 쓰기가 없다.
  assert.doesNotMatch(code, /contact-outcome|revenue\/activity|saveRevenueRecord|next_action|nextAction|last_touch|lastContact/);
  assert.doesNotMatch(code, /fetch\(/, "쓰기는 작성기(useMemoDocument)만 한다 — 저장소 확인은 fetchJournal");
  assert.match(code, /useMemoDocument\(\{\s*id, isNew: true, entry: null, contexts,/);
});

test("the request a memo sends is a journal note with this customer as its context — nothing a contact record carries", () => {
  const LEAD = "11111111-1111-4111-8111-111111111111";
  // 호출처가 넘긴 문맥(고객)이 작성기의 초안에 붙고, 작성기가 그 초안으로 요청을 만든다(journal-client).
  const contexts = initialMemoContexts(null, [{ type: "lead", id: LEAD, label: "메모 대상" }]);
  const { model, calls } = memoModel({ draft: { id: "22222222-2222-4222-8222-222222222222", body: "결정은 원장님이 직접", contexts, noteMeta: { kind: "note", enhancement: "" }, expectedRevision: 0 } });
  const saveRef = { current: null };
  render({ model, saveRef });
  saveRef.current();
  const request = buildNoteSave(calls.at(-1)[1], "33333333-3333-4333-8333-333333333333");
  assert.deepEqual(Object.keys(request).sort(), ["action", "body", "contexts", "entryId", "expectedRevision", "noteMeta", "occurredAt", "requestId", "title"]);
  assert.equal(request.action, "save");
  assert.equal(request.body, "결정은 원장님이 직접");
  assert.deepEqual(request.contexts, [{ type: "lead", id: LEAD }], "이 고객이 문맥으로 붙는다 — 그래서 기록 줄기에 보인다");
  assert.equal(request.expectedRevision, 0, "새 메모다");
  // 연락 기록이 싣는 것(약속 · 반응 · 채널 · 휴면 · 대상 종류)은 하나도 없다 — 마지막 연락일과 약속을 바꿀 길이 없다.
  for (const key of ["nextAction", "nextActionAt", "next_action", "reaction", "kind", "dormant", "entityType", "entityId", "leadId", "accountId", "companyId"]) {
    assert.equal(Object.hasOwn(request, key), false, key);
  }
  // 계약 고객은 account 문맥으로 붙는다.
  assert.deepEqual(initialMemoContexts(null, [{ type: "account", id: LEAD, label: "계약 고객" }]).map((c) => c.type), ["account"]);
});

test("the save key never sends an empty memo or a preview memo, and says why instead", () => {
  const empty = memoModel();
  const emptyRef = { current: null };
  render({ model: empty.model, saveRef: emptyRef });
  emptyRef.current();
  assert.deepEqual(empty.calls, [], "빈 메모는 보내지 않는다");
  // 빈 메모는 실패가 아니다 — 칸을 빨갛게 하지 않는다(error 없음). 저장 줄이 한 번 말하고 커서가 칸으로 간다.
  assert.doesNotMatch(code, /error=\{/);
  assert.doesNotMatch(code, /메모가 비어 있어요/);
  // 빈 메모는 보내지 않고 커서를 칸에 둔다 — 가려져 있던 칸('이 고객' 탭)은 쓰기 탭이 다시 선 다음 프레임에.
  assert.match(code, /if \(empty\) \{\s*if \(away\) requestAnimationFrame\(\(\) => bodyRef\.current\?\.focus\(\)\);\s*else bodyRef\.current\?\.focus\(\);\s*return;\s*\}/);

  const blank = written("   \n  ");
  const blankRef = { current: null };
  render({ model: blank.model, saveRef: blankRef });
  blankRef.current();
  assert.deepEqual(blank.calls, [], "공백뿐인 메모도 빈 메모다");

  const preview = written("연결 전에 쓴 메모", { source: "preview" });
  const previewRef = { current: null };
  const html = render({ model: preview.model, saveRef: previewRef });
  previewRef.current();
  assert.deepEqual(preview.calls, [], "연결 전에는 보내지 않는다 — 저장됐다고 말하지 않는다");
  assert.match(html, /data-truth="preview"/);
  assert.match(html, /<span>메모 저장소가 연결되지 않았어요\.<\/span>/);
  assert.match(bandOf(html), /Preview · 연결 필요 — 메모가 저장되지 않아요\. 쓰던 글은 이 탭에 남아 있어요\./);
  assert.match(html, />연결 전에 쓴 메모<\/textarea>/);
  assert.doesNotMatch(text(html), /저장됨|기록됨/);
  // 연결 전의 주 버튼은 눌리지 않는다 — 눌러도 아무 일 없는 '메모 저장'을 두지 않는다. 이유는 같은 줄에 있다.
  assert.match(primaryOf(html), /disabled=""[^>]*>저장할 수 없음<\/button>$/);
  assert.doesNotMatch(primaryOf(html), /⌘↵/);
  assert.equal((html.match(/hub-btn--primary/g) || []).length, 1);
  assert.doesNotMatch(html, /var\(--danger\)/, "연결 전은 실패가 아니다");
});

test("an empty memo is not a failure — the save row says what is missing once, nothing turns red", () => {
  // 저장을 눌러 본 빈 메모(missing)의 모습은 순수 규칙이 정한다 — 중립 글자 한 줄(role=alert 자리, 빨강 아님).
  const html = render({ model: memoModel().model });
  assert.doesNotMatch(html, /aria-invalid="true"|hub-field-msg--error|var\(--danger\)/);
  assert.equal((html.match(/role="alert"/g) || []).length, 0);
  const missing = recordMemoLine({ boot: "ready", ready: true, source: "live", empty: true, attempted: true });
  assert.deepEqual(missing.line.note, { tone: "missing", text: "메모를 한 줄 쓰면 저장돼요." });
  const line = renderToStaticMarkup(React.createElement(RecordSaveLine, { line: missing.line }));
  assert.equal((line.match(/role="alert"/g) || []).length, 1, "알림은 저장 줄 하나다");
  assert.match(line, /<span role="alert" style="color:var\(--fg-muted\)">메모를 한 줄 쓰면 저장돼요\.<\/span>/);
  assert.doesNotMatch(line, /var\(--danger\)/);
});

test("while the request is out the field is read-only and nothing reads as saved", () => {
  const saving = written("보내는 중인 메모", { busy: true, locked: true, pending: { requestId: "r1" }, saveState: "saving" });
  const ref = { current: null };
  const html = render({ model: saving.model, saveRef: ref });
  assert.match(html.match(/<textarea[^>]*>/)[0], /readonly=""/);
  assert.match(html, />보내는 중인 메모<\/textarea>/);
  assert.match(bandOf(html), /role="status"[^>]*>저장 중<\/span>/);
  assert.match(primaryOf(html), /disabled=""[^>]*>저장 중…<\/button>$/);
  assert.doesNotMatch(text(html), /저장됨|기록됨|⌘↵/);
  ref.current();
  assert.deepEqual(saving.calls, [], "가는 중에 ⌘↵를 또 눌러도 두 번 보내지 않는다");
});

test("an unconfirmed save keeps the text and re-checks the same request instead of sending a new one", () => {
  const pending = written("답을 못 받은 메모", { locked: true, pending: { requestId: "r1" }, saveState: "error", message: "저장을 확인하지 못했어요." });
  const ref = { current: null };
  const html = render({ model: pending.model, saveRef: ref });
  assert.match(html, />답을 못 받은 메모<\/textarea>/);
  const alert = bandOf(html).match(/<span role="alert"[^>]*>.*?<\/span><\/span>/s)?.[0] || "";
  assert.match(alert, /box-shadow:inset 1px 0 0 var\(--danger\)/);
  assert.match(alert, />저장 확인 못 함<\/span>/);
  assert.match(alert, /같은 요청으로 다시 확인하면 두 번 생기지 않아요\. 쓰던 글은 이 탭에 남아 있어요\./);
  assert.equal((html.match(/var\(--danger\)/g) || []).length, 2, "빨강은 레일과 제목 글자 한 곳뿐");
  assert.match(primaryOf(html), />저장 결과 확인<kbd/);
  ref.current();
  assert.deepEqual(pending.calls, [["retry"]], "새 요청(save)이 아니라 같은 요청의 확인(retry)");
  assert.doesNotMatch(text(html), /저장됨|기록됨/);
  // 되살린 글을 지우는 버튼은 잠긴 동안 없다(눌러도 소용없는 버튼을 두지 않는다).
  assert.doesNotMatch(html, />지우기<\/button>/);
});

test("a rejected save and a conflict both keep the text; the conflict offers both sides", () => {
  const failed = written("거절된 메모", { saveState: "error", message: "입력이나 연결할 업무를 확인해 주세요." });
  const failedHtml = render({ model: failed.model });
  assert.match(failedHtml, />거절된 메모<\/textarea>/);
  assert.match(bandOf(failedHtml), />저장 못 함<\/span><span[^>]*>입력이나 연결할 업무를 확인해 주세요\. 쓰던 글은 이 탭에 남아 있어요\.<\/span>/);
  assert.match(primaryOf(failedHtml), />메모 저장<kbd/);

  let settled = "not-called";
  const conflict = written("내가 쓴 글", { conflict: { id: "note-1", body: "다른 창의 글", revision: 2 }, saveState: "conflict", entry: { id: "note-1", revision: 1 } });
  const ref = { current: null };
  const html = render({ model: conflict.model, saveRef: ref, onSettled: (entry) => { settled = entry; } });
  assert.match(html, />내가 쓴 글<\/textarea>/);
  assert.match(bandOf(html), /다른 창에서 이 메모를 먼저 저장했어요/);
  assert.match(bandOf(html), /hub-btn--ghost[^>]*>저장본 그대로 두기<\/button>/);
  assert.match(primaryOf(html), />내 글로 저장<kbd/);
  assert.equal((html.match(/hub-btn--primary/g) || []).length, 1);
  // 내 글로 저장 — 저장본의 판을 받아들인 뒤 그대로 저장한다(이미 있는 메모라 기록 시각은 건드리지 않는다).
  ref.current();
  assert.deepEqual(conflict.calls.map(([name, arg]) => [name, name === "chooseConflict" ? arg : null]), [["chooseConflict", true], ["save", null]]);
  assert.equal(settled, "not-called");
  // 저장본 그대로 두기 — 내 글을 버리고 다음 메모로(저장 확인으로 세지 않는다: entry 없이 끝낸다).
  // 다음 메모의 문맥은 그 저장본이 든 것(서버가 확인한 것)을 넘긴다 — 빈 초안을 미리 세워 기다림 없이 넘어간다.
  assert.match(code, /const keepStored = \(\) => \{ const stored = model\.conflict; model\.chooseConflict\(false\); onSettled\?\.\(null, stored\?\.contexts, stored\?\.noteMeta\?\.scope\); \};/);
});

test("a confirmed save shows a receipt in the save row until the next memo is started", () => {
  const { model } = memoModel();
  const html = render({ model, savedAt: "2026-09-30T01:52:00Z" });
  const band = bandOf(html);
  assert.match(band, /<div class="record-wide__saved"><span class="record-receipt" data-receipt="saved" role="status">/);
  assert.equal(text(band.slice(0, band.indexOf("<button"))), "메모 저장됨 10:52 · 연락으로 세지 않았어요");
  assert.match(band, /<span class="mono">10:52<\/span>/);
  assert.match(primaryOf(html), />메모 저장<kbd/);
  assert.doesNotMatch(html, /--success/, "저장됨은 체크 + 글자 + 시각이다 — 초록 없음");
  // 다음 메모를 쓰기 시작하면 영수증 대신 초안 글자가 선다(쓰는 중인 글을 저장됐다고 읽히지 않게).
  const next = render({ model: written("다음 메모").model, savedAt: "2026-09-30T01:52:00Z" });
  assert.doesNotMatch(text(next), /메모 저장됨/);
  assert.match(bandOf(next), /초안 · 이 탭 · 서버에는 아직 없어요/);
  assert.match(css, /\.hub-app \.record-wide__saved \{ flex: 1 1 200px;/);
});

test("a memo left in this tab comes back with where it was kept, and can be cleared", () => {
  const restored = written("쓰다 만 메모");
  const html = render({ model: restored.model });
  assert.match(html, /<div role="status" class="record-wide__notice">.*초안 · 이 탭 · 쓰던 메모를 불러왔어요.*>지우기<\/button><\/div>/s);
  assert.match(html, />쓰다 만 메모<\/textarea>/);
  // 탭 저장소가 막힌 창에서는 '이 탭'이라고 하지 않는다.
  assert.match(render({ model: written("쓰다 만 메모", { localError: true }).model }), /초안 · 새로고침 전까지 · 쓰던 메모를 불러왔어요/);
  // 빈 칸으로 열리면 되살린 게 없다.
  assert.doesNotMatch(render({ model: memoModel().model }), /쓰던 메모를 불러왔어요|지우기/);
  assert.doesNotMatch(html + source, /이 기기/, "아직 약속하지 않는 곳(localStorage, Q-CR4)을 말하지 않는다");
});

test("before the memo store answers the pane is a skeleton with a waiting save row — a failed check says so and retries", () => {
  // 메모 칸은 효과가 돌기 전(서버 렌더 · 첫 그리기)에 확인 중으로 선다 — 빈 글쓰기 칸을 먼저 보이지 않는다.
  const pane = renderToStaticMarkup(React.createElement(RecordMemoPane, { contexts: [{ type: "lead", id: "11111111-1111-4111-8111-111111111111", label: "메모 대상" }] }));
  assert.match(pane, /role="status"/);
  assert.match(pane, /메모 칸 준비 중/);
  assert.doesNotMatch(pane, /<textarea/);
  assert.match(bandOf(pane), /role="status"[^>]*>메모 저장소 확인 중<\/span>/);
  assert.match(primaryOf(pane), /disabled=""[^>]*>메모 저장<\/button>$/);
  // 작성기가 아직 준비 중일 때도 같다.
  assert.match(render({ model: memoModel({ ready: false }).model }), /메모 칸 준비 중/);

  let retried = 0;
  const ref = { current: null };
  const failed = render({ boot: "error", bootMessage: "메모를 불러오지 못했어요. 다시 시도해 주세요.", onBootRetry: () => { retried += 1; }, saveRef: ref });
  // 원인은 한 번만 말한다 — '다시 불러오기' 옆 저장 줄의 레일 + 제목. 글쓰기 칸 자리의 덧말은 빨강도 알림도 아니다.
  assert.match(failed, /<div class="record-wide__scroll"><div class="record-wide__notice"><span>없는 게 아니라 확인하지 못한 거예요 · 연락 기록은 그대로 남길 수 있어요\.<\/span><\/div><\/div>/);
  assert.match(bandOf(failed), />메모 칸을 열지 못함<\/span><span[^>]*>메모를 불러오지 못했어요\. 다시 시도해 주세요\.<\/span>/);
  assert.equal((failed.match(/role="alert"/g) || []).length, 1, "같은 실패를 두 번 알리지 않는다");
  assert.equal((failed.match(/var\(--danger\)/g) || []).length, 2, "빨강은 레일과 제목 글자 한 곳뿐");
  assert.doesNotMatch(failed, /data-truth="error"/, "읽기 실패 알약을 하나 더 세우지 않는다");
  assert.equal((text(failed).match(/확인하지 못/g) || []).length, 1);
  assert.match(primaryOf(failed), />다시 불러오기<\/button>$/);
  assert.doesNotMatch(failed, /<textarea/);
  ref.current();
  assert.equal(retried, 1);
});

test("after a confirmed save the field stays up while the next memo boots — no skeleton, the receipt at once, the cursor in the field", () => {
  // 다음 메모의 작성기(새 ID)가 아직 준비 전이다 — 저장 확인 직후의 넘겨받기(handoff)에서는 칸이 그대로 서 있다.
  const booting = memoModel({ ready: false, draft: null });
  booting.model.draft = null;
  const ref = { current: null };
  const html = render({ model: booting.model, savedAt: "2026-09-30T01:52:00Z", handoff: true, saveRef: ref });
  assert.doesNotMatch(html, /메모 칸 준비 중|메모 저장소 확인 중/, "저장을 확인한 순간을 확인 중으로 되돌리지 않는다");
  const field = html.match(/<textarea[^>]*>/)?.[0] || "";
  assert.match(field, /class="hub-input record-wide__detail"/);
  assert.match(field, /readonly=""/, "작성기가 서기 전의 칸은 아직 받지 않는다 — 작성기 없는 글을 만들지 않는다");
  assert.match(html, /<textarea[^>]*><\/textarea>/, "칸은 비어 있다");
  assert.equal(text(bandOf(html).slice(0, bandOf(html).indexOf("<button"))), "메모 저장됨 10:52 · 연락으로 세지 않았어요");
  assert.match(primaryOf(html), />메모 저장<kbd/);
  // 준비 전에는 저장도 편집도 작성기에 닿지 않는다.
  ref.current();
  assert.deepEqual(booting.calls, []);
  assert.match(code, /const edit = \(value\) => \{\s*if \(!ready\) return;/);
  assert.match(code, /readOnly=\{!ready \|\| model\.locked\}/);
  // 커서는 칸이 서는 즉시(그리기 전) 그 칸에 — 작성기가 준비되기를 기다리지 않는다. 문서로 떨어진 커서는 이어 친
  // 글자를 전역 단축키(C · ?)로 흘린다.
  assert.match(code, /const standing = ready \|\| \(boot === "ready" && Boolean\(handoff && savedAt && model\)\);/);
  assert.match(code, /useLayoutEffectOnClient\(\(\) => \{\s*const el = bodyRef\.current;\s*if \(!standing \|\| !el\) return;[\s\S]*?el\.focus\(\);\s*\}, \[standing\]\);/);
  // 넘겨받기가 아니면(처음 열 때 · 모드를 옮길 때) 준비 전은 지금처럼 Skeleton이다 — 없는 저장을 말하지 않는다.
  assert.match(render({ model: booting.model, handoff: true }), /메모 칸 준비 중/);
  assert.match(render({ model: booting.model, savedAt: "2026-09-30T01:52:00Z" }), /메모 칸 준비 중/);
  // 작성기가 서면 같은 칸이 그대로 받는다(영수증은 다음 메모를 쓰기 시작할 때까지 남는다).
  const ready = render({ model: memoModel().model, savedAt: "2026-09-30T01:52:00Z", handoff: true });
  assert.doesNotMatch(ready.match(/<textarea[^>]*>/)[0], /readonly/);
  assert.match(text(bandOf(ready)), /메모 저장됨 10:52/);
});

test("a confirmed save seeds the next memo's draft, and the memo store is remembered across mode switches", () => {
  // 저장이 확인되면: 새 ID를 받고, 서버가 확인해 준 문맥으로 다음 메모의 빈 초안을 작성기의 탭 사본에 미리 세운다.
  const settle = code.slice(code.indexOf("const settle = (entry, contexts = entry?.contexts, scope = entry?.noteMeta?.scope) => {"), code.indexOf("if (session.status !== \"ready\") {\n    return"));
  assert.match(settle, /const id = claimContextMemoId\(sessionStorage, session\.storageKey\);\s*const seeded = seedNextMemo\(session\.ledger\.workspaceId, nextMemoSeed\(\{ id, contexts, seeds: stableContexts, scope \}\)\);\s*setSession\(\{ \.\.\.session, id, seeded, documentKey: `\$\{session\.ledger\.workspaceId\}:\$\{id\}`, ledger: \{ \.\.\.session\.ledger, fromPreview: false \} \}\);/);
  assert.match(code, /handoff=\{Boolean\(session\.seeded\)\}/);
  // 세우는 곳은 일지 메모 작성기의 저장소 그대로다(새 저장소 없음) — 막힌 창에서는 그 저장소의 메모리 사본이 남는다.
  const seed = code.slice(code.indexOf("function seedNextMemo"), code.indexOf("function RecordMemoDocument"));
  assert.match(seed, /createJournalStore\(\{ storage: sessionStorage, workspaceId, tabId: journalTabId\(\) \}\)/);
  assert.match(seed, /try \{ store\.write\(seed\.draft\.id, seed\); \} catch \{[^}]*\}\s*return Boolean\(store\.read\(seed\.draft\.id\)\);/);
  assert.match(seed, /if \(!seed\) return false;/);
  // 한 번 확인한 저장소는 이 페이지에서 기억한다 — 연락 기록 ↔ 메모를 오갈 때마다 확인 중으로 가리지 않고, 확인은 뒤에서 다시 한다.
  assert.match(code, /let knownLedger = null;/);
  assert.match(code, /React\.useState\(\(\) => \{\s*try \{ return knownLedger \? memoSession\(knownLedger, identity\) : \{ status: "loading" \}; \} catch \{ return \{ status: "loading" \}; \}\s*\}\);/);
  assert.match(code, /setSession\(\(prev\) => \(prev\.status === "ready" && prev\.identity === identity \? prev : \{ status: "loading" \}\)\);/);
  assert.match(code, /knownLedger = ledger;\s*const next = memoSession\(ledger, identity\);\s*setSession\(\(prev\) => reconcileMemoSession\(prev, next\)\);/);
  // 기억한 저장소로 선 자리는 다시 확인이 실패해도 쓰던 글을 가리지 않는다(저장할 때 작성기가 말한다).
  assert.match(code, /if \(active\) setSession\(\(prev\) => \(prev\.status === "ready" && prev\.identity === identity \? prev : \{ status: "error", message: failure\?\.message \|\| "" \}\)\);/);
});

test("the contact record still in flight keeps its line above the memo save row", () => {
  const line = React.createElement("div", { className: "record-wide__save", "data-contact-line": "" }, "연락 기록 · 기록 중");
  const html = render({ model: memoModel().model, contactLine: line });
  const band = bandOf(html);
  assert.ok(band.indexOf("data-contact-line") > 0 && band.indexOf("data-contact-line") < band.indexOf("hub-btn--primary"), "연락 기록의 진행이 위, 메모 저장이 아래");
  assert.equal((band.match(/class="record-wide__save"/g) || []).length, 2);
});

test("the memo draft shares its key with the memo drawer and is separate from the contact draft", () => {
  // 같은 고객의 새 메모는 드로어의 메모 창과 같은 자리에서 이어진다 — 저장소 · 키를 새로 만들지 않는다.
  assert.match(code, /const storageKey = contextMemoStorageKey\(ledger\.workspaceId, identity\);/);
  assert.match(code, /const id = claimContextMemoId\(sessionStorage, storageKey\)/);
  const drawer = readFileSync(new URL("./context-memo-drawer.jsx", import.meta.url), "utf8");
  assert.match(drawer, /contextMemoStorageKey\(ledger\.workspaceId, identity\)/);
  assert.match(drawer, /claimContextMemoId\(sessionStorage, storageKey\)/);
  assert.doesNotMatch(code, /crm-record|localStorage|createRecordDraftStore/, "연락 기록 초안과 다른 키 · 같은 탭(sessionStorage)");
  // 저장이 확인된 뒤에만: 메모 목록을 다시 읽게 하고, 영수증 시각을 세우고, 호출처에 알린다. 그리고 새 메모 ID로 넘어간다.
  const settle = code.slice(code.indexOf("const settle = (entry, contexts = entry?.contexts, scope = entry?.noteMeta?.scope) => {"), code.indexOf("if (session.status !== \"ready\") {\n    return"));
  assert.ok(settle.length > 0);
  assert.match(settle, /releaseContextMemoId\(sessionStorage, session\.storageKey\);/);
  assert.match(settle, /if \(!entry\) \{ setSavedAt\(null\); return; \}\s*window\.dispatchEvent\(new Event\(MEMO_CHANGED_EVENT\)\);\s*setSavedAt\(new Date\(\)\.toISOString\(\)\);\s*onSaved\?\.\(entry\);/);
  assert.match(code, /onSaved=\{settle\}/);
});

// ── 2026-09-30 넓은 기록창 ③ — 휴대폰 시트 · 좁은 화면의 탭에서도 같은 메모 칸(Q-CR3 · Q-CR11) ─────────────

test("on the phone sheet the memo's one primary goes to the header slot — never drawn in place while the slot is pending", () => {
  const { model } = written("원장님은 숫자로 설명해야 움직이심");
  // 머리 자리를 받지 않은 넓은 기록창 — 제자리(저장 줄 끝)에 하나, ⌘↵ 글자와 함께.
  const inPlace = render({ model });
  assert.equal((inPlace.match(/hub-btn--primary/g) || []).length, 1);
  assert.match(primaryOf(inPlace), />메모 저장<kbd[^>]*>⌘↵<\/kbd><\/button>$/);
  // 머리 자리를 받기로 했고 아직 서지 않았다(null) — 제자리에 그리지 않는다. 저장 줄의 글자 · 글쓰기 칸은 그대로다.
  const pending = render({ model, saveSlot: null });
  assert.equal((pending.match(/hub-btn--primary/g) || []).length, 0);
  assert.match(bandOf(pending), /초안 · 이 탭 · 서버에는 아직 없어요/);
  assert.match(pending, />원장님은 숫자로 설명해야 움직이심<\/textarea>/);
  // 자리는 연락 기록과 같은 규칙(RecordPrimarySlot)이다 — 버튼은 하나, 머리에서는 ⌘↵ 글자를 달지 않는다.
  assert.match(code, /<RecordPrimarySlot slot=\{saveSlot\}>\s*<Button variant="primary" size="md" disabled=\{plan\.primary\.disabled\} onClick=\{save\}>/);
  assert.match(code, /\{saveSlot === undefined && !plan\.primary\.disabled && plan\.primary\.action !== "reload" && <Kbd/);
  assert.equal((code.match(/variant="primary"/g) || []).length, 1);
  // 저장은 자리와 무관하게 같은 길이다 — ⌘↵ · 머리 버튼 모두 saveRef의 그 함수.
  const ref = { current: null };
  const { model: other, calls } = written("머리 버튼으로 저장");
  render({ model: other, saveRef: ref, saveSlot: null });
  ref.current();
  assert.deepEqual(calls.map(([name]) => name), ["edit", "save"]);
});

test("the mode switch the form hands over sits at the top of the memo's scrolling column", () => {
  const head = React.createElement("div", { className: "record-wide__mode", "data-head": "" }, "연락 기록 | 메모");
  const html = render({ model: memoModel().model, head });
  assert.match(html, /^<div class="record-wide__scroll"><div class="record-wide__mode" data-head="">연락 기록 \| 메모<\/div>/);
  assert.ok(html.indexOf("data-head") < html.indexOf("<textarea"), "전환 칸이 먼저, 글쓰기 칸이 다음");
  // 확인 중 · 열지 못했을 때도 전환 칸은 서 있다 — 연락 기록으로 돌아갈 길이 남는다.
  assert.match(render({ boot: "loading", head }), /^<div class="record-wide__scroll"><div class="record-wide__mode" data-head="">/);
  assert.match(render({ boot: "error", head }), /^<div class="record-wide__scroll"><div class="record-wide__mode" data-head="">/);
  // 넘기지 않으면(넓은 기록창) 지금 그대로다.
  assert.match(render({ model: memoModel().model }), /^<div class="record-wide__scroll"><div style="min-width:0">/);
  // 휴대폰 시트의 글쓰기 칸은 여섯 줄에서 시작한다(연락 기록의 자세히와 같다) — 넓은 기록창은 열 줄.
  assert.match(render({ model: memoModel().model, sheet: true }).match(/<textarea[^>]*>/)[0], /rows="6"/);
  assert.match(render({ model: memoModel().model }).match(/<textarea[^>]*>/)[0], /rows="10"/);
});

test("while 이 고객 is showing the memo stays where it is — the line below counts it and leads back", () => {
  const body = "원장님은 숫자로 설명해야 움직이심\n매일 쓸 사람은 부원장";
  const shown = render({ model: written(body).model });
  assert.doesNotMatch(shown, /record-wide__away/);
  const away = render({ model: written(body).model, away: true, onReturn() {} });
  // 글쓰기 칸 · 저장 줄은 그대로 서 있다(가리는 것은 스타일시트 — 폼의 뿌리가 data-away를 단다).
  assert.match(away, />원장님은 숫자로 설명해야 움직이심\n매일 쓸 사람은 부원장<\/textarea>/);
  assert.match(away, /class="record-wide__band"/);
  assert.match(away, new RegExp(`<div class="record-wide__away"><span class="record-wide__away-text num">쓰던 메모 · ${body.length}자</span><button[^>]*hub-btn--secondary[^>]*>쓰기로 돌아가기</button></div>$`));
  assert.match(render({ model: memoModel().model, away: true }), />아직 쓴 메모가 없어요<\/span>/);
  assert.doesNotMatch(away.slice(away.indexOf('class="record-wide__away"')), /저장됨|기록됨/);
  assert.match(code, /\{away && <RecordAwayBar label=\{recordAwayLabel\(\{ mode: "memo", chars: body\.trim\(\)\.length \}\)\} progress=\{contactProgress\} onUndo=\{onContactUndo\} onReturn=\{returnToWriting\} \/>\}/);

  // 앞서 누른 연락 기록이 아직 되돌리기 창이면 — 띠(contactLine)는 가려져 있으므로 돌아가기 줄이 그 진행과
  // 되돌리기를 대신 보인다. 탭을 옮겼다고 3.5초 되돌리기가 닿지 않게 되지 않는다(연락 기록 모드와 같다).
  let undone = 0;
  const pending = render({ model: written(body).model, away: true, onReturn() {}, contactProgress: { label: "연락 기록 · 기록 중", canUndo: true }, onContactUndo: () => { undone += 1; } });
  const bar = pending.slice(pending.indexOf('class="record-wide__away"'));
  assert.match(bar, /role="status"[^>]*>연락 기록 · 기록 중<button[^>]*>되돌리기<\/button>/);
  assert.doesNotMatch(bar, /쓰던 메모/, "진행이 글자 수 자리를 대신한다");
  assert.match(bar, />쓰기로 돌아가기<\/button>/);
  assert.equal(undone, 0);
  // 보낸 뒤(저장 중)에는 되돌리기가 없다 — 죽은 버튼을 두지 않는다.
  const sending = render({ model: written(body).model, away: true, contactProgress: { label: "연락 기록 · 저장 중", canUndo: false }, onContactUndo() {} });
  assert.match(sending.slice(sending.indexOf('class="record-wide__away"')), /연락 기록 · 저장 중/);
  assert.doesNotMatch(sending.slice(sending.indexOf('class="record-wide__away"')), /되돌리기/);
  // 쓰기 탭에서는 돌아가기 줄이 없다 — 진행은 띠의 contactLine이 보인다.
  assert.doesNotMatch(render({ model: written(body).model, contactProgress: { label: "연락 기록 · 기록 중", canUndo: true }, onContactUndo() {} }), /record-wide__away/);
  assert.match(code, /const returnToWriting = \(\) => \{\s*onReturn\?\.\(\);\s*requestAnimationFrame\(\(\) => bodyRef\.current\?\.focus\(\)\);\s*\};/);
});

test("a save that cannot go out from the 이 고객 tab asks to be looked at — a save that does go out does not", () => {
  // 가려진 칸의 커서는 다음 프레임에 둔다 — 시험은 그 프레임을 세기만 한다(DOM 없음).
  let frames = 0;
  const attend = (model, props = {}) => {
    let asked = 0;
    const ref = { current: null };
    const had = Object.hasOwn(globalThis, "requestAnimationFrame");
    const before = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (fn) => { frames += 1; fn(); return frames; };
    try {
      render({ model, saveRef: ref, away: true, onAttention: () => { asked += 1; }, ...props });
      ref.current();
    } finally {
      if (had) globalThis.requestAnimationFrame = before; else delete globalThis.requestAnimationFrame;
    }
    return asked;
  };
  // 빈 메모 — 이유(메모를 한 줄 쓰면 저장돼요)는 저장 줄에 있다. 쓰기로 돌아와야 보인다.
  const empty = memoModel();
  assert.equal(attend(empty.model), 1);
  assert.deepEqual(empty.calls, []);
  // 커서는 쓰기 탭이 다시 선 다음 프레임에 둔다 — 아직 가려진 칸에 곧바로 두면 커서가 어디에도 서지 않는다.
  assert.equal(frames, 1);
  // 쓰기 탭에서 누른 빈 메모는 프레임을 기다리지 않는다(칸이 이미 보인다).
  assert.equal(attend(memoModel().model, { away: false }), 1);
  assert.equal(frames, 1);
  // 쓴 메모는 그대로 나간다 — 읽던 탭에서 끌어내지 않는다.
  const good = written("결정은 원장님이 직접");
  assert.equal(attend(good.model), 0);
  assert.deepEqual(good.calls.map(([name]) => name), ["edit", "save"]);
  assert.equal(frames, 1, "나가는 저장은 커서를 옮기지 않는다");
  // 실패 · 미확인 · 충돌(레일 줄이 서는 상태)은 생기는 순간 알린다 — 가려진 탭에서 조용히 묻히지 않는다.
  assert.match(code, /const issue = plan\.line\.note\?\.tone === "error" \? plan\.line\.note\.title \|\| "" : "";\s*React\.useEffect\(\(\) => \{\s*if \(issue\) onAttention\?\.\(\);\s*\}, \[issue\]\);/);
  for (const patch of [{ saveState: "error", message: "서버가 거절했어요." }, { pending: { requestId: "r1" } }, { conflict: { id: "note-1", contexts: [] } }]) {
    assert.equal(recordMemoLine({ ready: true, source: "live", empty: false, saveState: patch.saveState, message: patch.message, pending: Boolean(patch.pending), conflict: Boolean(patch.conflict) }).line.note.tone, "error");
  }
  // 빈 메모 · 쓰는 중 · 저장 확인은 실패가 아니다 — 알리지 않는다.
  for (const input of [{ empty: true, attempted: true }, { empty: false }, { empty: true, savedAt: "2026-09-30T01:00:00.000Z" }]) {
    assert.notEqual(recordMemoLine({ ready: true, source: "live", ...input }).line.note?.tone, "error");
  }
});

test("the pane forwards what the form hands it — the slot props reach the view in every boot state", () => {
  // 확인 중(첫 그리기)에도 머리 자리 · 전환 칸 · 돌아가기 줄이 선다.
  const head = React.createElement("div", { "data-head": "" }, "전환 칸");
  const pane = renderToStaticMarkup(React.createElement(RecordMemoPane, {
    contexts: [{ type: "lead", id: "11111111-1111-4111-8111-111111111111", label: "메모 대상" }],
    head, saveSlot: null, away: true, onReturn() {}, onAttention() {},
  }));
  assert.match(pane, /^<div class="record-wide__scroll"><div data-head="">전환 칸<\/div>/);
  assert.equal((pane.match(/hub-btn--primary/g) || []).length, 0, "주 버튼은 머리 자리의 것 — 제자리에 그리지 않는다");
  assert.match(pane, /class="record-wide__away"/);
  assert.match(code, /export function RecordMemoPane\(\{ contexts = \[\], saveRef = null, contactLine = null, onSaved, \.\.\.slot \}\) \{/);
  assert.equal((code.match(/\{\.\.\.slot\}/g) || []).length, 2, "확인 중 · 준비된 뒤 둘 다");
});

// Execute the actual session effects and journal hook with deferred reads. This catches a
// writer remount even though static rendering cannot run effects or restore browser drafts.
function memoHookHarness(factory) {
  const slots = [];
  let cursor = 0, effects = [], component;
  const same = (left, right) => left?.length === right?.length && left.every((value, index) => Object.is(value, right[index]));
  const hooks = {
    useState(initial) {
      const index = cursor++, cell = slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
      return [cell.value, change => { cell.value = typeof change === "function" ? change(cell.value) : change; }];
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useMemo(create, deps) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { value: create(), deps };
      return slots[index].value;
    },
    useCallback(callback, deps) { return hooks.useMemo(() => callback, deps); },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) effects.push({ index, effect, deps });
    },
  };
  component = factory(hooks);
  return {
    render(props) {
      cursor = 0; effects = [];
      const view = component(props);
      for (const { index, effect, deps } of effects) {
        slots[index]?.cleanup?.();
        slots[index] = { deps, cleanup: effect() };
      }
      return view;
    },
    unmount() { for (const cell of slots) cell?.cleanup?.(); },
  };
}
function memoStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
function cachedMemoPane(storage, cachedLedger, read, seeds = []) {
  const helpers = source.slice(source.indexOf("function memoSession("), source.indexOf("// contexts: [{ type:"));
  const start = source.indexOf("export function RecordMemoPane("), end = source.indexOf('  if (session.status !== "ready") {', start);
  return memoHookHarness(hooks => new Function("React", "sessionStorage", "knownLedger", "fetchJournal", "claimContextMemoId", "contextMemoKey", "contextMemoStorageKey", "releaseContextMemoId", "isCanonicalUuid", "rememberJournalWorkspace", "seedNextMemo", "nextMemoSeed", "window", "MEMO_CHANGED_EVENT", "createJournalStore", "journalTabId",
    helpers + source.slice(start, end).replace("export function", "function") + '\nreturn { session, settle };\n}\nreturn RecordMemoPane;')(
      hooks, storage, cachedLedger, read, claimContextMemoId, contextMemoKey, contextMemoStorageKey, releaseContextMemoId, isCanonicalUuid, () => {},
      (_workspaceId, seed) => { seeds.push(seed); return Boolean(seed); }, nextMemoSeed, new EventTarget(), "synthetic:memo-changed", createJournalStore, () => "integration-tab"));
}
function actualMemoWriter(storage, fetchJournal) {
  const writerSource = readFileSync(new URL("./pages/use-memos.js", import.meta.url), "utf8");
  const body = writerSource.slice(writerSource.indexOf("export function useMemoDocument")).replace("export function", "function");
  const dependencies = { ...journalClient, createJournalStore, journalTabId: () => "integration-tab", sessionStorage: storage, fetchJournal,
    fetch() { throw Error("preview promotion must not send a write"); } };
  return memoHookHarness(hooks => new Function("React", ...Object.keys(dependencies), body + "\nreturn useMemoDocument;")(hooks, ...Object.values(dependencies)));
}
const memoTick = () => new Promise(setImmediate);

test("a deferred preview-to-live refresh preserves the mounted writer, text, and recovery document without saving", async () => {
  const storage = memoStorage();
  const contexts = [{ type: "lead", id: "70707070-7070-4070-8070-707070707070", label: "Current customer" }];
  const workspaceId = "80808080-8080-4080-8080-808080808080";
  let confirm;
  const pane = cachedMemoPane(storage, { workspaceId: null, status: "preview" }, () => new Promise(resolve => { confirm = resolve; }));
  const props = { contexts };
  pane.render(props);
  const before = pane.render(props).session;
  const writer = actualMemoWriter(storage, async () => ({ contexts }));
  const writerProps = session => ({ id: session.id, isNew: true, entry: null, contexts,
    workspaceId: session.ledger.workspaceId, workspaceConfirmed: isCanonicalUuid(session.ledger.workspaceId),
    source: session.ledger.status, fromPreview: Boolean(session.ledger.fromPreview) });
  writer.render(writerProps(before));
  await memoTick();
  writer.render(writerProps(before)).edit({ body: "Keep this unsaved preview text", noteMeta: { scope: "company" } });
  confirm({ workspaceId, status: "live" });
  await memoTick();
  const after = pane.render(props).session;
  assert.equal(after.id, before.id, "the context must keep the document containing the text");
  assert.equal(after.documentKey, before.documentKey, "the writer stays mounted so its workspace carry path can run");
  assert.equal(after.ledger.fromPreview, true);
  assert.equal(storage.getItem(contextMemoStorageKey(workspaceId, contextMemoKey(contexts))), before.id, "reopening this context resumes the promoted draft");
  writer.render(writerProps(after));
  const model = writer.render(writerProps(after));
  assert.equal(model.draft.body, "Keep this unsaved preview text");
  assert.equal(model.draft.noteMeta.scope, "company");
  assert.equal(model.pending, null);
  assert.equal(model.saveState, "idle", "promotion never auto-saves");
  assert.equal(createJournalStore({ storage, workspaceId, tabId: "integration-tab" }).read(before.id).draft.body, model.draft.body);
  writer.unmount(); pane.unmount();
});

test("confirmed workspace changes do not carry the prior workspace's memo into another workspace", async () => {
  const storage = memoStorage(), first = "90909090-9090-4090-8090-909090909090", second = "91919191-9191-4191-8191-919191919191";
  const contexts = [{ type: "lead", id: "92929292-9292-4292-8292-929292929292" }];
  let confirm;
  const pane = cachedMemoPane(storage, { workspaceId: first, status: "live" }, () => new Promise(resolve => { confirm = resolve; }));
  pane.render({ contexts });
  const before = pane.render({ contexts }).session;
  confirm({ workspaceId: second, status: "live" }); await memoTick();
  const after = pane.render({ contexts }).session;
  assert.notEqual(after.id, before.id);
  assert.notEqual(after.documentKey, before.documentKey);
  assert.equal(after.ledger.fromPreview, undefined);
  pane.unmount();
});

test("preview promotion carries an unresolved request as a locked recovery document without dispatching it", async () => {
  const storage = memoStorage(), workspaceId = "93939393-9393-4393-8393-939393939393";
  const contexts = [{ type: "account", id: "94949494-9494-4494-8494-949494949494" }];
  let confirm;
  const pane = cachedMemoPane(storage, { workspaceId: null, status: "preview" }, () => new Promise(resolve => { confirm = resolve; }));
  pane.render({ contexts });
  const before = pane.render({ contexts }).session;
  const pending = { action: "save", entryId: before.id, requestId: "95959595-9595-4595-8595-959595959595", body: "Unconfirmed text" };
  createJournalStore({ storage, workspaceId: null, tabId: "integration-tab" }).write(before.id, {
    draft: { id: before.id, body: pending.body, contexts, expectedRevision: 0 }, dirty: true, pending,
  });
  const writer = actualMemoWriter(storage, async () => ({ contexts }));
  const writerProps = session => ({ id: session.id, isNew: true, entry: null, contexts,
    workspaceId: session.ledger.workspaceId, workspaceConfirmed: isCanonicalUuid(session.ledger.workspaceId),
    source: session.ledger.status, fromPreview: Boolean(session.ledger.fromPreview) });
  writer.render(writerProps(before));
  confirm({ workspaceId, status: "live" }); await memoTick();
  const after = pane.render({ contexts }).session;
  writer.render(writerProps(after));
  const model = writer.render(writerProps(after));
  assert.deepEqual(model.pending, pending);
  assert.equal(model.locked, true);
  assert.equal(model.draft.body, pending.body);
  assert.deepEqual(createJournalStore({ storage, workspaceId, tabId: "integration-tab" }).read(before.id).pending, pending);
  writer.unmount(); pane.unmount();
});

test("confirmed saves and keeping a company conflict forward its scope into the next memo", () => {
  const storage = memoStorage(), workspaceId = "96969696-9696-4696-8696-969696969696";
  const contexts = [{ type: "lead", id: "97979797-9797-4797-8797-979797979797" }], seeds = [];
  const pane = cachedMemoPane(storage, { workspaceId, status: "live" }, () => new Promise(() => {}), seeds);
  pane.render({ contexts });
  pane.render({ contexts }).settle({ contexts, noteMeta: { scope: "company" } });
  assert.equal(seeds.at(-1).draft.noteMeta.scope, "company", "confirmed company memo keeps company as the next draft scope");
  const stored = { contexts, noteMeta: { scope: "company" } };
  const body = source.match(/const keepStored = \(\) => \{([\s\S]*?)\};/)[1];
  new Function("model", "onSettled", body)({ conflict: stored, chooseConflict(mine) { assert.equal(mine, false); } }, pane.render({ contexts }).settle);
  assert.equal(seeds.at(-1).draft.noteMeta.scope, "company", "accepting the stored conflict carries the stored scope too");
  pane.unmount();
});

test("an empty cached preview does not displace the live context's existing draft", async () => {
  const storage = memoStorage(), workspaceId = "98989898-9898-4898-8898-989898989898";
  const contexts = [{ type: "lead", id: "99999999-9999-4999-8999-999999999999" }];
  const key = contextMemoStorageKey(workspaceId, contextMemoKey(contexts));
  const liveId = claimContextMemoId(storage, key);
  createJournalStore({ storage, workspaceId, tabId: "integration-tab" }).write(liveId, { draft: { id: liveId, body: "Existing live draft" }, dirty: true });
  let confirm;
  const pane = cachedMemoPane(storage, { workspaceId: null, status: "preview" }, () => new Promise(resolve => { confirm = resolve; }));
  pane.render({ contexts });
  confirm({ workspaceId, status: "live" }); await memoTick();
  assert.equal(pane.render({ contexts }).session.id, liveId);
  assert.equal(storage.getItem(key), liveId);
  assert.equal(createJournalStore({ storage, workspaceId, tabId: "integration-tab" }).read(liveId).draft.body, "Existing live draft");
  pane.unmount();
});
