import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { RecordMemoPane, RecordMemoView } from "./record-memo-pane.jsx";
import { RecordSaveLine } from "./contact-record-form.jsx";
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
  assert.match(code, /useGrowingDetail\(bodyRef, ready, body\);/);
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
  assert.match(code, /if \(empty\) \{ bodyRef\.current\?\.focus\(\); return; \}/);

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
  assert.match(code, /const keepStored = \(\) => \{ const stored = model\.conflict; model\.chooseConflict\(false\); onSettled\?\.\(null, stored\?\.contexts\); \};/);
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
  const settle = code.slice(code.indexOf("const settle = (entry, contexts = entry?.contexts) => {"), code.indexOf("if (session.status !== \"ready\") {\n    return"));
  assert.match(settle, /const id = claimContextMemoId\(sessionStorage, session\.storageKey\);\s*const seeded = seedNextMemo\(session\.ledger\.workspaceId, nextMemoSeed\(\{ id, contexts, seeds: stableContexts \}\)\);\s*setSession\(\{ \.\.\.session, id, seeded \}\);/);
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
  assert.match(code, /knownLedger = ledger;\s*const next = memoSession\(ledger, identity\);\s*setSession\(\(prev\) => \(sameSession\(prev, ledger, identity\) \? prev : next\)\);/);
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
  assert.match(code, /id: claimContextMemoId\(sessionStorage, storageKey\)/);
  const drawer = readFileSync(new URL("./context-memo-drawer.jsx", import.meta.url), "utf8");
  assert.match(drawer, /contextMemoStorageKey\(ledger\.workspaceId, identity\)/);
  assert.match(drawer, /claimContextMemoId\(sessionStorage, storageKey\)/);
  assert.doesNotMatch(code, /crm-record|localStorage|createRecordDraftStore/, "연락 기록 초안과 다른 키 · 같은 탭(sessionStorage)");
  // 저장이 확인된 뒤에만: 메모 목록을 다시 읽게 하고, 영수증 시각을 세우고, 호출처에 알린다. 그리고 새 메모 ID로 넘어간다.
  const settle = code.slice(code.indexOf("const settle = (entry, contexts = entry?.contexts) => {"), code.indexOf("if (session.status !== \"ready\") {\n    return"));
  assert.ok(settle.length > 0);
  assert.match(settle, /releaseContextMemoId\(sessionStorage, session\.storageKey\);/);
  assert.match(settle, /if \(!entry\) \{ setSavedAt\(null\); return; \}\s*window\.dispatchEvent\(new Event\(MEMO_CHANGED_EVENT\)\);\s*setSavedAt\(new Date\(\)\.toISOString\(\)\);\s*onSaved\?\.\(entry\);/);
  assert.match(code, /onSaved=\{settle\}/);
});
