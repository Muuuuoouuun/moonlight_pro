import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { CalendarOutcome } = await import("./calendar-outcome.jsx");
const homeSource = await readFile(new URL("./pages/home.jsx", import.meta.url), "utf8");
const futuraCss = await readFile(new URL("./hub-futura.css", import.meta.url), "utf8");

const KEY = "a".repeat(64);
const render = (props) => renderToStaticMarkup(React.createElement(CalendarOutcome, { eventKey: KEY, title: "주간 점검", whenLabel: "09:30", ...props }));

// 완료·특이사항은 표면마다 모양만 다르고 기록은 하나다 — Home이 다른 키로 그리면
// Daily Brief에서 완료한 일정이 Home에서 미완료로 보인다.
test("Home 시간표는 Daily Brief·Calendar와 같은 outcomeKey로 행을 키잉하고 기록을 연결한다", () => {
  assert.match(homeSource, /import \{ CalendarOutcome \} from "\.\.\/calendar-outcome"/);
  assert.match(homeSource, /key=\{e\.outcomeKey \|\| e\.id \|\| i\}/);
  assert.match(homeSource, /eventKey=\{e\.outcomeKey\}/);
  assert.match(homeSource, /<CalendarOutcome[\s\S]*?\bcompact\b/);
  assert.doesNotMatch(homeSource, /key=\{e\.id\}/);
});

test("compact 변형은 Futura 시간표 한 줄로 그리고 로딩 중 행 높이를 늘리지 않는다", () => {
  const html = render({ compact: true, past: true, aside: React.createElement("span", { className: "fx-now" }, "NOW") });
  assert.match(html, /class="fx-time-item"/);
  assert.match(html, /class="fx-time-row" data-past="true"/);
  assert.match(html, /role="checkbox"[^>]*aria-label="주간 점검 완료"[^>]*disabled/);
  assert.match(html, /<span class="fx-time">09:30<\/span>/);
  assert.match(html, /<span class="fx-now">NOW<\/span>/);
  // 저장 확인 live region은 처음부터 트리에 있어야 읽힌다(나중에 끼워 넣으면 고지를 놓친다).
  assert.match(html, /aria-label="주간 점검 특이사항"[^>]*disabled/);
  // 로딩은 행 안의 live region 한 토큰으로 말한다 — 체크박스·편집 버튼이 둘 다 잠기는데
  // 표시가 없으면 첫 화면 일정이 전부 "눌러도 안 되는 줄"로 보인다(§11).
  assert.match(html, /<span class="fx-time-ack" role="status" aria-live="polite">불러오는 중…<\/span>/);
  // 다만 행 높이는 늘리지 않는다 — 94px 들여쓰기 블록도, Skeleton 줄도 compact에서는 그리지 않는다.
  assert.doesNotMatch(html, /hub-skeleton/);
  assert.doesNotMatch(html, /fx-time-note|fx-time-detail|fx-time-alert/);
});

test("기본 변형(Daily Brief·Calendar 드로어)의 로딩 표시는 그대로다", () => {
  const html = render({});
  assert.doesNotMatch(html, /fx-time/);
  assert.match(html, /불러오는 중/);
  assert.match(html, /role="checkbox"[^>]*aria-label="주간 점검 완료"/);
});

test("지난 일정의 취소선은 사라지고 취소선은 완료에만 남는다(§5.3 채널 겸직 금지)", () => {
  const pastRule = futuraCss.match(/\.fx-time-row\[data-past="true"\] \.fx-time-title \{([^}]*)\}/);
  assert.ok(pastRule, "past rule exists");
  assert.doesNotMatch(pastRule[1], /line-through/);
  assert.match(futuraCss, /\.fx-time-row\[data-done="true"\] \.fx-time-title \{[^}]*line-through/);
  // past와 done은 특정도가 같아 뒤에 오는 done이 past의 명도를 덮는다 — 조합 규칙으로 바닥을
  // 고정하지 않으면 완료한 지난 일정이 미기록 지난 일정보다 밝아진다(명도 위계 역전).
  const combined = futuraCss.match(/\.fx-time-row\[data-past="true"\]\[data-done="true"\] \.fx-time-title \{([^}]*)\}/);
  assert.ok(combined, "past+done 조합 규칙이 있어야 한다");
  assert.match(combined[1], /color: var\(--fg-faint\)/);
});
