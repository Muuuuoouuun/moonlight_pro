'use strict';
// Moonlight Pet — 허브 전송 계층(메인 프로세스, 순수 Node).
// Mac `HubTransport.swift`의 규칙을 그대로 옮긴다. Electron을 require 하지 않는다 —
// fetch·쿠키 읽기/쓰기는 주입받는다(Electron에서는 셸이 session.defaultSession 쿠키를 넘긴다).
//
// 봉투(kind) 규칙 — 순서가 의미를 가진다:
//   status 'not-configured' 또는 error 'operator-login-not-configured' → not-configured
//   401/403 또는 status unauthorized/forbidden                         → unauthorized
//   409                                                                → conflict
//   2xx 아님 · status 'error' · source 'error'(HTTP 200이어도)          → error('server')
//   JSON 객체가 아닌 본문(204 제외)                                     → invalid
// preview 는 여기서 성공으로 돌려주되 `preview: true`로 표시만 한다 — 읽기/쓰기 계층이 절대 성공으로 바꾸지 않는다.

const { LIMITS, ENVELOPE_KINDS } = require('../shared/contract');

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const METHODS = new Set(['GET', 'POST', 'PATCH', 'DELETE']);
const OFFICE_CHAT_PATH = '/api/hub/office/chat';

// 허브 요청 실패. kind 는 contract.ENVELOPE_KINDS 중 하나, error 는 기계가 읽는 사유 코드.
//   error 코드: rejected-url · redirect-rejected · offline · timeout · cancelled · server ·
//   unauthorized · operator-login-not-configured · hub-url-missing · conflict · missing-version ·
//   memo-conflict · invalid-response · invalid-status · invalid-input · save-not-verified ·
//   preview · busy · stale-origin · pending-memo
class HubError extends Error {
  constructor(kind, error, httpStatus = 0) {
    super(error);
    this.name = 'HubError';
    this.kind = ENVELOPE_KINDS.includes(kind) ? kind : 'error';
    this.error = error;
    this.httpStatus = httpStatus;
  }
}

const fail = (kind, error, httpStatus = 0) => new HubError(kind, error, httpStatus);

function okEnvelope(kind, data, httpStatus = 200) {
  return { kind, data, error: null, httpStatus };
}

function errorEnvelope(err) {
  if (err instanceof HubError) return { kind: err.kind, data: null, error: err.error, httpStatus: err.httpStatus };
  return { kind: 'error', data: null, error: 'unexpected', httpStatus: 0 };
}

// 허브 origin 정규화. https 는 어디든, http 는 정확한 loopback 이름만(127.1 같은 축약 금지).
// 경로·쿼리·조각·계정 정보가 있으면 거절한다. 반환: 'https://hub.example' 형태 또는 null.
function canonicalOrigin(input) {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw || /[?#\\\s]/.test(raw)) return null;
  const authority = /^([a-z][a-z0-9+.-]*):\/\/([^/]*)/i.exec(raw);
  if (!authority) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.username || url.password || authority[2].includes('@')) return null;
  if (url.pathname !== '/' && url.pathname !== '') return null;
  const rawHostPort = authority[2];
  const rawHost = (rawHostPort.startsWith('[') ? rawHostPort.slice(0, rawHostPort.indexOf(']') + 1) : rawHostPort.split(':')[0]).toLowerCase();
  if (!rawHost) return null;
  if (url.protocol === 'https:') return url.origin;
  if (url.protocol === 'http:' && LOOPBACK_HOSTS.has(rawHost) && url.hostname === rawHost) return url.origin;
  return null;
}

