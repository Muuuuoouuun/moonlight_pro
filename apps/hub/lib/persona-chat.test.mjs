import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

const state = (globalThis.__personaRouteTest = {});
const stubs = {
  "@/lib/hub-write-guard": `
    export function assertHubWriteAllowed() { return null; }
    export async function readHubWriteJson(req) { return { data: await req.json() }; }
  `,
  "@/lib/sales-os/brand-context": `
    export async function assembleBrandContext() { return { source: 'supabase', brand: { key: 'sinabro' } }; }
  `,
  "@/lib/sales-os/agent-runs": `
    export async function recordAgentRun(input) {
      globalThis.__personaRouteTest.run = input;
      return { persisted: true, id: 'persona-run-1' };
    }
  `,
  "@/lib/server-read": `
    export async function fetchSupabaseRows() { return []; }
    export function withWorkspaceFilter(f = []) { return f; }
  `,
};

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "next/server") return next("next/server.js", context);
    if (stubs[specifier]) {
      return {
        url: "data:text/javascript," + encodeURIComponent(stubs[specifier]),
        shortCircuit: true,
      };
    }
    return next(specifier, context);
  },
});

const { POST } = await import("../app/api/hub/persona-chat/route.js");
const { PERSONA_MODE_LABEL, LEGEND_LENS_MAP } = await import("../components/hub/persona-client.js");

beforeEach((t) => {
  for (const key of Object.keys(state)) delete state[key];
  const old = process.env.COM_MOON_ENGINE_URL;
  const fetchBefore = globalThis.fetch;
  process.env.COM_MOON_ENGINE_URL = "http://engine.test";

  globalThis.fetch = async (url, opts) => {
    state.calledUrl = url;
    state.calledBody = JSON.parse(opts.body);
    return Response.json({
      status: "generated",
      personaId: state.calledBody.personaId,
      mode: state.calledBody.mode,
      lens: state.calledBody.lens,
      text: "persona generated response",
    });
  };

  t.after(() => {
    globalThis.fetch = fetchBefore;
    if (old === undefined) delete process.env.COM_MOON_ENGINE_URL;
    else process.env.COM_MOON_ENGINE_URL = old;
  });
});

const request = (body) =>
  new Request("http://hub.test/api/hub/persona-chat", {
    method: "POST",
    body: JSON.stringify(body),
  });

test("persona-client exposes mode labels and legend lenses", () => {
  assert.equal(PERSONA_MODE_LABEL.advice, "조언");
  assert.equal(PERSONA_MODE_LABEL.critique, "평가/진단");
  assert.equal(PERSONA_MODE_LABEL.sparring, "3자 토론");
  assert.equal(PERSONA_MODE_LABEL["weekly-review"], "한 주 정리");
  assert.ok(LEGEND_LENS_MAP.jobs);
  assert.ok(LEGEND_LENS_MAP.bezos);
  assert.ok(LEGEND_LENS_MAP.chouinard);
});

test("POST forwards personaId, mode and lens to engine and logs agent run", async () => {
  const res = await POST(
    request({
      personaId: "order",
      mode: "advice",
      lens: "jobs",
      message: "오늘 우선순위 정리",
    }),
  );
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.personaId, "order");
  assert.equal(data.mode, "advice");
  assert.equal(data.lens, "jobs");
  assert.equal(data.runId, "persona-run-1");
  assert.equal(state.calledBody.personaId, "order");
  assert.equal(state.calledBody.lens, "jobs");
  assert.equal(state.run.agent, "persona.order");
  assert.equal(state.run.mode, "advice");
});

test("POST supports critique and sparring modes", async () => {
  const resCritique = await POST(
    request({
      personaId: "review",
      mode: "critique",
      draft: "우리 SaaS는 혁신적인 차세대 플랫폼입니다.",
    }),
  );
  assert.equal(resCritique.status, 200);
  assert.equal(state.calledBody.mode, "critique");

  const resSparring = await POST(
    request({
      personaId: "sales",
      mode: "sparring",
      message: "가격 2배 인상 제안",
    }),
  );
  assert.equal(resSparring.status, 200);
  assert.equal(state.calledBody.mode, "sparring");
});

test("POST supports weekly-review mode", async () => {
  const res = await POST(
    request({
      personaId: "council",
      mode: "weekly-review",
    }),
  );
  assert.equal(res.status, 200);
  assert.equal(state.calledBody.mode, "weekly-review");
});
