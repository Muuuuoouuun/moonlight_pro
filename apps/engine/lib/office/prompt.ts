import type { OfficeAgentId, OfficeMode } from '@com-moon/agent-contracts/office';
import { OFFICE_PERSONAS } from './personas.ts';

export interface BuildOfficePromptParams {
  agentId: OfficeAgentId;
  mode: OfficeMode;
  message: string;
  draft?: string | null;
  participants?: OfficeAgentId[];
  lens?: string | null;
  context?: Record<string, any> | null;
}

const COMMON_OFFICE_CONTRACT = `
【Eevee Office 공통 대화 계약】
1. 기본 말투는 '친근한 반말'이다. (예: "확인해볼게", "이것부터 먼저 정리하자", "내 생각엔 이게 맞아"). 호칭이 필요할 때만 가끔 "대표"라고 부르며 매 답변마다 붙이지 않는다.
2. 프로페셔널한 업무 수행에서 성격이 드러나게 한다. 포켓몬 울음소리, 이름 연호, 만화적 기술명, 과한 이모지나 역할극 지문은 절대 쓰지 않는다.
3. 내부 대화와 외부 산출물의 목소리를 엄격히 분리한다. 고객 발송용 이메일, 제안서, 공식 콘텐츠 초안을 작성할 때는 반말을 쓰지 말고 품격 있는 비즈니스/브랜드 톤을 쓴다.
4. 관점은 지키되 데이터와 논리로 타협한다. 영혼 없는 칭찬이나 무조건적인 동의는 하지 않는다. 반대할 때는 대안을 제시한다.
5. 아는 사실과 추정을 정직하게 구별한다. 조회된 데이터가 없으면 "없음"으로 지어내지 않고 "확인 불가"를 명시한다.
6. 도구 실행이나 저장 사실 없이 "저장했어", "발송했어", "계속 감시할게"라는 거짓 보고를 하지 않는다.
7. 사용자가 지치거나 부담스러워할 때는 업무량과 선택지를 최소한으로 줄여준다.
`;

export function buildOfficePrompt({
  agentId,
  mode,
  message,
  draft,
  participants = [],
  lens,
  context,
}: BuildOfficePromptParams): { systemInstruction: string; prompt: string } {
  const primaryPersona = OFFICE_PERSONAS[agentId] || OFFICE_PERSONAS.eevee;

  const systemLines: string[] = [
    `당신은 Moonlight OS Eevee Office의 핵심 임원입니다.`,
    COMMON_OFFICE_CONTRACT,
    `【주관 임원 정보】`,
    `- 이름: ${primaryPersona.nameKo} (${primaryPersona.nameEn})`,
    `- 직책: ${primaryPersona.title}`,
    `- 핵심 역할: ${primaryPersona.role}`,
    `- 슬로건: "${primaryPersona.tagline}"`,
    `- 시스템 지침:\n${primaryPersona.systemPrompt}`,
  ];

  if (mode === 'council') {
    systemLines.push(
      `\n【Office Council 종합 회의 모드 지침】`,
      `당신은 주관 임원(${primaryPersona.nameKo})의 입장에서 회의를 리드하며, 참여 임원들의 전문 관점을 교차 시뮬레이션하여 최적의 합의안을 도출해야 합니다.`,
      `참여 임원 목록:`
    );
    for (const pId of participants) {
      const p = OFFICE_PERSONAS[pId];
      if (p) {
        systemLines.push(`- ${p.nameKo} (${p.title}): ${p.focus} / 태도: "${p.tagline}"`);
      }
    }
  }

  const promptLines: string[] = [];

  // 1. Context injection
  if (context && Object.keys(context).length > 0) {
    promptLines.push(`【운영 문맥 스냅샷】`);
    if (context.scope) promptLines.push(`- 작업 스코프: ${context.scope}`);
    if (context.recentTasks?.length) {
      promptLines.push(`- 최근 주요 태스크 (${context.recentTasks.length}건):`);
      for (const t of context.recentTasks.slice(0, 5)) {
        promptLines.push(`  * [${t.status || 'todo'}] ${t.title || '제목 없음'}`);
      }
    }
    if (context.recentDeals?.length) {
      promptLines.push(`- 주요 파이프라인/딜 (${context.recentDeals.length}건):`);
      for (const d of context.recentDeals.slice(0, 5)) {
        promptLines.push(`  * [${d.stage || 'lead'}] ${d.title || d.name || '딜'}`);
      }
    }
    if (context.note) {
      promptLines.push(`- 참고: ${context.note}`);
    }
    promptLines.push('');
  }

  // 2. Legend lens if requested
  if (lens) {
    promptLines.push(`【참고 렌즈 관점】: ${lens}의 원칙과 비판적 사고방식을 결합하여 분석하되, 화자의 본래 정체성과 말투는 유지하라.\n`);
  }

  // 3. Draft / User input
  if (draft) {
    promptLines.push(`【검토/작업 대상 원문/초안】\n${draft}\n`);
  }

  promptLines.push(`【운영자(대표)의 요청】\n${message}\n`);

  // 4. Output format guidance per mode
  if (mode === 'council') {
    promptLines.push(
      `【Council 종합 회의 답변 형식】`,
      `아래 구조로 정밀하게 작성하라 (관점 시뮬레이션):`,
      `1. 👑 [주관 임원 ${primaryPersona.nameKo}의 1차 판단]`,
      `   - 핵심 현주소 및 추천 방향`,
      `2. 💬 [참여 임원 교차 관점]`,
      participants
        .map((pId) => {
          const p = OFFICE_PERSONAS[pId];
          return `   - ${p ? p.nameKo : pId}: 관점, 짚어야 할 맹점 또는 보완 제안`;
        })
        .join('\n'),
      `3. ⚖️ [Office Council 최종 종합 권고]`,
      `   - 추천 결정: (한 문장으로 명확히)`,
      `   - 핵심 근거: (추진 이유 및 기회)`,
      `   - 남은 이견 및 주의사항: (감수해야 할 리스크)`,
      `   - 다음 구체 행동 & 담당: (누가 무엇을 할 것인가)`,
      `   - 재검토 조건: (어떤 조건이 바뀌면 계획을 수정할 것인가)`
    );
  } else if (mode === 'task') {
    promptLines.push(
      `【실행 초안 (Task) 답변 형식】`,
      `1. [핵심 결과물/초안] (즉시 복사하여 쓸 수 있는 구체적 형태)`,
      `2. [완료 조건 및 확인 사항 (DoD)]`,
      `3. [다음 실행 담당 및 넘겨줄 파트너]`
    );
  } else if (mode === 'critique') {
    promptLines.push(
      `【비판적 감사 (Critique) 답변 형식】`,
      `1. 🚨 [치명적 맹점 및 리스크 위치]`,
      `2. ⚠️ [개선 필요 지점 및 이유]`,
      `3. ✅ [구체적 수정 대안 및 통과 조건]`
    );
  } else {
    // chat mode
    promptLines.push(
      `【대화 (Chat) 답변 형식】`,
      `친근한 반말로 불필요한 서두 없이 명쾌하게 답변하라:`,
      `[내 판단/의견] → [이유 및 배경] → [지금 바로 할 다음 행동]`
    );
  }

  return {
    systemInstruction: systemLines.join('\n'),
    prompt: promptLines.join('\n'),
  };
}
