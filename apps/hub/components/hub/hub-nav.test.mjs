import assert from "node:assert/strict";
import { test } from "node:test";

import { NAV_TREE } from "./hub-data.js";
import {
  DEFAULT_SCOPE,
  SIDEBAR_ANCHORS,
  SIDEBAR_PRIMARY,
  SIDEBAR_SCOPES,
  SIDEBAR_UTILITIES,
  deriveSidebarScope,
  isSidebarAnchorActive,
  normalizeScope,
  ownerAnchorKey,
  resolveSidebarPath,
} from "./hub-nav.js";

function navTreePaths() {
  const paths = [];
  for (const node of NAV_TREE) {
    if (node.path) paths.push(node.path);
    for (const child of node.children || []) if (child.path) paths.push(child.path);
  }
  return paths;
}

test("sidebar exposes exactly six primary and two utility anchors", () => {
  assert.equal(SIDEBAR_PRIMARY.length, 6);
  assert.equal(SIDEBAR_UTILITIES.length, 2);
  assert.deepEqual(
    SIDEBAR_PRIMARY.map((a) => a.key),
    ["today", "tasks", "revenue", "followups", "projects", "content"],
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
