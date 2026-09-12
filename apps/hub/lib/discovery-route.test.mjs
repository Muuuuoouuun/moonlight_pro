import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { after, beforeEach, test } from "node:test";

const repositoryStub = `
export async function getDiscoveryLedger(options) {
  const state = globalThis.__discoveryRouteState;
  state.reads.push(options);
  if (state.throwRead) throw new Error("private database credential");
  return state.readResult;
}
export async function getDiscoveryTargets(options) { return getDiscoveryLedger(options); }
export async function getDiscoveryHistory(id,options) { return getDiscoveryLedger({history:id,...options}); }
export async function saveDiscovery(value) {
  const state = globalThis.__discoveryRouteState;
  state.writes.push(value);
  if (state.throwWrite) throw new Error("private database credential");
  return state.writeResult;
}
`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/repositories/discovery-ledger") {
      return { url: `data:text/javascript,${encodeURIComponent(repositoryStub)}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const route = await import("../app/api/hub/discovery/route.js");
const envKeys = ["NODE_ENV", "VERCEL_ENV", "COM_MOON_HUB_WRITE_SECRET", "COM_MOON_HUB_URL", "NEXT_PUBLIC_APP_URL"];
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
let state;
const endpoint = "http://localhost:3000/api/hub/discovery";
const input = { id:null, requestId:'41c50d17-85b5-4672-8d05-408fa5a1bf8a', expectedRevision:0, title:'새 가능성', orgScope:'personal', discoveryMode:'capture', status:'captured', evidence:'', hypothesis:'', experiment:'', findings:'', decisionReason:'', resumeCondition:'', reviewDate:null, links:[] };

beforeEach(() => {
  for (const key of envKeys) delete process.env[key];
  process.env.NODE_ENV = "test";
  state = globalThis.__discoveryRouteState = {
    reads: [], writes: [], throwRead: false, throwWrite: false,
    readResult: { status: "live", configured: true, records: [] },
    writeResult: { status: "saved", record: { id: "discovery", revision: 1 } },
  };
});
after(() => {
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  delete globalThis.__discoveryRouteState;
});

const post = (body = JSON.stringify(input), headers = {}) => new Request(endpoint, {
  method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000", ...headers }, body,
});

test("discovery route exposes a dynamic GET and guarded POST", () => {
  assert.equal(typeof route.GET, "function");
  assert.equal(typeof route.POST, "function");
  assert.equal(route.dynamic, "force-dynamic");
  assert.equal(route.runtime, "nodejs");
});

test("GET dispatches scoped list, target search and revision history without caller workspace", async () => {
  for(const status of ['live','preview','error']) {
    state.readResult.status=status;
    const response=await route.GET(new Request(`${endpoint}?id=abc&workspaceId=foreign`));
    assert.equal(response.status,200);assert.deepEqual(await response.json(),state.readResult);
  }
  assert.deepEqual(state.reads[0],{id:'abc',offset:0});
  await route.GET(new Request(`${endpoint}?targets=1&type=project&q=pilot`));assert.deepEqual(state.reads.at(-1),{type:'project',q:'pilot'});
  await route.GET(new Request(`${endpoint}?history=abc`));assert.deepEqual(state.reads.at(-1),{history:'abc',offset:0});
});

test("unexpected GET failure is a safe HTTP 200 error with an empty records", async () => {
  state.throwRead = true;
  const response = await route.GET(new Request(endpoint));
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.status, "error");
  assert.deepEqual(result.records, []);
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
    state.writeResult = { status, httpStatus, record: status === "saved" ? { revision: 1 } : null };
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
  assert.equal(result.record, null);
  assert.equal(JSON.stringify(result).includes("private database"), false);
});

test('POST accepts the full allowed Korean snapshot within its explicit body limit', async () => {
  const body={...input};for(const key of ['evidence','hypothesis','experiment','findings','decisionReason','resumeCondition'])body[key]='한'.repeat(4000);
  const response=await route.POST(post(JSON.stringify(body)));
  assert.equal(response.status,200);assert.equal(state.writes[0].findings.length,4000);
});

test('GET forwards bounded list and history offset',async()=>{await route.GET(new Request(`${endpoint}?offset=200`));assert.deepEqual(state.reads.at(-1),{id:null,offset:200});await route.GET(new Request(`${endpoint}?history=abc&offset=100`));assert.deepEqual(state.reads.at(-1),{history:'abc',offset:100});});
