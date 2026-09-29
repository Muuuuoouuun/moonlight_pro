// StudioAI 렌더 스모크 — 선언 순서(TDZ)·prop 이름 가림 같은 실수는 빌드가 아니라 실행에서만 드러난다.
// 90863dd의 generate() TDZ 회귀(모든 AI 버튼 멈춤)는 이런 실행 검사가 없어서 통과했다.
import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { StudioAI } = await import("./content-studio-ai.jsx");
const { emptyStudioDraft } = await import("../../../lib/content-workflow-client.js");

const studio = (patch = {}) => ({
  draft: { ...emptyStudioDraft(), contentId: "c", variantId: "v", body: "첫 문단\n\n둘째 문단", sourceIdea: "메모" },
  ready: true, busy: false, recovery: null, dirty: false, save: async () => null, mutate: async () => null, ...patch,
});
const templates = { status: "live", templates: [{ id: "t1", name: "후킹 스레드", request: "첫 줄은 질문", skeleton: "" }], reload() {} };
const render = (props = {}) => renderToStaticMarkup(React.createElement(StudioAI, { studio: studio(), selection: null, templates, ...props }));

test("renders two direct AI actions and a folded request summary", () => {
  const html = render({ request: "첫 줄은 질문으로, 세 문단 이내, 반말로 써 주세요" });
  assert.match(html, /AI 초안/);
  assert.match(html, /AI 다듬기/);
  assert.match(html, /class="studio-ai-request"/);
  // 요약 줄은 지금 AI에 갈 요청을 보여 준다(24자에서 자름) — 숨은 지시가 몰래 적용되지 않게.
  assert.match(html, /첫 줄은 질문으로, 세 문단 이내, 반말로…/);
});

test("the selected template name wins in the summary; empty request says 없음", () => {
  assert.match(render({ request: "첫 줄은 질문", templateId: "t1" }), /후킹 스레드/);
  assert.match(render({ request: "" }), /없음/);
});

test("runRef runs only when the same button would be enabled", () => {
  const runRef = { current: null };
  render({ runRef, studio: studio({ draft: { ...emptyStudioDraft(), sourceIdea: "", body: "" } }) });
  assert.equal(typeof runRef.current, "function");
  // 메모·본문이 비어 있으면 초안 조건이 거짓 — 호출해도 아무 것도 하지 않는다(예외 없음).
  assert.doesNotThrow(() => runRef.current("draft"));
});
