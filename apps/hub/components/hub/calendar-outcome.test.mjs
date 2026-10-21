import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const { CalendarOutcome } = await import("./calendar-outcome.jsx");
const homeSource = await readFile(new URL("./pages/home.jsx", import.meta.url), "utf8");
const futuraCss = await readFile(new URL("./hub-futura.css", import.meta.url), "utf8");
const outcomeSource = await readFile(new URL("./calendar-outcome.jsx", import.meta.url), "utf8");

const KEY = "a".repeat(64);
const render = (props) => renderToStaticMarkup(React.createElement(CalendarOutcome, { eventKey: KEY, title: "주간 점검", whenLabel: "09:30", ...props }));
const LONG_WHEN = "2026-10-19 23:00 – 2026-10-21 1:00";
const LONG_TITLE = "합성 여러 날 시간 일정";

// Inspect production JSX with a synthetic read state, not a reimplementation of its layout.
const ast = ts.createSourceFile("calendar-outcome.jsx", outcomeSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "CalendarOutcome");
assert.ok(component);
const componentCode = ts.transpileModule(component.getText(ast).replace("export function", "function"), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const nodes = (node, predicate) => Array.isArray(node) ? node.flatMap(child => nodes(child, predicate))
  : node && typeof node === "object" ? [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)] : [];
function headerTree(props = {}, state = {}) {
  const outcome = { record: { done: false, note: "" }, state: "live", open: false, saving: false, detailsId: "synthetic-detail",
    editButtonRef: null, editLabel: "특이사항", save() {}, toggleOpen() {}, ...state };
  const deps = { React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    useCalendarOutcome: () => outcome, Checkbox: "Checkbox", Button: "Button", LifecycleBadge: "LifecycleBadge",
    Skeleton: "Skeleton", OutcomeEditor: "OutcomeEditor", RetryButton: "RetryButton", SAVED: "저장됨" };
  const Outcome = new Function(...Object.keys(deps), `${componentCode}; return CalendarOutcome;`)(...Object.values(deps));
  return nodes(Outcome({ eventKey: KEY, title: LONG_TITLE, whenLabel: LONG_WHEN, ...props }),
    node => node.props.children?.some(child => child?.type === "Checkbox")
      && node.props.children?.some(child => child?.type === "Button"))[0];
}

test("long date and title stay complete in a wrapping summary, separate from controls", () => {
  const html = render({ title: LONG_TITLE, whenLabel: LONG_WHEN, expanded: true });
  assert.ok(html.includes(LONG_TITLE));
  assert.ok(html.includes(LONG_WHEN));
  const header = headerTree();
  assert.deepEqual(header.props.children.map(child => child.type), ["Checkbox", "div", "Button"]);
  const summary = header.props.children[1];
  assert.equal(summary.props.style.flex, "1 1 0");
  assert.equal(summary.props.style.minWidth, 0);
  assert.equal(summary.props.style.flexWrap, "wrap");
  const [when, title] = summary.props.children;
  assert.equal(when.props.style.maxWidth, "100%");
  assert.equal(when.props.style.boxSizing, "border-box");
  assert.equal(when.props.style.whiteSpace, "normal");
  assert.equal(when.props.style.overflowWrap, "anywhere");
  assert.notEqual(when.props.style.flexShrink, 0);
  assert.equal(title.props.style.flex, "1 1 10rem", "nonzero basis wraps the title before it collapses");
  assert.equal(title.props.style.minWidth, 0);
  assert.equal(header.props.children[2].props.style.flexShrink, 0);
  // Style/SSR contract only: browser width and wrapping still require a rendered-device check.
});

test("completed and no-date headers preserve title, badge and original controls", () => {
  let done, edits = 0;
  const labels = ["09:30", LONG_WHEN, "2026-10-19 – 2026-10-21 · 종일", ""];
  for (const whenLabel of labels) {
    const title = "긴제목".repeat(30);
    const header = headerTree({ title, whenLabel }, {
      record: { done: true, note: "" }, save: value => { done = value; }, toggleOpen: () => { edits++; },
    });
    const [checkbox, summary, button] = header.props.children;
    assert.equal(summary.type, "div", "date/title/status share a wrapping middle group");
    assert.equal(summary.props.children[1].props.children[0], title);
    assert.equal(summary.props.children[1].props.style.textDecoration, "line-through");
    assert.equal(summary.props.children[2].type, "LifecycleBadge", "badge wraps inside summary, not beside controls");
    assert.equal(summary.props.children[2].props.state, "done");
    assert.equal(checkbox.props.size, 18, "existing bare-checkbox contract is unchanged");
    assert.equal(checkbox.props.label, `${title} 완료`);
    assert.equal(button.props["aria-controls"], "synthetic-detail");
    checkbox.props.onChange(false); button.props.onClick();
  }
  assert.equal(done, false);
  assert.equal(edits, labels.length);
  assert.doesNotMatch(render({ compact: true }), /calendar-outcome__/);
});

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
