import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import { NAV_TREE } from "./hub-data.js";
import * as catalog from "./hub-data.js";
import {
  DEFAULT_EXPANDED_ANCHORS,
  DEFAULT_SCOPE,
  SIDEBAR_ANCHORS,
  PAGE_OWNS_TABS,
  SIDEBAR_PRIMARY,
  SIDEBAR_SCOPES,
  SIDEBAR_UTILITIES,
  deriveSidebarScope,
  isSidebarAnchorActive,
  isSidebarChildActive,
  normalizeScope,
  ownerAnchorKey,
  resolveSidebarPath,
  sidebarChildren,
  topNavigationForRoute,
} from "./hub-nav.js";
import * as mobileNavRuntime from "./hub-nav.js";

const appSource = await readFile(new URL("./hub-app.jsx", import.meta.url), "utf8");
const sidebarSource = await readFile(new URL("./hub-sidebar.jsx", import.meta.url), "utf8");
const topbarSource = await readFile(new URL("./hub-topbar.jsx", import.meta.url), "utf8");
const primitivesSource = await readFile(new URL("./hub-primitives.jsx", import.meta.url), "utf8");

function navTreePaths() {
  const paths = [];
  for (const node of NAV_TREE) {
    if (node.path) paths.push(node.path);
    for (const child of node.children || []) if (child.path) paths.push(child.path);
  }
  return paths;
}

test('goal palette shortcuts stay in the current scope without adding a sidebar anchor', () => {
  const quick = NAV_TREE.find(node => node.key === 'goals-check');
  assert.ok(quick, 'quick check must be discoverable through the command catalog');
  for (const scope of ['personal', 'classin', 'all']) {
    const path = catalog.navPathForScope(quick, scope);
    const url = new URL(path, 'https://hub.invalid/');
    assert.equal(url.searchParams.get('scope'), scope);
    assert.equal(url.searchParams.get('check'), '1');
    assert.equal(ownerAnchorKey(path), 'overview');
    assert.equal(topNavigationForRoute('dashboard/overview', scope, 'goals').activeTab.key, 'overview-goals');
    const goals = NAV_TREE.find(node => node.key === 'goals');
    assert.equal(new URL(catalog.navPathForScope(goals, scope), 'https://hub.invalid/').searchParams.get('scope'), scope);
  }
  const weekly = NAV_TREE.find(node => node.key === 'goals-weekly');
  assert.ok(weekly, 'weekly actuals must be reachable on days without the weekly card');
  for (const scope of ['personal', 'classin', 'all']) {
    const url = new URL(catalog.navPathForScope(weekly, scope), 'https://hub.invalid/');
    assert.equal(url.searchParams.get('scope'), scope);
    assert.equal(url.searchParams.get('weekly'), '1');
    assert.equal(url.searchParams.has('check'), false);
  }
  const work = NAV_TREE.find(node => node.key === 'my-work');
  assert.equal(catalog.navPathForScope(work, 'personal'), work.path);
});

// Overview joined 2026-07-15 by direct operator instruction (see hub-nav.js
// header); brands joined 2026-08-29 (브랜드 탭 설계 §5.2 — 프로젝트 다음, 콘텐츠 앞)
// — ten primary + two utility anchors (home 추가, 2026-09-18).
test("sidebar exposes exactly ten primary and two utility anchors", () => {
  assert.equal(SIDEBAR_PRIMARY.length, 10);
  assert.equal(SIDEBAR_UTILITIES.length, 2);
  assert.deepEqual(
    SIDEBAR_PRIMARY.map((a) => a.key),
    ["home", "today", "overview", "tasks", "revenue", "followups", "discovery", "projects", "brands", "content"],
  );
});

test('overview goals subview has one active child and carries organizational scope', () => {
  const tabs = sidebarChildren('overview', 'classin');
  const goals = tabs.find(tab => tab.key === 'overview-goals');
  assert.ok(goals, 'goals belongs under the existing overview anchor');
  assert.equal(goals.path, 'dashboard/overview?view=goals&scope=classin');
  assert.equal(isSidebarChildActive('overview', 'dashboard/overview', 'dashboard/overview', 'goals'), false);
  assert.equal(isSidebarChildActive('overview', goals.path, 'dashboard/overview', 'goals'), true);
  assert.equal(topNavigationForRoute('dashboard/overview', 'classin', 'goals').activeTab?.key, 'overview-goals');
});

