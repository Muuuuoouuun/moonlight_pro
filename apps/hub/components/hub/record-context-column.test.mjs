import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Drawer } from "./hub-primitives.jsx";
import { RecordContextColumn, RecordReceipt } from "./record-context-column.jsx";
import { RECORD_DRAWER_WIDTH, recordReceipt } from "../../lib/sales-os/contact-record.js";
import { customerPromise } from "../../lib/sales-os/customer-list.js";
import { recordContextTruth } from "../../lib/sales-os/record-context.js";

const source = readFileSync(new URL("./record-context-column.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./record-window.css", import.meta.url), "utf8");

const TODAY = "2026-09-30";
const LIVE = recordContextTruth({ actSync: "live" });
const lead = (patch = {}) => ({ kind: "lead", stage: "Contact", name: "읽기 칸 고객", ...patch });
const promiseOf = (patch) => customerPromise(lead(patch), TODAY);
// 기록 시각은 실행하는 기기의 달력 날짜로 세운다 — 고정 UTC 시각은 서쪽 시간대에서 하루 밀려
// "2일 전"이 "3일 전"이 된다(영수증 시각만 KST 고정 형식이라 UTC 값을 그대로 쓴다).
const localNoon = (month, day) => new Date(2026, month - 1, day, 12).toISOString();
const act = (patch = {}) => ({ id: "a1", source: "activity", type: "call", msg: "견적 검토 통화", reaction: "positive", occurredAt: localNoon(9, 28), ...patch });
const render = (props = {}) => renderToStaticMarkup(React.createElement(RecordContextColumn, {
  name: "읽기 칸 고객", promise: promiseOf({ nextAction: "견적서 보내기", nextActionAt: "2026-10-05" }), rows: [], today: TODAY, truth: LIVE, ...props,
}));
const text = (html) => html.replace(/<[^>]+>/g, "");
// 이 칸의 버튼은 두 가지뿐이다 — 보기만 바꾸는 거르기(전체 · 연락 · 메모)와, 펼칠 것이 있는 기록 줄.
const buttonsOf = (html) => html.match(/<button[^>]*>/g) || [];
const filterButtons = (html) => buttonsOf(html).filter((tag) => /class="hub-seg__btn"/.test(tag));
const otherButtons = (html) => buttonsOf(html).filter((tag) => !/class="hub-seg__btn"/.test(tag));

test("the column is a read-only aside — a promise card and the record list, no write controls", () => {
  const html = render({ rows: [act()] });
  assert.match(html, /^<aside class="record-ctx" aria-label="읽기 칸 고객 · 읽기만">/);
  assert.match(html, /이 고객 · 읽기만/);
  assert.match(html, /<section class="record-ctx__promise" aria-label="다음 약속">/);
  assert.match(html, /<p class="record-ctx__what">견적서 보내기<\/p>/);
  assert.match(html, /<p class="record-ctx__when">10\/5 약속<\/p>/);
  assert.match(html, /<section class="record-ctx__sec" aria-label="기록">/);
  // 읽기만 — 약속 바꾸기 · 기록 삭제 · 메모 열기 버튼이 없다(한 줄짜리 기록은 누르는 곳도 아니다).
  // 있는 버튼은 보기만 바꾸는 거르기 셋뿐이다(2026-09-30 ⑥) — 아무것도 저장하지 않고 다시 읽지도 않는다.
  assert.equal(filterButtons(html).length, 3);
  assert.deepEqual(otherButtons(html), []);
  assert.doesNotMatch(html, /했어요 · 기록|날짜 다시|약속 정하기|기록 삭제/);
  assert.doesNotMatch(source, /hub-btn--primary|variant="primary"/);
  // 아직 만들지 않는 것 — 기다리는 것 목록(승인 전).
  assert.doesNotMatch(html + source.replace(/\/\/[^\n]*/g, ""), /기다리는 것/);
});

