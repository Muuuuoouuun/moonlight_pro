import { NextResponse } from "next/server.js";
import { buildAdvisorySystemInstruction } from "../../../../lib/advisor-guardrails.ts";
import { buildGuruAdvicePrompt, GURU_ADVICE_MODES, type GuruAdviceMode } from "../../../../lib/guru-advice-prompt.ts";

// Gemini generations can legitimately run tens of seconds; cap the route
// so a hung upstream cannot pin a serverless invocation past a minute.
export const maxDuration = 60;

import {
  DRAFT_GENERATION_BOUNDS,
  FOLLOWUP_DRAFT_MODE,
  buildDraftResponse,
  buildFollowupDraftPrompt,
  draftHttpStatus,
  parseFollowupDraft,
} from "../../../../lib/ai-draft-modes.ts";
import { generateGeminiText, getGeminiIntegrationStatus } from "../../../../lib/gemini.ts";
import {
  insertIntegrationSyncRun,
  resolveDefaultWorkspaceId,
  upsertIntegrationConnection,
} from "../../../../lib/integration-state.ts";
import { validateSharedWebhookRequest } from "../../../../lib/shared-webhook.ts";
import { insertSupabaseRecord } from "../../../../lib/supabase-rest.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DRAFT_SYSTEM_INSTRUCTION = [
  "당신은 Moonlight 운영자(파운더)의 영업 멘토입니다.",
  "노련한 세일즈 코치처럼 직설적이고 구체적으로, 한국어로 조언합니다.",
  "요청받은 후속 초안만 작성하고, 근거 없는 고객 반응이나 기한을 만들지 않습니다.",
  "판단 프레임은 12인 세일즈 구루 플레이북에서 가져오되, 사실(딜 상태·금액·접촉 이력)은",
  "제공된 ledger snapshot에서만 인용하고, 데이터에 없는 사실은 단정하지 않습니다.",
  "ClassIn은 Moonlight 전체가 아니라 운영자의 현재 회사 영업 lane입니다. 개인 사업/브랜드 확장과 섞어 판단하지 않습니다.",
  "주요 리드 공급원은 Meta 광고/마케팅팀 Google Sheet이고, 보조 소스는 기존 고객 연락과 Threads입니다.",
  "회사 CRM은 현재 read/get 중심입니다. 회사 CRM에 자동 push하거나 고객에게 직접 발송하지 않습니다.",
  "문자·카카오톡·Threads DM·전화 중심으로 제안하고, 이메일을 기본 채널로 두지 않습니다.",
  "고객 직접 전달과 콘텐츠 업로드는 사람의 확인 이후에만 실행합니다. 회사 CRM push/자동 입력은 수동 체크리스트로만 다룹니다.",
  "근거가 된 프레임은 한 줄로 출처를 밝힙니다 (예: \"Keenan 4층 기준 Layer 3이 비어 있음\").",
  "context.brand(classmoon) 가드레일을 지키고, 금지 표현(과장·보장·단정, 혁신적·차세대·시너지 같은 default SaaS 톤)을 쓰지 않습니다.",
  "context.outcomes.recent는 실제 접촉 이력이니 다음 액션의 근거로 삼고, context.memory.recent_runs(이전 코칭)와 중복되지 않게 연속성을 유지합니다.",
  "context.missing[]에 적힌 소스는 데이터 공백이므로 그 슬라이스의 사실은 추정하지 않습니다.",
].join("\n");

async function readJson(req: Request) {
  const text = await req.text();
  return text ? JSON.parse(text) : {};
}

// Resolve an advisory mode, or null when the caller asked for something this route does not
// implement. Deliberately NOT a silent fallback: the followup-autopilot cron shipped against a
// 'followup-draft' mode that did not exist here, the old fallback quietly answered with
// pipeline-triage prose instead, and every scheduled run burned a Gemini call to produce a
// response the cron could never accept. An unknown mode is now a 400 that names itself.
function resolveAdvisoryMode(value: unknown): GuruAdviceMode | null {
  const key = typeof value === "string" ? value.trim() : "";
  if (!key) return "pipeline-triage";
  return (key in GURU_ADVICE_MODES ? key : null) as GuruAdviceMode | null;
}

export async function GET() {
  return NextResponse.json({
    service: "com-moon-engine",
    integration: "gemini",
    agent: "guru",
    modes: Object.keys(GURU_ADVICE_MODES),
    draftModes: [FOLLOWUP_DRAFT_MODE],
    status: getGeminiIntegrationStatus(),
  });
}