function originOf(value) {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

// /api/ 아래 상대 경로만. 절대 주소·// 시작·역슬래시·조각·점 세그먼트(퍼센트 인코딩 포함)는 네트워크 전에 거절.
function resolveApiUrl(origin, path) {
  if (typeof path !== 'string' || !path.startsWith('/api/') || /[\\#\s]/.test(path)) throw fail('error', 'rejected-url');
  const rawPath = path.split('?')[0];
  if (rawPath.split('/').some((segment) => /^(?:\.|%2e){1,2}$/i.test(segment))) throw fail('error', 'rejected-url');
  let url;
  try {
    url = new URL(path, `${origin}/`);
  } catch {
    throw fail('error', 'rejected-url');
  }
  if (url.origin !== origin || !url.pathname.startsWith('/api/')) throw fail('error', 'rejected-url');
  return url;
}

// Office chat POST(정확한 경로)만 긴 예산을 쓴다. 쿼리·접미사·인코딩 변형은 일반 예산.
function timeoutsFor(path, method = 'GET') {
  const exactChat = path === OFFICE_CHAT_PATH && String(method).toUpperCase() === 'POST';
  return exactChat
    ? { request: LIMITS.chatTimeoutMs, total: LIMITS.chatTotalTimeoutMs }
    : { request: LIMITS.requestTimeoutMs, total: LIMITS.totalTimeoutMs };
}

function parseEnvelope(text) {
  if (typeof text !== 'string' || !text) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function headerSafe(value) {
  return typeof value === 'string' && value.length > 0 && !/[\r\n\0]/.test(value);
}

// options:
//   origin       허브 주소(정규화 규칙 위) — 틀리면 HubError('error','rejected-url')
//   fetch        WHATWG fetch 호환(기본 globalThis.fetch). redirect:'manual' 을 지켜야 한다.
//   cookieHeader async (url) → 'name=value; …' | '' — Electron 에서는 session.defaultSession 쿠키
//   storeCookies async (setCookieHeaders[], url) → void — 성공 응답의 Set-Cookie 를 세션에 되돌린다(선택)
//   setTimeout/clearTimeout 주입(테스트용)
function createHubClient(options = {}) {
  const origin = canonicalOrigin(options.origin);
  if (!origin) throw fail('error', 'rejected-url');
  const fetchImpl = options.fetch || globalThis.fetch;
  const cookieHeader = typeof options.cookieHeader === 'function' ? options.cookieHeader : null;
  const storeCookies = typeof options.storeCookies === 'function' ? options.storeCookies : null;
  const startTimer = options.setTimeout || setTimeout;
  const stopTimer = options.clearTimeout || clearTimeout;

  async function request(path, init = {}) {
    const method = String(init.method || 'GET').toUpperCase();
    if (!METHODS.has(method)) throw fail('error', 'rejected-url');
    const url = resolveApiUrl(origin, path);
    const budget = timeoutsFor(path, method);
    const headers = { accept: 'application/json' };
    if (method !== 'GET') {
      headers.origin = origin;
      headers['content-type'] = 'application/json';
    }
    if (cookieHeader) {
      let cookie = '';
      try {
        cookie = await cookieHeader(url.href);
      } catch {
        cookie = '';
      }
      if (headerSafe(cookie)) headers.cookie = cookie;
    }
    let body;
    if (method !== 'GET' && init.body !== undefined && init.body !== null) {
      body = typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
    }

    const controller = new AbortController();
    let reason = '';
    const abort = (why) => {
      if (reason) return;
      reason = why;
      controller.abort();
    };
    const external = init.signal;
    if (external && external.aborted) throw fail('error', 'cancelled');
    const onExternalAbort = () => abort('cancelled');
    if (external) external.addEventListener('abort', onExternalAbort, { once: true });
    const totalTimer = startTimer(() => abort('timeout'), budget.total);
    let requestTimer = startTimer(() => abort('timeout'), budget.request);
    const transportFailure = () => fail('error', reason === 'timeout' ? 'timeout' : reason === 'cancelled' ? 'cancelled' : 'offline');

    try {
      let response;
      try {
        response = await fetchImpl(url.href, { method, headers, body, redirect: 'manual', signal: controller.signal, cache: 'no-store' });
      } catch {
        throw transportFailure();
      }
      stopTimer(requestTimer);
      requestTimer = null;
      if (reason) throw transportFailure();
      if (!response || typeof response.status !== 'number') throw fail('invalid', 'invalid-response');
      if (response.type === 'opaqueredirect') throw fail('error', 'redirect-rejected', response.status);
      // 같은 origin 응답만. fetch 구현이 url 을 비우면 요청 주소로 본다(리다이렉트는 따라가지 않으므로 같다).
      if (originOf(response.url || url.href) !== origin) throw fail('invalid', 'invalid-response', response.status);
      if (response.status >= 300 && response.status < 400) throw fail('error', 'redirect-rejected', response.status);

      let text;
      try {
        text = await response.text();
      } catch {
        throw transportFailure();
      }
      if (reason) throw transportFailure();
      const httpStatus = response.status;
      const envelope = parseEnvelope(text);
      const status = envelope && typeof envelope.status === 'string' ? envelope.status : null;
      const source = envelope && typeof envelope.source === 'string' ? envelope.source : null;
      if (status === 'not-configured' || (envelope && envelope.error === 'operator-login-not-configured')) {
        throw fail('not-configured', 'operator-login-not-configured', httpStatus);
      }
      if (httpStatus === 401 || httpStatus === 403 || status === 'unauthorized' || status === 'forbidden') {
        throw fail('unauthorized', 'unauthorized', httpStatus);
      }
      if (httpStatus === 409) throw fail('conflict', 'conflict', httpStatus);
      if (httpStatus < 200 || httpStatus >= 300 || status === 'error' || source === 'error') throw fail('error', 'server', httpStatus);
      if (!envelope && httpStatus !== 204) throw fail('invalid', 'invalid-response', httpStatus);

      if (storeCookies && response.headers && typeof response.headers.getSetCookie === 'function') {
        const setCookies = response.headers.getSetCookie();
        if (setCookies.length) {
          try {
            await storeCookies(setCookies, url.href);
          } catch {
            // 쿠키 되돌리기 실패는 응답 자체를 무효로 만들지 않는다 — 다음 요청이 기존 세션을 쓴다.
          }
        }
      }
      return { httpStatus, json: envelope, status, source, preview: status === 'preview' || source === 'preview' };
    } finally {
      stopTimer(totalTimer);
      if (requestTimer) stopTimer(requestTimer);
      if (external) external.removeEventListener('abort', onExternalAbort);
    }
  }

  // GET /api/operator/session — 상태만 읽는다(로그인 폼 없음: 메인 창 세션을 공유한다).
  async function sessionStatus() {
    const response = await request('/api/operator/session');
    const json = response.json;
    if (!json || typeof json.configured !== 'boolean' || (response.status !== 'authenticated' && response.status !== 'anonymous')) {
      throw fail('invalid', 'invalid-response', response.httpStatus);
    }
    return { status: response.status, configured: json.configured, reason: typeof json.reason === 'string' ? json.reason : null };
  }

  // POST /api/operator/session {action:'logout'} — 공유 세션이라 메인 창도 로그아웃된다. 셸이 명시적으로만 부른다.
  async function logout() {
    const response = await request('/api/operator/session', { method: 'POST', body: { action: 'logout' } });
    if (response.status !== 'logged_out' || response.preview) throw fail('invalid', 'invalid-response', response.httpStatus);
    return { status: 'logged_out' };
  }

  return { origin, request, sessionStatus, logout, timeoutsFor };
}

// Electron 세션 다리(덕 타이핑 — electron 을 require 하지 않는다).
// electronSession: session.defaultSession. cookies.get({url}) 은 도메인·경로·secure 를 이미 거른다.
function electronCookieBridge(electronSession) {
  const cookies = electronSession && electronSession.cookies;
  return {
    async cookieHeader(url) {
      if (!cookies) return '';
      const list = await cookies.get({ url });
      return list.filter((c) => headerSafe(c.name) && typeof c.value === 'string').map((c) => `${c.name}=${c.value}`).join('; ');
    },
    async storeCookies(setCookieHeaders, url) {
      if (!cookies) return;
      for (const header of setCookieHeaders) {
        const parsed = parseSetCookie(header, url);
        if (!parsed) continue;
        if (parsed.remove) await cookies.remove(url, parsed.name);
        else await cookies.set(parsed.details);
      }
    },
  };
}

// Set-Cookie 한 줄 → Electron cookies.set 입력. 만료가 지났거나 Max-Age<=0 이면 remove.
function parseSetCookie(header, url) {
  if (typeof header !== 'string') return null;
  const parts = header.split(';').map((part) => part.trim());
  const first = parts.shift() || '';
  const eq = first.indexOf('=');
  if (eq <= 0) return null;
  const name = first.slice(0, eq).trim();
  const value = first.slice(eq + 1).trim();
  if (!headerSafe(name)) return null;
  const details = { url, name, value };
  let expired = false;
  for (const part of parts) {
    const at = part.indexOf('=');
    const key = (at < 0 ? part : part.slice(0, at)).trim().toLowerCase();
    const attr = at < 0 ? '' : part.slice(at + 1).trim();
    if (key === 'path' && attr.startsWith('/')) details.path = attr;
    else if (key === 'domain' && attr) details.domain = attr;
    else if (key === 'secure') details.secure = true;
    else if (key === 'httponly') details.httpOnly = true;
    else if (key === 'samesite') {
      const mode = attr.toLowerCase();
      details.sameSite = mode === 'strict' ? 'strict' : mode === 'none' ? 'no_restriction' : 'lax';
    } else if (key === 'max-age' && /^-?\d+$/.test(attr)) {
      const seconds = Number(attr);
      if (seconds <= 0) expired = true;
      else details.expirationDate = Date.now() / 1000 + seconds;
    } else if (key === 'expires' && details.expirationDate === undefined) {
      const at2 = Date.parse(attr);
      if (Number.isFinite(at2)) {
        if (at2 <= Date.now()) expired = true;
        else details.expirationDate = at2 / 1000;
      }
    }
  }
  return expired ? { remove: true, name } : { remove: false, name, details };
}

module.exports = {
  HubError, fail, okEnvelope, errorEnvelope,
  canonicalOrigin, resolveApiUrl, timeoutsFor, parseEnvelope,
  createHubClient, electronCookieBridge, parseSetCookie,
  OFFICE_CHAT_PATH,
};
