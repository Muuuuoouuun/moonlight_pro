// Structured draft modes — the machine-readable half of the mentor endpoints.
//
// The advisory modes (pipeline-triage, brand-strategy, …) answer a human in prose: the caller
// renders `text` in a chat pane. The two DRAFT modes here are consumed by a machine — the Hub
// Vercel crons (followup-autopilot, content-flywheel) turn the answer straight into a
// work_orders row — so they must return named fields, not prose:
//
//   followup-draft → { subject, body }   (Guru / sales-mentor)
//   content-draft  → { title,   body }   (Council / brand-mentor)
//
// Everything here is pure and IO-free so apps/hub/lib/sales-os/draft-contract.test.mjs can
// import it directly and assert the crons' success predicates against the REAL response
// builder. That test is what keeps this contract from drifting again — it drifted once
// already: the crons shipped against modes the Engine never implemented, normalizeMode
// silently answered with the wrong mode's prose, and no work order was ever produced.

export const FOLLOWUP_DRAFT_MODE = "followup-draft";
export const CONTENT_DRAFT_MODE = "content-draft";

export interface FollowupDraft {
  subject: string;
  body: string;
}

export interface ContentDraft {
  title: string;
  body: string;
}

// Same bounds card-news uses: JSON enforced at the API layer, plus a capped thinking budget
// so a runaway think cannot eat the output allowance and truncate the JSON mid-object.
export const DRAFT_GENERATION_BOUNDS = {
  responseMimeType: "application/json",
  thinkingBudget: 512,
} as const;

// Tolerant of code fences — responseMimeType makes bare JSON the norm, but a thinking model
// still wraps it in ```json occasionally. Same tolerance as the card-news parser.
function parseJsonObject(text: string): any {
  if (typeof text !== "string" || !text.trim()) return null;

  let raw = text.trim();
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

// Null on ANY shape violation — the caller must fail the run rather than persist a partial
// draft into the approval queue. Mock and live data never mix.
export function parseFollowupDraft(text: string): FollowupDraft | null {
  const obj = parseJsonObject(text);
  if (!obj) return null;

  const subject = readNonEmptyString(obj.subject);
  const body = readNonEmptyString(obj.body);
  if (!subject || !body) return null;

  return { subject, body };
}

export function parseContentDraft(text: string): ContentDraft | null {
  const obj = parseJsonObject(text);
  if (!obj) return null;

  const title = readNonEmptyString(obj.title);
  const body = readNonEmptyString(obj.body);
  if (!title || !body) return null;

  return { title, body };
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

// followup-draft writes off context.focus, which assembleSalesContext fills for this exact
// mode (see apps/hub/lib/sales-os/context-assembler.js — "followup-draft writes the message
// off exactly this slice"): the deal, the buyer style, recent outcomes, the next-action hint.
export function buildFollowupDraftPrompt(context: any): string {
  const focus = context?.focus ?? null;
  const entity = focus?.entity ?? {};
  const ledger = focus?.ledger ?? {};

  return [
    "정체된 딜에 지금 보낼 팔로업 메시지 초안을 하나 써라.",
    "",
    "규칙:",
    "- 코칭·진단·해설이 아니라, 운영자가 그대로 보낼 수 있는 완성된 메시지 본문을 쓴다.",
    "- 문자·카카오톡으로 보낼 길이(3~6문장)로 쓰고, 이메일처럼 격식을 차리지 않는다.",
    "- ledger snapshot에 있는 사실(회사·단계·마지막 접촉)만 인용하고, 없는 사실은 지어내지 않는다.",
    "- 과장·보장·단정과 '혁신적·차세대·시너지' 같은 상투어를 쓰지 않는다.",
    "- 상대가 답하기 쉬운 구체적 질문 또는 제안 하나로 끝맺는다.",
    "- 이 초안은 자동 발송되지 않는다 — 운영자가 승인 큐에서 검토·수정한다.",
    "",
    `대상 딜: ${entity.company ?? entity.name ?? "?"} · 단계=${entity.stage ?? "?"} · 마지막 접촉=${ledger.last_touch ?? "무접촉"}`,
    "",
    "출력은 아래 JSON 객체 하나만. 설명·머리말·코드펜스 없이 JSON만:",
    '{"subject": "메시지 한 줄 요약 (승인 큐 제목용, 40자 내외)", "body": "실제로 보낼 메시지 본문"}',
    "",
    "Sales ledger snapshot:",
    JSON.stringify(context ?? {}, null, 2),
  ].join("\n");
}

// content-draft writes off context.target_idea, which the content-flywheel cron sets to the
// exact idea it picked from the queue.
export function buildContentDraftPrompt(context: any): string {
  const idea = context?.target_idea ?? null;

  return [
    "아래 아이디어로 발행 가능한 콘텐츠 초안을 하나 써라.",
    "",
    "규칙:",
    "- 자문·평가가 아니라, 운영자가 검토 후 그대로 올릴 수 있는 완성된 본문을 쓴다.",
    "- 첫 문장은 스크롤을 멈추게 하는 훅으로 시작하고, 마지막은 독자의 다음 행동으로 끝맺는다.",
    "- 짧은 문장과 구체적 예시로 쓰고, 일반론·칭찬·마케팅 카피를 쓰지 않는다.",
    "- context.brand 가드레일(보이스·금지 표현)을 지킨다.",
    "- ledger snapshot에 없는 사실은 지어내지 않는다.",
    "- 이 초안은 자동 발행되지 않는다 — 운영자가 승인 큐에서 검토·수정한다.",
    "",
    `대상 아이디어: ${idea?.title ?? "?"}${idea?.summary ? ` — ${idea.summary}` : ""}${idea?.brandKey ? ` (브랜드: ${idea.brandKey})` : ""}`,
    "",
    "출력은 아래 JSON 객체 하나만. 설명·머리말·코드펜스 없이 JSON만:",
    '{"title": "콘텐츠 제목 (40자 내외)", "body": "발행할 본문 전체"}',
    "",
    "Brand ledger snapshot:",
    JSON.stringify(context ?? {}, null, 2),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Response envelope
// ---------------------------------------------------------------------------

export interface DraftResponseInput {
  mode: string;
  ref: string | null;
  model: string;
  // The parsed draft — null when generation failed OR the model returned unparseable JSON.
  draft: FollowupDraft | ContentDraft | null;
  reason: string;
  persistence?: unknown;
}

// THE contract. The crons read status/subject/body (followup) and status/title/body (content)
// off exactly this object; apps/hub/lib/sales-os/draft-contract.js holds the matching
// predicates and the shared test asserts the two agree. Change this shape and that test fails.
//
// `text` stays populated with the raw model output so the draft routes remain debuggable the
// same way the advisory modes are.
export function buildDraftResponse(input: DraftResponseInput) {
  const ok = Boolean(input.draft);

  return {
    status: ok ? "generated" : "error",
    mode: input.mode,
    ref: input.ref,
    model: input.model,
    ...(input.draft ?? {}),
    reason: input.reason,
    persistence: input.persistence ?? null,
  };
}

export function draftHttpStatus(draft: FollowupDraft | ContentDraft | null): number {
  return draft ? 200 : 502;
}
