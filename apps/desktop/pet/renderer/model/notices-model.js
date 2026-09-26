// 알림 화면·배지·말풍선의 순수 규칙 — 배지 99+, 상대 시각, 종류별 기호, 표시 목록, 이동 목적지.
'use strict';
(function (root, factory) {
  const C = typeof require === 'function' ? require('../../shared/contract.js') : root.PetContract;
  const api = factory(C);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else (root.PetModel = root.PetModel || {}).notices = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  const KIND = Object.freeze({
    inquiry: Object.freeze({ glyph: 'tray', label: '문의' }),
    event: Object.freeze({ glyph: 'calendar', label: '일정' }),
    reply: Object.freeze({ glyph: 'bubble', label: '답변' }),
  });

  function badgeText(count) {
    const n = Math.floor(Number(count) || 0);
    if (n <= 0) return '';
    return n > 99 ? '99+' : String(n);
  }

  function kindInfo(kind) { return KIND[kind] || KIND.inquiry; }

  function toDate(at) {
    if (at instanceof Date) return at;
    const ms = Date.parse(at);
    return Number.isFinite(ms) ? new Date(ms) : null;
  }

  function relativeTime(at, now) {
    const d = toDate(at);
    if (!d) return '';
    const ref = now || new Date();
    const diff = ref - d;
    if (diff < 0) {
      const ahead = Math.round(-diff / 60000);
      return ahead <= 1 ? '곧' : `${ahead}분 뒤`;
    }
    const min = Math.floor(diff / 60000);
    if (min < 1) return '방금';
    if (min < 60) return `${min}분 전`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `${hours}시간 전`;
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  }

  // 숨긴 알림은 빼고 최신순. 원본 배열은 건드리지 않는다.
  function visibleNotices(list) {
    return (Array.isArray(list) ? list : [])
      .filter((n) => n && n.id != null && !n.hidden)
      .slice()
      .sort((a, b) => (toDate(b.at) || 0) - (toDate(a.at) || 0));
  }

  function headerLabel({ loading, failed, unreadCount, total }) {
    if (loading) return '알림 확인 중…';
    if (failed && !total) return '알림 확인 필요';
    return `새 알림 ${Number(unreadCount) || 0}개 · 전체 ${Number(total) || 0}개`;
  }

  // target → 이동. 문자열 허브 경로, { path }, { mode, ... }, { url }(외부) 를 받는다.
  function resolveTarget(notice) {
    const t = notice && notice.target;
    if (typeof t === 'string') {
      if (t.startsWith('/') && !t.startsWith('//')) return { kind: 'hub', path: t };
      if (/^https?:\/\//i.test(t)) return { kind: 'external', url: t };
    } else if (t && typeof t === 'object') {
      if (typeof t.path === 'string' && t.path.startsWith('/') && !t.path.startsWith('//')) return { kind: 'hub', path: t.path };
      if (typeof t.mode === 'string' && C.MODES.includes(t.mode)) return { kind: 'mode', mode: t.mode, date: t.date || null, ownerId: t.ownerId || null, scope: t.scope || null };
      if (typeof t.url === 'string' && /^https?:\/\//i.test(t.url)) return { kind: 'external', url: t.url };
    }
    if (notice && notice.kind === 'event') return { kind: 'mode', mode: 'calendar', date: null };
    if (notice && notice.kind === 'reply') return { kind: 'mode', mode: 'council' };
    return { kind: 'hub', path: C.HUB_PATHS.notifications };
  }

  // 펫 옆 말풍선 첫 줄. 알림 수·연결 상태에서만 만든다(업무 데이터는 말풍선이 따로 읽지 않는다).
  function bubbleSummary({ hubStatus, badge }) {
    const n = Number(badge) || 0;
    if (hubStatus === 'unauthorized') return 'Hub 로그인이 필요해요. 메인 창에서 로그인해 주세요.';
    if (hubStatus === 'not-configured') return 'Hub 주소가 아직 없어요. 메인 창에서 정해 주세요.';
    if (hubStatus === 'offline') return 'Hub에 연결하지 못했어요. 입력은 이 PC에 보관돼요.';
    if (n > 0) return `새 알림 ${n > 99 ? '99+' : n}개가 있어요.`;
    return '새 알림은 없어요. 펫을 눌러 빠른 기능을 열어요.';
  }

  return { KIND, badgeText, kindInfo, relativeTime, visibleNotices, headerLabel, resolveTarget, bubbleSummary };
});
