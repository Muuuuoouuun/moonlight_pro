import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

// 정의(POST)와 편집(PATCH)이 같은 필드에 같은 계약을 갖는지만 본다 — 무효 값을 한쪽은
// 조용히 접고 다른 쪽은 400으로 막으면, 잘못된 분류로 태어난 루틴을 고칠 방법이 없다.
const stubs = {
  "next/server": `
    export const NextResponse = {
      json: (body, init) => new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
    };
  `,
  "@/lib/hub-write-guard": `
    export function assertHubWriteAllowed() { return null; }
    export async function readHubWriteJson(req) { return { data: await req.json() }; }
  `,
  "@/lib/server-read": `
    export function eqFilter(v) { return \`eq.\${v}\`; }
    export function withWorkspaceFilter(f = []) { return f; }
    export async function fetchSupabaseRows() { return []; }
  `,
  "@/lib/server-write": `
    export function buildRoutineCheckRecord(input) { return { ...input }; }
    export function resolveDefaultWorkspaceId() { return ""; }
    export function resolveSupabaseConfig() { return null; }
    export async function insertSupabaseRecord() { return { persisted: false }; }
    export async function updateSupabaseRecord() { return { persisted: false }; }
    export async function deleteSupabaseRecord() { return { persisted: false }; }
  `,
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const source = stubs[specifier];
    if (source) return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const route = await import("./route.js?routine-define-contract");

const post = (body) =>
  route.POST(new Request("https://hub.test/api/routine", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));

const valid = { ritualKey: "run-abc", name: "러닝", checkType: "morning" };

test("정의 POST는 명시된 무효 category를 general로 접지 않고 PATCH와 같게 거절한다", async () => {
  const res = await post({ ...valid, category: "생산성" });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, "invalid-category");
});

test("category를 생략하면 general이 기본값으로 남는다", async () => {
  const res = await post(valid);
  // Supabase 미구성이라 preview 봉투 — 기본값이 레코드에 실렸는지만 본다.
  assert.equal(res.status, 202);
  const body = await res.json();
  assert.equal(body.status, "preview");
  assert.equal(body.routine.meta.category, "general");
});

test("유효한 category는 그대로 통과한다", async () => {
  const res = await post({ ...valid, category: "health" });
  assert.equal(res.status, 202);
  assert.equal((await res.json()).routine.meta.category, "health");
});

test("범위 밖 targetPerWeek는 정의에서도 이름이 붙은 400이다", async () => {
  const res = await post({ ...valid, targetPerWeek: 9 });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "invalid-target-per-week");
});
