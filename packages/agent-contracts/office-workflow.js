// Browser-safe workflow contract. Keep the existing Office v2 chat contract independent.
import { OFFICE_IDS, OFFICE_MODES, OfficeInputError, parseOfficeDeliberation, parseOfficeDiscussion, parseOfficeFailure } from './office.js';

export const OFFICE_WORKFLOW_VERSION = '2026-09-21.v1';
export const OFFICE_WORKFLOW_INTENTS = Object.freeze(['weekly_report', 'customer_reply', 'freeform']);
export const OFFICE_WORKFLOW_LIMITS = Object.freeze({ message: 6000, history: 8, historyChars: 20000, factsBytes: 24576, resultBytes: 32768 });
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
const check = (ok, message) => { if (!ok) throw new OfficeInputError(message); };
function keys(value, allowed) { check(plain(value) && Object.keys(value).every(key => allowed.includes(key)), '지원하지 않는 workflow 필드입니다.'); }
function text(value, max) { check(typeof value === 'string' && value.trim().length > 0 && value.length <= max, '본문 길이를 확인해 주세요.'); return value.trim(); }
function uuid(value) { check(typeof value === 'string' && UUID.test(value), '요청 또는 대상 ID가 올바르지 않습니다.'); return value.toLowerCase(); }
function hash(value) { check(typeof value === 'string' && HASH.test(value), '문맥 해시가 올바르지 않습니다.'); return value; }
function date(value) {
  check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, '기간 날짜가 올바르지 않습니다.');
  return value;
}
function timestamp(value) {
  check(typeof value === 'string' && value.length <= 40 && /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)), '기준 시각이 올바르지 않습니다.');
  date(value.slice(0, 10));
  return value;
}
function strings(value, count = 12, length = 1000) {
  check(Array.isArray(value) && value.length <= count, '목록 크기를 확인해 주세요.');
  return value.map(item => text(item, length));
}
function json(value, depth = 0) {
  check(depth <= 16, '자료 구조가 너무 깊습니다.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') { check(Number.isFinite(value), '숫자 자료가 올바르지 않습니다.'); return value; }
  if (Array.isArray(value)) return value.map(item => json(item, depth + 1));
  check(plain(value) && !Object.keys(value).some(key => ['__proto__', 'constructor', 'prototype'].includes(key)), '자료는 JSON 객체여야 합니다.');
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, json(item, depth + 1)]));
}
function byteLength(value) { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
const stable = value => Array.isArray(value) ? `[${value.map(stable).join(',')}]` : plain(value) ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}` : JSON.stringify(value);

export function parseOfficeWorkflowOrigin(value, intent) {
  if (intent === 'weekly_report') {
    keys(value, ['periodStart', 'periodEnd', 'timezone']);
    const periodStart = date(value.periodStart), periodEnd = date(value.periodEnd);
    check(periodStart <= periodEnd && Date.parse(periodEnd) - Date.parse(periodStart) === 6 * 86400000, '주간 정리는 완료된 7일 기간을 선택해 주세요.');
    const timezone = text(value.timezone, 80);
    try { new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { throw new OfficeInputError('시간대가 올바르지 않습니다.'); }
    return { periodStart, periodEnd, timezone };
  }
  if (intent === 'customer_reply') {
    keys(value, ['entityType', 'entityId']);
    check(['lead', 'customer_account', 'deal'].includes(value.entityType), '고객 대상 종류가 올바르지 않습니다.');
    return { entityType: value.entityType, entityId: uuid(value.entityId) };
  }
  check(intent === 'freeform', '지원하지 않는 workflow입니다.');
  keys(value, []);
  return {};
}

export function parseOfficeWorkflowRequest(value) {
  keys(value, ['requestId', 'intent', 'ownerId', 'mode', 'participants', 'scope', 'originRef', 'expectedContextHash', 'message', 'boundedHistory', 'parentRequestId', 'deliberation']);
  check(OFFICE_WORKFLOW_INTENTS.includes(value.intent), '지원하지 않는 workflow입니다.');
  const ownerId = value.ownerId ?? ({ weekly_report: 'vaporeon', customer_reply: 'flareon', freeform: 'eevee' }[value.intent]);
  const mode = value.mode ?? (value.intent === 'freeform' ? 'chat' : 'draft');
  check(OFFICE_IDS.includes(ownerId) && OFFICE_MODES.includes(mode), 'Office 담당과 방식을 확인해 주세요.');
  check(['classin', 'personal'].includes(value.scope), 'workflow는 회사 또는 개인 범위를 선택해 주세요.');
  const participants = value.participants ?? [];
  check(Array.isArray(participants) && new Set(participants).size === participants.length && participants.every(id => OFFICE_IDS.includes(id)), '참여 관점을 확인해 주세요.');
  check(mode === 'council' ? participants.includes(ownerId) && participants.length >= 2 && participants.length <= 3 : participants.length === 0, '관점 비교는 주관을 포함해 2~3명을 선택해 주세요.');
  const history = value.boundedHistory ?? [];
  check(Array.isArray(history) && history.length <= OFFICE_WORKFLOW_LIMITS.history, '최근 대화는 최대 8개입니다.');
  const boundedHistory = history.map(turn => {
    keys(turn, ['role', 'text']);
    check(['user', 'assistant'].includes(turn.role), '대화 역할이 올바르지 않습니다.');
    return { role: turn.role, text: text(turn.text, 6000) };
  });
  check(JSON.stringify(boundedHistory).length <= OFFICE_WORKFLOW_LIMITS.historyChars, '대화 문맥이 너무 깁니다.');
  const requestId = uuid(value.requestId);
  const result = { requestId, intent: value.intent, ownerId, mode, participants: [...participants], scope: value.scope, originRef: parseOfficeWorkflowOrigin(value.originRef, value.intent), expectedContextHash: hash(value.expectedContextHash), message: text(value.message, OFFICE_WORKFLOW_LIMITS.message), boundedHistory };
  check(value.deliberation === undefined || mode === 'council', '토론 조절은 관점 비교에서 사용해 주세요.');
  if (value.deliberation !== undefined) result.deliberation = parseOfficeDeliberation(value.deliberation, participants);
  if (value.parentRequestId !== undefined && value.parentRequestId !== null) {
    result.parentRequestId = uuid(value.parentRequestId);
    check(result.parentRequestId !== requestId, '원본 요청과 수정 요청은 다른 ID여야 합니다.');
  }
  return result;
}

export function parseOfficeWorkflowContext(value, request) {
  keys(value, ['status', 'scope', 'originRef', 'originKey', 'sourceRefs', 'facts', 'missing', 'asOf', 'contextHash', 'capabilities']);
  check(['ready', 'preview', 'error'].includes(value.status) && value.scope === request.scope, '업무 문맥 상태 또는 범위가 일치하지 않습니다.');
  const originRef = parseOfficeWorkflowOrigin(value.originRef, request.intent);
  check(stable(originRef) === stable(request.originRef), '업무 문맥 대상이 일치하지 않습니다.');
  check(hash(value.contextHash) === request.expectedContextHash, '업무 문맥이 변경되었습니다. 다시 확인해 주세요.');
  check(Array.isArray(value.sourceRefs) && value.sourceRefs.length <= 80, '참고 자료 목록이 너무 큽니다.');
  const sourceRefs = value.sourceRefs.map(ref => {
    keys(ref, ['id', 'type', 'entityId', 'updatedAt', 'label']);
    const result = { id: text(ref.id, 200), type: text(ref.type, 80) };
    if (ref.entityId !== undefined && ref.entityId !== null) result.entityId = uuid(ref.entityId);
    if (ref.updatedAt !== undefined && ref.updatedAt !== null) result.updatedAt = timestamp(ref.updatedAt);
    if (ref.label !== undefined && ref.label !== null) result.label = text(ref.label, 300);
    return result;
  });
  check(new Set(sourceRefs.map(ref => ref.id)).size === sourceRefs.length, '참고 자료 ID가 중복됩니다.');
  const facts = json(value.facts);
  check(plain(facts) && byteLength(facts) <= OFFICE_WORKFLOW_LIMITS.factsBytes, '업무 자료가 너무 큽니다. 선택 범위를 줄여 주세요.');
  keys(value.capabilities, ['generate', 'applyTask']);
  check(typeof value.capabilities.generate === 'boolean' && typeof value.capabilities.applyTask === 'boolean', '업무 기능 상태가 올바르지 않습니다.');
  check(value.status === 'ready' || !value.capabilities.generate, '준비되지 않은 문맥으로 생성할 수 없습니다.');
  return { status: value.status, scope: value.scope, originRef, originKey: text(value.originKey, 300), facts, sourceRefs, missing: strings(value.missing), asOf: timestamp(value.asOf), contextHash: value.contextHash, capabilities: { ...value.capabilities } };
}

export const OFFICE_SOURCE_CHECKS = Object.freeze(['traced', 'none', 'untraced']);
const NOTE_NEXT_STEP_DROPPED = '다음 행동 제안을 확인하지 못해 제외했습니다. 필요하면 할 일을 직접 만들어 주세요.';
const NOTE_NEXT_STEP_TRIMMED = '다음 행동 제안의 일부 항목(기한·우선순위 등)을 확인하지 못해 뺐습니다.';
const attempt = parse => { try { return parse(); } catch { return undefined; } };

// Model output: a bad optional part must not discard a reviewed body (2026-09-23 운영자 확정).
// The proposal still grants nothing — only these typed fields survive, and projectId is chosen
// by the operator at the linking step, never by the model.
function nextStep(value, context, notes) {
  if (value === null || value === undefined) return null;
  const typed = plain(value) && value.kind === 'create_task' && plain(value.fields);
  const title = typed ? attempt(() => text(value.fields.title, 300)) : undefined;
  const label = typed ? attempt(() => text(value.label, 160)) : undefined;
  if (!title || !label || Object.keys(value).some(key => !['kind', 'label', 'fields'].includes(key))) { notes.push(NOTE_NEXT_STEP_DROPPED); return null; }
  const fields = { title };
  let trimmed = Object.keys(value.fields).some(key => !['title', 'description', 'nextAction', 'dueAt', 'dealId', 'priority'].includes(key));
  const keep = (key, parse) => {
    if (value.fields[key] === undefined || value.fields[key] === null) return;
    const parsed = attempt(parse);
    if (parsed === undefined) trimmed = true; else fields[key] = parsed;
  };
  keep('description', () => text(value.fields.description, 4000));
  keep('nextAction', () => text(value.fields.nextAction, 1000));
  keep('dueAt', () => /^\d{4}-\d{2}-\d{2}$/.test(value.fields.dueAt) ? date(value.fields.dueAt) : timestamp(value.fields.dueAt));
  keep('dealId', () => {
    const dealId = uuid(value.fields.dealId);
    check(context.sourceRefs.some(ref => ['deal', 'deals'].includes(ref.type) && ref.entityId === dealId), '다음 행동의 대상은 참고 자료에 있어야 합니다.');
    return dealId;
  });
  keep('priority', () => { check(['low', 'medium', 'high', 'critical'].includes(value.fields.priority), '우선순위가 올바르지 않습니다.'); return value.fields.priority; });
  if (trimmed) notes.push(NOTE_NEXT_STEP_TRIMMED);
  return { kind: 'create_task', label, fields };
}

export function parseOfficeWorkflowAnswer(value, request, context) {
  keys(value, ['summary', 'artifact', 'evidence', 'uncertainties', 'dissent', 'council', 'nextStep', 'sourceCheck']);
  check(byteLength(value) <= OFFICE_WORKFLOW_LIMITS.resultBytes, '결과가 너무 큽니다. 요청 범위를 줄여 주세요.');
  keys(value.artifact, ['kind', 'body']);
  check(['text', 'markdown', 'code'].includes(value.artifact.kind), '결과물 종류가 올바르지 않습니다.');
  check(Array.isArray(value.evidence) && value.evidence.length <= 20, '근거 목록이 올바르지 않습니다.');
  check(value.sourceCheck === undefined || OFFICE_SOURCE_CHECKS.includes(value.sourceCheck), '근거 확인 상태가 올바르지 않습니다.');
  // A citation outside the sent sources is dropped, not trusted and not fatal (2026-09-23 운영자 확정).
  const evidence = value.evidence.flatMap(ref => {
    const parsed = attempt(() => {
      keys(ref, ['sourceRefId', 'explanation']);
      check(context.sourceRefs.some(source => source.id === ref.sourceRefId), '근거는 실제로 전달된 자료만 참조할 수 있습니다.');
      return { sourceRefId: ref.sourceRefId, explanation: text(ref.explanation, 1000) };
    });
    return parsed ? [parsed] : [];
  });
  const notes = [];
  if (evidence.length < value.evidence.length) notes.push(`근거 ${value.evidence.length - evidence.length}건은 전달된 자료에서 찾지 못해 제외했습니다.`);
  const step = nextStep(value.nextStep, context, notes);
  const uncertainties = [...strings(value.uncertainties).slice(0, Math.max(0, 12 - notes.length)), ...notes];
  const sourceCheck = value.evidence.length > 0 && evidence.length === 0 ? 'untraced' : value.sourceCheck;
  const result = { summary: text(value.summary, 1800), artifact: { kind: value.artifact.kind, body: text(value.artifact.body, 24000) }, evidence, uncertainties, dissent: strings(value.dissent, 8), nextStep: step, ...(sourceCheck ? { sourceCheck } : {}) };
  if (request.mode === 'council') {
    keys(value.council, ['perspectives', 'recommendation']);
    const rows = value.council.perspectives;
    check(Array.isArray(rows) && rows.length === request.participants.length && new Set(rows.map(row => row?.ownerId)).size === rows.length, '참여 관점이 요청과 일치하지 않습니다.');
    const perspectives = rows.map(row => {
      keys(row, ['ownerId', 'judgment', 'tradeoff']);
      check(request.participants.includes(row.ownerId), '요청하지 않은 관점입니다.');
      return { ownerId: row.ownerId, judgment: text(row.judgment, 1800), tradeoff: text(row.tradeoff, 1000) };
    });
    result.council = { perspectives, recommendation: text(value.council.recommendation, 1800) };
  } else check(value.council === undefined, '관점 비교가 아닌 결과에는 council 필드를 쓸 수 없습니다.');
  return result;
}

// Only Engine output enters here. Persistence, application and permissions belong to Hub.
export function parseOfficeWorkflowResult(value, request, context) {
  const metadata = ['version', 'requestId', 'resultRevision', 'status', 'ownerId', 'mode', 'participants', 'scope', 'context', 'generation', 'discussion'];
  const answerKeys = ['summary', 'artifact', 'evidence', 'uncertainties', 'dissent', 'council', 'nextStep', 'sourceCheck'];
  keys(value, [...metadata, ...answerKeys, 'error', 'failure']);
  check(byteLength(value) <= OFFICE_WORKFLOW_LIMITS.resultBytes, '결과가 너무 큽니다. 요청 범위를 줄여 주세요.');
  check(value.version === OFFICE_WORKFLOW_VERSION && value.requestId === request.requestId && value.ownerId === request.ownerId && value.mode === request.mode && value.scope === request.scope && stable(value.participants) === stable(request.participants), '생성 결과의 요청 정보가 일치하지 않습니다.');
  check(['generated', 'preview', 'error'].includes(value.status), '생성 상태가 올바르지 않습니다.');
  const base = { version: value.version, requestId: value.requestId, ownerId: value.ownerId, mode: value.mode, participants: [...value.participants], scope: value.scope, status: value.status };
  if (value.status !== 'generated') {
    check(answerKeys.every(key => value[key] === undefined) && value.generation === undefined && value.resultRevision === undefined && value.context === undefined && value.discussion === undefined, '실패한 결과에 생성 본문을 넣을 수 없습니다.');
    const failure = parseOfficeFailure(value.failure);
    return { ...base, error: text(value.error, 1000), ...(failure ? { failure } : {}) };
  }
  check(value.error === undefined && value.failure === undefined && value.resultRevision === 1, '결과 버전이 올바르지 않습니다.');
  keys(value.context, ['asOf', 'contextHash', 'missing']);
  check(value.context.contextHash === context.contextHash && value.context.asOf === context.asOf && stable(value.context.missing) === stable(context.missing), '결과의 업무 문맥이 일치하지 않습니다.');
  keys(value.generation, ['policyVersion', 'promptHash', 'model', 'usage', 'elapsedMs']);
  const generation = { policyVersion: text(value.generation.policyVersion, 100), promptHash: hash(value.generation.promptHash), model: text(value.generation.model, 100), usage: null, elapsedMs: value.generation.elapsedMs };
  check(Number.isInteger(generation.elapsedMs) && generation.elapsedMs >= 0, '생성 소요 시간이 올바르지 않습니다.');
  if (value.generation.usage !== null) {
    keys(value.generation.usage, ['promptTokens', 'outputTokens', 'totalTokens']);
    check(['promptTokens', 'outputTokens', 'totalTokens'].every(key => Number.isSafeInteger(value.generation.usage[key]) && value.generation.usage[key] >= 0), '사용량이 올바르지 않습니다.');
    generation.usage = { ...value.generation.usage };
  }
  const answer = Object.fromEntries(answerKeys.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
  check(request.deliberation === undefined || value.discussion !== undefined, '요청한 토론 설정의 실행 기록이 없습니다.');
  const discussion = value.discussion === undefined ? {} : { discussion: parseOfficeDiscussion(value.discussion, request) };
  return { ...base, resultRevision: 1, ...parseOfficeWorkflowAnswer(answer, request, context), context: { ...value.context, missing: [...value.context.missing] }, generation, ...discussion };
}
