// 프리로드 다리 window.moonlightPet 감싸기. 렌더러는 이 파일로만 메인과 이야기한다.
// - 계약에 없는 채널은 부르지 않는다(개발 중 실수를 콘솔에 남김).
// - 허브 채널이 던지면(다리 없음·IPC 오류) 빈 결과가 아니라 error 봉투로 돌려준다 — 실패가 빈 목록으로 위장되지 않게.
'use strict';
(function () {
  const C = window.PetContract;
  const HUB_CHANNELS = new Set([
    'pet:hub-session', 'pet:tasks-list', 'pet:tasks-add', 'pet:tasks-toggle', 'pet:journal-read', 'pet:journal-save',
    'pet:calendar-week', 'pet:notices-list', 'pet:notices-read', 'pet:notices-hide', 'pet:notices-read-all',
    'pet:chat-send', 'pet:chat-cancel', 'pet:chat-session', 'pet:council-handoff',
  ]);
  const api = window.moonlightPet && typeof window.moonlightPet.invoke === 'function' ? window.moonlightPet : null;

  function failure(message) {
    return { kind: 'error', data: null, error: message, httpStatus: 0 };
  }

  function invoke(channel, payload) {
    if (!C.PET_INVOKE.includes(channel)) {
      console.error(`[pet] 계약에 없는 채널: ${channel}`);
      return Promise.resolve(HUB_CHANNELS.has(channel) ? failure('알 수 없는 요청이에요.') : null);
    }
    if (!api) {
      return Promise.resolve(HUB_CHANNELS.has(channel)
        ? { kind: 'not-configured', data: null, error: '데스크톱 앱 안에서만 Hub에 연결해요.', httpStatus: 0 }
        : null);
    }
    return Promise.resolve()
      .then(() => api.invoke(channel, payload == null ? {} : payload))
      .catch((err) => {
        console.error(`[pet] ${channel} 실패`, err);
        return HUB_CHANNELS.has(channel) ? failure('앱 안에서 요청을 전달하지 못했어요. 다시 시도해 주세요.') : null;
      });
  }

  function on(event, handler) {
    if (!C.PET_EVENTS.includes(event)) console.error(`[pet] 계약에 없는 이벤트: ${event}`);
    if (!api || typeof api.on !== 'function') return () => {};
    const off = api.on(event, (payload) => {
      try { handler(payload); } catch (err) { console.error(`[pet] ${event} 처리 실패`, err); }
    });
    return typeof off === 'function' ? off : () => {};
  }

  const store = {
    get: (key) => invoke('pet:store-get', { key }).then((v) => (v === undefined ? null : v)),
    set: (key, value) => invoke('pet:store-set', { key, value }),
  };

  window.PetBridge = Object.freeze({ invoke, on, store, available: !!api, HUB_CHANNELS });
})();
