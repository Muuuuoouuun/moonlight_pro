import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { after, beforeEach, test } from "node:test";

const repositoryStub = `
export async function getDailyReviewLedger(options) {
  const state = globalThis.__dailyReviewRouteState;
  state.reads.push(options);
  if (state.throwRead) throw new Error("private database credential");
  return state.readResult;
}
export async function saveDailyReview(value) {
  const state = globalThis.__dailyReviewRouteState;
  state.writes.push(value);
  if (state.throwWrite) throw new Error("private database credential");
  return state.writeResult;
}
`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/repositories/daily-review-ledger") {
      return { url: `data:text/javascript,${encodeURIComponent(repositoryStub)}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const route = await import("../app/api/hub/daily-review/route.js");
const envKeys = ["NODE_ENV", "VERCEL_ENV", "COM_MOON_HUB_WRITE_SECRET", "COM_MOON_HUB_URL", "NEXT_PUBLIC_APP_URL"];
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
let state;
const endpoint = "http://localhost:3000/api/hub/daily-review";
const input = { reviewDate: "2026-09-12", energy: 2, focus: "", progress: null, note: "", expectedRevision: 0, requestId: "41c50d17-85b5-4672-8d05-408fa5a1bf8a" };

beforeEach(() => {
  for (const key of envKeys) delete process.env[key];
  process.env.NODE_ENV = "test";
  state = globalThis.__dailyReviewRouteState = {
    reads: [], writes: [], throwRead: false, throwWrite: false,
    readResult: { status: "live", configured: true, timezone: "Asia/Seoul", review: null, entries: [] },
    writeResult: { status: "saved", review: { id: "review", revision: 1 } },
  };
});
after(() => {
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  delete globalThis.__dailyReviewRouteState;
});

const post = (body = JSON.stringify(input), headers = {}) => new Request(endpoint, {
  method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000", ...headers }, body,
});

test("daily review route exposes a dynamic GET and guarded POST", () => {
  assert.equal(typeof route.GET, "function");
  assert.equal(typeof route.POST, "function");
  assert.equal(route.dynamic, "force-dynamic");
  assert.equal(route.runtime, "nodejs");
});

test("GET passes date and month only and preserves live, preview and error envelopes at HTTP 200", async () => {
  for (const status of ["live", "preview", "error"]) {
    state.readResult.status = status;
    const response = await route.GET(new Request(`${endpoint}?date=2026-09-12&month=2026-09&workspaceId=foreign`));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), state.readResult);
  }
  assert.deepEqual(state.reads[0], { date: "2026-09-12", month: "2026-09" });
  await route.GET(new Request(endpoint));
  assert.deepEqual(state.reads.at(-1), { date: null, month: null });
});

test("unexpected GET failure is a safe HTTP 200 error with an empty review and list", async () => {
  state.throwRead = true;
  const response = await route.GET(new Request(endpoint));
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.status, "error");
  assert.equal(result.review, null);
  assert.deepEqual(result.entries, []);
  assert.equal(JSON.stringify(result).includes("private database"), false);
});

test("POST rejects cross-origin and malformed JSON before persistence", async () => {
  let response = await route.POST(post(undefined, { origin: "https://foreign.example" }));
  assert.equal(response.status, 403);
  response = await route.POST(post("{"));
  assert.equal(response.status, 400);
  assert.equal(state.writes.length, 0);
});

test("POST accepts a configured server secret and maps save, duplicate, conflict and error statuses", async () => {
  process.env.COM_MOON_HUB_WRITE_SECRET = "route-test-secret";
  for (const [status, httpStatus] of [["saved", 200], ["duplicate", 200], ["conflict", 409], ["invalid-input", 400], ["error", 503], ["error", 502]]) {
    state.writeResult = { status, httpStatus, review: status === "saved" ? { revision: 1 } : null };
    const response = await route.POST(post(undefined, { origin: "https://server.example", "x-com-moon-hub-write-secret": "route-test-secret" }));
    assert.equal(response.status, httpStatus);
    const result = await response.json();
    assert.equal(result.status, status);
    assert.equal(Object.hasOwn(result, "httpStatus"), false);
  }
  assert.deepEqual(state.writes[0], input);
});

test("unexpected POST failure returns 502 without private exception text", async () => {
  state.throwWrite = true;
  const response = await route.POST(post());
  const result = await response.json();
  assert.equal(response.status, 502);
  assert.equal(result.status, "error");
  assert.equal(result.review, null);
  assert.equal(JSON.stringify(result).includes("private database"), false);
});
