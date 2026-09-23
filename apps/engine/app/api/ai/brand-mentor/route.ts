import { NextResponse } from "next/server.js";
import { buildAdvisorySystemInstruction } from "../../../../lib/advisor-guardrails.ts";
import { formatLegendTriad } from "../../../../lib/legend-cards.ts";
import { parseCouncilResponse } from "../../../../lib/council-contract.ts";

// Gemini generations can legitimately run tens of seconds; cap the route
// so a hung upstream cannot pin a serverless invocation past a minute.
export const maxDuration = 60;

import {
  CONTENT_DRAFT_MODE,
  DRAFT_GENERATION_BOUNDS,
  buildContentDraftPrompt,
  buildDraftResponse,
  draftHttpStatus,
  parseContentDraft,
} from "../../../../lib/ai-draft-modes.ts";
import { generateGeminiText, getGeminiIntegrationStatus } from "../../../../lib/gemini.ts";
import { buildBusinessOpportunityCatchInstruction } from "../../../../lib/business-opportunity-catch.ts";
import {
  insertIntegrationSyncRun,
  resolveDefaultWorkspaceId,
  upsertIntegrationConnection,
} from "../../../../lib/integration-state.ts";
import { validateSharedWebhookRequest } from "../../../../lib/shared-webhook.ts";
import { insertSupabaseRecord } from "../../../../lib/supabase-rest.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Council brand-mentor — the general-purpose advisory layer for the operator's OWN brand
// work (창업 준비), explicitly distinct from the ClassIn sales Guru. Where Guru reasons over the
// revenue ledger with sales playbooks, the Council reasons over the content/brand/project ledger
// with brand-voice guardrails. Each mode leans on one advisor lens (Writer / Strategist / Analyst).
const MODES = {
  "content-critique": {
    lens: "Writer",
    question:
      "붙여 넣은 초안(제목·본문/슬라이드)을 브랜드 보이스 기준으로 진단하고, 더 좋게 만들 개선점 3가지를 제시하라. 훅·구조·구체성·CTA를 본다.",
    frames:
      "Ogilvy 카피(헤드라인이 80%, 구체적 사실), Miller StoryBrand SB7(독자=영웅, 브랜드=가이드), Sutherland 관점 전환, 한국어 에세이 호흡(짧은 문장·구체 예시).",
  },
  "brand-strategy": {
    lens: "Strategist",
    question:
      "브랜드/프로젝트 기록을 기준으로 이번 주 가장 먼저 손대야 할 브랜드 액션 3건과 그 이유를 우선순위로 제시하라. 정체된 프로젝트, 발행 케이던스 공백, 다음 마일스톤을 특히 본다.",
    frames:
      "Tracy 시간 우선순위(가장 임팩트 큰 일 먼저), Godin SVM(가장 작은 실행 가능한 시장), Collins 고슴도치(잘하는 것·열정·자원), Lemkin 케이던스 일관성.",
  },
  "audience-analysis": {
    lens: "Analyst",
    question:
      "콘텐츠 성과·구독/관심 신호·브랜드 키워드를 근거로 오디언스(고객)가 누구이고 무엇에 반응하는지 분석하고, 다음 콘텐츠/오퍼 가설 1개를 제시하라.",
    frames:
      "Sharp How Brands Grow(도달·가용성), Sherrington 카테고리 진입점(CEP), JTBD(고객이 고용하는 진짜 이유), Ariely 행동 신호 > 선언적 선호.",
  },
  "meeting-synthesis": {
    lens: "Strategist",
    question:
      "붙여 넣은 회의록/메모를 결정·오너·기한이 분명한 액션으로 정리하라. 모호한 합의는 '확인 필요'로 표시하고, 빠진 결정이 있으면 지적하라.",
    frames:
      "Grove OKR(측정 가능한 결과), Doerr 책임자 1명 규칙, Bezos 가역/비가역 결정 구분, Decisive(Heath) WRAP(선택지 넓히기·검증).",
  },
  "flow-review": {
    lens: "Analyst",
    question:
      "아이디어 → 초안 → 검토 → 발행으로 이어지는 브랜드 운영 플로우 전체를 점검하고, 가장 큰 병목 1곳과 그것을 줄일 자동화/루틴 1개를 제시하라.",
    frames:
      "Goldratt 제약 이론(병목이 처리량을 결정), Reinertsen 큐 길이·배치 축소, Kim 흐름의 원칙(작은 배치·빠른 피드백), Lean 핸드오프 낭비 제거.",
  },
  "sparring": {
    lens: "Debate",
    question:
      "제공된 초안 또는 프로젝트/오퍼에 대해 3자 균형 토론(스파링)을 진행하라. 칭찬이나 에코챔버 없이, [Strategist 추진 논거] vs [Devil's Advocate 맹점·비판·실패 리스크] vs [Operator 1단계 검증 행동]으로 날카롭게 격돌하라.",
    frames:
      "Godin SVM(가장 작은 실행 가능한 시장) & Collins 고슴도치 vs Voss 협상 저항 & Ziglar 5장애물 & Goldratt 병목 vs Grove OKR & Bezos 가역적 결정.",
  },
} as const;

