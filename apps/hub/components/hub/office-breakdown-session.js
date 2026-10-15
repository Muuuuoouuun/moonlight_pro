import { officeAutoStep, officePacketRequest, officePacketStates, parseOfficeBreakdownRequest, parseOfficeBreakdownResult, withOfficePacketOwner } from '@com-moon/agent-contracts/office-harness';

// One breakdown per Office scope, in memory only — like the mentor follow-up, a reload or a new
// browser session does not restore it. Nothing here writes a task, a request or a receipt.
export function createOfficeBreakdownStore() {
  const entries = new Map();
  const listeners = new Set();
  let reads = 0;
  const get = scope => entries.get(scope) || null;
  const set = (scope, next) => {
    if (next) entries.set(scope, next); else entries.delete(scope);
    for (const listener of listeners) listener();
    return next;
  };
  const patch = (scope, change) => { const current = get(scope); return current ? set(scope, { ...current, ...change }) : null; };
  const applied = scope => { const entry = get(scope); return entry?.status === 'applied' ? entry : null; };

  return {
    get,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    // Throws on an empty or over-long agenda so the caller can say why before any request.
    begin(scope, agenda) {
      const request = parseOfficeBreakdownRequest({ message: agenda, scope });
      const readId = ++reads;
      set(scope, { status: 'loading', readId, request, agenda: request.message });
      return { readId, request };
    },
    resolve(scope, readId, body) {
      const entry = get(scope);
      if (!entry || entry.status !== 'loading' || entry.readId !== readId) return null;
      if (body?.status === 'preview') return patch(scope, { status: 'preview', error: body.error || '오피스 Engine 연결이 필요합니다. 안건을 직접 나눠 담당을 골라 주세요.' });
      try {
        if (body?.status !== 'recommended' || body.businessWrites !== false) throw new Error('invalid-breakdown');
        const { businessWrites, ...result } = body;
        const breakdown = parseOfficeBreakdownResult(result, entry.request);
        return patch(scope, { status: 'recommended', breakdown, marks: {}, priors: {}, autoMarks: {}, opened: null, auto: null, error: null });
      } catch {
        return patch(scope, { status: 'error', error: '업무 나누기를 확인하지 못했습니다. 안건을 직접 나눠 담당을 골라 주세요.' });
      }
    },
    // A request that never left the page (empty or over-long agenda) still shows why.
    refuse(scope, error) { reads++; return set(scope, { status: 'error', error }); },
    fail(scope, readId) {
      const entry = get(scope);
      if (!entry || entry.readId !== readId) return null;
      return patch(scope, { status: 'error', error: '업무 나누기를 확인하지 못했습니다. 안건을 직접 나눠 담당을 골라 주세요.' });
    },
    apply(scope) {
      const entry = get(scope);
      return entry?.status === 'recommended' ? patch(scope, { status: 'applied' }) : null;
    },
    setOwner(scope, key, ownerId) {
      const entry = get(scope);
      if (!['recommended', 'applied'].includes(entry?.status)) return null;
      return patch(scope, { breakdown: withOfficePacketOwner(entry.breakdown, key, ownerId) });
    },
    // Opening remembers how many turns the meeting had, so marking the packet done can
    // offer the answer that came after it — and only that one.
    open(scope, key, { turnCount, withReviewers = false }) {
      const entry = applied(scope);
      if (!entry || !['classin', 'personal'].includes(scope) || entry.request.scope !== scope
        || entry.breakdown.packets.some(packet => packet.scope !== scope)) return null;
      const priorResults = Object.fromEntries(Object.entries(entry.priors).filter(([prior]) => entry.breakdown.packets.find(p => p.key === key)?.dependsOn.includes(prior)));
      const request = officePacketRequest(entry.breakdown, key, { agenda: entry.agenda, priorResults, withReviewers });
      patch(scope, { opened: { key, turnCount } });
      return request;
    },
    mark(scope, key, state, { latestAnswer = null, turnCount = 0, source = 'operator' } = {}) {
      const entry = applied(scope);
      if (!entry || !entry.breakdown.packets.some(p => p.key === key)) return null;
      const marks = { ...entry.marks }, priors = { ...entry.priors }, autoMarks = { ...entry.autoMarks };
      if (source === 'auto' && state === 'done') autoMarks[key] = true; else delete autoMarks[key];
      if (state) marks[key] = state; else { delete marks[key]; delete priors[key]; }
      // The copy is taken only when the operator marks done, from an answer produced after opening.
      if (state === 'done' && entry.opened?.key === key && turnCount > entry.opened.turnCount && typeof latestAnswer === 'string' && latestAnswer.trim()) priors[key] = latestAnswer.trim();
      if (state !== 'done') delete priors[key];
      return patch(scope, { marks, priors, autoMarks, opened: entry.opened?.key === key && state ? null : entry.opened });
    },
    // 자동 진행: started by one operator button, keeps the operator's unsent draft to give back.
    startAuto(scope, { savedDraft = '' } = {}) {
      const entry = applied(scope);
      if (!entry || entry.auto?.state === 'running') return null;
      return patch(scope, { auto: { state: 'running', runs: 0, current: null, reason: null, keys: [], savedDraft } });
    },
    autoNext(scope) {
      const entry = applied(scope);
      if (entry?.auto?.state !== 'running') return null;
      return officeAutoStep(entry.breakdown, entry.marks, entry.auto.runs);
    },
    autoRunning(scope, key) {
      const entry = applied(scope);
      if (entry?.auto?.state !== 'running') return null;
      return patch(scope, { auto: { ...entry.auto, current: key, runs: entry.auto.runs + 1 } });
    },
    // Returns the saved draft once, so the caller can put it back in the composer.
    stopAuto(scope, reason, keys = []) {
      const entry = get(scope);
      if (entry?.auto?.state !== 'running') return null;
      patch(scope, { auto: { ...entry.auto, state: 'stopped', current: null, reason, keys, savedDraft: '' } });
      return { savedDraft: entry.auto.savedDraft };
    },
    isAutoRunning(scope) { return get(scope)?.auto?.state === 'running'; },
    states(scope) {
      const entry = get(scope);
      return entry?.breakdown ? officePacketStates(entry.breakdown, entry.marks || {}) : {};
    },
    discard(scope) { reads++; return set(scope, null); },
  };
}

