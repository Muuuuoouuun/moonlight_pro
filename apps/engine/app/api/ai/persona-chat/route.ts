import { NextResponse } from "next/server";

export const maxDuration = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { generateGeminiText, getGeminiIntegrationStatus } from "../../../../lib/gemini";
import {
  insertIntegrationSyncRun,
  resolveDefaultWorkspaceId,
  upsertIntegrationConnection,
} from "../../../../lib/integration-state";
import { validateSharedWebhookRequest } from "../../../../lib/shared-webhook";
import {
  insertSupabaseRecord,
  fetchSupabaseRowsDetailed,
} from "../../../../lib/supabase-rest.ts";
import { retrieveKnowledge, type KnowledgeItem } from "../../../../lib/knowledge-retriever.ts";
import { buildBusinessOpportunityCatchInstruction } from "../../../../lib/business-opportunity-catch.ts";

const PERSONA_PROFILES: Record<string, { nameKo: string; role: string; systemPrompt: string; defaultAction: string }> = {
  order: {
    nameKo: "오더 (Dispatch)",
    role: "신호 수집, 작업지시서 발행, 우선순위 조립, 최소 활성 페르소나 선택",
    systemPrompt: `당신은 Moonlight OS의 '오더(Dispatch)' 페르소나입니다.
- 업무: 운영 신호(딜, 콘텐츠, 고객, 마일스톤)를 분석해 명확한 작업지시서(work_order)와 우선순위를 조립합니다.
- 원칙: 모든 일에 전원을 호출하지 않고, 건별 성격에 맞는 최소 집합만 활성화합니다. 고객 발송 등 되돌릴 수 없는(One-way door) 행동은 반드시 운영자 인간 승인 게이트를 둡니다.
- 형식: [1. 신호 분석] -> [2. 우선순위 판정] -> [3. 활성 페르소나 지정 (세일즈/콘텐츠 등)] -> [4. 작업지시서 초안 및 핸드오프].`,
    defaultAction: "오늘의 우선순위 작업지시서 조립",
  },
  sales: {
    nameKo: "세일즈 (Deals & Follow-up)",
    role: "딜 다음 행동, 반론 대응, 팔로업 위생, 구매자 의사결정 스타일 맞춤",
    systemPrompt: `당신은 Moonlight OS의 '세일즈(Deals)' 페르소나입니다.
- 업무: 딜 파이프라인에서 막힌 지점을 뚫고, 고객 반론에 대응하며, 최적의 후속 조치(Follow-up)를 설계합니다.
- 원칙: 닐 랙햄의 SPIN 질문 체계(Situation, Problem, Implication, Need-Payoff)와 크리스 보스의 Calibrated question('어떻게'/'무엇을')을 적용합니다. 고객 직접 발송이나 CRM 최종 수정은 운영자 승인을 전제로 합니다.
- 형식: [1. 딜 현주소] -> [2. 고객 저항/반론 핵심] -> [3. 추천 대화 스크립트/다음 행동] -> [4. 후속 시점 및 기록 등록 아이템].`,
    defaultAction: "정체 딜 반론 대응 및 다음 행동 설계",
  },
  content: {
    nameKo: "콘텐츠 (Ideas & Cadence)",
    role: "아이디어 큐 관리, 발행 케이던스 점검, 앵글 및 오디언스 가설 기획",
    systemPrompt: `당신은 Moonlight OS의 '콘텐츠(Content)' 페르소나입니다.
- 업무: 단순 대필이 아닌, 독자에게 명확한 가치를 주는 앵글과 케이던스(발행 주기)를 관리합니다.
- 원칙: David Ogilvy의 사실 중심 카피, Seth Godin의 SVM(가장 작은 유효 시장), Donald Miller의 StoryBrand SB7(캐릭터-문제-가이드-계획-행동촉구-성공/실패 회피) 구조를 적용합니다.
- 형식: [1. 핵심 앵글/가설] -> [2. 타겟 오디언스] -> [3. 훅과 스토리 개요] -> [4. 제작(Production) 핸드오프 가이드].`,
    defaultAction: "아이디어 앵글 기획 및 발행 큐 점검",
  },
  production: {
    nameKo: "제작 (Asset Scaffold)",
    role: "승인된 앵글을 채널별 포맷 골격(카드뉴스, 릴스, 스레드)으로 구조화",
    systemPrompt: `당신은 Moonlight OS의 '제작(Production)' 페르소나입니다.
- 업무: 콘텐츠 앵글을 채널 맞춤형 포맷(카드뉴스 5장 슬라이드, 스레드 분할, 숏폼 릴스 대본 구조)으로 뼈대를 잡습니다.
- 원칙: 발행 마찰을 제거하되 원문의 사실과 핵심 메시지를 훼손하지 않습니다.
- 형식: [1. 채널/포맷] -> [2. 슬라이드별/스레드별 헤드라인 및 본문 골격] -> [3. 시각화/제작 가이드] -> [4. 검수(Review) 핸드오프 요청안].`,
    defaultAction: "채널별 포맷 골격(카드뉴스/스레드) 변환",
  },
  review: {
    nameKo: "검수 (Review & Gate)",
    role: "내부 브랜드·사실 셀프리뷰 및 외부 아웃바운드 게이트 판정",
    systemPrompt: `당신은 Moonlight OS의 '검수(Review)' 페르소나입니다.
- 업무: 초안이나 제안서가 브랜드 가드레일을 준수하는지, 사실에 근거하는지, 고객에게 나갈 준비가 되었는지 검증합니다.
- 원칙: 과장/보장/단정 표현, 상투적 SaaS 문구(혁신적, 차세대, 시너지 등)를 적발하고 구체적 대안을 제시합니다.
- 게이트: [PASS | REVISE | NEEDS_HUMAN] 중 하나를 첫머리에 명확히 선언합니다.
- 형식: [1. 게이트 판정 결과 (PASS/REVISE/NEEDS_HUMAN)] -> [2. 사실 근거 및 과장 표현 검수] -> [3. 구체적 수정 권고안] -> [4. 승인 조건].`,
    defaultAction: "사실 기반 및 브랜드 가드레일 검수",
  },
  council: {
    nameKo: "Council (전략 자문단)",
    role: "Writer · Strategist · Analyst 종합 합의 및 3자 토론",
    systemPrompt: `당신은 Moonlight 파운더의 'Council(전략 자문단)'입니다.
- 구성: Writer(표현/메시지), Strategist(방향/우선순위), Analyst(데이터/병목)가 함께 의논합니다.
- 업무: 비즈니스 기록과 운영 상태를 종합 진단하고, 다각도 검토와 합의를 도출합니다.`,
    defaultAction: "Council 종합 진단 및 전략 자문",
  },
  guru: {
    nameKo: "Guru (영업 멘토)",
    role: "B2B 영업 파이프라인 진단 및 실전 클로징 코칭",
    systemPrompt: `당신은 Moonlight의 'Guru(영업 멘토)'입니다.
- 12인 세일즈 구루 프레임워크(Voss, Rackham, Keenan, Belfort, Cardone 등)를 바탕으로 날카로운 영업 코칭을 제공합니다.`,
    defaultAction: "영업 파이프라인 코칭 및 다음 수 설계",
  },
};

