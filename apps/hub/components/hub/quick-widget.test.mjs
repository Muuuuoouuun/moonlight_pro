import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  FirstActionRow, FirstActionSlot, QuickWidget, RECEIPT_COPY, WidgetBar, WidgetReceipt,
  WIDGET_HOME_PATH, firstActionView, widgetReceiptKind,
} from "./quick-widget.jsx";

// 데스크톱 빠른 입력 위젯(/widget) — 2026-09-26 운영자 승인 목업의 계약을 고정한다.
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const css = read("../../app/widget/widget.css");

test("receipt maps every save envelope to one line — preview never says 저장됨", () => {
  assert.equal(widgetReceiptKind({ status: "idle" }), "idle");
  assert.equal(widgetReceiptKind({ status: "saving" }), "saving");
  assert.equal(widgetReceiptKind({ status: "saved", duplicate: false }), "saved");
  assert.equal(widgetReceiptKind({ status: "saved", duplicate: true }), "duplicate");
  assert.equal(widgetReceiptKind({ status: "preview" }), "preview");
  assert.equal(widgetReceiptKind({ status: "error", error: "conflict" }), "error");

  assert.match(render(WidgetReceipt, { snapshot: { status: "idle" } }), /정리 전 메모로 보관합니다/);
  assert.match(render(WidgetReceipt, { snapshot: { status: "saved" } }), /저장됨 · 정리 전 메모/);
  assert.match(render(WidgetReceipt, { snapshot: { status: "saved", duplicate: true } }), /이미 저장된 메모입니다/);

  const preview = render(WidgetReceipt, { snapshot: { status: "preview" } });
  assert.match(preview, /data-truth="preview"/);
  assert.match(preview, /Preview · 연결 필요/);
  assert.match(preview, /저장하지 않았습니다/);
  assert.doesNotMatch(preview, /저장됨|완료/);
  assert.doesNotMatch(preview, /role="alert"/, "preview는 실패가 아니다");

  const error = render(WidgetReceipt, { snapshot: { status: "error", error: "engine-http-503" } });
  assert.match(error, /role="alert"/);
  assert.match(error, /quick-widget__receipt--error/);
  assert.match(error, /저장 실패/);
  assert.match(error, /입력은 남겨 두었습니다/);
  assert.match(error, /class="hub-btn hub-btn--ghost"[^>]*>다시 시도/);
  assert.doesNotMatch(error, /저장됨/);
  assert.equal(RECEIPT_COPY.idle, "정리 전 메모로 보관합니다");
});

