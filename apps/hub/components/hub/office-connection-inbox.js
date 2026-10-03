// Explicit input sharing inside the current browser session. Nothing is persisted,
// generated, approved, or executed by this inbox.
import { parseOfficeCustomerApproval } from '@com-moon/agent-contracts/office-workflow';
import { officeCustomerApprovalCurrent, officeCustomerResult } from './office-customer-preparation-client.js';

export const OFFICE_CONNECTION_SOURCE_LIMIT = 10;
const EMPTY = Object.freeze([]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCOPES = new Set(['personal', 'classin']);
const SOURCE_FIELDS = new Set(['id', 'kind', 'scope', 'boundary', 'artifactId', 'artifactRevision', 'label', 'source']);
const PRIVATE_KEY = /^(?:recoveryToken|credentials?|password(?:Hash)?|(?:client)?secret(?:Hash)?|apiKey|accessToken|refreshToken|sessionToken|bearerToken|authorization|cookie|token)$/i;
const needsUser = note => ({ status: 'needs_user', note });

function snapshot(value, seen = new Set()) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || seen.has(value)) throw new Error('invalid-source');
  seen.add(value);
  const copy = Array.isArray(value) ? value.map(item => snapshot(item, seen))
    : Object.fromEntries(Object.entries(value).filter(([key, item]) => !PRIVATE_KEY.test(key.replace(/[_\-\s]/g, '')) && item !== undefined)
      .map(([key, item]) => [key, snapshot(item, seen)]));
  seen.delete(value);
  return Object.freeze(copy);
}

function sameSource(a, b) {
  const ordered = value => Array.isArray(value) ? value.map(ordered)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
  return JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
}

export function officeConnectionBoundary(scope, brandId) {
  if ((!SCOPES.has(scope) && scope !== 'all') || (brandId !== null && !UUID.test(brandId || '')) || (scope === 'all' && brandId !== null)) return null;
  return Object.freeze({ scope, brandId });
}

function envelope(kind, boundary, artifactId, artifactRevision, label, source) {
  if (!boundary || typeof artifactId !== 'string' || !artifactId || !Number.isSafeInteger(artifactRevision) || artifactRevision < 1) return needsUser('원본 결과와 업무 범위를 확인해 주세요.');
  if (boundary.scope === 'all') return needsUser('전체 범위의 결과는 연결할 수 없습니다. 회사 또는 개인 범위를 골라 새 요청을 시작해 주세요.');
  if (boundary.scope === 'personal' && boundary.brandId === null) return needsUser('개인 결과를 연결하려면 요청 전에 브랜드를 선택해 주세요. 기존 결과에 나중에 브랜드를 붙일 수 없습니다.');
  try {
    return { status: 'ready', source: snapshot({
      id: `${kind}:${artifactId}:${artifactRevision}:${boundary.scope}:${boundary.brandId || 'unbranded'}`,
      kind, scope: boundary.scope, boundary, artifactId, artifactRevision, label, source,
    }) };
  } catch { return needsUser('원본 자료를 세션 입력으로 확인하지 못했습니다.'); }
}

export function officeCouncilConnectionSource(turn) {
  const boundary = officeConnectionBoundary(turn?.officeBoundary?.scope, turn?.officeBoundary?.brandId);
  if (!boundary) return needsUser('이 결과에는 요청 시작 때의 회사·개인 범위와 브랜드 기록이 없습니다. 원하는 범위에서 새 요청을 시작해 주세요.');
  if (turn?.request?.includeProjects === true) return needsUser('프로젝트 전체 문맥의 브랜드를 확인할 수 없습니다. 프로젝트 참고를 끄고 해당 원자료만 사용하는 새 회의를 준비해 주세요.');
  if (turn?.result?.status !== 'generated' || turn.request?.mode !== 'council' || turn.result.mode !== 'council'
    || turn.request?.scope !== boundary.scope || turn.result.scope !== boundary.scope
    || (turn.result.resultRevision !== undefined && turn.result.resultRevision !== 1)
    || typeof turn.message !== 'string' || typeof turn.result.answer !== 'string') return needsUser('같은 업무 범위에서 생성된 원본 회의 결론을 먼저 확인해 주세요. 대화·초안·검토 결과는 회의 결론으로 연결할 수 없습니다.');
  return envelope('office_council', boundary, turn.id, 1,
    `Office 결론 · ${turn.message.trim().split('\n')[0].slice(0, 80) || '원문'}`,
    { turn: { id: turn.id, message: turn.message, request: turn.request, result: turn.result, officeBoundary: turn.officeBoundary } });
}