const LEGEND_LENSES: Record<string, { nameKo: string; rule: string }> = {
  jobs: {
    nameKo: "스티브 잡스 (경험과 단순성)",
    rule: "기술 나열이나 부가 기능을 쳐내고, 사용자가 직관적으로 사랑할 수 있는 단순하고 완전한 사용자 경험에 집중하라.",
  },
  bezos: {
    nameKo: "제프 베이조스 (장기 고객가치 & 가역성)",
    rule: "당장의 편의보다 장기적인 고객 가치를 우선하고, 되돌릴 수 있는 결정(Type 2)은 빠르게 실험하며 되돌릴 수 없는 결정(Type 1)은 극도로 신중하라.",
  },
  chouinard: {
    nameKo: "이본 쉬나드 (목적의 지속성 & 단순한 해법)",
    rule: "불필요한 성장을 경계하고, 본래의 목적과 윤리적 일치성을 지키며 가장 튼튼하고 단순한 방식으로 문제를 해결하라.",
  },
  socrates: {
    nameKo: "소크라테스 (지적 정직성)",
    rule: "모르는 것을 안다고 착각하지 말고, 선택의 전제를 집요하게 질문하여 스스로 명료하게 설명할 수 있는지 점검하라.",
  },
  voss: {
    nameKo: "크리스 보스 (협상과 저항 극복)",
    rule: "상대의 거절(No)을 두려워하지 말고 시작점으로 삼아라. 감정을 라벨링하고, '어떻게'/'무엇을' 질문으로 상대가 스스로 주도권을 쥐게 하라.",
  },
  ogilvy: {
    nameKo: "데이비드 오길비 (사실 기반 카피)",
    rule: "헤드라인이 80%다. 모호한 형용사나 미사여구를 배제하고 구체적인 숫자와 검증된 사실로 고객의 마음을 움직여라.",
  },
  godin: {
    nameKo: "세스 고딘 (가장 작은 유효 시장)",
    rule: "모두를 위한 것은 누구를 위한 것도 아니다. 가장 작지만 확실히 반응할 핵심 고객을 정의하고 그들에게 필수적인 존재가 되라.",
  },
  rackham: {
    nameKo: "닐 랙햄 (SPIN 질문법)",
    rule: "제품을 설명하려 들지 말고 질문하라: 상황(Situation) -> 문제(Problem) -> 시사점(Implication) -> 해결가치(Need-Payoff).",
  },
  goldratt: {
    nameKo: "엘리 골드랫 (제약 이론)",
    rule: "시스템의 처리량을 결정하는 것은 단 하나의 병목(Bottleneck)이다. 다른 곳을 개선하는 것은 착시일 뿐이다. 병목에만 집중하라.",
  },
};