test("every anchor resolves a path in every scope", () => {
  for (const anchor of SIDEBAR_ANCHORS) {
    for (const scope of SIDEBAR_SCOPES) {
      const path = resolveSidebarPath(anchor.key, scope.key);
      assert.ok(path, `${anchor.key} has no path for scope ${scope.key}`);
      assert.match(path, /^dashboard\//);
    }
  }
});

test("invalid scope falls back to 전체", () => {
  assert.equal(normalizeScope("nope"), DEFAULT_SCOPE);
  assert.equal(normalizeScope(undefined), DEFAULT_SCOPE);
  assert.equal(
    resolveSidebarPath("revenue", "bogus"),
    resolveSidebarPath("revenue", DEFAULT_SCOPE),
  );
});

test("every NAV_TREE destination maps to at most one anchor", () => {
  for (const path of navTreePaths()) {
    const owner = ownerAnchorKey(path);
    assert.ok(owner, `no anchor owns ${path}`);
    const active = SIDEBAR_ANCHORS.filter((a) => isSidebarAnchorActive(a.key, path));
    assert.equal(active.length, 1, `${path} lit ${active.length} anchors`);
  }
});

test("follow-ups wins over revenue by longest prefix", () => {
  assert.equal(ownerAnchorKey("dashboard/revenue/followups"), "followups");
  assert.equal(ownerAnchorKey("dashboard/revenue/deals"), "revenue");
  assert.equal(ownerAnchorKey("dashboard/classin/followups"), "followups");
});

test("the projects surface splits between 할 일 and 프로젝트·기획 by view", () => {
  const path = "dashboard/work/projects";
  assert.equal(isSidebarAnchorActive("tasks", path, "todos"), true);
  assert.equal(isSidebarAnchorActive("projects", path, "todos"), false);
  assert.equal(isSidebarAnchorActive("tasks", path, "tasks"), true, "?view=tasks is an alias");
  assert.equal(isSidebarAnchorActive("projects", path, undefined), true);
  assert.equal(isSidebarAnchorActive("tasks", path, "tree"), false);
});

test("unknown routes highlight nothing", () => {
  assert.equal(ownerAnchorKey("dashboard/unknown/surface"), null);
  assert.equal(ownerAnchorKey(""), null);
  for (const anchor of SIDEBAR_ANCHORS) {
    assert.equal(isSidebarAnchorActive(anchor.key, "dashboard/unknown/surface"), false);
  }
});

test("entering a scoped route derives its scope; global routes keep the current one", () => {
  assert.equal(deriveSidebarScope("dashboard/classin/pipeline"), "classin");
  assert.equal(deriveSidebarScope("dashboard/brand/queue"), "personal");
  assert.equal(deriveSidebarScope("dashboard/daily-brief"), null);
  assert.equal(deriveSidebarScope("dashboard/revenue/deals"), null);
});

test("active state survives query strings and leading slashes", () => {
  assert.equal(ownerAnchorKey("/dashboard/revenue/deals?deal=D-1"), "revenue");
  assert.equal(ownerAnchorKey("dashboard/content/queue#top"), "content");
});

// ── Second level — horizontal top navigation ─────────────────────────────

test("every child resolves and is owned by its parent anchor in every scope", () => {
  for (const anchor of SIDEBAR_ANCHORS) {
    for (const scope of SIDEBAR_SCOPES) {
      for (const child of sidebarChildren(anchor.key, scope.key)) {
        assert.match(child.path, /^dashboard\//, `${anchor.key}/${child.key} path`);
        assert.equal(
          ownerAnchorKey(child.path),
          anchor.key,
          `${child.path} must stay under ${anchor.key}`,
        );
      }
    }
  }
});

test("single-destination anchors render no sub-list", () => {
  for (const scope of SIDEBAR_SCOPES) {
    for (const key of ["today", "followups"]) {
      assert.deepEqual(sidebarChildren(key, scope.key), [], `${key} in ${scope.key}`);
    }
  }
  // ClassIn 콘텐츠 is one surface — the anchor is the destination.
  assert.deepEqual(sidebarChildren("content", "classin"), []);
  assert.ok(sidebarChildren("content", "all").length > 1);
});

test("daily review stays under my work and opens the same personal record in every scope", () => {
  for (const { key } of SIDEBAR_SCOPES) {
    // OKR·KPI는 2026-09-23 운영자 지시로 내 작업의 마지막 하위 탭이 됐다.
    assert.deepEqual(sidebarChildren('tasks', key).map((child) => child.path), ['dashboard/work/my', 'dashboard/work/memos', 'dashboard/work/daily-review', 'dashboard/work/goals']);
    assert.equal(ownerAnchorKey('dashboard/work/daily-review'), 'tasks');
  }
  assert.ok(NAV_TREE.some((node) => node.path === 'dashboard/work/daily-review'));
  assert.match(appSource, /'dashboard\/work\/daily-review':.*<DailyReview/);
});

test("at most one child lights up for any route in any scope", () => {
  for (const scope of SIDEBAR_SCOPES) {
    for (const path of navTreePaths()) {
      const active = [];
      for (const anchor of SIDEBAR_ANCHORS) {
        for (const child of sidebarChildren(anchor.key, scope.key)) {
          if (isSidebarChildActive(anchor.key, child.path, path)) {
            active.push(`${anchor.key}/${child.key}`);
          }
        }
      }
      assert.ok(active.length <= 1, `${path} in ${scope.key} lit ${active.join(", ")}`);
    }
  }
});

test("child active matching ignores queries but respects the tasks/projects view split", () => {
  // ?scope=personal children still match their pathname.
  assert.equal(
    isSidebarChildActive("revenue", "dashboard/revenue/overview?scope=personal", "dashboard/revenue/overview"),
    true,
  );
  // 할 일 owns the todos view, so the Projects child must stay dark.
  assert.equal(
    isSidebarChildActive("projects", "dashboard/work/projects", "dashboard/work/projects", "todos"),
    false,
  );
  assert.equal(
    isSidebarChildActive("projects", "dashboard/work/projects", "dashboard/work/projects", undefined),
    true,
  );
});

test("default-expanded anchors actually have children to show", () => {
  for (const key of DEFAULT_EXPANDED_ANCHORS) {
    assert.ok(
      sidebarChildren(key, DEFAULT_SCOPE).length > 1,
      `${key} is default-expanded but has no sub-list`,
    );
  }
});

test("AI·자동화 children all carry a group label for the two-eyebrow layout", () => {
  for (const scope of SIDEBAR_SCOPES) {
    const children = sidebarChildren("ai", scope.key);
    assert.ok(children.length >= 8);
    for (const child of children) {
      assert.ok(["Agents", "Automations"].includes(child.group), `${child.key} group`);
    }
  }
});

test('Office, work execution, coaching and brand advice keep four distinct existing destinations', () => {
  const expected = [
    ['Office', 'dashboard/agents/office-council'],
    ['작업·실행', 'dashboard/agents/orders'],
    ['코칭·대화', 'dashboard/agents/chat'],
    ['브랜드 자문', 'dashboard/agents/council'],
  ];
  assert.deepEqual(NAV_TREE.find(node => node.key === 'agents').children.map(child => [child.label, child.path]), expected);
  for (const scope of SIDEBAR_SCOPES) {
    const children = sidebarChildren('ai', scope.key).filter(child => child.group === 'Agents');
    assert.deepEqual(children.map(child => [child.label, child.path]), expected);
    assert.ok(children.filter(child => child.key !== 'ai-office').every(child => child.deferred));
    const jobs = topNavigationForRoute('dashboard/agents/orders', scope.key, 'jobs');
    assert.equal(jobs.activeTab?.key, 'ai-orders');
  }
  assert.equal(catalog.LEGACY_REDIRECTS['dashboard/agents/office'].to, 'dashboard/agents/office-council');
});

test("second-level destinations resolve into the top bar with one active tab", () => {
  const revenue = topNavigationForRoute("dashboard/revenue/deals", "all");
  assert.equal(revenue.anchor?.key, "revenue");
  assert.equal(revenue.activeTab?.key, "rev-deals");
  assert.ok(revenue.tabs.length >= 6);

  const today = topNavigationForRoute("dashboard/daily-brief", "all");
  assert.equal(today.anchor?.key, "today");
  assert.deepEqual(today.tabs, []);
  assert.equal(today.activeTab, null);
});

test("sidebar is one level deep and the top bar owns contextual tabs", () => {
  assert.doesNotMatch(sidebarSource, /hub-nav-caret|hub-nav-sublist|hub-nav-subgroup/);
  // 2026-09-19 Futura 패스는 외형만 바꿨다 — 사이드바는 여전히 한 단계고, 하위
  // 목적지는 탑바가 그린다. 펼침 UI를 다시 들이는 변경은 이 단언을 먼저 깨야 한다.
  assert.doesNotMatch(sidebarSource, /fx-nav-child|sidebarChildren\(a\.key, scope\)/);
  assert.match(topbarSource, /topNavigationForRoute\(path, scope, view\)/);
  assert.match(topbarSource, /className="hub-topbar__tabs"/);
  assert.match(topbarSource, /aria-current=\{selected \? 'page' : undefined\}/);
});

// 2026-09-19 Futura 패스가 뺐던 아이콘을 2026-09-23 운영자가 펼친 행에도 다시
// 요청했다(§15) — 펼친 행과 접힌 56px 레일(§15 2026-09-22) 모두 같은
// <Iconed name={a.icon}>를 그린다. 여기서 검사하는 건 외형 계약이지 깊이가 아니다.
// 소스 문자열 위치("if (collapsed)" 등)에 기대지 않고, 사이드바의 실제 행 렌더러를
// 추출해 collapsed=false/true 두 상태로 그려 본다.
function sidebarAst() {
  return ts.createSourceFile("hub-sidebar.jsx", sidebarSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
}

function findNodes(root, predicate) {
  const found = [];
  const visit = (node) => {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

function compileJsx(code) {
  return ts.transpileModule(code, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isIconedElement = (node) =>
  (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText() === "Iconed";

async function loadSidebarRowRenderer() {
  const ast = sidebarAst();
  const [renderAnchor] = findNodes(ast, (node) =>
    ts.isVariableDeclaration(node) && node.name.getText() === "renderAnchor" && node.initializer && ts.isArrowFunction(node.initializer));
  assert.ok(renderAnchor, "hub-sidebar.jsx must render nav rows through renderAnchor");
  const [countBadge] = findNodes(ast, (node) => ts.isFunctionDeclaration(node) && node.name?.text === "CountBadge");
  assert.ok(countBadge, "hub-sidebar.jsx must declare CountBadge");

  const CountBadge = new Function("React", `${compileJsx(countBadge.getText())}; return CountBadge;`)(React);
  const { Iconed } = await import("./hub-icons.jsx");
  const rowSource = compileJsx(`const renderAnchor = ${renderAnchor.initializer.getText()};`);

  // renderAnchor의 클로저 의존성 — 새 식별자가 생기면 ReferenceError로 여기서 드러난다.
  return ({ collapsed, counts = {} }) => {
    const scope = {
      React, Iconed, CountBadge, isSidebarAnchorActive,
      collapsed, counts, active: "dashboard/daily-brief", view: undefined, go: () => {},
    };
    const render = new Function(...Object.keys(scope), `${rowSource}; return renderAnchor;`)(...Object.values(scope));
    return (anchor, small) => {
      try {
        return renderToStaticMarkup(render(anchor, small));
      } catch (error) {
        if (error instanceof ReferenceError) {
          throw new Error(`renderAnchor gained a closure dependency this test does not supply: ${error.message}`);
        }
        throw error;
      }
    };
  };
}

test("expanded sidebar nav rows carry the same icon glyph as the collapsed rail", async () => {
  const rowRenderer = await loadSidebarRowRenderer();
  const anchors = [...SIDEBAR_PRIMARY.map((a) => [a, false]), ...SIDEBAR_UTILITIES.map((a) => [a, true])];
  assert.ok(anchors.length > 0);

  for (const counts of [{}, Object.fromEntries(anchors.map(([a]) => [a.key, 3]))]) {
    const expanded = rowRenderer({ collapsed: false, counts });
    const rail = rowRenderer({ collapsed: true, counts });
    for (const [anchor, small] of anchors) {
      const label = escapeRegExp(anchor.label);
      const row = expanded(anchor, small);
      assert.match(row, /<svg/, `${anchor.key}: expanded row must draw its icon (${anchor.icon}) beside the label`);
      assert.doesNotMatch(row, /fx-nav-child/, `${anchor.key}: no nested child rows`);
      assert.match(row, new RegExp(`class="hub-sidebar-label"[^>]*>${label}<`), `${anchor.key}: visible label`);

      // The rail draws the same glyph without the text label and names the row via aria-label.
      const railRow = rail(anchor, small);
      assert.match(railRow, /<svg/, `${anchor.key}: collapsed rail must draw its icon (${anchor.icon})`);
      assert.match(railRow, new RegExp(`aria-label="${label}`), `${anchor.key}: rail accessible name`);
      assert.doesNotMatch(railRow, /hub-sidebar-label/, `${anchor.key}: rail hides the text label`);
    }
  }
});

test("sidebar nav regions draw rows only through the row renderer", () => {
  const ast = sidebarAst();
  const regionOf = (element) => {
    const className = element.openingElement.attributes.properties
      .find((attr) => ts.isJsxAttribute(attr) && attr.name.getText() === "className")?.initializer?.getText() || "";
    if (/\bhub-sidebar-nav\b/.test(className)) return "nav";
    if (/\bhub-sidebar-utilities\b/.test(className)) return "utilities";
    return null;
  };
  const regions = findNodes(ast, (node) => ts.isJsxElement(node) && regionOf(node));
  assert.deepEqual(regions.map(regionOf).sort(), ["nav", "utilities"]);
  for (const region of regions) {
    const calls = findNodes(region, (node) => ts.isCallExpression(node) && node.expression.getText() === "renderAnchor");
    assert.ok(calls.length > 0, `${regionOf(region)} rows must come from renderAnchor`);
    assert.deepEqual(findNodes(region, isIconedElement).length, 0, `${regionOf(region)} must not inline icon glyphs`);
  }
});

// Futura 라우트는 페이지 헤더가 pill 탭을 직접 그리므로 탑바는 같은 줄을 또 그리지 않는다.
test("a page that draws its own tabs suppresses the top bar row", () => {
  assert.match(topbarSource, /!pageOwnsTabs\(path\)/);
  assert.ok(PAGE_OWNS_TABS.has("dashboard/work/decisions"));
  for (const route of PAGE_OWNS_TABS) {
    assert.ok(topNavigationForRoute(route, "all").tabs.length > 0, `${route} must still resolve tabs`);
  }
});

// ── Mobile navigation accessibility contract ─────────────────────────────

test("only the closed mobile sidebar is removed from focus and the accessibility tree", () => {
  assert.match(appSource, /getMobileNavigationState\(\{ isMobileViewport, navOpen \}\)/);
  assert.match(appSource, /mobileHidden=\{mobileNavState\.navHidden\}/);
  assert.match(
    appSource,
    /setElementInert\(mainRef\.current, mobileNavState\.mainHidden\)/,
  );
  assert.doesNotMatch(appSource, /<main[\s\S]*?inert=/);

  assert.match(
    sidebarSource,
    /setElementInert\(sidebarRef\.current, mobileHidden\)/,
  );
  assert.doesNotMatch(sidebarSource, /const sidebarA11yProps = \{[\s\S]*?inert:/);
  assert.equal(
    sidebarSource.match(/<aside\s+\{\.\.\.sidebarA11yProps\}/g)?.length,
    1,
    "one stable sidebar keeps focus and shares the mobile-only inert contract across widths",
  );
  assert.doesNotMatch(appSource, /aria-hidden=\{!navOpen\}/);
});

test("mobile navigation opens as a focused modal with a trapped Tab order", () => {
  assert.match(appSource, /const mobileCloseButtonRef = React\.useRef\(null\)/);
  assert.match(
    appSource,
    /React\.useEffect\(\(\) => \{[\s\S]*?if \(!mobileNavState\.open\) return[\s\S]*?visibilityFrame = window\.requestAnimationFrame[\s\S]*?focusFrame = window\.requestAnimationFrame\([\s\S]*?mobileCloseButtonRef\.current\?\.focus\(\)[\s\S]*?cancelAnimationFrame\(visibilityFrame\)[\s\S]*?cancelAnimationFrame\(focusFrame\)/,
  );
  assert.match(sidebarSource, /role:\s*mobileOpen \? ['"]dialog['"] : undefined/);
  assert.match(sidebarSource, /['"]aria-modal['"]:\s*mobileOpen \? ['"]true['"] : undefined/);
  assert.match(sidebarSource, /onKeyDown=\{handleMobileKeyDown\}/);
  assert.match(
    sidebarSource,
    /className="hub-mobile-nav-close"[\s\S]*?ref=\{mobileCloseButtonRef\}[\s\S]*?tooltip="내비게이션 닫기"[\s\S]*?onClick=\{onMobileClose\}/,
  );
});

test("Escape and backdrop focus the opener before synchronously closing mobile navigation", () => {
  assert.match(appSource, /const menuButtonRef = React\.useRef\(null\)/);
  assert.match(
    appSource,
    /dismissMobileNavigation\(\{[\s\S]*?focusTarget:\s*menuButtonRef\.current,[\s\S]*?close:\s*\(\) => setNavOpen\(false\)/,
  );
  assert.doesNotMatch(appSource, /closeMobileNavigation[\s\S]{0,500}requestAnimationFrame/);
  assert.match(
    appSource,
    /shouldMobileNavigationHandleEscape\([\s\S]*?paletteOpen[\s\S]*?event\.key === ["']Escape["'][\s\S]*?closeMobileNavigation\(\)/,
  );
  // No density/Tweaks panel — the row checkbox owns completion now (see projects.jsx),
  // and there is no other settings surface competing for the overlay stack.
  assert.doesNotMatch(appSource, /tweaksOpen|setTweaksOpen|toggleTweaksPanel|\bdensity\b|\bonDensity\b/);
  assert.doesNotMatch(topbarSource, /onTweaksToggle|\bdensity\b|\bonDensity\b/);
  assert.match(
    appSource,
    /<div[\s\S]*?className="hub-mobile-backdrop"[\s\S]*?aria-hidden="true"[\s\S]*?onClick=\{closeMobileNavigation\}/,
  );
  assert.doesNotMatch(appSource, /<button[^>]*className="hub-mobile-backdrop"/);
});

test("sidebar navigation closes with a distinct final-focus policy for the new page", () => {
  assert.match(appSource, /const pendingRouteFocusRef = React\.useRef\(readMobileNavigationRouteFocus\(\)\)/);
  assert.match(appSource, /const navigateFromSidebar = React\.useCallback/);
  assert.match(
    appSource,
    /beginMobileNavigationRoute\(\{[\s\S]*?markMainFocus:[\s\S]*?pendingRouteFocusRef\.current = rememberMobileNavigationRouteFocus\(\{[\s\S]*?fromPath: path,[\s\S]*?targetPath: target[\s\S]*?focusTarget:\s*menuButtonRef\.current[\s\S]*?close:\s*\(\) => setNavOpen\(false\)/,
  );
  assert.match(
    appSource,
    /shouldFocusMainAfterMobileNavigation\(\{[\s\S]*?pending:\s*pendingRouteFocusRef\.current \|\| readMobileNavigationRouteFocus\(\),[\s\S]*?currentPath:\s*path,[\s\S]*?navOpen:\s*mobileNavState\.open[\s\S]*?pendingRouteFocusRef\.current = null[\s\S]*?clearMobileNavigationRouteFocus\(\)[\s\S]*?mainRef\.current\?\.focus\(\)/,
  );
  assert.match(appSource, /<main[\s\S]*?ref=\{mainRef\}[\s\S]*?tabIndex=\{-1\}/);
  assert.match(appSource, /<Sidebar[\s\S]*?onNavigate=\{navigateFromSidebar\}/);
});

test("the programmatically focused main landmark survives the SPA page swap", () => {
  const mainTag = appSource.match(/<main[\s\S]*?>/)?.[0] || "";
  assert.doesNotMatch(mainTag, /key=\{path\}/);
  assert.match(appSource, /<main[\s\S]*?>[\s\S]*?<div key=\{path\} className="fade-up">/);
});

test("opening a top overlay closes mobile navigation and keeps Escape on the topmost layer", () => {
  assert.match(
    appSource,
    /const openCommandPalette = React\.useCallback\([\s\S]*?closeMobileNavigation\(\)[\s\S]*?setPaletteOpen\(true\)/,
  );
  assert.match(appSource, /openPalette=\{openCommandPalette\}/);
  assert.match(appSource, /if \(paletteOpen\)[\s\S]*?setPaletteOpen\(false\)[\s\S]*?openCommandPalette\(\)/);
});

// TopBar New는 "지금 보는 표면에 만든다" — 팔레트만 열던 위장 버튼(기준선 §2.8)의 회귀 가드.
test("TopBar New routes to the current surface's create deep link with palette fallback", () => {
  assert.match(appSource, /onNew=\{createOnCurrentSurface\}/);
  assert.match(appSource, /dashboard\/revenue\/leads\?new=lead/);
  assert.match(appSource, /dashboard\/revenue\/deals\?new=deal/);
  assert.match(appSource, /dashboard\/revenue\/accounts\?new=account/);
  assert.match(appSource, /dashboard\/revenue\/cases\?new=case/);
  assert.match(appSource, /dashboard\/work\/rhythm\?new=rhythm/);
  // 매핑 없는 표면만 팔레트 폴백.
  assert.match(appSource, /const createOnCurrentSurface = React\.useCallback\([\s\S]*?if \(target\) navigate\(target\);[\s\S]*?else openCommandPalette\(\);/);
});

test("leaving the mobile breakpoint commits close before handing focus to desktop main", () => {
  assert.match(appSource, /import \{ flushSync \} from ["']react-dom["']/);
  assert.match(
    appSource,
    /completeMobileNavigationDesktopHandoff\(\{[\s\S]*?active:\s*navOpen,[\s\S]*?close:[\s\S]*?flushSync\(\(\) => setNavOpen\(false\)\)[\s\S]*?focusTarget:\s*mainRef\.current/,
  );
});

test("mobile menu opener exposes state and IconButton forwards its stable ref", () => {
  assert.match(
    topbarSource,
    /<IconButton[\s\S]*?className="hub-mobile-only hub-mobile-nav-opener"[\s\S]*?ref=\{menuButtonRef\}[\s\S]*?aria-expanded=\{navOpen\}[\s\S]*?aria-controls="hub-mobile-navigation"/,
  );
  assert.match(primitivesSource, /export const IconButton = React\.forwardRef\(function IconButton/);
  assert.match(primitivesSource, /<button\s+\{\.\.\.props\}[\s\S]*?ref=\{ref\}/);
});

// The focus/layer policy below executes as plain JavaScript. Source assertions above
// only guard the React wiring; these tests own the transition behavior itself.
test("mobile navigation visibility never hides the desktop sidebar or desktop main", () => {
  const fn = mobileNavRuntime.getMobileNavigationState;
  assert.equal(typeof fn, "function");
  assert.deepEqual(fn({ isMobileViewport: false, navOpen: false }), {
    open: false,
    navHidden: false,
    mainHidden: false,
  });
  assert.deepEqual(fn({ isMobileViewport: false, navOpen: true }), {
    open: false,
    navHidden: false,
    mainHidden: false,
  });
  assert.deepEqual(fn({ isMobileViewport: true, navOpen: false }), {
    open: false,
    navHidden: true,
    mainHidden: false,
  });
  assert.deepEqual(fn({ isMobileViewport: true, navOpen: true }), {
    open: true,
    navHidden: false,
    mainHidden: true,
  });
});

test("inert is toggled through the DOM boolean-attribute API without a React prop", () => {
  const setInert = mobileNavRuntime.setElementInert;
  assert.equal(typeof setInert, "function");
  const attributes = new Set();
  const element = {
    toggleAttribute(name, force) {
      if (force) attributes.add(name);
      else attributes.delete(name);
    },
    hasAttribute(name) { return attributes.has(name); },
  };

  assert.equal(setInert(element, true), true);
  assert.equal(element.hasAttribute("inert"), true);
  assert.equal(setInert(element, false), false);
  assert.equal(element.hasAttribute("inert"), false);
});

test("dismiss focuses the opener before closing, while route close also marks final main focus", () => {
  const dismiss = mobileNavRuntime.dismissMobileNavigation;
  const route = mobileNavRuntime.beginMobileNavigationRoute;
  assert.equal(typeof dismiss, "function");
  assert.equal(typeof route, "function");

  const dismissOrder = [];
  dismiss({
    active: true,
    focusTarget: { focus: () => dismissOrder.push("focus-opener") },
    close: () => dismissOrder.push("close"),
  });
  assert.deepEqual(dismissOrder, ["focus-opener", "close"]);

  const routeOrder = [];
  route({
    active: true,
    markMainFocus: () => routeOrder.push("mark-main"),
    focusTarget: { focus: () => routeOrder.push("leave-nav") },
    close: () => routeOrder.push("close"),
  });
  assert.deepEqual(routeOrder, ["mark-main", "leave-nav", "close"]);
});

test("mobile Tab policy wraps in both directions and leaves middle controls alone", () => {
  const fn = mobileNavRuntime.getMobileNavigationTabTarget;
  assert.equal(typeof fn, "function");
  const first = { id: "first" };
  const middle = { id: "middle" };
  const last = { id: "last" };
  const focusables = [first, middle, last];

  assert.equal(fn({ focusables, activeElement: last, shiftKey: false }), first);
  assert.equal(fn({ focusables, activeElement: first, shiftKey: true }), last);
  assert.equal(fn({ focusables, activeElement: middle, shiftKey: false }), null);
  assert.equal(fn({ focusables: [], activeElement: null, shiftKey: false }), null);
});

test("mobile Escape belongs to nav only when no higher overlay is active", () => {
  const fn = mobileNavRuntime.shouldMobileNavigationHandleEscape;
  assert.equal(typeof fn, "function");
  assert.equal(fn({ open: true, paletteOpen: false, tweaksOpen: false }), true);
  assert.equal(fn({ open: true, paletteOpen: true, tweaksOpen: false }), false);
  assert.equal(fn({ open: true, paletteOpen: false, tweaksOpen: true }), false);
  assert.equal(fn({ open: false, paletteOpen: false, tweaksOpen: false }), false);
});

test("route focus waits for the target commit and accepts an eventual redirect", () => {
  const fn = mobileNavRuntime.shouldFocusMainAfterMobileNavigation;
  assert.equal(typeof fn, "function");
  const pending = { fromPath: "dashboard/work/projects", targetPath: "dashboard/work/roadmap" };

  assert.equal(fn({ pending, currentPath: pending.fromPath, navOpen: false }), false);
  assert.equal(fn({ pending, currentPath: pending.targetPath, navOpen: true }), false);
  assert.equal(fn({ pending, currentPath: pending.targetPath, navOpen: false }), true);
  assert.equal(fn({ pending, currentPath: "dashboard/daily-brief", navOpen: false }), true);
  assert.equal(fn({ pending: null, currentPath: pending.targetPath, navOpen: false }), false);
  assert.equal(fn({
    pending: { fromPath: pending.fromPath, targetPath: pending.fromPath },
    currentPath: pending.fromPath,
    navOpen: false,
  }), true);
});

test("route focus handoff survives a HubApp remount until the new path consumes it", () => {
  const remember = mobileNavRuntime.rememberMobileNavigationRouteFocus;
  const read = mobileNavRuntime.readMobileNavigationRouteFocus;
  const clear = mobileNavRuntime.clearMobileNavigationRouteFocus;
  assert.equal(typeof remember, "function");
  assert.equal(typeof read, "function");
  assert.equal(typeof clear, "function");

  clear();
  const pending = remember({
    fromPath: "dashboard/work/roadmap",
    targetPath: "dashboard/work/calendar",
  });
  assert.deepEqual(read(), pending);
  assert.deepEqual(read(), {
    fromPath: "dashboard/work/roadmap",
    targetPath: "dashboard/work/calendar",
  });
  clear();
  assert.equal(read(), null);
});

test("desktop handoff closes before focusing main so BODY is never the final target", () => {
  const fn = mobileNavRuntime.completeMobileNavigationDesktopHandoff;
  assert.equal(typeof fn, "function");
  const order = [];
  fn({
    active: true,
    close: () => order.push("close-commit"),
    focusTarget: { focus: () => order.push("focus-main") },
  });
  assert.deepEqual(order, ["close-commit", "focus-main"]);
});

test('memos has one my-work owner and is reachable in the navigation catalog', () => {
  assert.equal(ownerAnchorKey('dashboard/work/memos'), 'tasks');
  assert.ok(NAV_TREE.some(node => node.path === 'dashboard/work/memos'));
});

 test("discovery owns its independent route and consumes company/personal scopes", () => {
  assert.equal(ownerAnchorKey("dashboard/discovery"), "discovery");
  assert.equal(resolveSidebarPath("discovery", "classin"), "dashboard/discovery?scope=classin");
  assert.equal(resolveSidebarPath("discovery", "personal"), "dashboard/discovery?scope=personal");
  assert.ok(navTreePaths().includes("dashboard/discovery"));
});

test('content performance is a visible content child and command palette destination', () => {
  assert.equal(ownerAnchorKey('dashboard/content/performance'), 'content');
  assert.ok(sidebarChildren('content', 'all').some(child => child.path === 'dashboard/content/performance'));
  assert.ok(navTreePaths().includes('dashboard/content/performance'));
  assert.match(appSource, /'dashboard\/content\/performance':/);
});

test("OKR·KPI lives under 내 작업 and is also surfaced on 현황 (same Goals screen, two doors)", () => {
  for (const { key: scope } of SIDEBAR_SCOPES) {
    // 본체: 내 작업의 하위 탭 — 경로 소유자가 프로젝트(dashboard/work)가 아니라 내 작업이다.
    assert.equal(ownerAnchorKey("dashboard/work/goals"), "tasks");
    const nav = topNavigationForRoute("dashboard/work/goals", scope);
    assert.equal(nav.anchor?.key, "tasks", scope);
    assert.deepEqual(nav.tabs.map((tab) => tab.key).slice(-1), ["my-okr"], scope);
    assert.equal(nav.activeTab?.key, "my-okr", scope);
    assert.equal(nav.activeTab.label, "OKR·KPI");
    // Work 탭 줄에는 더 이상 없다.
    const work = topNavigationForRoute("dashboard/work/rhythm", scope);
    assert.ok(!work.tabs.some((tab) => tab.path === "dashboard/work/goals"), scope);
    assert.equal(work.activeTab?.key, "prj-rhythm", scope);
    // 현황: 같은 이름의 탭이 목표 화면을 연다.
    const overview = topNavigationForRoute("dashboard/overview", scope, "goals");
    assert.equal(overview.activeTab?.key, "overview-goals", scope);
    assert.equal(overview.activeTab.label, "OKR·KPI", scope);
  }
  assert.ok(NAV_TREE.some((item) => item.path === "dashboard/work/goals"), "⌘K catalog reaches 내 작업 › OKR·KPI");
});

test('AI utility anchor lands on Office in every scope and Office is findable in Korean', () => {
  const ai = SIDEBAR_UTILITIES.find(anchor => anchor.key === 'ai');
  for (const scope of SIDEBAR_SCOPES) assert.equal(ai.paths[scope.key], 'dashboard/agents/office-council');
  const office = NAV_TREE.find(node => node.key === 'agents').children.find(child => child.key === 'office-council');
  for (const word of ['오피스', '이브이', '비서']) assert.ok(office.keywords.includes(word), word);
});
