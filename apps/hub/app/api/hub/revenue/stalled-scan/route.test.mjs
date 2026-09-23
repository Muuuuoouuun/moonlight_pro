import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

// 라이브러리는 ok/preview/error 어휘를, 허브 read 계약은 live/partial/preview/error 어휘를 쓴다.
// 번역은 라우트 경계에서만 일어나므로 라이브러리를 스텁해 GET의 봉투만 고정한다.
const scanStub = `
export async function scanStalledDeals() { return globalThis.__stalledScanResult; }
`;
// next/server는 이 저장소의 node --test 경로에서 확장자 없이는 풀리지 않는다(다른 라우트
// 테스트는 소스가 'next/server.js'를 import해 피해 간다). 여기선 JSON 봉투만 보므로 최소 스텁.
const nextStub = `
export const NextResponse = {
  json: (body, init) => new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json" },
  }),
};
`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/sales-os/stalled-scan") {
      return { url: `data:text/javascript,${encodeURIComponent(scanStub)}`, shortCircuit: true };
    }
    if (specifier === "next/server") {
      return { url: `data:text/javascript,${encodeURIComponent(nextStub)}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const route = await import("./route.js?stalled-scan-envelope");

async function get() {
  const res = await route.GET(new Request("https://hub.test/api/hub/revenue/stalled-scan"));
  return { httpStatus: res.status, body: await res.json() };
}

test("성공한 dry-run 스캔은 계약 어휘 live로 나간다", async () => {
  globalThis.__stalledScanResult = { status: "ok", dryRun: true, stalled: 2, created: 0, skipped: 0, proposals: [] };
  const { httpStatus, body } = await get();
  assert.equal(httpStatus, 200);
  // 전개가 매핑을 덮어쓰면 여기서 "ok"가 나온다 — 소비자가 live를 못 본다.
  assert.equal(body.status, "live");
  assert.equal(body.stalled, 2);
});

test("읽기 실패는 preview로 뭉개지지 않고 error 그대로 나간다", async () => {
  globalThis.__stalledScanResult = { status: "error", reason: "ledger-read-failed", stalled: 0, proposals: [] };
  const { httpStatus, body } = await get();
  assert.equal(httpStatus, 200);
  assert.equal(body.status, "error");
  assert.equal(body.reason, "ledger-read-failed");
});

test("미구성 저장소는 preview를 유지한다", async () => {
  globalThis.__stalledScanResult = { status: "preview", reason: "ledger-preview", stalled: 0, proposals: [] };
  const { body } = await get();
  assert.equal(body.status, "preview");
});
