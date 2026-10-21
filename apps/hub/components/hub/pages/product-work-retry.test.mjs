import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

import * as catalog from "../../../lib/product-catalog.js";
import { createWork } from "./product-client.js";
import { executePmsCommand } from "../../../../engine/lib/pms-command-service.ts";

const source = readFileSync(new URL("./product-page.jsx", import.meta.url), "utf8");
const pageJs = ts.transpileModule(
  source.replace(/^import[\s\S]*?;\s*$/gm, "").replaceAll("export function ", "function "),
  { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } },
).outputText;
const IDS = {
  workspace: "11111111-1111-4111-8111-111111111111",
  area: "22222222-2222-4222-8222-222222222222",
  product: "33333333-3333-4333-8333-333333333333",
  lead: "44444444-4444-4444-8444-444444444444",
};

// Actual WorkDrawer hooks and handlers; only React rendering and child primitives
// are replaced. Save work, transport envelopes and Engine command logic stay real.
function mountWorkDrawer(overrides = {}) {
  const slots = [];
  const saved = [];
  let index = 0;
  let tree;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity).filter(child => child != null && child !== false) } }),
    useState(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = typeof initial === "function" ? initial() : initial;
      return [slots[slot], value => { slots[slot] = typeof value === "function" ? value(slots[slot]) : value; }];
    },
    useRef(initial) {
      const slot = index++;
      return slots[slot] ||= { current: initial };
    },
  };
  const props = {
    product: { id: IDS.product, name: "합성 제품", orgScope: "personal", projects: [] },
    areas: [{ id: IDS.area, name: "합성 분야" }],
    onClose() {}, onSaved: (...args) => saved.push(args),
    ...overrides.props,
  };
  const dependencies = {
    React, ...catalog, createWork, linkInquiry: async () => ({ ok: true }), styles: {},
    formatWon: value => String(value), ...overrides.writes,
  };
  for (const name of ["Button", "Drawer", "Kbd", "SectionTitle", "SegmentedControl", "SelectField", "TextField"]) dependencies[name] = name;
  const WorkDrawer = new Function(...Object.keys(dependencies), `${pageJs}; return WorkDrawer;`)(...Object.values(dependencies));
  const render = () => { index = 0; tree = WorkDrawer(props); };
  const findAll = (predicate, node = tree) => {
    if (!node || typeof node !== "object") return [];
    return [...(predicate(node) ? [node] : []), ...(node.props?.children || []).flatMap(child => findAll(predicate, child)), ...(node.props?.footer ? findAll(predicate, node.props.footer) : [])];
  };
  const field = label => findAll(node => node.type === "TextField" && node.props.label === label)[0];
  const saveButton = () => findAll(node => node.type === "Button" && node.props.variant === "primary")[0];
  const text = node => typeof node === "string" ? node : (node?.props?.children || []).map(text).join("");
  render();
  return {
    saved, props, render, field, findAll,
    edit(label, value) { field(label).props.onChange({ target: { value } }); render(); },
    async save() { const pending = saveButton().props.onClick(); render(); await pending; render(); },
    startSave() { const pending = saveButton().props.onClick(); render(); return pending; },
    alert: () => text(findAll(node => node.props.role === "alert")[0]),
  };
}

// The fake transport is the only fetch implementation. Persistence is an injected
// Map; the real Engine normalizer, relationship validation and duplicate checks run.
function projectTransport(t, outcomes = []) {
  const rows = new Map();
  const requests = [];
  const deps = {
    async insert(table, record) {
      assert.equal(table, "projects");
      if (rows.has(record.id)) return { persisted: false, reason: "duplicate" };
      rows.set(record.id, structuredClone(record));
      return { persisted: true, reason: "inserted", record: structuredClone(record) };
    },
    async fetchRows(table, options) {
      const id = options.filters.find(([key]) => key === "id")?.[1].slice(3);
      if (["areas", "products", "leads"].includes(table)) return [{ id }];
      assert.equal(table, "projects");
      return rows.has(id) ? [structuredClone(rows.get(id))] : [];
    },
    async update() { assert.fail("creation recovery must not silently update a project"); },
  };
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "/api/hub/projects");
    assert.equal(options.method, "POST");
    const body = JSON.parse(options.body);
    const behavior = outcomes[requests.length];
    const call = { body };
    requests.push(call);
    if (behavior === "refuse") return new Response(JSON.stringify({ status: "error", error: "forbidden" }), { status: 403 });
    if (behavior === "invalid") return new Response(JSON.stringify({ status: "invalid-input", error: "invalid-reference" }), { status: 400 });
    const result = await executePmsCommand({ ...body, action: "create_project", workspaceId: IDS.workspace }, { workspaceId: IDS.workspace, now: "2026-10-19T12:00:00Z" }, deps);
    call.engineStatus = result.status;
    if (behavior === "lose") {
      assert.equal(result.status, "saved");
      throw new TypeError("Synthetic response loss after persisted creation");
    }
    return new Response(JSON.stringify(result), { status: result.status === "conflict" ? 409 : 200 });
  });
  return { rows, requests };
}

test("saveWork propagates an unknown creation outcome for receipt recovery", async () => {
  const result = await catalog.saveWork({
    createWork: async () => ({ ok: false, unknownOutcome: true, message: "결과 확인 필요" }),
    linkInquiry: async () => assert.fail("unconfirmed creation must not link"),
  }, { product: { id: IDS.product, orgScope: "personal" }, draft: { title: "합성 일", areaId: IDS.area }, id: "pending" });
  assert.equal(result.unknownOutcome, true);
  assert.equal(result.createdId, null);
});