type Mode = keyof typeof MODES;

const SYSTEM_INSTRUCTION = [
  "당신은 Moonlight 운영자(파운더)의 브랜드 카운슬(Council)입니다 — Writer·Strategist·Analyst가 함께 의논하는 자문단.",
  "노련한 편집장·브랜드 전략가처럼 직설적이고 구체적으로, 한국어로 조언합니다.",
  "칭찬·일반론·마케팅 카피는 금지하고 항상 '다음 한 수'로 끝맺습니다.",
  "이 자문은 운영자의 개인 브랜드/창업 준비(시나브로·고래·HolyFunCollector·22nomad 등)에 대한 것입니다. ClassIn 회사 영업 lane과 섞어 판단하지 않습니다.",
  "판단 프레임은 브랜드·콘텐츠·전략 구루 플레이북에서 가져오되, 사실(프로젝트 상태·발행 케이던스·콘텐츠 큐)은 제공된 ledger snapshot에서만 인용하고, 데이터에 없는 사실은 단정하지 않습니다.",
  "context.brand 가드레일(voice·rules·forbidden)을 반드시 지킵니다. 금지 표현(과장·보장·단정, 혁신적·차세대·시너지 같은 default SaaS 톤)을 쓰지 않습니다.",
  "콘텐츠 발행·외부 전달은 human approval gate 이후의 실행으로 표기합니다. 직접 발행하라고 지시하지 말고 Moonlight work_orders 승인 큐에 올릴 액션으로 제안합니다.",
  "근거가 된 프레임/렌즈는 한 줄로 출처를 밝힙니다 (예: \"Writer 렌즈 · Ogilvy 헤드라인 기준\").",
  "context.memory.recent_runs(이전 자문)와 중복되지 않게 연속성을 유지합니다.",
  "context.missing[]에 적힌 소스는 데이터 공백이므로 그 슬라이스의 사실은 추정하지 않습니다.",
].join("\n");

async function readJson(req: Request) {
  const text = await req.text();
  return text ? JSON.parse(text) : {};
}

// Resolve an advisory lens, or null when the caller asked for something this route does not
// implement. Deliberately NOT a silent fallback — see the sibling note in sales-mentor:
// the content-flywheel cron shipped against a 'content-draft' mode that did not exist here and
// the old fallback quietly answered with brand-strategy prose every single night.
function resolveAdvisoryMode(value: unknown): Mode | null {
  const key = typeof value === "string" ? value.trim() : "";
  if (!key) return "brand-strategy";
  return (key in MODES ? key : null) as Mode | null;
}

// Readable digest of the assembled brand context, so the model attends to the brand
// guardrails / cadence / project bottlenecks instead of only the raw JSON blob.
// Defensive: every slice optional.
function digestBrand(context: any): string {
  if (!context || typeof context !== "object") return "";
  const lines: string[] = [];

  const brand = context.brand;
  if (brand && (brand.forbidden?.length || brand.rules?.length || brand.voice)) {
    lines.push(
      `브랜드 가드레일 (${brand.name ?? brand.key ?? "brand"}): 보이스=${brand.voice || "-"} · 금지=${(brand.forbidden ?? []).join(", ") || "-"}`,
    );
  }

  const cadence = context.content?.cadence_status;
  if (cadence) lines.push(`발행 케이던스: ${cadence}`);

  const ideas = context.content?.idea_queue_top;
  if (Array.isArray(ideas) && ideas.length) {
    lines.push(`아이디어 큐 상위: ${ideas.slice(0, 4).map((i: any) => i.title ?? "?").join(" · ")}`);
  }

  const projects = context.projects;
  if (Array.isArray(projects) && projects.length) {
    const stalled = projects.filter((p: any) => p.status === "In progress" || p.status === "Review" || p.status === "Blocked");
    lines.push(`브랜드 프로젝트 ${projects.length}건 (진행/검토 ${stalled.length}건)`);
    const focus = stalled.slice(0, 4).map((p: any) => `${p.name}(${p.status}·${p.progress ?? 0}%)`).join(" · ");
    if (focus) lines.push(`주목 프로젝트: ${focus}`);
  }

  const runs = context.memory?.recent_runs;
  if (Array.isArray(runs) && runs.length) {
    lines.push(`이전 자문 ${runs.length}건 기록됨 — 연속성을 유지하고 같은 조언을 반복하지 마라.`);
  }

  const focus = context.focus;
  if (focus && focus.found) {
    lines.push(`포커스: ${focus.entity?.name ?? "?"} · ${focus.entity?.status ?? "?"} · 다음=${focus.entity?.nextAction || "미정"}`);
  }

  const missing = context.missing;
  if (Array.isArray(missing) && missing.length) {
    lines.push(`데이터 공백(추정 금지): ${missing.map((m: any) => m.source).join(", ")}`);
  }

  return lines.length ? ["브랜드 컨텍스트 요약:", ...lines].join("\n") : "";
}

