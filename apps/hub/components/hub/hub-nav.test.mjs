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
} from "./hub-nav.js";

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

// ── Second level (2026-07-15 spec) ────────────────────────────────────────

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

// ── Mobile navigation accessibility contract ─────────────────────────────

test("only the closed mobile sidebar is removed from focus and the accessibility tree", () => {
  assert.match(appSource, /const mobileNavHidden = isMobileViewport && !navOpen/);
  assert.match(appSource, /mobileHidden=\{mobileNavHidden\}/);

  assert.match(
    sidebarSource,
    /const sidebarA11yProps = \{[\s\S]*?["']aria-hidden["']:\s*mobileHidden \? true : undefined,[\s\S]*?inert:\s*mobileHidden \? ["']{2} : undefined/,
  );
  assert.equal(
    sidebarSource.match(/<aside\s+\{\.\.\.sidebarA11yProps\}/g)?.length,
    2,
    "both expanded and collapsed sidebar variants must share the mobile-only inert contract",
  );
  assert.doesNotMatch(appSource, /aria-hidden=\{!navOpen\}/);
});

test("mobile navigation closes on Escape, backdrop, and navigation then restores opener focus", () => {
  assert.match(appSource, /const menuButtonRef = React\.useRef\(null\)/);
  assert.match(
    appSource,
    /const closeMobileNavigation = React\.useCallback\([\s\S]*?setNavOpen\(false\)[\s\S]*?requestAnimationFrame\([\s\S]*?menuButtonRef\.current\?\.focus\(\)/,
  );
  assert.match(
    appSource,
    /React\.useEffect\(\(\) => \{[\s\S]*?if \(!navOpen \|\| !isMobileViewport\) return[\s\S]*?event\.key === ["']Escape["'][\s\S]*?closeMobileNavigation\(\)/,
  );
  assert.match(appSource, /const navigate = React\.useCallback\([\s\S]*?closeMobileNavigation\(\)/);
  assert.match(
    appSource,
    /<div[\s\S]*?className="hub-mobile-backdrop"[\s\S]*?aria-hidden="true"[\s\S]*?onClick=\{closeMobileNavigation\}/,
  );
  assert.doesNotMatch(appSource, /<button[^>]*className="hub-mobile-backdrop"/);
});

test("mobile menu opener exposes state and IconButton forwards its stable ref", () => {
  assert.match(
    topbarSource,
    /<IconButton[\s\S]*?className="hub-mobile-only hub-mobile-nav-opener"[\s\S]*?ref=\{menuButtonRef\}[\s\S]*?aria-expanded=\{navOpen\}[\s\S]*?aria-controls="hub-mobile-navigation"/,
  );
  assert.match(primitivesSource, /export const IconButton = React\.forwardRef\(function IconButton/);
  assert.match(primitivesSource, /<button\s+\{\.\.\.props\}[\s\S]*?ref=\{ref\}/);
});