function customerConnectionSource(state, selectedBoundary, snapshotOnly = false) {
  const boundary = officeConnectionBoundary(selectedBoundary?.scope, selectedBoundary?.brandId);
  const { context, receipt } = state || {};
  const result = receipt?.result;
  // Receipt inspection after a reload does not recover the original generation
  // request. Keep it null, and compare the saved receipt metadata separately.
  const request = state?.request && state.request.requestId === receipt?.requestId ? state.request : null;
  const reference = request || { requestId: receipt?.requestId, intent: receipt?.intent, ownerId: receipt?.ownerId,
    mode: receipt?.mode, scope: receipt?.scope, originRef: receipt?.originRef, expectedContextHash: result?.context?.contextHash };
  if (!boundary) return needsUser('고객 결과의 업무 범위와 브랜드를 확인해 주세요.');
  if (state?.pending || state?.loading || state?.approvalBusy || state?.applicationUnknown || state?.draft?.trim()
    || receipt?.status !== 'generated' || receipt.persistence?.persisted !== true || result?.status !== 'generated'
    || !officeCustomerResult(result)) return needsUser('현재 고객 대응 묶음의 생성·저장을 확인한 뒤 입력으로 공유해 주세요.');
  if (reference.intent !== 'customer_reply' || reference.requestId !== receipt.requestId || result.requestId !== receipt.requestId
    || reference.ownerId !== 'flareon' || result.ownerId !== 'flareon' || reference.mode !== 'draft' || result.mode !== 'draft'
    || receipt.intent !== 'customer_reply' || receipt.ownerId !== result.ownerId || receipt.mode !== result.mode
    || receipt.resultRevision !== result.resultRevision || result.resultRevision !== 1 || receipt.scope !== boundary.scope
    || receipt.originRef?.entityType !== reference.originRef?.entityType || receipt.originRef?.entityId !== reference.originRef?.entityId
    || reference.scope !== boundary.scope || result.scope !== boundary.scope || context?.scope !== boundary.scope || context.status !== 'ready'
    || !/^[a-f0-9]{64}$/.test(context.contextHash || '') || context.contextHash !== reference.expectedContextHash || context.contextHash !== result.context?.contextHash
    || context.originRef?.entityType !== reference.originRef?.entityType || context.originRef?.entityId !== reference.originRef?.entityId
    || (state.ownerId && state.ownerId !== result.ownerId) || state.cancelledRequestId === result.requestId || state.rejectedRequestId === result.requestId) {
    return needsUser('선택한 고객 자료·요청·현재 결과가 일치하지 않습니다. 자료를 확인하고 새 결과를 준비해 주세요.');
  }
  // A later selection cannot supply a brand missing from the original customer facts.
  const customer = context.facts?.customer;
  if (!customer || !Object.hasOwn(customer, 'brandId') || customer.brandId !== boundary.brandId) return needsUser('현재 고객 원문의 브랜드와 선택한 브랜드가 일치해야 합니다. 기존 결과에 나중에 브랜드를 붙일 수 없습니다.');
  if (!UUID.test(customer.id || '') || !['lead', 'customer_account', 'deal'].includes(customer.entityType)
    || customer.id !== receipt.originRef?.entityId || customer.entityType !== receipt.originRef?.entityType) return needsUser('보관된 결과와 현재 고객 원문이 같은 고객인지 다시 확인해 주세요.');
  if (typeof result.artifact?.body !== 'string' || !result.artifact.body.trim() || result.artifact.body.length > 1000) return needsUser('고객 답장을 1,000자 이내의 현재 초안으로 준비해 주세요. 원문은 자동으로 줄이지 않습니다.');
  if (state.reviewedSources !== true || state.reviewedQuestions !== true || (!snapshotOnly && !officeCustomerApprovalCurrent(state))) return needsUser('고객 화면에서 현재 부스터 초안의 원문·질문을 검토하고 초안을 승인한 뒤 입력으로 공유해 주세요. 이 승인은 이브이의 승인이나 실행 권한으로 이어지지 않습니다.');
  try {
    // The inbox checks the approval's structure and bindings. The server alone
    // recomputes its result digest before accepting a Commander connection.
    parseOfficeCustomerApproval(state.customerApproval, result, state.customerApproval?.resultHash);
    if (state.customerApproval.reviewedContextHash !== context.contextHash) return needsUser('현재 고객 자료의 원문·질문을 다시 검토하고 초안을 승인해 주세요.');
  } catch { return needsUser('현재 고객 결과의 원문 검토와 초안 승인을 다시 확인해 주세요.'); }
  return envelope('customer_reply', boundary, result.requestId, result.resultRevision,
    `고객 대응 · ${String(customer.name || result.summary || '현재 결과').slice(0, 80)}`,
    { state: { request, context, receipt, reviewedSources: state.reviewedSources, reviewedQuestions: state.reviewedQuestions, customerApproval: state.customerApproval } });
}

