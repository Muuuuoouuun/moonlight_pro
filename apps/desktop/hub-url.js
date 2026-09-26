// 허브 주소 규칙 — Electron 없이 테스트할 수 있게 순수 함수만 둔다.
'use strict';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

// 입력을 허브 origin으로 정리한다. https는 어디든, http는 로컬 개발 주소만 받는다.
function normalizeHubUrl(input) {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return { ok: false, reason: 'empty' };
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (url.username || url.password) return { ok: false, reason: 'credentials' };
  if (url.protocol === 'https:') return { ok: true, url: url.origin };
  if (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname)) return { ok: true, url: url.origin };
  return { ok: false, reason: 'scheme' };
}

// 사용자 설정 → 앱 기본값 순서. 둘 다 없거나 규칙에 어긋나면 빈 문자열(설정 화면).
function resolveHubUrl(settingsValue, configValue) {
  for (const candidate of [settingsValue, configValue]) {
    const result = normalizeHubUrl(candidate);
    if (result.ok) return result.url;
  }
  return '';
}

function originOf(value) {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

function isSameOrigin(target, hubUrl) {
  const hubOrigin = originOf(hubUrl);
  return Boolean(hubOrigin) && hubOrigin !== 'null' && originOf(target) === hubOrigin;
}

function dashboardUrl(hubUrl) {
  return `${originOf(hubUrl)}/dashboard`;
}

// 시스템 브라우저로 넘겨도 되는 주소만: http(s)와 mailto.
function isExternalOpenable(target) {
  try {
    const { protocol } = new URL(target);
    return protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:';
  } catch {
    return false;
  }
}

module.exports = { normalizeHubUrl, resolveHubUrl, isSameOrigin, dashboardUrl, isExternalOpenable };