function buildPrompt(mode: Mode, context: unknown, draft?: string | null, legendIds?: string[]) {
  const config = MODES[mode];
  const isCouncil = mode === "sparring" || (Array.isArray(legendIds) && legendIds.length > 0);
  const lines = [
    config.question,
    buildBusinessOpportunityCatchInstruction({ surface: "brand", mode, context }),
    "",
    `자문 렌즈: ${config.lens}`,
    `참고 프레임: ${config.frames}`,
    "",
    ...(isCouncil
      ? [
          "당신은 평범한 AI 챗봇이 아닙니다. 실리콘밸리와 글로벌 최상위 0.01% 경영진의 비밀 이사회(Council)로서 잡담과 인사말, 영혼 없는 칭찬을 100% 배제하고 가장 날카로운 지적 긴장감으로 응답하십시오.",
          "반드시 다음 [카운슬 4단계 출력 표준 계약] 형식의 한국어로 답하라 (공백 포함 700자 이내):",
          "### 1. 관점별 진단 (각 1~2문장)",
          "- **[관점/레전드 A]**: (핵심 가치 기준 진단 및 추진 논거) / (감수할 비용 및 버릴 것)",
          "- **[관점/레전드 B]**: (가장 아픈 사각지대 지적 및 치명적 실패 리스크) / (보호해야 할 기준)",
          "- **[관점/레전드 C]**: (현실적 실행 기준과 병목 해소 전략) / (가역적 실험 조건)",
          "",
          "### 2. 남은 이견 (Dissent & Divergence)",
          "- 타협되지 않는 상충점과 치명적 리스크 1문장 (가짜 합의, \"모두 동의함\" 절대 금지)",
          "",
          "### 3. 조건부 결론 (Conditional Verdict)",
          "- \"만약 [관찰 사건 X]라면 A로 가고, [관찰 사건 Y]라면 B의 경고를 수용해 보류한다.\" (Type 1 비가역 vs Type 2 가역 명시)",
          "",
          "### 4. 1단계 검증 행동 (Unified Next Step)",
          "- 오늘 30분 내 0원으로 즉시 실행할 수 있는 가장 작은 행동 1개 + 가설 반증 질문 1문장",
        ]
      : [
          "당신은 평범한 AI 챗봇이 아닙니다. 노련하고 냉철한 1인 창업·브랜드 전략가로서, 잡담과 인사말, 영혼 없는 칭찬을 100% 배제하고 가장 날카로운 통찰을 제시하십시오.",
          "다음 형식의 한국어로 답하라 (공백 포함 600자 이내):",
          "1. 진단 (지금 무엇이 보이고 무엇을 착각하고 있는가 — 프레임워크 출처 명시)",
          "2. 리스크 (놓치면 잃는 것과 당장 삭제해야 할 사족/집착 90%)",
          "3. 다음 액션 (오늘 30분 내 1단계 가역적 행동 1개 + 독자/고객 반응 검증 질문 1문장)",
          "4. 승인 큐 후보 (work_order로 올릴 제목 1개와 gate/human approval 표기)",
        ]),
  ];

  if (legendIds && legendIds.length > 0) {
    const formattedLegends = formatLegendTriad(legendIds);
    if (formattedLegends) {
      lines.push("", "적용할 레전드 마이크로 카드 (가치관·비용·판단 질문):", formattedLegends);
    }
  }

  if (draft && draft.trim()) {
    const label = mode === "meeting-synthesis" ? "정리할 회의록/메모:" : "검토할 초안:";
    lines.push("", label, draft.trim());
  }

  const digest = digestBrand(context);
  if (digest) {
    lines.push("", digest);
  }

  lines.push("", "Brand ledger snapshot:", JSON.stringify(context ?? {}, null, 2));
  return lines.join("\n");
}