test("a missed promise is one danger label, not a rail; a muted promise shows no date line", () => {
  const late = render({ promise: promiseOf({ nextAction: "OMR 시안 보내기", nextActionAt: "2026-09-27" }) });
  assert.match(late, /<p class="record-ctx__when"><span class="record-ctx__late">3일 지남<\/span> · 9\/27 약속<\/p>/);
  // 빨강은 글자 한 곳 — 쓰는 동안의 레일은 실패 원인 줄 몫이다.
  assert.match(css, /\.hub-app \.record-ctx__late \{ color: var\(--danger\); font-weight: 500; \}/);
  assert.equal((css.match(/var\(--danger\)/g) || []).length, 1);
  assert.doesNotMatch(css, /inset 1px 0 0/);

  const none = render({ promise: promiseOf({}) });
  assert.match(none, /<p class="record-ctx__what" data-muted="true">아직 정하지 않았어요<\/p>/);
  assert.doesNotMatch(none, /record-ctx__when/);
});

test("the one tip this customer already has is shown as a reason only — no action, no second tip", () => {
  const withTip = render({ tipReason: "우려 반응 뒤 닷새째 정리가 없어요" });
  assert.equal((withTip.match(/class="suggestion-tip"/g) || []).length, 1);
  assert.match(withTip, /우려 반응 뒤 닷새째 정리가 없어요/);
  assert.match(withTip, />제안</);
  assert.doesNotMatch(withTip, /<button/, "읽기 칸의 팁에는 행동 · 나중에 · 숨기기가 없다");
  assert.doesNotMatch(render(), /suggestion-tip/, "고른 팁이 없으면 지어내지 않는다");
  assert.match(source, /<SuggestionTip reason=\{tipReason\} \/>/);
});

