import type { OfficeMode } from '@com-moon/agent-contracts/office';

const string = (maxLength: number) => ({ type: 'string', minLength: 1, maxLength });
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const list = (items: Record<string, unknown>, maxItems: number) => ({ type: 'array', items, maxItems });

// Provider formatting guidance is followed by the strict, source-aware contract parser.
export function officeWorkflowResponseSchema(mode: OfficeMode): Record<string, unknown> {
  const taskFields = object({
    title: string(300), description: string(4000), nextAction: string(1000),
    dueAt: { ...string(40), description: '사용자가 제시한 기한만. 없으면 필드를 생략한다.' },
    dealId: { ...string(36), description: 'sourceRefs의 deal entityId만. 없으면 생략한다.' },
    priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
  }, ['title']);
  const properties: Record<string, unknown> = {
    summary: { ...string(1800), description: '중요한 결론을 짧게. 본문과 반복하지 않는다.' },
    artifact: object({ kind: { type: 'string', enum: ['text', 'markdown', 'code'] }, body: { ...string(24000), description: '복사 가능한 실제 결과물. 내부 검토 주석은 uncertainties로 분리한다.' } }),
    evidence: list(object({ sourceRefId: string(200), explanation: string(1000) }), 20),
    uncertainties: list(string(1000), 12),
    dissent: list(string(1000), 8),
    nextStep: { anyOf: [{ type: 'null' }, object({ kind: { type: 'string', enum: ['create_task'] }, label: string(160), fields: taskFields })], description: '별도 할 일이 필요한 경우만 제안한다. 인사·휴식·추가 행동이 없는 요청은 null.' },
  };
  if (mode === 'council') properties.council = object({
    perspectives: { ...list(object({ ownerId: string(40), judgment: string(1800), tradeoff: string(1000) }), 3), minItems: 2 },
    recommendation: string(1800),
  });
  return object(properties);
}