function buildPrompt({
  personaId,
  mode,
  lens,
  message,
  context,
  draft,
  ragSnippets,
}: {
  personaId: string;
  mode: string;
  lens?: string | null;
  message?: string | null;
  context?: any;
  draft?: string | null;
  ragSnippets?: KnowledgeItem[];
}) {
  const profile = PERSONA_PROFILES[personaId] || PERSONA_PROFILES.order;
  const lines: string[] = [];

  lines.push(`[담당 페르소나]: ${profile.nameKo}`);
  lines.push(`[작업 모드]: ${mode.toUpperCase()}`);

  if (lens && LEGEND_LENSES[lens]) {
    const l = LEGEND_LENSES[lens];
    lines.push(`[적용할 사상가/구루 렌즈]: ${l.nameKo}`);
    lines.push(`- 판단 기준: ${l.rule}`);
  }

  lines.push("");

  // Mode instructions
  if (mode === "critique") {
    lines.push(
      "【평가/진단 모드】",
      "제공된 초안, 딜 또는 기획에 대해 냉철한 비판적 검수자(Critique) 관점에서 답변하라:",
      "1. 🚨 [치명적 맹점 및 리스크] (고객이 거절할 이유, 논리적 비약, 실행 실패 요인)",
      "2. ⚠️ [개선 필요 지점] (모호한 표현, 입증되지 않은 주장, 브랜드 가드레일 위반)",
      "3. ✅ [합격 판정 및 수정 가이드] (PASS / REVISE / HOLD 판정과 함께 즉시 고쳐야 할 구체적 문장)",
    );
  } else if (mode === "sparring") {
    lines.push(
      "【3자 토론 (스파링) 모드】",
      "찬반과 검증 행동이 명확히 격돌하는 3단 구조로 답변하라 (칭찬·잡담 금지):",
      "1. 🟢 [추진 논거 (Strategist)] (왜 이 방향이 유효한가, 잠재 기회와 고객 가치)",
      "2. 🔴 [Devil's Advocate 맹점/비판] (숨은 비용, 실패 가능성, 타협하면 안 되는 약점)",
      "3. 🟡 [1단계 가역적 검증 행동 (Operator)] (위험을 줄이며 이번 주 안에 검증할 1가지 실험과 관찰 질문)",
    );
  } else if (mode === "weekly-review") {
    lines.push(
      "【한 주 정리 & 사실 기반 자동 평가 모드】",
      "기록을 분석하여 과장 없는 팩트 중심 평가와 다음 주 실험을 도출하라:",
      "1. 📊 [이번 주 실행 팩트 요약] (완료된 작업, 진척된 딜/콘텐츠, 실제 일어난 결과)",
      "2. 🔍 [냉철한 병목 및 패턴 진단] (어디서 정체가 발생했는지, 반복된 지연 원인 분석 - 인격/의지 비난 금지)",
      "3. 🎯 [다음 주 Council 조언: 단 1가지 가역적 실험]",
      "반드시 다음 주에 집중할 단 1가지 가역적 실험을 아래 형식으로 명확히 제시하라:",
      "📌 다음 주 단 1가지 실험: [구체적 실험 제목]",
      "완료 기준: [완료 여부를 판단할 구체적 기준]",
    );
  } else if (mode === "advice") {
    lines.push(
      "【실행 조언 모드】",
      "어떻게 풀어갈지 실천 가능한 가이드와 다음 한 수를 제시하라:",
      "1. 💡 [핵심 방향 진단] (지금 가장 중요한 한 가지)",
      "2. 🎯 [실행 가능한 다음 한 수 1~3가지] (구체적 행동, 담당, 기한)",
      "3. 📋 [등록할 할 일(Task) 제안]",
      "Moonlight 기록에 바로 등록할 단 하나의 핵심 태스크를 아래 형식으로 제시하라:",
      "📌 추천 태스크: [구체적 태스크 제목]",
    );
  } else {
    // Default chat
    lines.push(
      "【업무 협업 대화 모드】",
      "페르소나의 전문 역할에 충실하게, 불필요한 서두 없이 직설적이고 명료하게 실전 답변을 제공하라.",
    );
  }

  lines.push("");

  if (ragSnippets && ragSnippets.length > 0) {
    lines.push("【🔍 관련 과거 메모 및 패턴 참고 (RAG Grounding)】:");
    for (const item of ragSnippets) {
      lines.push(`- [${item.sourceTable}:${item.id} | ${item.kind} | ${item.occurredAt ? item.occurredAt.slice(0, 10) : "날짜 미제공"}] ${item.title}: "${item.snippet}"`);
    }
    lines.push("");
  }

  if (message && message.trim()) {
    lines.push("【사용자 요청 / 질문】:", message.trim(), "");
  }

  if (draft && draft.trim()) {
    lines.push("【검토 대상 초안 / 데이터】:", draft.trim(), "");
  }

  if (context && typeof context === "object") {
    lines.push("【현재 작업 기록 스냅샷 (Ledger Context)】:");
    lines.push(JSON.stringify(context, null, 2));
  }

  return lines.join("\n");
}

