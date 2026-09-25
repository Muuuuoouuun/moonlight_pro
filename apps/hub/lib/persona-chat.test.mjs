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
    export async function fetchSupabaseRows(table) {
      const state = globalThis.__personaRouteTest;
      (state.readTables ||= []).push(table);
      return state.rowsByTable?.[table] || [];
    }
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
  assert.equal(PERSONA_MODE_LABEL["outreach-draft"], "연락 초안");
  assert.equal(PERSONA_MODE_LABEL["extract-actions"], "액션 추출");
  assert.equal(PERSONA_MODE_LABEL["daily-dispatch"], "오더 브리핑");
  assert.ok(LEGEND_LENS_MAP.jobs);
  assert.ok(LEGEND_LENS_MAP.bezos);
  assert.ok(LEGEND_LENS_MAP.chouinard);
  assert.ok(LEGEND_LENS_MAP.carnegie);
  assert.ok(LEGEND_LENS_MAP.hill);
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

test("POST supports outreach-draft, extract-actions, and daily-dispatch modes", async () => {
  const resOutreach = await POST(
    request({
      personaId: "sales",
      mode: "outreach-draft",
      draft: "고객: 김대표님, 최근 접촉: 2주 전",
    }),
  );
  assert.equal(resOutreach.status, 200);
  assert.equal(state.calledBody.mode, "outreach-draft");

  const resExtract = await POST(
    request({
      personaId: "order",
      mode: "extract-actions",
      draft: "오늘 미팅 메모: 견적서 송부하고 슬랙 채널 개설하기",
    }),
  );
  assert.equal(resExtract.status, 200);
  assert.equal(state.calledBody.mode, "extract-actions");

  const resDispatch = await POST(
    request({
      personaId: "order",
      mode: "daily-dispatch",
      draft: "오늘 태스크 3개, 신호 1개",
    }),
  );
  assert.equal(resDispatch.status, 200);
  assert.equal(state.calledBody.mode, "daily-dispatch");
});

test("record-local sales modes do not mix unrelated deals into a supplied record", async () => {
  state.rowsByTable = {
    deals: [{ name: "다른 고객의 딜", stage: "Qualified", value: 3000000 }],
  };

  const outreach = await POST(request({
    personaId: "sales",
    mode: "outreach-draft",
    draft: "김 고객에게 보낼 문자를 써줘",
  }));
  assert.equal(outreach.status, 200);
  assert.equal(state.calledBody.context, null);
  assert.deepEqual(state.readTables || [], []);

  const extraction = await POST(request({
    personaId: "sales",
    mode: "extract-contact-outcome",
    draft: "박 고객과 통화한 원문",
  }));
  assert.equal(extraction.status, 200);
  assert.equal(state.calledBody.context, null);
  assert.deepEqual(state.readTables || [], []);

  const localContext = { id: "target-1", name: "이 고객" };
  const scoped = await POST(request({
    personaId: "sales",
    mode: "outreach-draft",
    draft: "이 고객에게 보낼 문자를 써줘",
    context: localContext,
  }));
  assert.equal(scoped.status, 200);
  assert.deepEqual(state.calledBody.context, localContext);
  assert.deepEqual(state.readTables || [], []);
});