export async function GET() {
  return NextResponse.json({
    service: "com-moon-engine",
    integration: "gemini",
    agent: "council",
    modes: Object.keys(MODES),
    draftModes: [CONTENT_DRAFT_MODE],
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
  const isDraftMode = requestedMode === CONTENT_DRAFT_MODE;
  const advisoryMode = isDraftMode ? null : resolveAdvisoryMode(payload.mode);

  // Unknown modes are refused before any provider call (never silently swapped for an
  // advisory lens). The body names what this route does implement.
  if (!isDraftMode && !advisoryMode) {
    return NextResponse.json(
      {
        status: "invalid-input",
        error: "unsupported-mode",
        detail: `Unsupported mode '${requestedMode}'.`,
        modes: Object.keys(MODES),
        draftModes: [CONTENT_DRAFT_MODE],
      },
      { status: 400 },
    );
  }

  const mode = isDraftMode ? CONTENT_DRAFT_MODE : (advisoryMode as Mode);
  const ref = typeof payload.ref === "string" ? payload.ref.trim() || null : null;
  const draft = typeof payload.draft === "string" ? payload.draft : null;
  const legendIds = Array.isArray(payload.legendIds) ? payload.legendIds : [];
  const context = payload.context ?? {};
  const workspaceId = resolveDefaultWorkspaceId();
  const maxOutputTokens =
    typeof payload.maxOutputTokens === "number" ? payload.maxOutputTokens : 8192;

  // `council`은 MODES 키가 아니라 resolveAdvisoryMode가 위에서 400으로 끊는다 — 여기서 다시
  // 받아주면 이 route가 그 mode를 여전히 지원하는 것처럼 읽힌다.
  const isCouncilMode = mode === "sparring" || legendIds.length > 0;
  const explicitDirectives = payload.directives ?? (payload.values || payload.knowledge ? { values: payload.values, knowledge: payload.knowledge } : null);
  const combinedDirectives = explicitDirectives ? {
    ...explicitDirectives,
    values: {
      ...explicitDirectives.values,
      legendIds: explicitDirectives.values?.legendIds ?? (legendIds.length ? legendIds : undefined),
    },
  } : (legendIds.length ? { values: { legendIds } } : undefined);

  const systemInstruction = isDraftMode
    ? SYSTEM_INSTRUCTION
    : buildAdvisorySystemInstruction({
        type: isCouncilMode ? "council" : "brand-mentor",
        mode,
        context,
        directives: combinedDirectives,
      });

  const startedAt = new Date().toISOString();
  // The draft mode asks for JSON at the API layer with a capped thinking budget; the advisory
  // lenses stay free-form prose for the chat pane, under the advisory guardrails/directives.
  const result = await generateGeminiText(
    isDraftMode
      ? {
          systemInstruction,
          prompt: buildContentDraftPrompt(context),
          maxOutputTokens,
          ...DRAFT_GENERATION_BOUNDS,
        }
      : {
          systemInstruction,
          prompt: buildPrompt(mode as Mode, context, draft, legendIds),
          maxOutputTokens,
        },
  );
  const councilAnalysis = (isCouncilMode && result.ok && !isDraftMode) ? parseCouncilResponse(result.text) : null;
  const finishedAt = new Date().toISOString();

  // Parse before the telemetry writes so a well-formed HTTP 200 carrying unparseable JSON is
  // recorded as the failure it is, instead of showing the integration as healthy.
  const parsedDraft = isDraftMode && result.ok ? parseContentDraft(result.text) : null;
  const draftOk = isDraftMode ? Boolean(parsedDraft) : false;
  const generationOk = isDraftMode ? draftOk : result.ok;
  const failureReason =
    isDraftMode && result.ok && !draftOk ? "invalid-draft-json" : result.reason;

  const connection = await upsertIntegrationConnection({
    provider: "council",
    status: generationOk ? "connected" : "error",
    config: {
      ...getGeminiIntegrationStatus(),
      agent: "council",
      lastResult: { ok: generationOk, status: result.status, reason: failureReason, mode },
    },
    lastSyncedAt: generationOk ? finishedAt : null,
  });
  const syncRun = await insertIntegrationSyncRun({
    provider: "council",
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
    // creates, and the cron logs its own agent_run.
    return NextResponse.json(
      buildDraftResponse({
        mode,
        ref,
        model: result.model,
        draft: parsedDraft,
        reason: draftOk ? "ok" : failureReason,
        persistence: { connection, syncRun, councilUpdate: null },
      }),
      { status: draftHttpStatus(parsedDraft) },
    );
  }

  let councilUpdate = null;

  if (result.ok && workspaceId) {
    councilUpdate = await insertSupabaseRecord("project_updates", {
      workspace_id: workspaceId,
      project_id: null,
      source: "council",
      event_type: "ai.brand_mentor",
      status: "reported",
      title: `Council ${mode}${ref ? ` · ${ref}` : ""}`,
      summary: result.text.slice(0, 500),
      progress: null,
      milestone: null,
      next_action: "Council 자문의 다음 액션을 브랜드 프로젝트/콘텐츠에 반영하세요.",
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
      ...(councilAnalysis ? { council: councilAnalysis } : {}),
      reason: result.reason,
      persistence: { connection, syncRun, councilUpdate },
    },
    { status: result.ok ? 200 : 502 },
  );
}