test("error receipt draws the 1px danger rail from CSS, not a fill", () => {
  assert.match(css, /\.quick-widget__receipt--error \{ box-shadow: inset 1px 0 0 var\(--danger\);/);
  assert.doesNotMatch(css, /--danger-bg/);
});

test("without the app bridge there is no pin or close and the row is a plain link", () => {
  const bar = render(WidgetBar, {});
  assert.doesNotMatch(bar, /aria-pressed/);
  assert.doesNotMatch(bar, /닫기/);
  assert.match(bar, /<h2 class="quick-widget__eyebrow">빠른 입력<\/h2>/);

  const signal = { id: "s1", kind: "Revenue", title: "신규 리드 분류", meta: "Leads · 24시간 안에 분류", tone: "neutral" };
  const slot = render(FirstActionSlot, { status: "live", signals: [signal] });
  assert.match(slot, /<a class="quick-widget__row hub-row" href="\/dashboard\/home"/);
  assert.doesNotMatch(slot, /<button/, "링크 안에 버튼을 두지 않는다");
  assert.match(slot, /<span aria-hidden="true" class="hub-btn hub-btn--ghost quick-widget__open"/);
  assert.match(slot, /Revenue · Leads · 24시간 안에 분류/);
  assert.equal(FirstActionRow({ signal, urgent: false, bridge: null }).props.onClick, undefined);
});

test("with the bridge the pin reflects aria-pressed and the row opens the main window instead of navigating", () => {
  const bridge = { openMain: (path) => { bridge.opened = path; return Promise.resolve({ ok: true }); } };
  const bar = render(WidgetBar, { bridge, pinned: true });
  assert.match(bar, /aria-pressed="true"/);
  assert.match(bar, /aria-label="항상 위에 고정"/);
  assert.match(bar, /aria-label="닫기"/);
  assert.match(render(WidgetBar, { bridge, pinned: false }), /aria-pressed="false"/);

  const row = FirstActionRow({ signal: { title: "t", kind: "k" }, urgent: false, bridge });
  let prevented = false;
  row.props.onClick({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(bridge.opened, WIDGET_HOME_PATH);
  assert.equal(WIDGET_HOME_PATH, "/dashboard/home");
});

test("a danger signal gets the 1px rail, a clock and 지연 — ordinary signals stay neutral", () => {
  const urgent = render(FirstActionSlot, { status: "live", signals: [{ title: "한 거래 정체", kind: "Revenue", meta: "Deal", tone: "danger" }] });
  assert.match(urgent, /data-urgent="true"/);
  assert.match(urgent, /quick-widget__row-urgent/);
  assert.match(urgent, /지연/);
  assert.match(urgent, /<circle cx="12" cy="12" r="9"/, "clock 아이콘");
  assert.match(urgent, /aria-label="오늘 첫 행동 열기: 한 거래 정체 \(지연\)"/);
  assert.match(css, /\.quick-widget__row\[data-urgent="true"\] \{\s*box-shadow: inset 1px 0 0 var\(--danger\);/);

  const calm = render(FirstActionSlot, { status: "partial", signals: [{ title: "대기", kind: "Content", tone: "warning" }] });
  assert.doesNotMatch(calm, /data-urgent|지연|data-truth/, "partial은 배지 없이 행만, warning은 빨강이 아니다");
});

test("first action slot states follow the read envelope", () => {
  assert.deepEqual(firstActionView({ status: "loading" }), { kind: "loading" });
  assert.equal(firstActionView({ status: "live", signals: [] }).kind, "empty");
  assert.equal(firstActionView({ status: "error", signals: [{ title: "x" }] }).kind, "error");

  const loading = render(FirstActionSlot, { status: "loading", signals: [] });
  assert.match(loading, /class="hub-skeleton"/);
  assert.equal((loading.match(/hub-skeleton__line/g) || []).length, 2);

  const error = render(FirstActionSlot, { status: "error", signals: [] });
  assert.match(error, /data-truth="error"/);
  assert.match(error, /첫 행동을 불러오지 못했습니다/);
  assert.match(error, /다시 시도/);

  const preview = render(FirstActionSlot, { status: "preview", signals: [] });
  assert.match(preview, /연결 전이라 첫 행동을 읽지 않았습니다/);
  assert.doesNotMatch(preview, /hub-skeleton|data-empty/);

  const empty = render(FirstActionSlot, { status: "live", signals: [] });
  assert.match(empty, /오늘 첫 행동 없음/);
  assert.doesNotMatch(empty, /data-empty/, "EmptyState가 아니라 조용한 한 줄");
});

test("server render is the browser shape: no bridge, no drag class, loading slot", () => {
  const html = render(QuickWidget, {});
  assert.doesNotMatch(html, /is-app/);
  assert.doesNotMatch(html, /aria-pressed/);
  assert.match(html, /class="hub-app quick-widget-page"/);
  assert.match(html, /placeholder="무엇이든 적고 Enter"/);
  assert.match(html, /정리 전 메모로 보관합니다/);
  assert.match(html, /data-slot="loading"/);
  assert.equal((html.match(/<h2/g) || []).length, 1, "페이지 h2는 하나");
  assert.equal((html.match(/<a /g) || []).length, 0, "행이 없으면 같은 origin 링크도 없다");
});

test("fixed 380×200 layout — slot heights never resize the window", () => {
  assert.match(css, /\.quick-widget \{[^}]*height: 200px;/);
  assert.match(css, /\.quick-widget__bar \{[^}]*height: 32px;/);
  assert.match(css, /\.quick-widget__receipt \{[^}]*height: 20px;/);
  assert.match(css, /\.quick-widget__slot \{ height: 50px;/);
  // 앱 안: OS 둥근 모서리 + 1px --line 선, 그림자·큰 radius 없음
  assert.match(css, /\.hub-app\.is-app \.quick-widget \{[^}]*box-shadow: none;/);
  assert.match(css, /\.hub-app\.is-app \.quick-widget::after \{[^}]*border: 1px solid var\(--line\);/);
  assert.match(css, /\.hub-app\.is-app \.quick-widget__bar \{ -webkit-app-region: drag; \}/);
  assert.match(css, /\.quick-widget__actions \{[^}]*-webkit-app-region: no-drag;/);
  const source = read("./quick-widget.jsx");
  assert.doesNotMatch(source, /setHeight\(/, "위젯 페이지는 창 높이를 바꾸지 않는다");
});

test("the touch-floor undo is scoped to a fine pointer inside the widget; focus keeps the 1px ring", () => {
  assert.match(css, /@media \(pointer: fine\) and \(max-width: 720px\) \{/);
  const undo = css.slice(css.indexOf("@media (pointer: fine)"));
  assert.match(undo, /\.hub-app\.quick-widget-page button,/);
  assert.doesNotMatch(css, /@media \(pointer: coarse\)/);
  assert.match(css, /\.quick-widget__input:focus-visible \{ outline-offset: -1px; \}/);
  assert.doesNotMatch(css, /:focus-visible[^{]*\{[^}]*border-radius/);
});

test("the route lives outside /dashboard, stays dynamic and keeps the session gate", () => {
  assert.match(read("../../app/widget/page.jsx"), /export const dynamic = "force-dynamic";/);
  assert.match(read("../../app/widget/layout.jsx"), /hub-tokens\.css/);
  assert.doesNotMatch(read("../../app/widget/layout.jsx"), /import[^\n]*HubApp|<HubApp/);
  const access = read("../../lib/route-access.js");
  assert.doesNotMatch(access, /["']\/widget/);
  const source = read("./quick-widget.jsx");
  assert.match(source, /hint 'inbox'/);
  assert.match(source, /submitQuickCapture\(session, \{ fetchImpl \}\)/);
  assert.match(source, /useDailyBriefSignals\(reloadKey, \{ keepPrevious: true \}\)/);
  assert.match(source, /shouldSubmitQuickTask\(event, saving\)/);
  assert.doesNotMatch(source, /setInterval|setTimeout/, "다시 읽기는 포커스·가시성 이벤트뿐");
});

// 2026-09-26 검증 지적: 위젯이 열린 채 세션이 끝나면 API가 401로 답한다. 읽기 실패로 위장하지 않고
// 로그인으로 보내되, 초안은 같은 origin의 localStorage에 맡겼다가 되찾는다.
test("세션 만료(401)는 읽기 실패가 아니라 로그인 필요다 — 위젯은 초안을 맡기고 로그인으로 간다", async () => {
  const { readEnvelope } = await import("./daily-brief-signals.js");
  const { stashWidgetDraft, takeWidgetDraft, WIDGET_LOGIN_PATH, WIDGET_DRAFT_KEY } = await import("./quick-widget.jsx");
  assert.equal(readEnvelope({ ok: false, status: 401 }, { status: "unauthorized", error: "operator-session-required" }), "unauthorized");
  assert.equal(readEnvelope({ ok: true, status: 200 }, { status: "unauthorized" }), "unauthorized");
  assert.equal(readEnvelope({ ok: false, status: 500 }, null), "error");
  assert.equal(readEnvelope({ ok: true, status: 200 }, { status: "live", signals: [] }), "live");

  assert.deepEqual(firstActionView({ status: "unauthorized", signals: [] }), { kind: "unauthorized" });
  const html = render(FirstActionSlot, { status: "unauthorized", signals: [] });
  assert.match(html, /data-slot="unauthorized"/);
  assert.match(html, /로그인이 필요합니다/);
  assert.match(html, /로그인</);
  assert.doesNotMatch(html, /읽기 실패|data-truth="error"/, "세션 만료를 읽기 실패로 그리지 않는다");

  assert.equal(WIDGET_LOGIN_PATH, "/login?next=%2Fwidget");
  assert.equal(WIDGET_DRAFT_KEY, "mlp.widgetDraft");
  const store = new Map();
  const storage = { setItem: (k, v) => store.set(k, v), getItem: (k) => (store.has(k) ? store.get(k) : null), removeItem: (k) => store.delete(k) };
  stashWidgetDraft("   ", storage);
  assert.equal(takeWidgetDraft(storage), "", "빈 초안은 맡기지 않는다");
  stashWidgetDraft("김원장 견적서 보내기", storage);
  assert.equal(takeWidgetDraft(storage), "김원장 견적서 보내기");
  assert.equal(takeWidgetDraft(storage), "", "되찾은 초안은 한 번만 쓴다");
  const broken = { setItem() { throw new Error("blocked"); }, getItem() { throw new Error("blocked"); }, removeItem() {} };
  stashWidgetDraft("x", broken);
  assert.equal(takeWidgetDraft(broken), "", "저장소가 막혀도 던지지 않는다");

  const source = read("./quick-widget.jsx");
  assert.match(source, /res\.status === 401\) leaveForLogin\(\)/, "저장 401은 로그인으로 보낸다");
  assert.match(source, /brief\.status === "unauthorized"\) leaveForLogin\(\)/, "읽기 401도 로그인으로 보낸다");
  assert.match(source, /submitQuickCapture\(session, \{ fetchImpl \}\)/, "위젯 저장은 401을 보는 fetch를 쓴다");
  assert.match(source, /takeWidgetDraft\(storage\)/, "마운트 때 맡긴 초안을 되찾는다");
});
