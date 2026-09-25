// Browser-only draft handoff. Receiving a fragment never invokes an advisor or saves a record.
export const COUNCIL_HANDOFF_PREFIX = '#moonlight-council=';
export const COUNCIL_HANDOFF_DRAFT_LIMIT = 4000;
export const COUNCIL_HANDOFF_FRAGMENT_LIMIT = 24000;
const COUNCIL_PATH = '/dashboard/agents/council';
const invalid = (error = '안건을 읽지 못했습니다. 데스크톱에서 내용을 확인하고 다시 열어 주세요.') => ({ ok: false, error });
const ownsFragment = hash => typeof hash === 'string' && (hash === '#moonlight-council' || hash.startsWith(COUNCIL_HANDOFF_PREFIX));
const exactKeys = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

function validPayload(value) {
  if (!exactKeys(value, ['version', 'draft', 'source']) || value.version !== 1
    || typeof value.draft !== 'string' || !value.draft.trim() || value.draft.length > COUNCIL_HANDOFF_DRAFT_LIMIT
    || !exactKeys(value.source, ['kind']) || !['memo', 'task', 'text'].includes(value.source.kind)) return false;
  // TextEncoder replaces lone UTF-16 surrogates; reject instead of changing the reviewed text.
  for (const character of value.draft) {
    const code = character.codePointAt(0);
    if (code >= 0xd800 && code <= 0xdfff) return false;
  }
  return true;
}

export function parseCouncilDesktopHandoff(hash) {
  if (!ownsFragment(hash)) return null;
  if (hash.length > COUNCIL_HANDOFF_FRAGMENT_LIMIT) return invalid('안건 링크가 너무 깁니다. 4,000자 이내로 줄여 다시 열어 주세요.');
  const encoded = hash.slice(COUNCIL_HANDOFF_PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) return invalid();
  try {
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!validPayload(value)) return invalid();
    return { ok: true, payload: { version: 1, draft: value.draft, source: { kind: value.source.kind } } };
  } catch { return invalid(); }
}

export function encodeCouncilDesktopHandoff(payload) {
  if (!validPayload(payload)) throw new TypeError('유효한 Council 안건이 아닙니다.');
  const canonical = { version: 1, draft: payload.draft, source: { kind: payload.source.kind } };
  const binary = Array.from(new TextEncoder().encode(JSON.stringify(canonical)), byte => String.fromCharCode(byte)).join('');
  const fragment = COUNCIL_HANDOFF_PREFIX + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (fragment.length > COUNCIL_HANDOFF_FRAGMENT_LIMIT) throw new RangeError('안건 링크가 너무 깁니다.');
  return fragment;
}

export function consumeCouncilDesktopHandoff(browser) {
  const hash = browser.location.hash;
  if (!ownsFragment(hash)) return null;
  try {
    // Strip before parsing, including malformed/oversized input. Preserve Next's history state.
    browser.history.replaceState(browser.history.state, '', browser.location.pathname + browser.location.search);
  } catch { return invalid('주소에서 안건을 지우지 못했습니다. 주소의 # 뒤 내용을 지우고 다시 열어 주세요.'); }
  return parseCouncilDesktopHandoff(hash);
}

export function isCouncilHandoffLoginTarget(next, origin) {
  try {
    const base = new URL(origin);
    const target = new URL(next, base);
    return typeof next === 'string' && ['https:', 'http:'].includes(base.protocol)
      && target.origin === base.origin && !target.username && !target.password
      && target.pathname === COUNCIL_PATH && !target.search && !target.hash;
  } catch { return false; }
}

export function councilHandoffLoginPath(next, origin, payload) {
  if (!isCouncilHandoffLoginTarget(next, origin)) return null;
  try { return COUNCIL_PATH + encodeCouncilDesktopHandoff(payload); } catch { return null; }
}

export function createCouncilDraftState() {
  return { draft: '', source: null, pending: [], notice: '', error: '' };
}

export function reduceCouncilDraft(state, action) {
  switch (action.type) {
    case 'receive': {
      if (!validPayload(action.payload)) return { ...state, error: invalid().error };
      const payload = action.payload;
      if (!state.draft.trim() && state.pending.length === 0) {
        return { ...state, draft: payload.draft, source: payload.source, error: '', notice: '데스크톱 안건을 가져왔습니다. 내용을 확인한 뒤 자문을 요청하세요.' };
      }
      if ((state.draft === payload.draft && state.source?.kind === payload.source.kind)
        || state.pending.some(item => item.draft === payload.draft && item.source.kind === payload.source.kind)) return state;
      return { ...state, pending: [...state.pending, payload], error: '', notice: '새 안건이 도착했습니다. 기존 입력은 유지했습니다.' };
    }
    case 'edit': return { ...state, draft: action.draft, error: '', notice: '' };
    case 'append': {
      const incoming = state.pending[0];
      if (!incoming) return state;
      const draft = state.draft ? `${state.draft}\n\n${incoming.draft}` : incoming.draft;
      if (draft.length > COUNCIL_HANDOFF_DRAFT_LIMIT) return { ...state, error: '합치면 4,000자를 넘습니다. 현재 안건을 줄인 뒤 다시 붙여 주세요. 두 안건은 그대로 보관 중입니다.' };
      return { ...state, draft, source: state.draft ? { kind: 'text' } : incoming.source, pending: state.pending.slice(1), error: '', notice: '기존 입력 뒤에 안건을 붙였습니다.' };
    }
    case 'dismiss': return { ...state, pending: state.pending.slice(1), error: '', notice: '대기 중인 안건 한 건을 닫았습니다. 기존 입력은 유지했습니다.' };
    case 'error': return { ...state, error: action.error, notice: '' };
    default: return state;
  }
}
