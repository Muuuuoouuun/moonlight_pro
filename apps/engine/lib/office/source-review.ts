// A source-first editing aid, not independent fact verification. The model must
// anchor its rewrite in verbatim material before producing the public answer.
export const OFFICE_SOURCE_REVIEW_INSTRUCTIONS = `
먼저 sourceQuotes에 이번 판단을 제한하는 원문을 최대 5개 그대로 복사한다. 숫자뿐 아니라 '미정/미제공/추정/종료 요청'처럼 답의 범위를 제한하는 구절도 중요하다. sourceContext·현재 사용자 원문·이전 사용자 발언만 인용하고, AI 초안이나 동료의 주장은 근거로 인용하지 않는다. 인용할 사실이 없으면 빈 배열이다.
그다음 corrections에 AI 초안 또는 동료 의견의 구체적 오류를 짧게 적는다. cause(관측을 원인 확정으로 바꿈), capability(제공·약속·기능 창작), completion(미확인 저장을 성공으로 판정), scope(종결을 업무로 확장), wording(길이·과장·문맥)을 확인한다. 결함이 없으면 빈 배열이며 결함 개수를 채우지 않는다.
이 두 목록은 공개 답변의 근거·교정 메모이며 내부 사고 과정을 설명하는 곳이 아니다. 마지막 공개 답변에는 교정을 실제로 반영한다. 단서나 주의사항을 뒤에 붙이고 앞의 틀린 코드·약속을 그대로 남기지 않는다. 새로운 주장으로 바꿔 끼우지 말고 필요한 사실과 결과만 남긴다. 코드의 성공 계약을 모르면 성공 알림 호출 경로 자체가 없어야 한다. 미확인 기능·자료에 대해 '준비됐다/제공한다/지원 중이다'를 쓰지 않는다. 단순 확인·종결에 새 계획이나 재승인을 붙이지 않는다.
`;

export function officeSourceReviewSchema(schema: Record<string, any>) {
  return { ...schema, properties: {
    sourceQuotes: { type: 'array', maxItems: 5, items: { type: 'string' }, description: 'AI 주장이 아닌 제공 원문에서 판단에 중요한 구절을 그대로 복사. 의역하지 않는다. 항목당 300자 이하.' },
    corrections: { type: 'array', maxItems: 5, items: { type: 'string' }, description: '초안/동료 의견에서 바로잡을 구체 오류와 수정 방향. 항목당 350자 이하. 없으면 빈 배열.' },
    ...schema.properties,
  }, required: ['sourceQuotes', 'corrections', ...schema.required] };
}

function sourceStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(sourceStrings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(sourceStrings);
  return [];
}

export function readSourceReviewedOutput(raw: unknown, request: {message: string; history?: {role:string;text:string}[]; boundedHistory?: {role:string;text:string}[]}, context: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invalid-source-review');
  const { sourceQuotes, corrections, ...answer } = raw as Record<string, unknown>;
  const validStrings = (value: unknown, max: number): value is string[] => Array.isArray(value) && value.length <= 5 && value.every(item => typeof item === 'string' && item.trim() && item.length <= max && !item.includes('\0'));
  if (!validStrings(sourceQuotes, 300) || !validStrings(corrections, 350)) throw new Error('invalid-source-review');
  const source = [request.message, ...sourceStrings(context), ...(request.history || request.boundedHistory || []).filter(turn => turn.role === 'user').map(turn => turn.text)];
  if (sourceQuotes.some(quote => !source.some(text => text.includes(quote)))) throw new Error('untraceable-source-review');
  return answer;
}
