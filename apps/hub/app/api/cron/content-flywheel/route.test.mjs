import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

// 이 크론은 Engine 왕복과 Supabase 읽기/쓰기를 모두 타므로 경계만 스텁하고 두 가지 계약만
// 고정한다: (1) 공유 시크릿이 없으면 네트워크를 타지 않고 원인을 말한다, (2) automation_runs
// 기록 실패가 이미 끝난 실행의 응답을 뒤집지 않는다. draft-contract는 실제 모듈을 쓴다.
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
      if (globalThis.__cronLogThrows) throw new Error("automation_runs insert failed");
      return { persisted: true };
    }
  `,
  "@/lib/sales-os/agent-runs": `
    export async function recordAgentRun(entry) { globalThis.__agentRuns.push(entry); return { id: "run-1" }; }
  `,
  "@/lib/sales-os/brand-context": `
    export async function assembleBrandContext() {
      return {
        source: "supabase",
        content: {
          cadence: { behind: true, week: "2026-W39", published: 0, goal: 2 },
          idea_queue_top: [{ id: "idea-1", title: "루틴 설계", summary: "", brandKey: "moonlight" }],
        },
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

const route = await import("./route.js?content-flywheel-cron");

function reset({ logThrows = false } = {}) {
  globalThis.__cronRuns = [];
  globalThis.__agentRuns = [];
  globalThis.__workOrders = [];
  globalThis.__cronLogThrows = logThrows;
  globalThis.__openOrdersResult = { source: "supabase", orders: [] };
}

async function run() {
  const res = await route.GET(new Request("https://hub.test/api/cron/content-flywheel"));
  return { httpStatus: res.status, body: await res.json() };
}

test("공유 시크릿이 없으면 Engine을 부르지 않고 설정 누락을 그대로 말한다", async () => {
  const env = { ...process.env };
  const fetchSnapshot = globalThis.fetch;
  process.env.COM_MOON_ENGINE_URL = "https://engine.test";
  delete process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
  globalThis.fetch = async () => {
    throw new Error("인증 헤더 없는 POST가 Engine으로 나가면 안 된다");
  };
  reset();
  try {
    const { httpStatus, body } = await run();
    assert.equal(httpStatus, 503);
    // "draft-failed"로 뭉개지면 자동화 화면에서 고칠 것을 읽을 수 없다.
    assert.equal(body.reason, "shared-secret-not-configured");
    assert.equal(globalThis.__workOrders.length, 0);
    assert.equal(globalThis.__cronRuns.at(-1).status, "failure");
    assert.equal(globalThis.__cronRuns.at(-1).errorMessage, "shared-secret-not-configured");
    assert.match(globalThis.__agentRuns.at(-1).inputSummary, /503 · shared-secret-not-configured/);
  } finally {
    process.env = env;
    globalThis.fetch = fetchSnapshot;
  }
});

test("automation_runs 기록이 실패해도 끝난 실행의 응답은 바뀌지 않는다", async () => {
  const env = { ...process.env };
  const fetchSnapshot = globalThis.fetch;
  process.env.COM_MOON_ENGINE_URL = "https://engine.test";
  process.env.COM_MOON_SHARED_WEBHOOK_SECRET = "shared-secret";
  globalThis.fetch = async (url, init) => {
    assert.equal(init.headers["x-com-moon-shared-secret"], "shared-secret");
    return new Response(
      JSON.stringify({ status: "generated", title: "루틴 설계", body: "본문", model: "m" }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  reset({ logThrows: true });
  const errorSnapshot = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    const { httpStatus, body } = await run();
    // work_order는 이미 만들어졌다 — 기록이 던졌다고 크론 호출자에게 500을 주면 재시도가 붙는다.
    assert.equal(globalThis.__workOrders.length, 1);
    assert.equal(httpStatus, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.drafted, 1);
    // 삼켜도 조용하면 안 된다 — 기록 실패는 로그에 남는다.
    assert.equal(logged.length, 1);
  } finally {
    console.error = errorSnapshot;
    process.env = env;
    globalThis.fetch = fetchSnapshot;
  }
});

test("승인 대기 목록 읽기 실패 시 유료 생성과 중복 제안을 시작하지 않는다", async () => {
  const env = { ...process.env };
  const fetchSnapshot = globalThis.fetch;
  process.env.COM_MOON_ENGINE_URL = "https://engine.test";
  process.env.COM_MOON_SHARED_WEBHOOK_SECRET = "shared-secret";
  let engineCalls = 0;
  globalThis.fetch = async () => {
    engineCalls += 1;
    return new Response(JSON.stringify({ status: "generated", title: "중복 초안", body: "본문" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  reset();
  globalThis.__openOrdersResult = { source: "error", error: "work-orders-read-failed", orders: [] };
  try {
    const { httpStatus, body } = await run();
    assert.equal(httpStatus, 503);
    assert.equal(body.status, "error");
    assert.equal(body.reason, "work-orders-read-failed");
    assert.equal(engineCalls, 0);
    assert.equal(globalThis.__workOrders.length, 0);
    assert.equal(globalThis.__cronRuns.at(-1).status, "failure");
  } finally {
    process.env = env;
    globalThis.fetch = fetchSnapshot;
  }
});