export function officeCustomerConnectionSource(state, selectedBoundary) {
  return customerConnectionSource(state, selectedBoundary);
}

export function createOfficeConnectionInbox() {
  let sources = EMPTY;
  const listeners = new Set(), scoped = new Map();
  const changed = () => { scoped.clear(); for (const listener of listeners) listener(); };
  const get = scope => {
    if (scope === 'all') return sources;
    if (!scoped.has(scope)) scoped.set(scope, Object.freeze(sources.filter(item => item.scope === scope)));
    return scoped.get(scope);
  };
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    get,
    publish(value) {
      const boundary = officeConnectionBoundary(value?.boundary?.scope, value?.boundary?.brandId);
      if (!boundary || !SCOPES.has(boundary.scope) || value.scope !== boundary.scope || !['office_council', 'customer_reply'].includes(value.kind)
        || typeof value.id !== 'string' || !value.id || typeof value.label !== 'string'
        || !value.source || typeof value.artifactId !== 'string' || !value.artifactId
        || !Number.isSafeInteger(value.artifactRevision) || value.artifactRevision < 1
        || (boundary.scope === 'personal' && boundary.brandId === null)) return needsUser('원본 자료와 업무 범위를 확인해 주세요.');
      let copy;
      try { copy = snapshot(value); } catch { return needsUser('원본 자료를 세션 입력으로 확인하지 못했습니다.'); }
      if (Object.keys(copy).some(key => !SOURCE_FIELDS.has(key))) return needsUser('공유할 원본 자료의 필드를 확인해 주세요.');
      const captured = copy.kind === 'office_council' ? officeCouncilConnectionSource(copy.source.turn)
        : customerConnectionSource(copy.source.state, boundary, true);
      if (captured.status !== 'ready' || captured.source.artifactId !== copy.artifactId || captured.source.artifactRevision !== copy.artifactRevision
        || captured.source.scope !== copy.scope || captured.source.boundary.brandId !== copy.boundary.brandId
        || !sameSource(captured.source.source, copy.source)) return needsUser('공유할 자료의 원본과 업무 범위가 일치하지 않습니다.');
      const existing = sources.find(item => item.id === copy.id);
      if (existing) return sameSource(existing, copy) ? { status: 'shared', source: existing }
        : needsUser('같은 결과의 공유 자료가 바뀌었습니다. 이브이 입력 목록에서 이전 자료를 지우고 다시 공유해 주세요.');
      if (sources.length >= OFFICE_CONNECTION_SOURCE_LIMIT) return needsUser('이 세션에는 입력 자료를 최대 10개까지 공유할 수 있습니다. 이브이 입력 목록에서 사용하지 않는 자료를 지워 주세요.');
      sources = Object.freeze([...sources, copy]); changed();
      return { status: 'shared', source: copy };
    },
    remove(id) {
      const next = sources.filter(item => item.id !== id);
      if (next.length === sources.length) return false;
      sources = Object.freeze(next); changed(); return true;
    },
    clear(scope) {
      const next = scope === 'all' ? EMPTY : sources.filter(item => item.scope !== scope);
      if (next.length === sources.length) return false;
      sources = Object.freeze(next); changed(); return true;
    },
  };
}

export const officeConnectionInbox = createOfficeConnectionInbox();

export async function loadOfficeConnectionBrands(scope, { fetcher = fetch } = {}) {
  if (!SCOPES.has(scope)) return { status: 'needs_user', brands: [], note: '회사 또는 개인 범위를 먼저 선택해 주세요.' };
  try {
    const response = await fetcher('/api/hub/brands', { cache: 'no-store' });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || data.status === 'error' || data.source === 'error') return { status: 'error', brands: [], note: '브랜드를 읽지 못했습니다. 다시 확인해 주세요.' };
    if (data.status === 'preview' || data.source === 'preview') return { status: 'preview', brands: [], note: '브랜드 목록은 저장 연결 후 확인할 수 있습니다.' };
    if (!['ok', 'live', 'partial'].includes(data.status) || !Array.isArray(data.brands)) return { status: 'error', brands: [], note: '브랜드 읽기 상태를 확인하지 못했습니다.' };
    return { status: data.status === 'partial' ? 'partial' : 'live', brands: data.brands.filter(brand => brand?.orgScope === scope && UUID.test(brand.id || '') && typeof brand.name === 'string') };
  } catch { return { status: 'error', brands: [], note: '브랜드를 읽지 못했습니다. 다시 확인해 주세요.' }; }
}
