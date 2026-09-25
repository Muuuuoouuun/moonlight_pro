import { guidancePromptFrame } from '@com-moon/guru-guidance';

export const GURU_ADVICE_MODES = {
  'open-question': {
    question: '운영자가 묻는 상황과 질문을 먼저 읽고, 확인된 사실과 빠진 맥락을 구분해 도움을 주세요. 사용자가 요청하지 않은 일감은 만들지 마세요.',
    defaultCardId: 'sales-gap',
  },
  'pipeline-triage': {
    question: '현재 기록에서 확인되는 파이프라인의 차이와 아직 모르는 것을 구분해 주세요. 운영자가 판단을 요청한 경우에만 우선순위 선택지를 보여 주세요.',
    defaultCardId: 'sales-meddic',
  },
  'deal-review': {
    question: '이 딜의 기록에서 보이는 사실, 비어 있는 정보, 고객에게 직접 확인할 질문을 구분해 주세요. 구매자 성향이나 숨은 이유를 사실처럼 추정하지 마세요.',
    defaultCardId: 'sales-gap',
  },
  'proposal-critique': {
    question: '운영자가 붙여 넣은 문구나 제안을 검토하고, 실제 고객 근거가 있는 부분과 확인이 필요한 부분을 구분해 주세요.',
    defaultCardId: 'sales-meddic',
  },
  'weekly-retro': {
    question: '이번 주 실제 기록에서 드러난 패턴과 아직 판단할 수 없는 부분을 짧게 정리해 주세요. 새로운 주간 과제를 자동으로 배정하지 마세요.',
    defaultCardId: 'sales-gap',
  },
  sparring: {
    question: '운영자가 요청한 영업 판단에 대해 추진 관점과 반론을 나란히 보여 주고, 결정을 바꿀 관찰 조건을 남겨 주세요.',
    defaultCardId: 'sales-gap',
  },
} as const;

export type GuruAdviceMode = keyof typeof GURU_ADVICE_MODES;

export function buildGuruAdvicePrompt({ mode, context, draft, guidanceId }: {
  mode: GuruAdviceMode;
  context: unknown;
  draft?: string | null;
  guidanceId?: string | null;
}): string {
  const config = GURU_ADVICE_MODES[mode];
  const requestedFrame = guidanceId ? guidancePromptFrame(guidanceId) : '';
  // A freeform question without a selected card must not acquire an unrelated
  // person's method or a source attribution by default.
  const frame = requestedFrame || (mode === 'open-question' ? '' : guidancePromptFrame(config.defaultCardId));
  const lines = [
    config.question,
    frame
      ? '답변은 짧은 한국어로: 1. 관찰된 사실과 미확인 정보 2. 적용할 프레임과 출처 3. 운영자가 고려할 질문 또는 선택.'
      : '답변은 짧은 한국어로: 1. 관찰된 사실과 미확인 정보 2. 도움이 되는 판단 기준 3. 운영자가 고려할 질문 또는 선택.',
    '후속 행동이나 업무 등록은 운영자가 명시적으로 요청했을 때만 제안하십시오. 카드 조회 자체는 업무 요청이 아닙니다.',
    '고객에게 직접 발송하거나 회사 CRM을 자동 입력하지 마십시오.',
    'context.memory.recent_runs는 이전 생성 조언이며 현재 고객 사실 근거가 아닙니다. 검증된 원장 기록과 구분하십시오.',
    ...(mode === 'open-question' ? ['질문과 직접 관련 없는 다른 고객·거래·파이프라인 상태를 끌어오지 마십시오. 질문과 선택 카드에 필요한 확인된 사실만 사용하십시오.'] : []),
    frame || '선택된 자료 카드가 없으므로 특정 인물·방법론·출처를 임의로 붙이지 마십시오.',
  ];
  if (draft?.trim()) lines.push('운영자가 제공한 질문 또는 초안:', draft.trim());
  lines.push('Sales ledger snapshot (자료 카드와 별개인 사실 근거):', JSON.stringify(context ?? {}, null, 2));
  return lines.join('\n\n');
}