test("actual work drawer normal save creates one project and acknowledges its submitted title", async t => {
  const transport = projectTransport(t);
  const drawer = mountWorkDrawer();
  drawer.edit("제목", "합성 원래 제목");
  await drawer.save();
  assert.equal(transport.rows.size, 1);
  assert.equal(drawer.saved.length, 1);
  assert.match(drawer.saved[0][0], /합성 원래 제목/);
});

test("actual work drawer response-loss retry replays the same full command and creates no second project", async t => {
  const transport = projectTransport(t, ["lose"]);
  const drawer = mountWorkDrawer({ props: { seed: { inquiryId: "synthetic-inquiry", customer: { type: "lead", id: IDS.lead } } } });
  drawer.edit("제목", "합성 원래 제목");
  drawer.edit("기한", "2026-11-01");
  await drawer.save();
  assert.equal(drawer.saved.length, 0);
  await drawer.save();
  assert.deepEqual(transport.requests[1].body, transport.requests[0].body);
  assert.equal(transport.requests[1].engineStatus, "duplicate");
  assert.equal(transport.rows.size, 1);
  assert.equal(drawer.saved.length, 1);
});

test("pending work input stays frozen even for a queued change handler; recovery never claims an edited title was saved", async t => {
  const transport = projectTransport(t, ["lose"]);
  const drawer = mountWorkDrawer();
  drawer.edit("제목", "합성 원래 제목");
  const queuedChange = drawer.field("제목").props.onChange;
  const pending = drawer.startSave();
  assert.equal(drawer.findAll(node => node.type === "fieldset")[0].props.disabled, true);
  queuedChange({ target: { value: "합성 늦은 변경" } });
  await pending;
  drawer.render();
  assert.equal(drawer.findAll(node => node.type === "fieldset")[0].props.disabled, true);
  drawer.edit("제목", "합성 늦은 변경");
  assert.equal(drawer.field("제목").props.value, "합성 원래 제목");
  await drawer.save();
  assert.deepEqual(transport.requests[1].body, transport.requests[0].body);
  assert.equal(transport.rows.size, 1);
  assert.match(drawer.saved[0][0], /합성 원래 제목/);
  assert.doesNotMatch(drawer.saved[0][0], /합성 늦은 변경/);
});

test("a later refusal does not discard an earlier unknown creation command", async t => {
  const transport = projectTransport(t, ["lose", "refuse"]);
  const drawer = mountWorkDrawer();
  drawer.edit("제목", "합성 원래 제목");
  await drawer.save();
  assert.equal(drawer.saved.length, 0);
  assert.equal(drawer.findAll(node => node.type === "fieldset")[0].props.disabled, true);
  await drawer.save();
  await drawer.save();
  assert.deepEqual(transport.requests.map(call => call.body), Array(3).fill(transport.requests[0].body));
  assert.equal(transport.rows.size, 1);
  assert.equal(transport.requests[2].engineStatus, "duplicate");
  assert.equal(drawer.saved.length, 1);
});

test("a queued close callback cannot discard a creation while its response is pending", async () => {
  let resolveWrite;
  let closes = 0;
  const drawer = mountWorkDrawer({
    props: { onClose() { closes++; } },
    writes: { createWork: () => new Promise(resolve => { resolveWrite = resolve; }) },
  });
  drawer.edit("제목", "합성 원래 제목");
  const queuedClose = drawer.findAll(node => node.type === "Drawer")[0].props.onClose;
  const pending = drawer.startSave();
  queuedClose();
  // Release the injected operation before asserting so a failed regression leaves no work pending.
  const closedWhilePending = closes;
  resolveWrite({ ok: false, unknownOutcome: true, message: "합성 응답 유실" });
  await pending;
  drawer.render();
  assert.equal(closedWhilePending, 0);
  assert.equal(drawer.saved.length, 0);
  assert.equal(drawer.findAll(node => node.type === "fieldset")[0].props.disabled, true);
});

test("a definite rejection unlocks corrected input and permits a fresh creation command", async t => {
  const transport = projectTransport(t, ["invalid"]);
  const drawer = mountWorkDrawer();
  drawer.edit("제목", "합성 처음 제목");
  await drawer.save();
  assert.equal(drawer.findAll(node => node.type === "fieldset")[0].props.disabled, false);
  drawer.edit("제목", "합성 고친 제목");
  await drawer.save();
  assert.equal(transport.rows.size, 1);
  assert.notEqual(transport.requests[1].body.id, transport.requests[0].body.id);
  assert.equal([...transport.rows.values()][0].name, "합성 고친 제목");
});

test("known-created work retries only its original inquiry link", async t => {
  const transport = projectTransport(t);
  const links = [];
  const drawer = mountWorkDrawer({
    props: { seed: { inquiryId: "synthetic-inquiry" } },
    writes: { linkInquiry: async (...args) => { links.push(args); return links.length === 1 ? { ok: false, unknownOutcome: true, message: "합성 연결 실패" } : { ok: true }; } },
  });
  drawer.edit("제목", "합성 원래 제목");
  await drawer.save();
  await drawer.save();
  assert.equal(transport.requests.length, 1);
  assert.equal(transport.rows.size, 1);
  assert.deepEqual(links[1], links[0]);
  assert.equal(drawer.saved.length, 1);
});