export async function GET() {
  return NextResponse.json({
    service: "com-moon-engine",
    integration: "gemini",
    endpoint: "persona-chat",
    personas: Object.keys(PERSONA_PROFILES),
    lenses: Object.keys(LEGEND_LENSES),
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
    const text = await req.text();
    payload = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ status: "invalid-json", error: "Request body must be valid JSON." }, { status: 400 });
  }

  const personaId = typeof payload.personaId === "string" && payload.personaId in PERSONA_PROFILES ? payload.personaId : "order";
  const mode = typeof payload.mode === "string" ? payload.mode : "advice";
  const lens = typeof payload.lens === "string" && payload.lens in LEGEND_LENSES ? payload.lens : null;
  const message = typeof payload.message === "string" ? payload.message : null;
  const draft = typeof payload.draft === "string" ? payload.draft : null;
  const context = payload.context ?? {};
  const workspaceId = resolveDefaultWorkspaceId();

  let ragSnippets: KnowledgeItem[] = [];
  if (workspaceId && (message || draft || context?.summary || context?.title)) {
    const searchQuery = [message, draft, context?.title, context?.summary].filter(Boolean).join(" ");
    try {
      const ragResult = await retrieveKnowledge(
        { workspaceId, query: searchQuery, filters: { limit: 4 } },
        { readTable: fetchSupabaseRowsDetailed }
      );
      if (ragResult.status === "live" && Array.isArray(ragResult.items)) {
        ragSnippets = ragResult.items;
      }
    } catch {
      // Non-blocking RAG failure
    }
  }

  const profile = PERSONA_PROFILES[personaId];
  const systemInstruction = [
    `당신은 Moonlight 개인 운영 OS의 전문 페르소나 [${profile.nameKo}]입니다.`,
    profile.systemPrompt,
    "운영자의 언어는 한국어이며, 실무적이고 직설적인 문체를 사용합니다.",
    "모호한 일반론이나 칭찬은 금지하고 항상 '다음 한 수'로 끝맺습니다.",
    "사실(기록 데이터)에 없는 내용을 지어내지 않으며, 외부 발송/공개 행동은 인간 승인 게이트(Human Approval)를 거치도록 제안합니다.",
    buildBusinessOpportunityCatchInstruction({ surface: "persona", personaId, mode, context }),
  ].join("\n\n");

  const prompt = buildPrompt({ personaId, mode, lens, message, context, draft, ragSnippets });
  const startedAt = new Date().toISOString();

  const isThinkingRole = personaId === "council" || personaId === "guru" || mode === "sparring" || mode === "weekly-review";
  const modelToUse = typeof payload.model === "string" && payload.model.trim()
    ? payload.model.trim()
    : isThinkingRole
    ? (process.env.GEMINI_PRO_MODEL?.trim() || "gemini-3.1-pro-preview")
    : (process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash");

  const result = await generateGeminiText({
    systemInstruction,
    prompt,
    model: modelToUse,
    maxOutputTokens: typeof payload.maxOutputTokens === "number" ? payload.maxOutputTokens : 8192,
  });

  const finishedAt = new Date().toISOString();

  const connection = await upsertIntegrationConnection({
    provider: `persona_${personaId}`,
    status: result.ok ? "connected" : "error",
    config: {
      ...getGeminiIntegrationStatus(),
      agent: personaId,
      mode,
      lens,
      lastResult: { ok: result.ok, status: result.status, reason: result.reason },
    },
    lastSyncedAt: result.ok ? finishedAt : null,
  });

  await insertIntegrationSyncRun({
    provider: `persona_${personaId}`,
    connectionId: connection.connection?.id || null,
    status: result.ok ? "success" : "failure",
    payload: {
      startedAt,
      finishedAt,
      personaId,
      mode,
      lens,
      model: result.model,
      usageMetadata: result.ok ? result.usageMetadata : null,
    },
    errorMessage: result.ok ? null : result.reason,
  });

  if (result.ok && workspaceId && (mode === "weekly-review" || mode === "sparring")) {
    await insertSupabaseRecord("project_updates", {
      workspace_id: workspaceId,
      project_id: null,
      source: `persona.${personaId}`,
      event_type: `ai.${mode}`,
      status: "reported",
      title: `${profile.nameKo} · ${mode === "weekly-review" ? "한 주 정리" : "스파링 토론"}${lens ? ` (${LEGEND_LENSES[lens]?.nameKo})` : ""}`,
      summary: result.text.slice(0, 500),
      progress: null,
      milestone: null,
      next_action: "제안된 다음 액션을 할 일 또는 작업지시서에 반영하세요.",
      payload: { personaId, mode, lens, model: result.model, text: result.text },
      happened_at: finishedAt,
    });
  }

  return NextResponse.json({
    status: result.ok ? "generated" : "error",
    personaId,
    mode,
    lens,
    model: result.model,
    text: result.text,
    reason: result.reason,
    startedAt,
    finishedAt,
  }, { status: result.ok ? 200 : 502 });
}
