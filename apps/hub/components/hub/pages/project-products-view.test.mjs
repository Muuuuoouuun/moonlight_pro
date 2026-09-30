import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

import * as catalog from "../../../lib/product-catalog.js";

const source = readFileSync(new URL("./project-products-view.jsx", import.meta.url), "utf8");
const pageJs = ts.transpileModule(
  source.replace(/^import[\s\S]*?;\s*$/gm, "").replaceAll("export function ", "function "),
  { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } },
).outputText;

// Keep the actual page mounted while its URL changes, like HubApp's pathname key.
// Only external reads and child surfaces are replaced; page hooks and handlers run.
function mountPage({ status = "live" } = {}) {
  const slots = [];
  const pending = [];
  const navigations = [];
  let params = new URLSearchParams();
  let index = 0;
  let dirty = false;
  let tree;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity).filter(Boolean) } }),
    useState(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = typeof initial === "function" ? initial() : initial;
      return [slots[slot], (value) => {
        const next = typeof value === "function" ? value(slots[slot]) : value;
        if (!Object.is(next, slots[slot])) { slots[slot] = next; dirty = true; }
      }];
    },
    useRef(initial) {
      const slot = index++;
      return slots[slot] ||= { current: initial };
    },
    useCallback(fn, deps) {
      const slot = index++;
      if (!same(slots[slot]?.deps, deps)) slots[slot] = { fn, deps };
      return slots[slot].fn;
    },
    useEffect(fn, deps) {
      const slot = index++;
      if (same(slots[slot]?.deps, deps)) return;
      slots[slot]?.cleanup?.();
      slots[slot] = { deps };
      pending.push(() => { slots[slot].cleanup = fn(); });
    },
  };
  const router = { replace(url) {
    navigations.push(url);
    params = new URL(url, "https://moonlight.test").searchParams;
    dirty = true;
  } };
  const toast = Object.assign(() => {}, { success() {}, error() {} });
  const deps = {
    React, ...catalog,
    usePathname: () => "/dashboard/products",
    useSearchParams: () => params,
    useRouter: () => router,
    useToast: () => toast,
    usePageCreateHotkey() {},
    readProducts: async () => ({ status, products: [], candidates: [], inquiries: [], areas: [], missing: [] }),
    readGitHubStatus: async () => ({ state: "preview" }),
    styles: {},
  };
  for (const name of ["Button", "EditDrawer", "EmptyState", "Kbd", "SegmentedControl", "Skeleton", "TruthBadge", "ProductDetailDrawer", "ProductInbox", "ProductPage", "ProductPortfolio"]) deps[name] = name;
  const Page = new Function(...Object.keys(deps), `${pageJs}; return ProjectProductsView;`)(...Object.values(deps));
  const render = async () => {
    for (let turn = 0; turn < 10; turn += 1) {
      dirty = false;
      index = 0;
      tree = Page({});
      while (pending.length) pending.shift()();
      await new Promise((resolve) => setImmediate(resolve));
      if (!dirty) return;
    }
    assert.fail("page render did not settle");
  };
  const find = (type, node = tree) => {
    if (!node || typeof node !== "object") return null;
    if (node.type === type) return node;
    for (const child of node.props?.children || []) {
      const match = find(type, child);
      if (match) return match;
    }
    return null;
  };
  return {
    render, find, navigations,
    async navigate(query) { params = new URLSearchParams(query); await render(); },
  };
}

test("topbar New opens a product drawer again after the previous drawer closes", async () => {
  const page = mountPage();
  await page.render();
  await page.navigate("new=product");
  const first = page.find("EditDrawer");
  assert.equal(first?.props.title, "새 제품");
  assert.equal(page.navigations.length, 1, "consume the first create query once");

  first.props.onClose();
  await page.render();
  assert.equal(page.find("EditDrawer"), null);

  await page.navigate("new=product");
  assert.equal(page.find("EditDrawer")?.props.title, "새 제품", "the same mounted page accepts another New action");
  assert.equal(page.navigations.length, 2, "consume the second create query once");
});

test("an unavailable product store does not consume the New query or open a drawer", async () => {
  const page = mountPage({ status: "preview" });
  await page.navigate("new=product");
  assert.equal(page.find("EditDrawer"), null);
  assert.equal(page.navigations.length, 0);
});
