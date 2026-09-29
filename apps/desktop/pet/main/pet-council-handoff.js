'use strict';
// Council 안건 전달 조각 — apps/hub/components/hub/council-desktop-handoff.js 의 인코딩을 CommonJS 로 그대로 옮긴다.
// version 1 JSON {version, draft, source:{kind}} → UTF-8 → base64url(패딩 없음) → '#moonlight-council=<…>'.
// draft 는 공백만이면 안 되고 4000 UTF-16 이하, 외톨이 서로게이트 금지. 조각 전체 24000자 이하.
// 받는 쪽(허브)은 조각을 메모리로 옮기고 주소에서 지운다 — AI 호출은 사용자가 허브에서 누를 때만.

const { LIMITS } = require('../shared/contract');

const COUNCIL_PATH = '/dashboard/agents/council';
const COUNCIL_HANDOFF_PREFIX = '#moonlight-council=';
const SOURCE_KINDS = Object.freeze(['memo', 'task', 'text']);

const exactKeys = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

function validPayload(value) {
  if (!exactKeys(value, ['version', 'draft', 'source']) || value.version !== 1
    || typeof value.draft !== 'string' || !value.draft.trim() || value.draft.length > LIMITS.councilDraft
    || !exactKeys(value.source, ['kind']) || !SOURCE_KINDS.includes(value.source.kind)) return false;
  for (const character of value.draft) {
    const code = character.codePointAt(0);
    if (code >= 0xd800 && code <= 0xdfff) return false;
  }
  return true;
}

function encodeCouncilDesktopHandoff(payload) {
  if (!validPayload(payload)) throw new TypeError('유효한 Council 안건이 아닙니다.');
  const canonical = { version: 1, draft: payload.draft, source: { kind: payload.source.kind } };
  const fragment = COUNCIL_HANDOFF_PREFIX + Buffer.from(JSON.stringify(canonical), 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (fragment.length > LIMITS.councilFragment) throw new RangeError('안건 링크가 너무 깁니다.');
  return fragment;
}

// 허브 상대 경로: '/dashboard/agents/council#moonlight-council=…'. 틀린 안건이면 던진다(TypeError/RangeError).
function councilHandoffPath(draft, sourceKind = 'text') {
  return COUNCIL_PATH + encodeCouncilDesktopHandoff({ version: 1, draft, source: { kind: sourceKind } });
}

// 검증용 역변환(허브 parseCouncilDesktopHandoff 와 같은 규칙).
function parseCouncilDesktopHandoff(hash) {
  if (typeof hash !== 'string' || !hash.startsWith(COUNCIL_HANDOFF_PREFIX)) return null;
  if (hash.length > LIMITS.councilFragment) return { ok: false };
  const encoded = hash.slice(COUNCIL_HANDOFF_PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) return { ok: false };
  try {
    const bytes = Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!validPayload(value)) return { ok: false };
    return { ok: true, payload: { version: 1, draft: value.draft, source: { kind: value.source.kind } } };
  } catch {
    return { ok: false };
  }
}

module.exports = {
  COUNCIL_PATH, COUNCIL_HANDOFF_PREFIX, SOURCE_KINDS,
  validPayload, encodeCouncilDesktopHandoff, councilHandoffPath, parseCouncilDesktopHandoff,
};
