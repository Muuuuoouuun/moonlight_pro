// 플랫폼 규칙(순수) — 창 안 단축키의 주 수정키(Windows Ctrl / macOS ⌘)와 사용자에게 보이는 기기 명사('이 PC' / '이 Mac').
// 감지는 렌더러 안에서 navigator 로 한다(프리로드는 샌드박스라 platform 을 싣지 않는다). 모든 함수가 platform 인자를 받아
// 테스트가 두 플랫폼을 다 덮는다. 인자를 생략하면 렌더러에서는 현재 창의 플랫폼, Node 테스트에서는 'win'(기존 기대값 유지).
'use strict';
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else (root.PetModel = root.PetModel || {}).platform = api;
  // 렌더러 페이지면 <html data-platform="mac|win"> 을 가능한 한 일찍 단다(CSS 가 플랫폼별 창 모서리 반경 등을 읽는다).
  if (typeof document !== 'undefined' && document.documentElement) document.documentElement.dataset.platform = api.current();
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  const MAC = 'mac';
  const WIN = 'win';

  // navigator(또는 같은 모양의 객체) → 'mac' | 'win'. 알 수 없으면 기존 동작인 'win'.
  function detect(nav) {
    const n = nav || {};
    const uad = n.userAgentData && typeof n.userAgentData.platform === 'string' ? n.userAgentData.platform : '';
    const text = `${uad} ${typeof n.platform === 'string' ? n.platform : ''}`;
    if (/mac/i.test(text)) return MAC;
    if (!text.trim() && typeof n.userAgent === 'string' && /Macintosh|Mac OS X/i.test(n.userAgent)) return MAC;
    return WIN;
  }

  let cached = null;
  // 렌더러(document 가 있는 페이지)에서만 navigator 를 읽는다. Node 에는 navigator 가 있어도 테스트 기대값은 'win' 이다.
  function current() {
    if (cached) return cached;
    cached = typeof document !== 'undefined' && root.navigator ? detect(root.navigator) : WIN;
    return cached;
  }
  const pick = (platform) => (platform === MAC || platform === WIN ? platform : current());
  const isMac = (platform) => pick(platform) === MAC;

  // 주 수정키가 '정확히' 눌렸는가 — 다른 수정키가 섞이면 아니다(Windows: Ctrl 만, mac: ⌘ 만. Alt 는 전역 단축키 몫).
  function primaryDown(e, platform) {
    if (!e || e.altKey) return false;
    return isMac(platform) ? !!e.metaKey && !e.ctrlKey : !!e.ctrlKey && !e.metaKey;
  }

  // 단축키 표시: key 는 '1'~'7' · 'S' · 'Enter' · 'Esc'. Windows 'Ctrl+S' · 'Ctrl+Enter', macOS '⌘S' · '⌘Return'(프로토타입 표기).
  function hotkey(key, platform) {
    const k = String(key);
    if (k === 'Esc') return 'Esc';
    return isMac(platform) ? `⌘${k === 'Enter' ? 'Return' : k}` : `Ctrl+${k}`;
  }

  const device = (platform) => (isMac(platform) ? '이 Mac' : '이 PC');
  // 사용자에게 보이는 문구의 '이 PC' 를 플랫폼 기기 명사로 바꾼다(저장 키·ID 는 건드리지 않는다).
  const localize = (text, platform) => (isMac(platform) ? String(text).replace(/이 PC/g, '이 Mac') : String(text));

  return { MAC, WIN, detect, current, isMac, primaryDown, hotkey, device, localize };
});