test("records list newest-first with shape, type, reaction and time — memos say 연락 아님", () => {
  const html = render({
    rows: [
      act({ id: "a1", msg: "채점 기능은 10월 중순이면 좋겠다" }),
      { id: "memo:1", source: "memo", type: "memo", msg: "원장님 성향", detail: "숫자로 설명해야 움직이심", occurredAt: localNoon(9, 27) },
      act({ id: "a3", type: "deal", reaction: null, msg: "계약 · 클로징", occurredAt: localNoon(9, 22) }),
    ],
  });
  const items = html.match(/<li class="record-ctx__item"[^>]*>/g) || [];
  assert.deepEqual(items.map((li) => li.match(/data-shape="(\w+)"/)[1]), ["contact", "memo", "event"]);
  assert.match(html, /최근 <span class="num">3<\/span>/);
  assert.ok(html.indexOf("채점 기능은") < html.indexOf("원장님 성향") && html.indexOf("원장님 성향") < html.indexOf("계약 · 클로징"), "받은 순서 그대로");
  assert.match(text(html), /채점 기능은 10월 중순이면 좋겠다통화긍정2일 전/);
  assert.match(text(html), /원장님 성향메모연락 아님3일 전자세히 2줄/);
  // 시각은 mono.
  assert.match(html, /<span class="mono">2일 전<\/span>/);
  // 모양은 CSS가 든다 — 메모는 네모(--r-xs), 그 밖은 흐린 원. 점선 · 점은 확실성 몫이라 쓰지 않는다.
  assert.match(css, /\.record-ctx__item\[data-shape="memo"\] \.record-ctx__dot \{ border-radius: var\(--r-xs\);/);
  assert.match(css, /\.record-ctx__item\[data-shape="event"\] \.record-ctx__dot \{ border-color: var\(--line-soft\);/);
  assert.doesNotMatch(css.slice(css.indexOf("── 읽기 칸")), /dashed|dotted/);
});

test("only a row with more to read is a button, and it expands in place", () => {
  const html = render({ rows: [act({ id: "short" }), act({ id: "long", type: "note", reaction: null, msg: "[요약]\n원장님과 50분 미팅\n[결정사항]\n- 시범 채점" })] });
  const buttons = otherButtons(html);
  assert.equal(buttons.length, 1);
  assert.match(buttons[0], /type="button" class="hub-row record-ctx__body" aria-expanded="false"/);
  assert.match(html, /<span class="record-ctx__open">자세히 <span class="num">4<\/span>줄<\/span>/);
  assert.match(html, /<span class="record-ctx__title">\[요약\]<\/span>/);
  // 펼침은 이 칸 안의 상태다 — 다른 창을 열지 않고(onOpen 같은 콜백 없음) 그 자리에서 전부 보인다.
  assert.match(source, /aria-expanded=\{open\} onClick=\{onToggle\}/);
  assert.match(source, /\{open\s*\? <span className="record-ctx__full">\{row\.full\}<\/span>\s*: <span className="record-ctx__title">\{row\.title\}<\/span>\}/);
  assert.match(source, /\{open \? "접기" : /);
  assert.match(css, /\.hub-app \.record-ctx__full \{[^}]*white-space: pre-line;/);
  assert.doesNotMatch(source, /onOpenMemo|onDeleteActivity|setMemoState/);
});

test("no row is cut off without a way to read it — the two-line fold applies only to rows that expand", () => {
  // 두 줄에 안 들어가는 한 줄 기록(읽기 칸의 글 너비는 214~254px) — 접히지 않고 전부 보인다.
  const middling = "단원평가는 OMR로 채점하고 싶어 하심 · 10월 셋째 주 시범 채점 뒤 11월 본계약 검토";
  assert.ok(middling.length > 40 && middling.length <= 72);
  const plain = render({ rows: [act({ id: "m1", msg: middling })] });
  assert.deepEqual(otherButtons(plain), [], "펼칠 것이 없는 줄은 누르는 곳이 아니다");
  assert.match(plain, new RegExp(`<div class="record-ctx__body"><span class="record-ctx__title">${middling}</span>`));
  // 접힘(말줄임)은 누를 수 있는 줄 안에서만 — 누를 수 없는 줄의 제목에는 걸리지 않는다.
  const titleRule = css.match(/\n\.hub-app \.record-ctx__title \{[^}]*\}/)?.[0] || "";
  assert.ok(titleRule.length > 0);
  assert.doesNotMatch(titleRule, /line-clamp|overflow: hidden/);
  assert.match(css, /\.hub-app \.record-ctx__body\[aria-expanded\] \.record-ctx__title \{ display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; \}/);

  // 더 긴 한 줄은 접히고 펼칠 수 있다 — 줄 수가 아니라 "펼치기"라고 말한다("자세히 1줄"이 아니다).
  const long = "가".repeat(80);
  const folded = render({ rows: [act({ id: "l1", msg: long })] });
  assert.match(folded, /<button type="button" class="hub-row record-ctx__body" aria-expanded="false">/);
  assert.match(folded, /<span class="record-ctx__open">펼치기<\/span>/);
  assert.doesNotMatch(text(folded), /자세히 1줄/);
  assert.match(source, /row\.openLabel === "lines" \? <>자세히 <span className="num">\{row\.lineCount\}<\/span>줄<\/> : "펼치기"/);
});

test("reads in flight, failed or partial say so — never an empty list that reads as no records", () => {
  const loading = render({ truth: recordContextTruth({ actSync: "loading" }), rows: [act()] });
  assert.match(loading, /role="status"/);
  assert.match(loading, /기록 불러오는 중/);
  assert.doesNotMatch(loading, /record-ctx__item|아직 기록이 없어요/);

  const failed = render({ truth: recordContextTruth({ actSync: "error" }), rows: [], onRetry() {} });
  assert.match(failed, /<div role="alert" class="record-ctx__state">/);
  assert.match(failed, /data-truth="error"[^>]*>.*읽기 실패 · 활동 기록을 읽지 못했어요/s);
  assert.match(failed, />다시 시도<\/button>/);
  assert.doesNotMatch(failed, /아직 기록이 없어요/, "못 읽은 것을 없는 것으로 말하지 않는다");

  // 활동은 읽었고 연결 메모만 못 읽었다 — 읽은 줄은 보이고, 빠진 출처와 다시 읽기를 함께 낸다.
  const partial = render({ truth: recordContextTruth({ actSync: "live", memoEnabled: true, memoStatus: "error" }), rows: [act()], onRetry() {} });
  assert.match(partial, /data-truth="partial"[^>]*>.*일부 데이터 · 연결 메모를 읽지 못했어요/s);
  assert.match(partial, />다시 읽기<\/button>/);
  assert.match(partial, /record-ctx__item/);
  // 다시 읽기는 어느 읽기인지(activities · memos)를 호출처에 넘긴다.
  assert.match(source, /const retry = truth\?\.retry && onRetry \? \(\) => onRetry\(truth\.retry\) : null;/);

  const preview = render({ truth: recordContextTruth({ actSync: "preview" }) });
  assert.match(preview, /data-truth="preview"/);
  assert.match(preview, /연결 전이라 지난 기록을 읽을 수 없어요\./);
  assert.match(render(), /아직 기록이 없어요\./);
  // 다섯 줄을 넘으면 나머지가 어디 있는지 말한다(읽기 칸은 다섯 줄까지만).
  const many = render({ rows: Array.from({ length: 7 }, (_, i) => act({ id: `a${i}` })) });
  assert.equal((many.match(/<li class="record-ctx__item"/g) || []).length, 5);
  assert.match(text(many), /전체 7건은 ‘고객 정보로’에서 봐요\./);
});

test("the newest row is the receipt — 기록 중 → 저장 중 → 저장됨 hh:mm, 일부 저장 for a half-saved record", () => {
  const mark = (row) => renderToStaticMarkup(React.createElement(RecordReceipt, { receipt: recordReceipt(row) }));
  assert.equal(mark({ id: "stored" }), "", "읽어 온 기록에는 영수증이 없다");

  const pending = mark({ pending: true });
  assert.match(pending, /^<span class="record-receipt" data-receipt="pending" role="status">/);
  assert.equal(text(pending), "기록 중 · 아직 보내지 않았어요");
  // 저장 중은 TruthBadge의 syncing 그대로 — 새 알약을 만들지 않는다.
  const sending = mark({ pending: true, receipt: "sending" });
  assert.match(sending, /^<span data-truth="syncing" aria-label="데이터 상태: 저장 중"/);
  assert.equal(text(sending), "저장 중");
  // 저장됨은 서버가 답한 뒤에만 — 시각은 mono, 초록 없음.
  const saved = mark({ receipt: "saved", savedAt: "2026-09-30T01:42:00Z" });
  assert.match(saved, /data-receipt="saved"/);
  assert.match(saved, /저장됨 <span class="mono">10:42<\/span>/);
  assert.equal(text(saved), "저장됨 10:42");
  const partial = mark({ receipt: "partial", savedAt: "2026-09-30T01:42:00Z" });
  assert.equal(text(partial), "일부 저장 10:42 · 요약만 저장됐어요 · 긴 글은 아직");
  // 모든 영수증은 글자 + 표식이다(§11) — 일부 저장은 반만 찬 원, 저장됨은 체크, 기록 중은 멈춤.
  // 일부 저장은 눈에 띄어야 하는 쪽이라 저장됨과 같은 또렷함(--fg)이고, 빨강은 쓰지 않는다.
  for (const html of [pending, saved, partial]) assert.equal((html.match(/<svg/g) || []).length, 1);
  assert.match(partial, /<svg[^>]*aria-hidden="true"[^>]*><circle[^>]*fill="none" stroke="currentColor"[^>]*><\/circle><path[^>]*fill="currentColor"><\/path><\/svg>/);
  assert.match(css, /\.hub-app \.record-receipt\[data-receipt="saved"\],\s*\.hub-app \.record-receipt\[data-receipt="partial"\] \{ color: var\(--fg\); \}/);
  for (const html of [pending, sending, partial]) assert.doesNotMatch(text(html), /저장됨|기록됨/);
  for (const html of [pending, sending, saved, partial]) assert.doesNotMatch(html, /--success|--warning|--info|--danger/);
  assert.doesNotMatch(css, /--success|--warning|--info/);

  // 읽기 칸의 줄: 영수증이 시각 자리를 대신하고, 방금 남긴 줄은 한 단계 또렷하다.
  const html = render({ rows: [act({ id: "local-1", at: "방금", pending: true }), act({ id: "a2" })] });
  assert.match(html, /<li class="record-ctx__item" data-shape="contact" data-receipt="pending">/);
  const first = html.slice(html.indexOf('data-receipt="pending"'), html.indexOf("</li>"));
  assert.match(text(first), /기록 중 · 아직 보내지 않았어요$/);
  assert.doesNotMatch(text(first), /방금|오늘|일 전/, "확인되지 않은 기록에 시각을 달지 않는다");
  assert.match(css, /\.record-ctx__item\[data-receipt\] \.record-ctx__title \{ font-weight: 500; \}/);
});

test("the two columns scroll on their own and fold to the composer alone at 900px", () => {
  assert.match(css, /\.hub-app \.record-window \{ flex: 1; min-height: 0; display: grid; grid-template-columns: minmax\(0, 1fr\) clamp\(280px, 33\.4%, 320px\); \}/);
  assert.match(css, /\.hub-app \.record-ctx \{[^}]*overflow-y: auto;/);
  // 쓰기 칸 — 아래 띠는 제자리, 그 위(요약 + 자세히)만 흐른다.
  assert.match(css, /\.hub-app \.record-wide__scroll \{ flex: 1 0 var\(--record-scroll-floor\); min-height: 0; overflow-y: auto;/);
  assert.match(css, /\.hub-app \.record-wide__band \{ flex: none;/);
  assert.doesNotMatch(css, /record-wide__top/, "요약은 흐르는 칸 안에 있다 — 제자리는 아래 띠 하나");
  // 낮은 화면(가로로 눕힌 휴대폰 · 200% 확대)에서 띠가 잘린 채 닿지 않는 곳에 남지 않는다 — 흐르는 칸이
  // 바닥 아래로 줄 자리가 없으면 쓰기 칸 전체가 흐른다. 안쪽 흐름이 쓰기 칸으로 이어져야 하므로
  // 흐르는 칸에는 overscroll 가둠을 두지 않고, 쓰기 칸에서 가둔다.
  const wideRule = css.match(/\n\.hub-app \.record-wide \{[^}]*\}/)?.[0] || "";
  assert.match(wideRule, /--record-scroll-floor: 16rem;/);
  assert.match(wideRule, /overflow-y: auto; overscroll-behavior: contain;/);
  assert.doesNotMatch(css.match(/\n\.hub-app \.record-wide__scroll \{[^}]*\}/)?.[0] || "x overscroll-behavior", /overscroll-behavior/);
  // 중단점은 900 하나(600 이하는 이 배치를 쓰지 않는다) — 새 중단점을 만들지 않는다.
  assert.deepEqual([...css.matchAll(/@media \(([^)]+)\)/g)].map((m) => m[1]), ["max-width: 900px"]);
  const narrow = css.slice(css.indexOf("@media (max-width: 900px)"));
  assert.match(narrow, /\.hub-app \.record-window \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(narrow, /\.hub-app \.record-ctx \{ display: none; \}/);
  // 토큰만 — 원색 · raw 시간 · 굵은 선이 없다.
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b|rgba?\(|oklch\(/);
  assert.doesNotMatch(css, /\d+ms\b|cubic-bezier\(/);
  assert.doesNotMatch(css, /border(?:-(?:top|right|bottom|left))?(?:-width)?: (?:[2-9]|\d{2,})px/);
  assert.doesNotMatch(css, /font-size: (?:\d|10)(?:\.[0-4]\d*)?px/, "10.5px 아래 글자는 없다");
});

// ── 2026-09-30 넓은 기록창 ⑥ — 한 줄기, 모양과 글자로 나누고 전체 · 연락 · 메모로 거른다(Q-CR6) ──────

test("contact rows are circles, memo rows are squares that also say 메모 · 연락 아님 — shape and label, never color", () => {
  const html = render({
    rows: [
      act({ id: "c1", msg: "채점 기능은 10월 중순이면 좋겠다" }),
      { id: "memo:1", source: "memo", type: "memo", msg: "원장님 성향", occurredAt: localNoon(9, 27) },
      act({ id: "n1", type: "note", reaction: null, msg: "연락이 아닌 한 줄", occurredAt: localNoon(9, 26) }),
    ],
  });
  const items = html.match(/<li class="record-ctx__item"[^>]*>.*?<\/li>/gs) || [];
  assert.deepEqual(items.map((li) => li.match(/data-shape="(\w+)"/)[1]), ["contact", "memo", "memo"]);
  // 연결 메모(journal)와 활동 노트는 같은 네모, 같은 이름이다 — 글자로도 말한다(모양만으로 뜻을 나르지 않는다).
  assert.match(text(items[1]), /^원장님 성향메모연락 아님3일 전$/);
  assert.match(text(items[2]), /^연락이 아닌 한 줄메모연락 아님4일 전$/);
  assert.doesNotMatch(text(items[0]), /메모|연락 아님/);
  assert.doesNotMatch(text(html), /노트/, "네모 하나에 이름 둘(노트 · 메모)을 두지 않는다");
  // 모양은 표식의 모서리와 면뿐이다 — 연락은 원(999px), 메모는 네모(--r-xs). 색 토큰으로 나누지 않는다.
  assert.match(css, /\.hub-app \.record-ctx__dot \{[^}]*border-radius: 999px;/);
  const memoRule = css.match(/\.hub-app \.record-ctx__item\[data-shape="memo"\] \.record-ctx__dot \{[^}]*\}/)?.[0] || "";
  assert.match(memoRule, /border-radius: var\(--r-xs\); background: var\(--surface-2\); \}$/);
  assert.doesNotMatch(memoRule, /--accent|--moon|--danger|--success|--warning|--info|--personal|--company/);
});

test("the filter is a view state inside the column — 전체 by default, shown only when there is something to filter", () => {
  const rows = [
    act({ id: "c1", msg: "통화 기록" }),
    { id: "memo:1", source: "memo", type: "memo", msg: "메모 기록", occurredAt: localNoon(9, 27) },
    act({ id: "e1", type: "deal", reaction: null, msg: "거래 기록", occurredAt: localNoon(9, 22) }),
  ];
  const html = render({ rows });
  const group = html.match(/<div class="hub-seg record-ctx__filter" role="group" aria-label="기록 거르기"[^>]*>.*?<\/div>/s)?.[0] || "";
  assert.deepEqual([...group.matchAll(/aria-pressed="(true|false)"[^>]*>([^<]+)</g)].map((m) => [m[2], m[1]]), [["전체", "true"], ["연락", "false"], ["메모", "false"]]);
  assert.equal((html.match(/<li class="record-ctx__item"/g) || []).length, 3, "전체는 거래 같은 흐린 원도 보인다");
  // 기록이 없으면 고를 것도 없다 — 읽는 중 · 읽기 실패에도 거르기를 두지 않는다.
  assert.doesNotMatch(render(), /record-ctx__filter/);
  assert.doesNotMatch(render({ rows, truth: recordContextTruth({ actSync: "loading" }) }), /record-ctx__filter/);
  assert.doesNotMatch(render({ rows, truth: recordContextTruth({ actSync: "error" }) }), /record-ctx__filter/);
  // 일부만 읽은 줄기(연결 메모 실패)도 거를 수 있다 — 빠진 출처는 그대로 말한다.
  const partial = render({ rows, truth: recordContextTruth({ actSync: "live", memoEnabled: true, memoStatus: "error" }), onRetry() {} });
  assert.match(partial, /record-ctx__filter/);
  assert.match(partial, /data-truth="partial"/);
  // 거르기는 이 칸의 상태다 — 새 읽기도 콜백도 없다. 거른 뒤에 최근 다섯 줄을 자른다(순수 규칙 — record-context.test.mjs).
  assert.match(source, /const \[filter, setFilter\] = React\.useState\("all"\);/);
  assert.match(source, /const visible = readable \? filterRecordStream\(rows, filter\) : \[\];\s*const items = recordContextRows\(visible, \{ today \}\);/);
  assert.match(source, /<SegmentedControl label="기록 거르기" options=\{RECORD_FILTERS\} value=\{filter\} onChange=\{setFilter\} className="record-ctx__filter" \/>/);
  assert.doesNotMatch(source, /onFilter|fetch\(/);
  // 거른 결과가 비면 그 종류가 없다고 말한다("기록 없음"과 다른 말) — 거른 줄이 다섯을 넘으면 그 종류의 수로 말한다.
  assert.match(source, /const empty = recordEmptyPlan\(\{ filter, total: rows\.length, state, memos: truth\?\.memos \}\);/);
  assert.match(source, /\{visible\.length > RECORD_CONTEXT_LIMIT && \(/);
  assert.match(css, /\.hub-app \.record-ctx__filter \{ margin-left: auto; \}/);
});

// 그릇은 같은 Drawer다(Q-CR1) — 폭은 이미 있는 width로, 두 칸이 각자 흐르도록 본문 여백만 걷는다.
test("the same Drawer carries the record window — width through the existing prop, body padding only when asked", () => {
  const bodyOf = (html) => html.match(/<div class="hub-drawer__body scroll-y"[^>]*>/)?.[0] || "";
  const asideOf = (html) => html.match(/<aside[^>]*>/)?.[0] || "";
  const draw = (props) => renderToStaticMarkup(React.createElement(Drawer, { title: "연락 기록", onClose() {}, ...props }, "본문"));

  // 기본 — 어떤 호출처도 바뀌지 않는다: 본문 여백 16px, 본문이 흐른다.
  const plain = draw({ width: RECORD_DRAWER_WIDTH.rest });
  assert.match(bodyOf(plain), /style="flex:1;padding:16px;display:flex;flex-direction:column;gap:14px"/);
  assert.match(asideOf(plain), /width:min\(480px, 96vw\)/);

  // 넓은 기록창 — 같은 side 드로어에 폭만 넓고, 본문은 여백 · 스크롤을 칸들에게 넘긴다.
  const wide = draw({ width: RECORD_DRAWER_WIDTH.wide, bodyStyle: { padding: 0, gap: 0, overflow: "hidden" } });
  assert.match(asideOf(wide), /data-presentation="side"/);
  assert.match(asideOf(wide), /role="dialog" aria-modal="true" aria-label="연락 기록"/);
  assert.match(asideOf(wide), /width:min\(960px, calc\(100% - 56px\)\)/);
  assert.match(bodyOf(wide), /style="flex:1;padding:0;display:flex;flex-direction:column;gap:0;overflow:hidden"/);
});

test("an empty place never reads as 'no memos' while linked memos are loading or unread", () => {
  // 활동은 읽었고(없음) 연결 메모는 아직 읽는 중 — 빈 말이 아니라 Skeleton이다.
  const loading = render({ truth: recordContextTruth({ actSync: "live", memoEnabled: true, memoStatus: "loading" }) });
  assert.match(loading, /role="status"/);
  assert.match(loading, /메모 불러오는 중/);
  assert.doesNotMatch(text(loading), /아직 기록이 없어요|메모가 아직 없어요/);
  // 연결 메모를 못 읽었다 — 머리 줄의 '일부 데이터 · 다시 읽기'와 같은 말을 한다(없다고 하지 않는다).
  const unread = render({ truth: recordContextTruth({ actSync: "live", memoEnabled: true, memoStatus: "error" }), onRetry() {} });
  assert.match(unread, /data-truth="partial"[^>]*>.*일부 데이터 · 연결 메모를 읽지 못했어요/s);
  assert.match(unread, />다시 읽기<\/button>/);
  assert.match(unread, /<p class="record-ctx__empty">활동 기록은 없어요 · 연결 메모는 읽지 못했어요\.<\/p>/);
  assert.doesNotMatch(text(unread), /아직 기록이 없어요|메모가 아직 없어요/);
  assert.doesNotMatch(unread, /role="alert"/, "읽은 활동까지 실패로 말하지 않는다 — 빠진 출처는 '일부 데이터'가 말한다");
  // 다 읽었고 없다 — 그때만 없다고 말한다. 메모를 읽지 않는 고객(uuid 아님)도 같다.
  assert.match(render({ truth: recordContextTruth({ actSync: "live", memoEnabled: true, memoStatus: "live" }) }), /<p class="record-ctx__empty">아직 기록이 없어요\.<\/p>/);
  assert.match(render({ truth: recordContextTruth({ actSync: "live" }) }), /<p class="record-ctx__empty">아직 기록이 없어요\.<\/p>/);
  // 거른 자리(메모 · 전체)도 같은 규칙이다 — 거르기 값과 메모 읽기 상태가 빈 자리의 말을 정한다(순수 규칙은 record-context.test.mjs).
  assert.match(source, /empty\.kind === "loading"\s*\? <Skeleton height=\{14\} lines=\{2\} label=\{empty\.label\} \/>\s*: <p className="record-ctx__empty">\{empty\.text\}<\/p>/);
  assert.doesNotMatch(source, /recordFilterEmptyCopy/, "빈 자리의 말을 읽기 상태 없이 고르지 않는다");
});
