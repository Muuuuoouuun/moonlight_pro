import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

import * as catalog from "../../../lib/product-catalog.js";
import { readSaveOutcome } from "./product-client.js";

const source = readFileSync(new URL("./project-products-view.jsx", import.meta.url), "utf8");
const pageJs = ts.transpileModule(
  source.replace(/^import[\s\S]*?;\s*$/gm, "").replaceAll("export function ", "function "),
  { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } },
).outputText;

// Keep the actual page mounted while its URL changes, like HubApp's pathname key.
// Only external reads and child surfaces are replaced; page hooks and handlers run.
function mountPage({ status = "live", ...overrides } = {}) {
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
    ...overrides,
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
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
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

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

const ledgerWith = (name) => ({ status: "live", products: [{ id: "product", name }], candidates: [], inquiries: [], areas: [], missing: [] });

test("product reads publish before an unrelated GitHub read finishes", async () => {
  const github = deferred();
  const page = mountPage({ readProducts: async () => ledgerWith("Current"), readGitHubStatus: () => github.promise });
  await page.render();
  assert.equal(page.find("ProductPortfolio")?.props.products[0].name, "Current");
  page.unmount();
  github.resolve({ state: "preview" });
});

test("the latest refresh owns both reads even when older transports finish last", async () => {
  const products = [deferred(), deferred(), deferred()];
  const github = [deferred(), deferred(), deferred()];
  const signals = [];
  let productRead = 0;
  let githubRead = 0;
  const page = mountPage({
    readProducts: (signal) => { signals.push(signal); return products[productRead++].promise; },
    readGitHubStatus: () => github[githubRead++].promise,
  });
  products[0].resolve(ledgerWith("Initial"));
  github[0].resolve({ state: "preview" });
  await page.navigate("product=product");
  const older = page.find("ProductPage").props.onChanged();
  const latest = page.find("ProductPage").props.onChanged();
  products[2].resolve(ledgerWith("Latest"));
  github[2].resolve({ state: "live", configured: true, linkedRepositories: 2 });
  await latest;
  await page.render();
  products[1].resolve(ledgerWith("Stale"));
  github[1].resolve({ state: "error" });
  await older;
  await page.render();
  assert.equal(page.find("ProductPage").props.product.name, "Latest");
  assert.equal(signals[1]?.aborted, true, "superseded refresh releases its transport");
  page.find("ProductPage").props.onOpenSettings();
  await page.render();
  assert.equal(page.find("ProductDetailDrawer").props.github.linkedRepositories, 2);
  page.unmount();
  assert.equal(signals[2].aborted, true, "unmount also cancels imperative refreshes");
});

async function fillNewProduct(page) {
  await page.navigate("new=product");
  for (const [key, value] of Object.entries({ name: "Product", summary: "Summary", capabilities: "One feature", requirements: "One requirement" })) {
    page.find("EditDrawer").props.onChange(key, value);
    await page.render();
  }
}

test("an uncertain create retries the identical command including nested item IDs", async () => {
  const bodies = [];
  const page = mountPage({ createProduct: async (body) => { bodies.push(body); return { ok: false, status: "error", unknownOutcome: true }; } });
  await fillNewProduct(page);
  await page.find("EditDrawer").props.onSave();
  await page.find("EditDrawer").props.onSave();
  assert.deepEqual(bodies[1], bodies[0]);
  assert.ok(bodies[0].id);
  assert.ok(bodies[0].details.capabilities[0].id);
  assert.ok(bodies[0].details.requirements[0].id);
  page.unmount();
});

for (const [status, data] of [[401, { status: "unauthorized" }], [202, { status: "preview" }], [409, { status: "conflict" }]]) {
  test(`${data.status} on retry cannot disprove an earlier uncertain create`, async () => {
    const bodies = [];
    const stored = new Map();
    const page = mountPage({ createProduct: async (body) => {
      bodies.push(body);
      if (bodies.length === 2) return readSaveOutcome(status, data);
      const existed = stored.has(body.id);
      if (!existed) stored.set(body.id, { ...body, org_scope: body.orgScope, updated_at: "2026-10-02T00:00:00Z" });
      // The first request persisted, but its receipt was lost in the Hub → Engine transport.
      if (bodies.length === 1) return readSaveOutcome(502, { status: "error", error: "engine-unreachable" });
      return readSaveOutcome(existed ? 200 : 201, { status: existed ? "duplicate" : "saved", entity: stored.get(body.id) });
    } });
    await fillNewProduct(page);
    await page.find("EditDrawer").props.onSave();
    await page.find("EditDrawer").props.onSave();
    page.find("EditDrawer").props.onChange("capabilities", "Changed feature");
    await page.render();
    await page.find("EditDrawer").props.onSave();
    assert.deepEqual(bodies[2], bodies[0], "retain the original ID and body until its outcome is known");
    assert.equal(stored.size, 1, "a transient refusal cannot turn a receipt retry into a second product");
    page.unmount();
  });
}

test("edited input after an uncertain create confirms the original command then requires an explicit update", async () => {
  const bodies = [];
  const updates = [];
  const page = mountPage({
    createProduct: async (body) => {
      bodies.push(body);
      // Engine's duplicate identity checks name, summary and org_scope, not details.
      return bodies.length === 1 ? { ok: false, status: "error", unknownOutcome: true }
        : { ok: true, status: "duplicate", entity: { ...bodies[0], org_scope: bodies[0].orgScope, updated_at: "2026-10-02T00:00:00Z", version: 1 } };
    },
    updateProduct: async (body) => { updates.push(body); return { ok: true, status: "saved", entity: body }; },
  });
  await fillNewProduct(page);
  await page.find("EditDrawer").props.onSave();
  page.find("EditDrawer").props.onChange("capabilities", "Changed feature");
  await page.render();
  const receipt = await page.find("EditDrawer").props.onSave();
  assert.deepEqual(bodies[1], bodies[0], "edited details must not contaminate the original receipt replay");
  assert.equal(receipt.ok, false, "do not close and discard the changed input");
  assert.match(receipt.message, /카드 저장/);
  assert.equal(updates.length, 0, "no automatic write follows receipt confirmation");
  await page.render();
  assert.equal(page.find("EditDrawer").props.saveLabel, "카드 저장");
  assert.equal(page.find("EditDrawer").props.record.id, null, "keep the drawer identity so its feedback and dirty draft survive");
  assert.equal(page.find("EditDrawer").props.record.capabilities, "Changed feature");
  assert.equal((await page.find("EditDrawer").props.onSave()).ok, true);
  assert.equal(updates[0].id, bodies[0].id);
  assert.equal(updates[0].expectedUpdatedAt, "2026-10-02T00:00:00Z");
  assert.equal(updates[0].details.capabilities[0].text, "Changed feature");
  page.unmount();
});

test("an uncertain create cannot silently apply a later scope change to an existing product", async () => {
  let first;
  let count = 0;
  const page = mountPage({ createProduct: async (body) => {
    first ||= body;
    return ++count === 1 ? { ok: false, status: "error", unknownOutcome: true }
      : { ok: true, status: "duplicate", entity: { ...first, org_scope: first.orgScope, updated_at: "2026-10-02T00:00:00Z" } };
  } });
  await fillNewProduct(page);
  await page.find("EditDrawer").props.onSave();
  page.find("EditDrawer").props.onChange("orgScope", "classin");
  await page.render();
  const receipt = await page.find("EditDrawer").props.onSave();
  assert.match(receipt.message, /소속.*바꿀 수 없/);
  await page.render();
  assert.equal(page.find("EditDrawer").props.record.orgScope, "personal");
  page.unmount();
});

test("a definite create rejection permits corrected input on the next manual save", async () => {
  const bodies = [];
  const page = mountPage({ createProduct: async (body) => { bodies.push(body); return { ok: false, status: "error", unknownOutcome: false }; } });
  await fillNewProduct(page);
  await page.find("EditDrawer").props.onSave();
  page.find("EditDrawer").props.onChange("name", "Corrected");
  await page.render();
  await page.find("EditDrawer").props.onSave();
  assert.equal(bodies[1].name, "Corrected");
  page.unmount();
});

test("a create completing after unmount does not start another page refresh or navigation", async () => {
  const save = deferred();
  let reads = 0;
  let body;
  const page = mountPage({
    readProducts: async () => { reads++; return ledgerWith("Existing"); },
    createProduct: (input) => { body = input; return save.promise; },
  });
  await fillNewProduct(page);
  const pending = page.find("EditDrawer").props.onSave();
  page.unmount();
  save.resolve({ ok: true, status: "saved", entity: body });
  await pending;
  assert.equal(reads, 1);
  assert.equal(page.navigations.length, 1, "only the consumed New query, no late product navigation");
});
