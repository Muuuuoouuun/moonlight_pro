import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCodexDraft, createProduct, readGitHubStatus, readInquiryProduct, readProducts, readSaveOutcome, runGitHubSync, summarizeSyncResult } from "./product-client.js";

test("save envelopes: preview is never a success", () => {
  assert.deepEqual(readSaveOutcome(201, { status: "saved", entity: { id: "p" } }), { ok: true, status: "saved", entity: { id: "p" } });
  assert.equal(readSaveOutcome(200, { status: "duplicate" }).ok, true);
  const preview = readSaveOutcome(202, { status: "preview", error: "engine-not-configured" });
  assert.equal(preview.ok, false);
  assert.match(preview.message, /저장되지 않았어요/);
  assert.equal(readSaveOutcome(202, { status: "error", error: "missing-config" }).ok, false);
  const conflict = readSaveOutcome(409, { status: "conflict", error: "repository-owned-by-other-product" });
  assert.equal(conflict.status, "conflict");
  assert.match(conflict.message, /제품 하나에만/);
  assert.match(readSaveOutcome(502, null).message, /http-502/);
});

test("sync results name what happened without a green success", () => {
  assert.equal(summarizeSyncResult(200, { status: "synced", repositories: [{}, {}] }).message, "저장소 2개를 동기화했어요.");
  assert.equal(summarizeSyncResult(202, { status: "preview", configured: false }).message, "제품에 연결된 저장소가 없어요.");
  assert.equal(summarizeSyncResult(502, { status: "error" }).tone, "danger");
});

test("codex draft carries the failing check and log link, not secrets", () => {
  const draft = buildCodexDraft({ name: "OMR" }, { fullName: "o/omr", defaultBranch: "main", summary: { ci: { failed: ["test"], url: "https://github.com/o/omr/actions/runs/1" } } });
  assert.match(draft, /o\/omr 기본 브랜치\(main\) CI가 실패/);
  assert.match(draft, /실패한 check: test/);
  assert.match(draft, /actions\/runs\/1/);
});

test("focus cap rejection keeps the engine's product list in the message", () => {
  const outcome = readSaveOutcome(400, { status: "invalid-input", error: "focus-cap-reached", limit: 3, focus: [{ name: "OMR" }] });
  assert.equal(outcome.ok, false);
  assert.match(outcome.message, /지금: OMR/);
});

const readers = [
  ["products", (signal) => readProducts(signal), { status: "live", products: [] }, "status"],
  ["inquiry", (signal) => readInquiryProduct("inquiry", signal), { status: "live", products: [], productId: null }, "status"],
  ["github", (signal) => readGitHubStatus(signal), { status: { configured: true } }, "state"],
];

for (const [name, read, data, stateKey] of readers) {
  test(`${name} accepts its live envelope and skips an already cancelled request`, async (t) => {
    const transport = t.mock.method(globalThis, "fetch", async () => ({ ok: true, status: 200, json: async () => data }));
    assert.equal((await read())[stateKey], "live");
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(read(controller.signal), { name: "AbortError" });
    assert.equal(transport.mock.callCount(), 1);
  });

  test(`${name} rejects unsuccessful HTTP responses even with a live-looking body`, async (t) => {
    t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 500, json: async () => data }));
    assert.equal((await read())[stateKey], "error");
  });

  for (const phase of ["headers", "body"]) {
    test(`${name} times out stalled ${phase} even if transport ignores abort`, async (t) => {
      t.mock.timers.enable({ apis: ["setTimeout"] });
      let resolveTransport;
      let signal;
      const stalled = new Promise((resolve) => { resolveTransport = resolve; });
      t.mock.method(globalThis, "fetch", async (_url, options) => {
        signal = options.signal;
        return phase === "headers" ? stalled : { ok: true, status: 200, json: () => stalled };
      });
      let result;
      const pending = read().then((value) => { result = value; });
      await new Promise(setImmediate);
      t.mock.timers.tick(120_000);
      await new Promise(setImmediate);
      assert.equal(result?.[stateKey], "error", "deadline must settle the public read");
      assert.equal(signal?.aborted, true);
      resolveTransport(phase === "headers" ? { ok: true, status: 200, json: async () => data } : data);
      await pending;
    });
  }

  test(`${name} propagates caller cancellation, including during a stalled body`, async (t) => {
    t.mock.method(globalThis, "fetch", async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) }));
    const controller = new AbortController();
    let result;
    const pending = read(controller.signal).then(() => { result = "resolved"; }, (error) => { result = error.name; });
    await new Promise(setImmediate);
    controller.abort("page-left");
    await new Promise(setImmediate);
    assert.equal(result, "AbortError");
    await pending;
  });
}

test("read envelopes reject missing truth, wrong collection shape, and source errors", async (t) => {
  let data;
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, status: 200, json: async () => data }));
  for (data of [{}, [], { status: "live", products: null }, { status: "live", products: [], source: "error" }]) {
    assert.equal((await readProducts()).status, "error");
    assert.equal((await readInquiryProduct("id")).status, "error");
  }
  data = { status: [] };
  assert.equal((await readGitHubStatus()).state, "error");
  data = { status: "error", error: "products-table-missing" };
  assert.equal((await readProducts()).error, "products-table-missing");
});

test("HTTP failures cannot acknowledge saved or synced bodies", () => {
  assert.equal(readSaveOutcome(500, { status: "saved" }).ok, false);
  assert.equal(readSaveOutcome(500, { status: "duplicate" }).ok, false);
  assert.equal(summarizeSyncResult(500, { status: "synced" }).ok, false);
  assert.equal(summarizeSyncResult(500, { status: "partial" }).ok, false);
});

for (const [name, write] of [["create", () => createProduct({ id: "p" })], ["sync", () => runGitHubSync()]]) {
  test(`${name} bounds the response body without automatically retrying a write`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let signal;
    const transport = t.mock.method(globalThis, "fetch", async (_url, options) => {
      signal = options.signal;
      return { ok: true, status: 200, json: () => new Promise(() => {}) };
    });
    let result;
    const pending = write().then((value) => { result = value; });
    await new Promise(setImmediate);
    t.mock.timers.tick(120_000);
    await new Promise(setImmediate);
    assert.equal(result?.ok, false);
    assert.equal(signal?.aborted, true);
    assert.equal(transport.mock.callCount(), 1);
    if (name === "create") assert.equal(result.unknownOutcome, true);
    await pending;
  });
}
