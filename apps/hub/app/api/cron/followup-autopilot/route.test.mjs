import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const stubs = {
  "next/server": `
    export const NextResponse = {
      json: (body, init) => new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
    };
  `,
  "@/lib/hub-write-guard": `export function assertHubWriteAllowed() { return null; }`,
  "@/lib/server-write": `export function resolveDefaultWorkspaceId() { return "ws-1"; }`,
  "@/lib/automation-runs": `
    export async function recordAutomationRun(entry) {
      globalThis.__cronRuns.push(entry);
      return { persisted: true };
    }
  `,
  "@/lib/repositories/followups-ledger": `
    export async function getFollowups() { return globalThis.__followupsResult; }
  `,
  "@/lib/sales-os/agent-runs": `
    export async function recordAgentRun(entry) { globalThis.__agentRuns.push(entry); return { id: "run-1" }; }
  `,
  "@/lib/sales-os/context-assembler": `
    export async function assembleSalesContext({ ref }) {
      globalThis.__contextCalls.push(ref);
      return globalThis.__salesContexts[ref] || {
        source: "supabase",
        focus: { found: true, item_id: ref },
      };
    }
  `,
  "@/lib/sales-os/work-orders": `
    export async function getWorkOrders() { return globalThis.__openOrdersResult; }
    export async function createWorkOrder(order) { globalThis.__workOrders.push(order); return { persisted: true }; }
  `,
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const source = stubs[specifier];
    if (source) return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const route = await import("./route.js?followup-autopilot-cron");

function reset() {
  globalThis.__cronRuns = [];
  globalThis.__agentRuns = [];
  globalThis.__workOrders = [];
  globalThis.__contextCalls = [];
  globalThis.__salesContexts = {};
  globalThis.__followupsResult = {
    source: "supabase",
    configured: true,
    items: [{ kind: "deal", id: "deal-1", name: "거래 1", why: "후속 필요" }],
  };
  globalThis.__openOrdersResult = { source: "supabase", orders: [] };
}

async function run() {
  const response = await route.GET(new Request("https://hub.test/api/cron/followup-autopilot"));
  return { httpStatus: response.status, body: await response.json() };
}

test("승인 대기 목록 읽기 실패 시 유료 후속 초안을 만들지 않는다", async () => {
  const fetchSnapshot = globalThis.fetch;
  reset();
  globalThis.__openOrdersResult = { source: "error", error: "work-orders-read-failed", orders: [] };
  let engineCalls = 0;
  globalThis.fetch = async () => {
    engineCalls += 1;
    return new Response(JSON.stringify({ status: "generated", subject: "후속", body: "본문" }), { status: 200 });
  };
  try {
    const { httpStatus, body } = await run();
    assert.equal(httpStatus, 503);
    assert.equal(body.status, "error");
    assert.equal(body.reason, "work-orders-read-failed");
    assert.equal(engineCalls, 0);
    assert.equal(globalThis.__workOrders.length, 0);
    assert.equal(globalThis.__cronRuns.at(-1).status, "failure");
  } finally {
    globalThis.fetch = fetchSnapshot;
  }
});

test("후속 후보 읽기 실패를 빈 후보로 기록하지 않는다", async () => {
  const fetchSnapshot = globalThis.fetch;
  reset();
  globalThis.__followupsResult = { source: "error", configured: true, error: "followups-read-failed", items: [] };
  globalThis.fetch = async () => {
    throw new Error("Engine must not be called after a failed followups read");
  };
  try {
    const { httpStatus, body } = await run();
    assert.equal(httpStatus, 503);
    assert.equal(body.status, "error");
    assert.equal(body.reason, "followups-read-failed");
    assert.equal(globalThis.__cronRuns.at(-1).status, "failure");
  } finally {
    globalThis.fetch = fetchSnapshot;
  }
});

test("거래 소스의 부분 실패를 후속 후보 없음으로 기록하지 않는다", async () => {
  reset();
  globalThis.__followupsResult = {
    source: "supabase",
    partial: true,
    failedSources: ["deals"],
    items: [],
  };
  const { httpStatus, body } = await run();
  assert.equal(httpStatus, 503);
  assert.equal(body.status, "error");
  assert.equal(body.reason, "followups-read-partial");
  assert.equal(globalThis.__cronRuns.at(-1).status, "failure");
});

for (const source of ["preview", "error"]) {
  test(`영업 컨텍스트 ${source}면 Engine과 승인 대기 생성을 중단한다`, async () => {
    const fetchSnapshot = globalThis.fetch;
    const engineUrlSnapshot = process.env.COM_MOON_ENGINE_URL;
    const sharedSecretSnapshot = process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
    reset();
    globalThis.__salesContexts["deal-1"] = { source, error: "revenue-read-failed", focus: { found: true, item_id: "deal-1" } };
    process.env.COM_MOON_ENGINE_URL = "https://engine.test";
    process.env.COM_MOON_SHARED_WEBHOOK_SECRET = "test-secret";
    let engineCalls = 0;
    globalThis.fetch = async () => {
      engineCalls += 1;
      return new Response(JSON.stringify({ status: "generated", subject: "후속", body: "본문" }), { status: 200 });
    };
    try {
      const { body } = await run();
      assert.equal(body.scanned, 1);
      assert.equal(body.errored, 1);
      assert.equal(engineCalls, 0);
      assert.equal(globalThis.__agentRuns.length, 0);
      assert.equal(globalThis.__workOrders.length, 0);
      assert.equal(globalThis.__cronRuns.at(-1).status, "failure");
    } finally {
      globalThis.fetch = fetchSnapshot;
      if (engineUrlSnapshot === undefined) delete process.env.COM_MOON_ENGINE_URL;
      else process.env.COM_MOON_ENGINE_URL = engineUrlSnapshot;
      if (sharedSecretSnapshot === undefined) delete process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
      else process.env.COM_MOON_SHARED_WEBHOOK_SECRET = sharedSecretSnapshot;
    }
  });
}

test("개인 거래가 후속 후보에 섞여도 ClassIn focus가 아니면 초안을 만들지 않는다", async () => {
  const fetchSnapshot = globalThis.fetch;
  const engineUrlSnapshot = process.env.COM_MOON_ENGINE_URL;
  const sharedSecretSnapshot = process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
  reset();
  globalThis.__followupsResult.items.push({ kind: "deal", id: "deal-2", name: "거래 2", why: "후속 필요" });
  globalThis.__salesContexts["deal-1"] = { source: "supabase", focus: { found: false } };
  process.env.COM_MOON_ENGINE_URL = "https://engine.test";
  process.env.COM_MOON_SHARED_WEBHOOK_SECRET = "test-secret";
  const engineRefs = [];
  globalThis.fetch = async (_url, options) => {
    engineRefs.push(JSON.parse(options.body).ref);
    return new Response(JSON.stringify({ status: "generated", subject: "후속", body: "본문" }), { status: 200 });
  };
  try {
    const { body } = await run();
    assert.deepEqual(globalThis.__contextCalls, ["deal-1", "deal-2"]);
    assert.deepEqual(engineRefs, ["deal-2"]);
    assert.equal(body.skipped, 1);
    assert.equal(body.drafted, 1);
    assert.deepEqual(globalThis.__workOrders.map((order) => order.dealId), ["deal-2"]);
    assert.deepEqual(globalThis.__agentRuns.map((run) => run.ref), ["deal-2"]);
  } finally {
    globalThis.fetch = fetchSnapshot;
    if (engineUrlSnapshot === undefined) delete process.env.COM_MOON_ENGINE_URL;
    else process.env.COM_MOON_ENGINE_URL = engineUrlSnapshot;
    if (sharedSecretSnapshot === undefined) delete process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
    else process.env.COM_MOON_SHARED_WEBHOOK_SECRET = sharedSecretSnapshot;
  }
});
