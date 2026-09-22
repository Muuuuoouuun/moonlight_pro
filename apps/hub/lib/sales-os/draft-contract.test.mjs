// Hub↔Engine draft contract regression.
//
// This bridges the two apps on purpose: it imports the Engine's REAL response builder and the
// Hub crons' REAL success predicates, then asserts they agree. No hand-written fixture of "what
// the Engine probably returns" — that is precisely the assumption that broke.
//
// What broke: followup-autopilot and content-flywheel each POSTed a mode the Engine did not
// implement ('followup-draft' / 'content-draft'). The Engine's normalizeMode silently swapped in
// an advisory mode and answered with coaching prose — {status, mode, ref, model, text, reason,
// persistence}, no subject/title/body. The crons' predicates could never match, so every
// scheduled run since the crons landed burned two Gemini calls per deal and produced zero work
// orders. The "engine returns coaching prose" case below is that exact regression, pinned.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONTENT_DRAFT_MODE,
  FOLLOWUP_DRAFT_MODE,
  isContentDraftOk,
  isFollowupDraftOk,
} from "./draft-contract.js";

const engine = await import("../../../engine/lib/ai-draft-modes.ts");

const MODEL = "gemini-3.5-flash";

// Build a response exactly the way the Engine routes do.
function engineResponse({ mode, ref = "deal-1", draft, reason = "ok" }) {
  return {
    body: engine.buildDraftResponse({ mode, ref, model: MODEL, draft, reason }),
    status: engine.draftHttpStatus(draft),
  };
}

test("engine mode names match the ones the crons send", () => {
  assert.equal(FOLLOWUP_DRAFT_MODE, engine.FOLLOWUP_DRAFT_MODE);
  assert.equal(CONTENT_DRAFT_MODE, engine.CONTENT_DRAFT_MODE);
});

test("a real followup-draft response satisfies the followup-autopilot predicate", () => {
  const draft = engine.parseFollowupDraft(
    JSON.stringify({ subject: "도입 일정 확인", body: "지난주 논의 이후 일정이 어떻게 되는지 궁금합니다." }),
  );
  assert.ok(draft, "engine must parse a well-formed followup draft");

  const { body, status } = engineResponse({ mode: FOLLOWUP_DRAFT_MODE, draft });

  assert.equal(status, 200);
  assert.ok(
    isFollowupDraftOk(status, body),
    `cron rejected a valid engine response: ${JSON.stringify(body)}`,
  );
  // The fields the cron actually persists into work_orders.
  assert.equal(body.subject, "도입 일정 확인");
  assert.equal(typeof body.body, "string");
  assert.equal(body.mode, FOLLOWUP_DRAFT_MODE);
  assert.equal(body.model, MODEL);
});

test("a real content-draft response satisfies the content-flywheel predicate", () => {
  const draft = engine.parseContentDraft(
    JSON.stringify({ title: "혼자 만드는 운영 시스템", body: "처음에는 스프레드시트 한 장이었다." }),
  );
  assert.ok(draft, "engine must parse a well-formed content draft");

  const { body, status } = engineResponse({ mode: CONTENT_DRAFT_MODE, ref: "idea-1", draft });

  assert.equal(status, 200);
  assert.ok(
    isContentDraftOk(status, body),
    `cron rejected a valid engine response: ${JSON.stringify(body)}`,
  );
  assert.equal(body.title, "혼자 만드는 운영 시스템");
  assert.equal(typeof body.body, "string");
  assert.equal(body.mode, CONTENT_DRAFT_MODE);
});

test("the two draft shapes are not interchangeable", () => {
  const followup = engine.parseFollowupDraft(JSON.stringify({ subject: "s", body: "b" }));
  const content = engine.parseContentDraft(JSON.stringify({ title: "t", body: "b" }));

  const followupRes = engineResponse({ mode: FOLLOWUP_DRAFT_MODE, draft: followup });
  const contentRes = engineResponse({ mode: CONTENT_DRAFT_MODE, draft: content });

  // A content response has no `subject`; a followup response has no `title`.
  assert.equal(isFollowupDraftOk(contentRes.status, contentRes.body), false);
  assert.equal(isContentDraftOk(followupRes.status, followupRes.body), false);
});

