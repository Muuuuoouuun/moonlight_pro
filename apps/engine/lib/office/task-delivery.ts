// Private final-authoring format. This constrains output structure and current
// request traceability; it neither verifies intent nor grants action authority.
export const OFFICE_TASK_DELIVERY_INSTRUCTIONS = `먼저 requestContract에 이번 요청의 결과물을 명시한다. deliverable은 지금 답 안에 제공할 산출물, doneWhen은 이 답이 그 요청을 충족하는 조건이다. 각각 350자 이내의 짧은 사양이며 내부 사고 과정이나 품질 판정이 아니다. currentRequestQuote는 현재 userRequest에서 그대로 인용한 600자 이내 구절이다. sourceContext·이전 대화·역할 기준에서 가져오지 않는다.
targetEvidence는 실제 대상의 실행·검증에 관한 제공 자료의 상태다. 관련 없으면 null, 확인 자료가 없으면 unverified, 제공 원문에 결과가 기록돼 있으면 source-reported다. source-reported도 독립 실행 검증을 뜻하지 않는다. 설명·범위 확인·계획·테스트 설계는 실제 구현이 미검증이어도 답으로 완성할 수 있다.
answer에는 요청한 결과물을 완성한다. 요청한 테스트 절차·완료 기준은 산출물 안에 쓰되, 이것만으로 사용자에게 실행 후 보고할 의무가 생기지 않는다. 역할의 확인·실측 기준은 현재 요청의 산출물 범위 안에서 적용한다.
nextAction은 작성하지 않는다. followUp은 이번 요청이 요구한 후속 행동이거나 답을 작성하는 데 반드시 필요한 질문일 때만 객체로 둔다. 그 외에는 null이다. requested_action은 kind·text·currentRequestQuote, answer_blocking_question은 kind·text·missingInput·currentRequestQuote를 쓴다. text는 공개할 행동 또는 질문 전체이며 1000자 이내, missingInput은 답 작성에 빠진 입력을 350자 이내로 명시한다. 각 currentRequestQuote는 현재 userRequest의 정확한 인용이다. 실제 제품 검증·저장·실행이 안 됐다는 이유만으로 답 작성을 막는 입력이라고 분류하지 않는다. 인용의 존재는 실행 권한이나 분류의 정당성을 증명하지 않는다. 본문·추천·followUp 모두 같은 요청 범위를 지킨다.`;

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const check: (condition: unknown) => asserts condition = condition => { if (!condition) throw new Error('invalid-task-delivery'); };
const textSchema = (maxLength: number) => ({ type: 'string', minLength: 1, maxLength, pattern: '^[^\\u0000]*$' });
const objectSchema = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });

export function officeTaskDeliverySchema(schema: Record<string, any>): Record<string, any> {
  const result = structuredClone(schema);
  check(record(result.properties) && Object.hasOwn(result.properties, 'nextAction') && Array.isArray(result.required) && result.required.includes('nextAction'));
  const { nextAction: _nextAction, ...publicProperties } = result.properties;
  const requestContract = objectSchema({
    deliverable: textSchema(350), doneWhen: textSchema(350), currentRequestQuote: textSchema(600),
    targetEvidence: { anyOf: [{ type: 'null' }, { type: 'string', enum: ['unverified', 'source-reported'] }] },
  });
  const followUp = { anyOf: [
    { type: 'null' },
    objectSchema({ kind: { type: 'string', enum: ['requested_action'] }, text: textSchema(1000), currentRequestQuote: textSchema(600) }),
    objectSchema({ kind: { type: 'string', enum: ['answer_blocking_question'] }, text: textSchema(1000), missingInput: textSchema(350), currentRequestQuote: textSchema(600) }),
  ] };
  result.properties = { requestContract, ...publicProperties, followUp };
  result.required = ['requestContract', ...result.required.filter((key: string) => key !== 'nextAction'), 'followUp'];
  return result;
}

function exactKeys(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  check(record(value) && Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
}
function boundedText(value: unknown, max: number): asserts value is string {
  check(typeof value === 'string' && value.trim().length > 0 && value.length <= max && !value.includes('\0'));
}
function currentQuote(value: unknown, currentRequest: string) {
  boundedText(value, 600);
  check(currentRequest.includes(value));
}

export function readOfficeTaskDeliveryOutput(raw: unknown, currentRequest: string): Record<string, unknown> {
  check(record(raw) && typeof currentRequest === 'string' && !Object.hasOwn(raw, 'nextAction'));
  check(Object.hasOwn(raw, 'requestContract') && Object.hasOwn(raw, 'followUp'));
  const { requestContract, followUp, ...answer } = raw;
  exactKeys(requestContract, ['deliverable', 'doneWhen', 'currentRequestQuote', 'targetEvidence']);
  boundedText(requestContract.deliverable, 350);
  boundedText(requestContract.doneWhen, 350);
  currentQuote(requestContract.currentRequestQuote, currentRequest);
  check(requestContract.targetEvidence === null || requestContract.targetEvidence === 'unverified' || requestContract.targetEvidence === 'source-reported');
  if (followUp === null) return { ...answer, nextAction: '추가 행동 없음.' };
  check(record(followUp));
  if (followUp.kind === 'requested_action') exactKeys(followUp, ['kind', 'text', 'currentRequestQuote']);
  else {
    check(followUp.kind === 'answer_blocking_question');
    exactKeys(followUp, ['kind', 'text', 'missingInput', 'currentRequestQuote']);
    boundedText(followUp.missingInput, 350);
  }
  boundedText(followUp.text, 1000);
  currentQuote(followUp.currentRequestQuote, currentRequest);
  // Preserve unknown public keys for the existing public/Council parsers to
  // reject. Do not repair body, recommendation or a model-authored action.
  return { ...answer, nextAction: followUp.text };
}
