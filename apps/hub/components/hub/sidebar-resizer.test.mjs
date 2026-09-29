import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SIDEBAR_WIDTH } from "../../lib/hub-preferences.js";
import { SidebarResizer } from "./sidebar-resizer.jsx";

const appSource = await readFile(new URL("./hub-app.jsx", import.meta.url), "utf8");
const sidebarSource = await readFile(new URL("./hub-sidebar.jsx", import.meta.url), "utf8");
const tokensSource = await readFile(new URL("./hub-tokens.css", import.meta.url), "utf8");

// 훅이 있는 컴포넌트를 한 번 렌더해 핸들러가 붙은 엘리먼트를 꺼낸다. 핸들러는 렌더 때
// 만들어진 ref를 클로저로 들고 있으므로, 렌더가 끝난 뒤에도 실제 드래그 순서대로 호출할 수 있다.
function mountResizer(width) {
  const shellVars = [];
  const shellAttrs = new Map();
  const commits = [];
  const collapses = [];
  const shellRef = {
    current: {
      style: { setProperty: (name, value) => shellVars.push([name, value]) },
      setAttribute: (name, value) => shellAttrs.set(name, value),
      removeAttribute: (name) => shellAttrs.delete(name),
    },
  };
  let element;
  function Probe() {
    element = SidebarResizer({
      width,
      shellRef,
      onCommit: (value) => commits.push(value),
      onCollapse: () => collapses.push(true),
    });
    return element;
  }
  const markup = renderToStaticMarkup(React.createElement(Probe));
  const handle = { setPointerCapture() {}, setAttribute() {} };
  const pointer = (clientX, extra = {}) => ({
    button: 0, clientX, pointerId: 1, currentTarget: handle, preventDefault() {}, ...extra,
  });
  const key = (name) => {
    let prevented = false;
    element.props.onKeyDown({ key: name, preventDefault: () => { prevented = true; } });
    return prevented;
  };
  return { markup, props: element.props, pointer, key, commits, collapses, shellVars, shellAttrs };
}

test("the handle is a keyboard-reachable vertical splitter that names the sidebar it controls", () => {
  const { markup } = mountResizer(264);
  assert.match(markup, /role="separator"/);
  assert.match(markup, /aria-orientation="vertical"/);
  assert.match(markup, /aria-label="사이드바 너비"/);
  assert.match(markup, /tabindex="0"/i);
  assert.match(markup, /aria-valuenow="264"/);
  assert.match(markup, new RegExp(`aria-valuemin="${SIDEBAR_WIDTH.min}"`));
  assert.match(markup, new RegExp(`aria-valuemax="${SIDEBAR_WIDTH.max}"`));
  assert.match(markup, /aria-controls="hub-mobile-navigation"/);
  assert.match(sidebarSource, /id: 'hub-mobile-navigation'/, "aria-controls must point at the sidebar's real id");
});

test("dragging previews the width on the shell and commits once on release", () => {
  const view = mountResizer(232);
  view.props.onPointerDown(view.pointer(100));
  assert.equal(view.shellAttrs.get("data-sidebar-resizing"), "true", "drag state turns the width transition off");

  view.props.onPointerMove(view.pointer(160));
  assert.deepEqual(view.shellVars.at(-1), ["--hub-sidebar-w", "292px"]);
  assert.deepEqual(view.commits, [], "no React state change per frame");

  view.props.onPointerMove(view.pointer(100 + 5000));
  assert.deepEqual(view.shellVars.at(-1), ["--hub-sidebar-w", `${SIDEBAR_WIDTH.max}px`], "clamped to max");

  view.props.onPointerMove(view.pointer(160));
  view.props.onPointerUp(view.pointer(160));
  view.props.onLostPointerCapture(view.pointer(160));
  assert.deepEqual(view.commits, [292], "pointerup commits; the trailing lostpointercapture does not double-commit");
  assert.equal(view.shellAttrs.has("data-sidebar-resizing"), false);
});

test("a cancelled drag restores the starting width without committing", () => {
  const view = mountResizer(240);
  view.props.onPointerDown(view.pointer(50));
  view.props.onPointerMove(view.pointer(10));
  view.props.onPointerCancel(view.pointer(10));
  assert.deepEqual(view.shellVars.at(-1), ["--hub-sidebar-w", "240px"]);
  assert.deepEqual(view.commits, []);
  assert.equal(view.shellAttrs.has("data-sidebar-resizing"), false);
});

test("a click without movement, a non-primary button, and moves without a drag change nothing", () => {
  const view = mountResizer(232);
  view.props.onPointerMove(view.pointer(400));
  view.props.onPointerDown(view.pointer(100, { button: 2 }));
  view.props.onPointerMove(view.pointer(300));
  view.props.onPointerDown(view.pointer(100));
  view.props.onPointerUp(view.pointer(100));
  assert.deepEqual(view.shellVars, []);
  assert.deepEqual(view.commits, []);
});