export const officeBreakdowns = createOfficeBreakdownStore();

export async function fetchOfficeBreakdown(request, fetcher = fetch) {
  const response = await fetcher('/api/hub/office/breakdown', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request), cache: 'no-store',
  });
  const body = await response.json().catch(() => null);
  if (body?.status === 'preview') return body;
  if (!response.ok) return { status: 'error' };
  return body;
}

export function officeBreakdownProgress(entry, states) {
  if (entry?.status !== 'applied') return null;
  const values = Object.values(states);
  return { done: values.filter(state => state === 'done').length, closed: values.filter(state => state === 'done' || state === 'skipped').length, total: values.length };
}

const AUTO_STOP_LABELS = {
  complete: '모든 조각을 닫았습니다.',
  'needs-operator': '직접 할 조각에서 멈췄습니다',
  blocked: '선행 조각이 건너뛰어졌거나 직접 할 조각이 끝나지 않아 멈췄습니다',
  failed: '오피스 응답을 받지 못해 멈췄습니다',
  limit: '자동 실행 한도에 닿아 멈췄습니다',
  stopped: '멈추기를 눌러 멈췄습니다.',
  left: '회의실을 떠나 멈췄습니다.',
  'scope-required': '회사 또는 개인 범위를 선택한 뒤 안건을 다시 나눠 주세요.',
};
export function officeAutoStopText(auto) {
  if (!auto || auto.state !== 'stopped') return '';
  const base = AUTO_STOP_LABELS[auto.reason] || '자동 진행을 멈췄습니다.';
  return auto.keys?.length && !base.endsWith('.') ? `${base} · ${auto.keys.join(', ')}` : base.replace(/([^.])$/, '$1.');
}

// One auto step through the same Office pipeline a person uses: fill the composer with the
// packet, begin, request, complete. The result lands in the meeting thread like any turn.
export async function runOfficeAutoStep({ scope, sessions, request, breakdowns = officeBreakdowns, newId = () => crypto.randomUUID(), signal }) {
  const step = breakdowns.autoNext(scope);
  if (!step) return { done: true };
  if (step.action === 'stop') return { done: true, stop: breakdowns.stopAuto(scope, step.reason, step.keys) };
  const session = sessions.get(scope);
  if (session.pending) return { done: true, stop: breakdowns.stopAuto(scope, 'blocked', [step.key]) };
  const packet = breakdowns.open(scope, step.key, { turnCount: session.turns.length, withReviewers: false });
  if (!packet) return { done: true, stop: breakdowns.stopAuto(scope, 'scope-required', [step.key]) };
  sessions.update(scope, { ownerId: packet.ownerId, mode: packet.mode, reviewers: [], presetId: null, draft: packet.message });
  const pending = sessions.begin(scope, newId());
  if (!pending) return { done: true, stop: breakdowns.stopAuto(scope, 'failed', [step.key]) };
  breakdowns.autoRunning(scope, step.key);
  let result;
  try { result = await request(pending.request, { signal }); }
  catch { result = { status: 'error', error: '오피스 응답을 확인하지 못했습니다. 입력을 유지한 채 다시 시도해 주세요.' }; }
  sessions.complete(scope, pending.id, result);
  // Stopped while waiting: the answer stays in the thread, the operator decides whether it is done.
  if (!breakdowns.isAutoRunning(scope)) return { done: true };
  if (result.status !== 'generated') return { done: true, stop: breakdowns.stopAuto(scope, 'failed', [step.key]) };
  breakdowns.mark(scope, step.key, 'done', { latestAnswer: result.answer, turnCount: sessions.get(scope).turns.length, source: 'auto' });
  return { done: false, ran: step.key };
}

export async function runOfficeAuto(options) {
  const ran = [];
  for (;;) {
    const step = await runOfficeAutoStep(options);
    if (step.ran) ran.push(step.ran);
    if (step.done) return { ran, savedDraft: step.stop?.savedDraft ?? '' };
  }
}
