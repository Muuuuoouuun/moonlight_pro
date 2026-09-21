import type { OfficeMode } from '@com-moon/agent-contracts/office';

// Provider formatting control complements (never replaces) parseOfficeAnswer at the boundary.
export function officeResponseSchema(mode: OfficeMode): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    answer: { type: 'string', minLength: 1, maxLength: 10000, description: '요청에 바로 쓸 최종 답 또는 완성된 초안. 제공되지 않은 사실·경험·성과를 만들지 않는다.' },
    nextAction: { type: 'string', minLength: 1, maxLength: 1000, description: '답변의 추천과 일치하는 구체 행동 하나. 추가 업무가 불필요한 질문·인사·휴식 요청이면 추가 행동 없음.' },
  };
  if (mode === 'council') {
    properties.recommendation = { type: 'string', minLength: 1, maxLength: 2000, description: '주관의 추천 하나와 요청한 대체 문안/산출물' };
    for (const key of ['evidence', 'dissent']) {
      properties[key] = { type: 'array', maxItems: 5, items: { type: 'string', minLength: 1, maxLength: 1000 } };
    }
  }
  return { type: 'object', additionalProperties: false, properties, required: Object.keys(properties) };
}
