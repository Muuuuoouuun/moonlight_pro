import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { NAV_TREE } from "./hub-data.js";
import {
  DEFAULT_EXPANDED_ANCHORS,
  DEFAULT_SCOPE,
  SIDEBAR_ANCHORS,
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

// Overview joined 2026-07-15 by direct operator instruction (see hub-nav.js
// header) — seven primary + two utility anchors.
test("sidebar exposes exactly seven primary and two utility anchors", () => {
  assert.equal(SIDEBAR_PRIMARY.length, 7);
  assert.equal(SIDEBAR_UTILITIES.length, 2);
  assert.deepEqual(
    SIDEBAR_PRIMARY.map((a) => a.key),
    ["today", "overview", "tasks", "revenue", "followups", "projects", "content"],
  );
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
    for (const key of ["today", "tasks", "followups"]) {
      assert.deepEqual(sidebarChildren(key, scope.key), [], `${key} in ${scope.key}`);
    }
  }
  // ClassIn 콘텐츠 is one surface — the anchor is the destination.
  assert.deepEqual(sidebarChildren("content", "classin"), []);
  assert.ok(sidebarChildren("content", "all").length > 1);
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
  assert.match(topbarSource, /topNavigationForRoute\(path, scope, view\)/);
  assert.match(topbarSource, /className="hub-topbar__tabs"/);
  assert.match(topbarSource, /aria-current=\{selected \? 'page' : undefined\}/);
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
    2,
    "both expanded and collapsed sidebar variants must share the mobile-only inert contract",
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
