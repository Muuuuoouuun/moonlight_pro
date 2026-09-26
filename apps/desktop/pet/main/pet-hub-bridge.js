'use strict';
// 허브 채널 위임 — 셸은 전송을 구현하지 않는다. pet-main.install({ hub })로 받은 객체에 넘기고,
// 돌아온 값을 계약의 봉투 { kind, data, error, httpStatus }로 맞춘다. hub가 없으면 { kind: 'not-configured' }.
//
// hub 객체 모양(허브 패키지가 만든다, 둘 중 하나):
//   hub.invoke(channel, payload, meta) → Promise<envelope>
//   hub['pet:tasks-list'](payload, meta) → Promise<envelope>   (채널 이름을 키로 한 함수)
// meta = { surface }  — 요청을 보낸 펫 창('pet'|'panel'|'perch'|'bubble'|'focus').
const C = require('../shared/contract');

// 허브로 가는 채널: 저장 채널 뒤의 것 중 집중 타이머(셸 소유)를 뺀 전부.
const HUB_CHANNELS = Object.freeze(C.PET_INVOKE.slice(C.PET_INVOKE.indexOf('pet:store-set') + 1)
  .filter((channel) => !channel.startsWith('pet:focus-')));
const FOCUS_CHANNELS = Object.freeze(C.PET_INVOKE.filter((channel) => channel.startsWith('pet:focus-')));

function envelope(kind, data = null, error = null, httpStatus = 0) {
  return { kind, data, error, httpStatus };
}

function normalizeEnvelope(result) {
  if (!result || typeof result !== 'object' || !C.ENVELOPE_KINDS.includes(result.kind)) {
    return envelope('invalid', null, 'envelope');
  }
  return envelope(
    result.kind,
    result.data === undefined ? null : result.data,
    result.error === undefined || result.error === null ? null : String(result.error),
    Number.isFinite(result.httpStatus) ? result.httpStatus : 0,
  );
}

// 봉투에서 읽히는 허브 상태(허브가 'pet:hub-status'를 따로 보내도 같은 결론이 된다).
function statusFromEnvelope(result) {
  if (!result) return null;
  if (result.kind === 'unauthorized') return 'unauthorized';
  if (result.kind === 'not-configured') return 'not-configured';
  if (result.kind === 'live' || result.kind === 'partial' || result.kind === 'conflict') return 'connected';
  return null;
}

function createHubBridge(getHub) {
  return async function callHub(channel, payload, meta = {}) {
    const hub = getHub();
    if (!hub) return envelope('not-configured', null, 'hub');
    try {
      let result;
      if (typeof hub.invoke === 'function') result = await hub.invoke(channel, payload, meta);
      else if (typeof hub[channel] === 'function') result = await hub[channel](payload, meta);
      else return envelope('not-configured', null, 'channel');
      return normalizeEnvelope(result);
    } catch (error) {
      return envelope('error', null, String(error && error.message ? error.message : error));
    }
  };
}

// 허브 패키지 모듈에서 hub 객체를 만든다. 모듈은 다음 중 하나를 내보낸다:
//   createPetHub(ctx) / create(ctx) / 함수 자체(ctx) → hub,  또는 hub 객체(invoke가 있는)
function hubFromModule(mod, ctx) {
  if (!mod) return null;
  const factory = typeof mod === 'function' ? mod : mod.createPetHub || mod.create || null;
  if (typeof factory === 'function') return factory(ctx) || null;
  if (typeof mod.invoke === 'function') return mod;
  return null;
}

module.exports = { HUB_CHANNELS, FOCUS_CHANNELS, envelope, normalizeEnvelope, statusFromEnvelope, createHubBridge, hubFromModule };
