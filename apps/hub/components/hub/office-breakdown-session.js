import { officePacketRequest, officePacketStates, parseOfficeBreakdownRequest, parseOfficeBreakdownResult, withOfficePacketOwner } from '@com-moon/agent-contracts/office-harness';

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
      if (body?.status === 'preview') return patch(scope, { status: 'preview', error: body.error || 'Office Engine 연결이 필요합니다. 안건을 직접 나눠 담당을 골라 주세요.' });
      try {
        if (body?.status !== 'recommended' || body.businessWrites !== false) throw new Error('invalid-breakdown');
        const { businessWrites, ...result } = body;
        const breakdown = parseOfficeBreakdownResult(result, entry.request);
        return patch(scope, { status: 'recommended', breakdown, marks: {}, priors: {}, opened: null, error: null });
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
      if (!entry) return null;
      const priorResults = Object.fromEntries(Object.entries(entry.priors).filter(([prior]) => entry.breakdown.packets.find(p => p.key === key)?.dependsOn.includes(prior)));
      const request = officePacketRequest(entry.breakdown, key, { agenda: entry.agenda, priorResults, withReviewers });
      patch(scope, { opened: { key, turnCount } });
      return request;
    },
    mark(scope, key, state, { latestAnswer = null, turnCount = 0 } = {}) {
      const entry = applied(scope);
      if (!entry || !entry.breakdown.packets.some(p => p.key === key)) return null;
      const marks = { ...entry.marks }, priors = { ...entry.priors };
      if (state) marks[key] = state; else { delete marks[key]; delete priors[key]; }
      // The copy is taken only when the operator marks done, from an answer produced after opening.
      if (state === 'done' && entry.opened?.key === key && turnCount > entry.opened.turnCount && typeof latestAnswer === 'string' && latestAnswer.trim()) priors[key] = latestAnswer.trim();
      if (state !== 'done') delete priors[key];
      return patch(scope, { marks, priors, opened: entry.opened?.key === key && state ? null : entry.opened });
    },
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