test("arrow/Home/End keys resize; other keys keep their default behavior; double-click resets", () => {
  const view = mountResizer(264);
  assert.equal(view.key("ArrowRight"), true);
  assert.equal(view.key("ArrowLeft"), true);
  assert.equal(view.key("Home"), true);
  assert.equal(view.key("End"), true);
  assert.equal(view.key("Tab"), false, "Tab must still move focus");
  assert.deepEqual(view.commits, [264 + SIDEBAR_WIDTH.step, 264 - SIDEBAR_WIDTH.step, SIDEBAR_WIDTH.min, SIDEBAR_WIDTH.max]);

  view.props.onDoubleClick();
  assert.equal(view.commits.at(-1), SIDEBAR_WIDTH.default);

  const atDefault = mountResizer(SIDEBAR_WIDTH.default);
  atDefault.props.onDoubleClick();
  assert.deepEqual(atDefault.commits, []);
});

test("the shell owns the expanded width and shows the handle only beside the expanded desktop sidebar", () => {
  assert.match(appSource, /useState\(DEFAULT_HUB_PREFERENCES\.sidebarWidth\)/, "SSR renders the default width first");
  assert.match(appSource, /setSidebarWidth\(stored\.sidebarWidth\)/, "saved width restores after hydration");
  assert.match(appSource, /persistHubPreference\(storage, "sidebarWidth", value\)/);
  assert.match(appSource, /ref=\{shellRef\} className="hub-shell"[^>]*'--hub-sidebar-w': `\$\{sidebarWidth\}px`/);
  assert.match(
    appSource,
    /\{!sidebarCollapsed && !isMobileViewport && \(\s*<SidebarResizer\s+width=\{sidebarWidth\}\s+shellRef=\{shellRef\}\s+onCommit=\{commitSidebarWidth\}\s+onCollapse=\{collapseSidebar\}\s*\/>/,
  );
  assert.match(sidebarSource, /width: collapsed \? 56 : 'var\(--hub-sidebar-w, 232px\)'/, "collapsed rail stays 56px");
});

test("resizer styles: straddles the border, freezes the width transition while dragging, hidden on mobile", () => {
  assert.match(tokensSource, /\.hub-app \.hub-sidebar-resizer \{[^}]*flex: 0 0 8px;[^}]*margin: 0 -4px;[^}]*cursor: col-resize;/);
  assert.match(tokensSource, /\.hub-shell\[data-sidebar-resizing="true"\] \.hub-sidebar-root \{ transition: none; \}/);
  const mobile = tokensSource.match(/@media \(max-width: 900px\) \{[\s\S]*?\.hub-desktop-sidebar-collapse \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(mobile, /\.hub-sidebar-resizer \{\s*display: none !important;/, "mobile drawer keeps its fixed width");
});

test("dragging left past the collapse threshold previews the icon rail and commits collapse on release", () => {
  const view = mountResizer(232);
  view.props.onPointerDown(view.pointer(100));

  // Small move left stays expanded
  view.props.onPointerMove(view.pointer(80));
  assert.deepEqual(view.shellVars.at(-1), ["--hub-sidebar-w", "212px"]);
  assert.equal(view.shellAttrs.has("data-sidebar-collapse-preview"), false);

  // Moving past collapseThreshold (140px: startWidth 232 + clientX 0 - startX 100 = 132px)
  view.props.onPointerMove(view.pointer(0));
  assert.deepEqual(view.shellVars.at(-1), ["--hub-sidebar-w", `${SIDEBAR_WIDTH.rail}px`]);
  assert.equal(view.shellAttrs.get("data-sidebar-collapse-preview"), "true");
  assert.deepEqual(view.collapses, [], "does not commit collapse mid-drag");

  // Release in collapse zone commits collapse and restores the shell width variable to preserved starting width
  view.props.onPointerUp(view.pointer(0));
  assert.deepEqual(view.collapses, [true]);
  assert.deepEqual(view.commits, []);
  assert.deepEqual(view.shellVars.at(-1), ["--hub-sidebar-w", "232px"]);
  assert.equal(view.shellAttrs.has("data-sidebar-resizing"), false);
  assert.equal(view.shellAttrs.has("data-sidebar-collapse-preview"), false);
});

test("dragging past threshold and then back to the right restores expanded width", () => {
  const view = mountResizer(232);
  view.props.onPointerDown(view.pointer(100));

  // Move past threshold into collapse zone
  view.props.onPointerMove(view.pointer(0));
  assert.equal(view.shellAttrs.get("data-sidebar-collapse-preview"), "true");

  // Move back right into expanded zone (rawWidth: 232 + 80 - 100 = 212px)
  view.props.onPointerMove(view.pointer(80));
  assert.deepEqual(view.shellVars.at(-1), ["--hub-sidebar-w", "212px"]);
  assert.equal(view.shellAttrs.has("data-sidebar-collapse-preview"), false);

  view.props.onPointerUp(view.pointer(80));
  assert.deepEqual(view.collapses, []);
  assert.deepEqual(view.commits, [212]);
});

test("a cancelled drag past collapse threshold restores starting width without collapsing", () => {
  const view = mountResizer(232);
  view.props.onPointerDown(view.pointer(100));
  view.props.onPointerMove(view.pointer(0));
  assert.equal(view.shellAttrs.get("data-sidebar-collapse-preview"), "true");

  view.props.onPointerCancel(view.pointer(0));
  assert.deepEqual(view.shellVars.at(-1), ["--hub-sidebar-w", "232px"]);
  assert.deepEqual(view.collapses, []);
  assert.deepEqual(view.commits, []);
  assert.equal(view.shellAttrs.has("data-sidebar-resizing"), false);
  assert.equal(view.shellAttrs.has("data-sidebar-collapse-preview"), false);
});