export async function POST(req: Request) {
  const auth = validateSharedWebhookRequest(req);

  if (!auth.ok || auth.mode === "open") {
    return NextResponse.json({ status: "unauthorized", error: auth.error }, { status: 401 });
  }

  let payload: any = {};

  try {
    payload = await readJson(req);
  } catch {
    return NextResponse.json(
      { status: "invalid-json", error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const requestedMode = typeof payload.mode === "string" ? payload.mode.trim() : "";
  const isDraftMode = requestedMode === FOLLOWUP_DRAFT_MODE;
  const advisoryMode = isDraftMode ? null : resolveAdvisoryMode(payload.mode);

  // Unknown modes are refused before any provider call (never silently swapped for an
  // advisory lens). The body names what this route does implement.
  if (!isDraftMode && !advisoryMode) {
    return NextResponse.json(
      {
        status: "invalid-input",
        error: "unsupported-mode",
        detail: `Unsupported mode '${requestedMode}'.`,
        modes: Object.keys(GURU_ADVICE_MODES),
        draftModes: [FOLLOWUP_DRAFT_MODE],
      },
      { status: 400 },
    );
  }

  const mode = isDraftMode ? FOLLOWUP_DRAFT_MODE : (advisoryMode as GuruAdviceMode);
  const ref = typeof payload.ref === "string" ? payload.ref.trim() || null : null;
  const draft = typeof payload.draft === "string" ? payload.draft : null;
  const context = payload.context ?? {};
  const guidanceId = typeof payload.guidanceId === "string" ? payload.guidanceId : null;
  const workspaceId = resolveDefaultWorkspaceId();
  const explicitDirectives = payload.directives ?? (payload.values || payload.knowledge ? { values: payload.values, knowledge: payload.knowledge } : null);
  const maxOutputTokens =
    typeof payload.maxOutputTokens === "number" ? payload.maxOutputTokens : 8192;

  const startedAt = new Date().toISOString();
  // The draft mode asks for JSON at the API layer with a capped thinking budget; the advisory
  // modes stay free-form prose for the chat pane, under the advisory guardrails/directives.
  const result = await generateGeminiText(
    isDraftMode
      ? {
          systemInstruction: DRAFT_SYSTEM_INSTRUCTION,
          prompt: buildFollowupDraftPrompt(context),
          maxOutputTokens,
          ...DRAFT_GENERATION_BOUNDS,
        }
      : {
          systemInstruction: buildAdvisorySystemInstruction({
            type: "sales-mentor",
            mode,
            context,
            directives: explicitDirectives,
          }),
          prompt: buildGuruAdvicePrompt({ mode: mode as GuruAdviceMode, context, draft, guidanceId }),
          maxOutputTokens,
        },
  );
  const finishedAt = new Date().toISOString();

  // Parse before the telemetry writes so a well-formed HTTP 200 carrying unparseable JSON is
  // recorded as the failure it is, instead of showing the integration as healthy.
  const parsedDraft = isDraftMode && result.ok ? parseFollowupDraft(result.text) : null;
  const draftOk = isDraftMode ? Boolean(parsedDraft) : false;
  const generationOk = isDraftMode ? draftOk : result.ok;
  const failureReason =
    isDraftMode && result.ok && !draftOk ? "invalid-draft-json" : result.reason;

  const connection = await upsertIntegrationConnection({
    provider: "guru",
    status: generationOk ? "connected" : "error",
    config: {
      ...getGeminiIntegrationStatus(),
      agent: "guru",
      lastResult: { ok: generationOk, status: result.status, reason: failureReason, mode },
    },
    lastSyncedAt: generationOk ? finishedAt : null,
  });
  const syncRun = await insertIntegrationSyncRun({
    provider: "guru",
    connectionId: connection.connection?.id || null,
    status: generationOk ? "success" : "failure",
    payload: {
      startedAt,
      finishedAt,
      mode,
      ref,
      model: result.model,
      usageMetadata: result.usageMetadata || null,
    },
    errorMessage: generationOk ? null : failureReason,
  });

  if (isDraftMode) {
    // No project_updates row for drafts: the artifact is the work_orders proposal the cron
    // creates, and the cron logs its own agent_run. Writing a Daily Brief entry here too would
    // double-report the same draft.
    return NextResponse.json(
      buildDraftResponse({
        mode,
        ref,
        model: result.model,
        draft: parsedDraft,
        reason: draftOk ? "ok" : failureReason,
        persistence: { connection, syncRun, mentorUpdate: null },
      }),
      { status: draftHttpStatus(parsedDraft) },
    );
  }

  let mentorUpdate = null;

  if (result.ok && workspaceId) {
    mentorUpdate = await insertSupabaseRecord("project_updates", {
      workspace_id: workspaceId,
      project_id: null,
      source: "guru",
      event_type: "ai.sales_mentor",
      status: "reported",
      title: `Guru ${mode}${ref ? ` · ${ref}` : ""}`,
      summary: result.text.slice(0, 500),
      progress: null,
      milestone: null,
      next_action: null,
      payload: { mode, ref, model: result.model, text: result.text },
      happened_at: finishedAt,
    });
  }

  return NextResponse.json(
    {
      status: result.ok ? "generated" : "error",
      mode,
      ref,
      model: result.model,
      text: result.text,
      reason: result.reason,
      persistence: { connection, syncRun, mentorUpdate },
    },
    { status: result.ok ? 200 : 502 },
  );
}