test("engine failure responses are rejected and carry a 502", () => {
  for (const [mode, predicate] of [
    [FOLLOWUP_DRAFT_MODE, isFollowupDraftOk],
    [CONTENT_DRAFT_MODE, isContentDraftOk],
  ]) {
    const { body, status } = engineResponse({ mode, draft: null, reason: "missing-api-key" });

    assert.equal(status, 502, `${mode} failure must not be a 2xx`);
    assert.equal(body.status, "error");
    assert.equal(predicate(status, body), false, `${mode} failure must not pass the cron gate`);
  }
});

// The pinned regression. This is the shape the Engine returned for a year of nightly runs.
test("an advisory (prose) response never passes a draft predicate", () => {
  const advisory = {
    status: "generated",
    mode: "pipeline-triage",
    ref: "deal-1",
    model: MODEL,
    text: "1. 진단 …\n2. 리스크 …\n3. 다음 액션 …",
    reason: "ok",
    persistence: {},
  };

  assert.equal(isFollowupDraftOk(200, advisory), false);
  assert.equal(isContentDraftOk(200, advisory), false);
});

test("parsers reject drafts that would persist an empty work order", () => {
  const badFollowup = [
    JSON.stringify({ subject: "제목만", body: "" }),
    JSON.stringify({ subject: "   ", body: "본문" }),
    JSON.stringify({ body: "subject 없음" }),
    JSON.stringify({ title: "content 모양", body: "본문" }),
    JSON.stringify([{ subject: "s", body: "b" }]),
    "설명 문장, JSON 아님",
    "",
  ];
  for (const text of badFollowup) {
    assert.equal(engine.parseFollowupDraft(text), null, `should reject: ${text}`);
  }

  const badContent = [
    JSON.stringify({ title: "제목만", body: "   " }),
    JSON.stringify({ body: "title 없음" }),
    JSON.stringify({ subject: "followup 모양", body: "본문" }),
    "```json\n{\"title\": \"닫히지 않음\"",
  ];
  for (const text of badContent) {
    assert.equal(engine.parseContentDraft(text), null, `should reject: ${text}`);
  }
});

test("parsers tolerate the code fence a thinking model still emits", () => {
  const fenced = '```json\n{"subject": "일정 확인", "body": "본문입니다."}\n```';
  assert.deepEqual(engine.parseFollowupDraft(fenced), { subject: "일정 확인", body: "본문입니다." });

  const fencedContent = '```\n{"title": "제목", "body": "본문"}\n```';
  assert.deepEqual(engine.parseContentDraft(fencedContent), { title: "제목", body: "본문" });
});

test("draft generation asks for JSON at the API layer, not just in the prompt", () => {
  // The prompt alone is what card-news relied on; responseMimeType is what makes it reliable.
  assert.equal(engine.DRAFT_GENERATION_BOUNDS.responseMimeType, "application/json");
  assert.equal(typeof engine.DRAFT_GENERATION_BOUNDS.thinkingBudget, "number");
});

test("draft prompts carry the slice each cron actually assembles", () => {
  // followup-autopilot sends context.focus (assembleSalesContext fills it for this mode).
  const followupPrompt = engine.buildFollowupDraftPrompt({
    focus: { found: true, entity: { company: "한빛학원", stage: "제안" }, ledger: { last_touch: "2026-08-01" } },
  });
  assert.match(followupPrompt, /한빛학원/);
  assert.match(followupPrompt, /2026-08-01/);
  assert.match(followupPrompt, /"subject"/);

  // content-flywheel sends context.target_idea.
  const contentPrompt = engine.buildContentDraftPrompt({
    target_idea: { id: "i1", title: "운영 시스템 만들기", summary: "요약", brandKey: "sinabro" },
  });
  assert.match(contentPrompt, /운영 시스템 만들기/);
  assert.match(contentPrompt, /sinabro/);
  assert.match(contentPrompt, /"title"/);
});
