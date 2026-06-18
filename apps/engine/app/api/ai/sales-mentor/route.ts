import { NextResponse } from "next/server";

import { generateGeminiText, getGeminiIntegrationStatus } from "../../../../lib/gemini";
import {
  insertIntegrationSyncRun,
  resolveDefaultWorkspaceId,
  upsertIntegrationConnection,
} from "../../../../lib/integration-state";
import { validateSharedWebhookRequest } from "../../../../lib/shared-webhook";
import { insertSupabaseRecord } from "../../../../lib/supabase-rest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mentor modes — see docs/sales-guru-mentor-agent-plan.md §5 / §14.
// Each mode declares the question and which knowledge-base frames to lean on.
const MODES = {
  "pipeline-triage": {
    question:
      "이번 주 가장 먼저 손대야 할 딜 3건과 그 이유를 우선순위로 제시하라. 정체·금액·접촉 공백을 근거로 삼아라.",
    frames: "Cardone 10X Contact(80%는 5번째 이후 접촉), Ross MEDDIC 자격, Tracy 시간 우선순위.",
  },
  "deal-review": {
    question:
      "이 딜의 정체 원인을 진단하고, 다음 미팅 전 해야 할 액션을 제시하라. 가능하면 구매자 의사결정 스타일을 먼저 추정하고 같은 액션을 그 스타일의 언어로 번역하라.",
    frames:
      "Keenan GAP 4층(표면→프로세스→매출 영향→개인 임팩트), Voss 보정된 질문, Belfort 확신 온도(제품·사람·회사), Ziglar 5장애물(No need/money/hurry/desire/trust), 의사결정 7스타일(논리·관계·권위·직관·안정·체면·집단합의).",
  },
  "proposal-critique": {
    question:
      "붙여 넣은 초안의 구조와 설득력을 진단하고 개선점 3가지를 제시하라.",
    frames:
      "Miller StoryBrand SB7(고객=영웅, 브랜드=가이드, 외부·내부·철학 문제), Ogilvy 카피(헤드라인이 80%, 구체적 사실), Rackham SPIN·Benefit, Godin SVM(가장 작은 실행 가능한 시장).",
  },
  "weekly-retro": {
    question:
      "지난 주 딜 이동과 won/lost에서 패턴을 찾고, 다음 주에 시도할 실험 1개를 제시하라.",
    frames:
      "Girard 팔로업·고객 파일, Lemkin churn·expansion, Hill 목표 재정렬.",
  },
} as const;

type Mode = keyof typeof MODES;

const SYSTEM_INSTRUCTION = [
  "당신은 Moonlight 운영자(파운더)의 영업 멘토입니다.",
  "노련한 세일즈 코치처럼 직설적이고 구체적으로, 한국어로 조언합니다.",
  "칭찬·일반론·마케팅 카피는 금지하고 항상 '다음 한 수'로 끝맺습니다.",
  "판단 프레임은 12인 세일즈 구루 플레이북에서 가져오되, 사실(딜 상태·금액·접촉 이력)은",
  "제공된 ledger snapshot에서만 인용하고, 데이터에 없는 사실은 단정하지 않습니다.",
  "근거가 된 프레임은 한 줄로 출처를 밝힙니다 (예: \"Keenan 4층 기준 Layer 3이 비어 있음\").",
].join("\n");

async function readJson(req: Request) {
  const text = await req.text();
  return text ? JSON.parse(text) : {};
}

function normalizeMode(value: unknown): Mode {
  const key = typeof value === "string" ? value.trim() : "";
  return (key in MODES ? key : "pipeline-triage") as Mode;
}

function buildPrompt(mode: Mode, context: unknown, draft?: string | null) {
  const config = MODES[mode];
  const lines = [
    config.question,
    "",
    `참고 프레임: ${config.frames}`,
    "",
    "다음 형식의 한국어로 답하라:",
    mode === "deal-review" ? "0. 구매자 스타일 (추정/미확인 표기)" : null,
    "1. 진단 (지금 무엇이 보이는가)",
    "2. 리스크 (놓치면 잃는 것)",
    "3. 다음 액션 (구체적 1~3개, 담당/기한 포함)",
  ].filter(Boolean);

  if (draft && draft.trim()) {
    lines.push("", "검토할 초안:", draft.trim());
  }

  lines.push("", "Sales ledger snapshot:", JSON.stringify(context ?? {}, null, 2));
  return lines.join("\n");
}

export async function GET() {
  return NextResponse.json({
    service: "com-moon-engine",
    integration: "gemini",
    agent: "guru",
    modes: Object.keys(MODES),
    status: getGeminiIntegrationStatus(),
  });
}

export async function POST(req: Request) {
  const auth = validateSharedWebhookRequest(req);

  if (!auth.ok) {
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

  const mode = normalizeMode(payload.mode);
  const ref = typeof payload.ref === "string" ? payload.ref.trim() || null : null;
  const draft = typeof payload.draft === "string" ? payload.draft : null;
  const context = payload.context ?? {};
  const workspaceId = resolveDefaultWorkspaceId();

  const startedAt = new Date().toISOString();
  const result = await generateGeminiText({
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt: buildPrompt(mode, context, draft),
    maxOutputTokens: typeof payload.maxOutputTokens === "number" ? payload.maxOutputTokens : 768,
  });
  const finishedAt = new Date().toISOString();

  const connection = await upsertIntegrationConnection({
    provider: "guru",
    status: result.ok ? "connected" : "error",
    config: {
      ...getGeminiIntegrationStatus(),
      agent: "guru",
      lastResult: { ok: result.ok, status: result.status, reason: result.reason, mode },
    },
    lastSyncedAt: result.ok ? finishedAt : null,
  });
  const syncRun = await insertIntegrationSyncRun({
    provider: "guru",
    connectionId: connection.connection?.id || null,
    status: result.ok ? "success" : "failure",
    payload: {
      startedAt,
      finishedAt,
      mode,
      ref,
      model: result.model,
      usageMetadata: result.ok ? result.usageMetadata : null,
    },
    errorMessage: result.ok ? null : result.reason,
  });

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
      next_action: "Guru 코칭의 다음 액션을 deal/account에 반영하세요.",
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
