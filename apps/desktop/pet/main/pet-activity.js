'use strict';
// Moonlight Pet — 알림 모델(Mac PetActivityStore 이식). 로컬 표시 상태만 다룬다:
// 숨기기·읽음은 절대 허브의 미확인 상태를 바꾸지 않는다.
//   원천: 미확인 문의(최신 25 + 전체 개수) · 지금부터 10분 안에 시작하는 시각 일정(now..+24h 조회, 종일 제외) ·
//         보고 있지 않은 대화에 도착한 에이전트 답변.
//   첫 연결의 기존 문의는 조용히 목록만 채우고, 이후 새 수신 토큰만 말풍선 후보가 된다(각 한 번).
//   전달·읽음·숨김은 허브 origin 별로 최대 1000건 보관(`petNotices.delivery.v1.<origin>`).
// 타이머는 호출자가 가진다: 60초마다 tick(now) 를 부른다. 말풍선 사이 1초 간격만 schedule 로 잡는다.

const { LIMITS } = require('../shared/contract');
const { localDateKey } = require('./pet-hub-api');

const DELIVERY_PREFIX = 'petNotices.delivery.v1.';
const BANNERS_KEY = 'petNotices.banners';
const WINDOW_MS = 24 * 60 * 60 * 1000;
const REPLY_KEEP = 30;

const FRIENDLY = {
  unauthorized: 'Hub 로그인이 필요해요.',
  'operator-login-not-configured': 'Hub 서버에 운영자 로그인 설정이 아직 없어요.',
  offline: 'Hub에 연결하지 못했어요.',
  timeout: 'Hub 응답이 늦어지고 있어요.',
  preview: 'Hub 데이터 연결이 필요해요.',
};
function friendly(error) {
  const code = error && error.error;
  return FRIENDLY[code] || 'Hub 응답을 확인하지 못했어요.';
}

// 0 은 숨김(''), 100 이상은 '99+'.
function badgeLabel(count) {
  if (!Number.isFinite(count) || count <= 0) return '';
  return count > 99 ? '99+' : String(Math.floor(count));
}

function recentUnique(values) {
  const seen = new Set();
  const out = [];
  for (let i = values.length - 1; i >= 0 && out.length < LIMITS.noticesKept; i -= 1) {
    const value = values[i];
    if (typeof value !== 'string' || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out.reverse();
}

function sanitizeDelivery(value) {
  const list = (v) => (Array.isArray(v) ? recentUnique(v) : []);
  const source = value && typeof value === 'object' ? value : {};
  return { delivered: list(source.delivered), hidden: list(source.hidden), read: list(source.read) };
}

function hhmm(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function defaultSchedule(fn, ms) {
  const timer = setTimeout(fn, ms);
  if (timer && typeof timer.unref === 'function') timer.unref();
  return () => clearTimeout(timer);
}

// options: { store, now, schedule(fn, ms) → cancel, gapMs }
function createActivity(options = {}) {
  const store = options.store || null;
  const clock = options.now || Date.now;
  const schedule = options.schedule || defaultSchedule;
  const gapMs = options.gapMs ?? LIMITS.bubbleGapMs;

  let api = null;
  let generation = 0;
  let storageKey = null;
  let delivery = sanitizeDelivery(null);
  let refreshing = false;
  let loaded = false;
  let bannersEnabled = true;
  let inquiryNotices = [];
  let eventNotices = [];
  let replyNotices = [];
  let eligible = new Set();
  let hasInquiryBaseline = false;
  let receivedInquiries = new Set();
  let ready = new Set();
  let notices = [];
  let banner = null;
  let cancelGap = null;
  let totalInquiryCount = 0;
  let message = 'Hub에 연결하면 문의와 다가오는 일정을 확인해요.';
  // 마지막 조회에서 원천별 실패(HubError) — 빈 받은함과 실패를 구별한다.
  let sourceErrors = { inquiry: null, event: null };
  const hooks = { onBanner: null, onBannerDismissed: null, onChange: null };

  const isUnread = (id) => !delivery.read.includes(id);
  const unreadCount = () => notices.filter((n) => isUnread(n.id)).length;

  function persist() {
    delivery = sanitizeDelivery(delivery);
    if (!store || !storageKey) return;
    try {
      const result = store.set(storageKey, { delivered: delivery.delivered, hidden: delivery.hidden, read: delivery.read });
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      // 다음 저장에서 다시 시도된다.
    }
  }

  function changed() {
    if (hooks.onChange) {
      try {
        hooks.onChange(snapshot());
      } catch {
        // 알림 받는 쪽 실패는 모델 상태를 바꾸지 않는다.
      }
    }
  }

  function publicNotice(n) {
    return { id: n.id, kind: n.kind, title: n.title, body: n.body, at: n.at, read: !isUnread(n.id), hidden: false, target: { ...n.target } };
  }

  function rebuild(nowMs) {
    const hidden = new Set(delivery.hidden);
    notices = [...replyNotices, ...eventNotices, ...inquiryNotices].filter((n) => !hidden.has(n.id) && (n.eventMs == null || n.eventMs >= nowMs));
    if (banner && !notices.some((n) => n.id === banner.id)) dismissBanner();
  }

  function snapshot() {
    const count = unreadCount();
    return {
      notices: notices.map(publicNotice),
      unreadCount: count,
      badge: badgeLabel(count),
      totalInquiryCount,
      message,
      bannersEnabled,
      banner: banner ? publicNotice(banner) : null,
      loaded,
      sources: {
        inquiry: sourceErrors.inquiry ? sourceErrors.inquiry.error : loaded ? 'ok' : 'unknown',
        event: sourceErrors.event ? sourceErrors.event.error : loaded ? 'ok' : 'unknown',
      },
    };
  }

  // 새 연결(또는 연결 해제: service=null). 이전 origin 의 내용은 즉시 지운다.
  async function configure({ service = null, origin = null } = {}) {
    generation += 1;
    const ticket = generation;
    api = service;
    refreshing = false;
    loaded = false;
    if (cancelGap) cancelGap();
    cancelGap = null;
    banner = null;
    notices = [];
    inquiryNotices = [];
    eventNotices = [];
    replyNotices = [];
    totalInquiryCount = 0;
    eligible = new Set();
    hasInquiryBaseline = false;
    receivedInquiries = new Set();
    ready = new Set();
    sourceErrors = { inquiry: null, event: null };
    storageKey = origin ? DELIVERY_PREFIX + origin : null;
    delivery = sanitizeDelivery(null);
    message = service ? '알림을 불러오는 중이에요.' : 'Hub 연결이 필요해요. 연결 설정에서 확인해 주세요.';
    changed();
    let stored = null;
    let bannersValue = null;
    if (store) {
      try {
        stored = storageKey ? await store.get(storageKey) : null;
        bannersValue = await store.get(BANNERS_KEY);
      } catch {
        stored = null;
      }
    }
    if (ticket !== generation) return false;
    delivery = sanitizeDelivery(stored);
    bannersEnabled = typeof bannersValue === 'boolean' ? bannersValue : true;
    return true;
  }

  // 문의·일정을 함께 읽는다. 한 원천이 실패해도 다른 원천은 반영하고, 실패는 message·errors 로 드러낸다.
  async function refresh(nowMs = clock()) {
    if (!api || refreshing) return { skipped: true, errors: [], succeeded: 0 };
    const ticket = generation;
    const service = api;
    refreshing = true;
    let inquiryResult;
    let calendarResult;
    try {
      [inquiryResult, calendarResult] = await Promise.all([
        service.inquiries().then((value) => ({ value }), (error) => ({ error })),
        service.calendar(new Date(nowMs), new Date(nowMs + WINDOW_MS)).then((value) => ({ value }), (error) => ({ error })),
      ]);
    } finally {
      if (ticket === generation) refreshing = false;
    }
    if (ticket !== generation) return { skipped: true, errors: [], succeeded: 0 };
    const messages = [];
    const errors = [];
    if (inquiryResult.value) {
      const page = inquiryResult.value;
      ready.add('inquiry');
      sourceErrors.inquiry = null;
      totalInquiryCount = page.unreadCount;
      const tokens = page.inquiries.map((i) => i.token);
      // 첫 연결의 기존 미확인은 조용히 목록만 채운다.
      if (hasInquiryBaseline) tokens.filter((t) => !receivedInquiries.has(t)).forEach((t) => eligible.add(t));
      else hasInquiryBaseline = true;
      tokens.forEach((t) => receivedInquiries.add(t));
      inquiryNotices = page.inquiries.map((i) => ({
        id: i.token, kind: 'inquiry', title: i.title, body: i.subtitle, at: i.updatedAt || new Date(nowMs).toISOString(),
        eventMs: null, target: { type: 'hub', path: i.path, inquiryId: i.id },
      }));
      if (page.unreadCount > page.inquiries.length) messages.push(`문의 최신 ${page.inquiries.length}개 · 전체 미확인 ${page.unreadCount}개`);
    } else {
      ready.delete('inquiry');
      sourceErrors.inquiry = inquiryResult.error;
      errors.push(inquiryResult.error);
      messages.push(`문의: ${friendly(inquiryResult.error)}`);
    }
    if (calendarResult.value) {
      const page = calendarResult.value;
      ready.add('event');
      sourceErrors.event = null;
      eventNotices = page.events
        .filter((e) => !e.allDay && e.startMs >= nowMs && e.startMs - nowMs <= LIMITS.upcomingEventMinutes * 60000)
        .map((e) => ({
          id: `event:${e.key}:${Math.floor(e.startMs / 1000)}`, kind: 'event', title: e.title,
          body: `${hhmm(e.startMs)} 시작 · 일정이 곧 있어요.`, at: new Date(e.startMs).toISOString(), eventMs: e.startMs,
          target: { type: 'calendar', dateISO: localDateKey(e.startMs), eventKey: e.key },
        }));
      eventNotices.forEach((n) => eligible.add(n.id));
      if (page.partial) messages.push('일정 일부만 확인했어요. 전체 일정은 Hub에서 확인해 주세요.');
    } else {
      ready.delete('event');
      sourceErrors.event = calendarResult.error;
      errors.push(calendarResult.error);
      messages.push(`일정: ${friendly(calendarResult.error)}`);
    }
    loaded = true;
    message = messages.length ? messages.join('\n') : null;
    rebuild(nowMs);
    presentNext(nowMs);
    changed();
    return { skipped: false, errors, succeeded: (inquiryResult.value ? 1 : 0) + (calendarResult.value ? 1 : 0) };
  }

  // 말풍선 하나. onBanner(notice) 가 true 를 돌려야 전달로 기록한다(누름·집중·패널 사용 중이면 false → 나중에 다시).
  function presentNext(nowMs = clock()) {
    rebuild(nowMs);
    if (!bannersEnabled || banner || cancelGap) return null;
    const next = notices.find((n) => eligible.has(n.id) && isUnread(n.id) && !delivery.delivered.includes(n.id) && ready.has(n.kind));
    if (!next) return null;
    banner = next;
    let accepted = false;
    try {
      accepted = hooks.onBanner ? hooks.onBanner(publicNotice(next)) === true : false;
    } catch {
      accepted = false;
    }
    if (accepted) {
      delivery.delivered.push(next.id);
      persist();
      return publicNotice(next);
    }
    banner = null;
    return null;
  }

  // 말풍선을 내린다(읽음 아님). 다음 말풍선은 간격 뒤에.
  function dismissBanner() {
    if (!banner) return;
    banner = null;
    if (hooks.onBannerDismissed) {
      try {
        hooks.onBannerDismissed();
      } catch {
        // 무시
      }
    }
    if (cancelGap) cancelGap();
    const ticket = generation;
    cancelGap = schedule(() => {
      if (ticket !== generation) return;
      cancelGap = null;
      presentNext();
      changed();
    }, gapMs);
  }

  function addAgentReply({ id, ownerId, scope, title, body = '', at } = {}) {
    if (!id || !ownerId || !scope) return null;
    const token = `reply:${id}`;
    replyNotices = [{
      id: token, kind: 'reply', title: String(title || ''), body: String(body || ''), at: at || new Date(clock()).toISOString(),
      eventMs: null, target: { type: 'chat', ownerId, scope },
    }, ...replyNotices].slice(0, REPLY_KEEP);
    ready.add('reply');
    eligible.add(token);
    presentNext();
    changed();
    return token;
  }

  // 그 담당·범위 대화를 보고 있으면 그 답변 알림만 거둔다(정확히 일치할 때만).
  function acknowledgeAgentReplies(ownerId, scope) {
    const ids = new Set(replyNotices.filter((n) => n.target.ownerId === ownerId && n.target.scope === scope).map((n) => n.id));
    if (!ids.size) return 0;
    replyNotices = replyNotices.filter((n) => !ids.has(n.id));
    if (banner && ids.has(banner.id)) dismissBanner();
    rebuild(clock());
    changed();
    return ids.size;
  }

  function find(id) {
    return notices.find((n) => n.id === id) || null;
  }

  // 알림을 열어 읽음으로. 돌려주는 target: {type:'hub',path} | {type:'calendar',dateISO} | {type:'chat',ownerId,scope}
  function read(id) {
    const notice = find(id);
    if (!notice) return null;
    if (isUnread(id)) {
      delivery.read.push(id);
      persist();
    }
    if (banner && banner.id === id) dismissBanner();
    changed();
    return { ...notice.target };
  }

  function readAll() {
    delivery.read.push(...notices.map((n) => n.id));
    persist();
    dismissBanner();
    changed();
  }

  // 이 PC 에서만 숨긴다 — 허브 미확인 수(totalInquiryCount)는 그대로.
  function hide(id) {
    if (typeof id !== 'string' || !id) return false;
    delivery.hidden.push(id);
    persist();
    if (banner && banner.id === id) dismissBanner();
    rebuild(clock());
    changed();
    return true;
  }

  function setBannersEnabled(enabled) {
    bannersEnabled = Boolean(enabled);
    if (store) {
      try {
        const result = store.set(BANNERS_KEY, bannersEnabled);
        if (result && typeof result.catch === 'function') result.catch(() => {});
      } catch {
        // 무시
      }
    }
    if (!bannersEnabled) dismissBanner();
    else presentNext();
    changed();
  }

  return {
    configure,
    refresh,
    tick: (nowMs) => refresh(nowMs ?? clock()),
    presentNext,
    dismissBanner,
    addAgentReply,
    acknowledgeAgentReplies,
    read,
    readAll,
    hide,
    setBannersEnabled,
    list: snapshot,
    unreadCount,
    isLoaded: () => loaded,
    sourceErrors: () => [sourceErrors.inquiry, sourceErrors.event].filter(Boolean),
    isRefreshing: () => refreshing,
    target: (id) => {
      const notice = find(id);
      return notice ? { ...notice.target } : null;
    },
    set onBanner(fn) { hooks.onBanner = typeof fn === 'function' ? fn : null; },
    get onBanner() { return hooks.onBanner; },
    set onBannerDismissed(fn) { hooks.onBannerDismissed = typeof fn === 'function' ? fn : null; },
    get onBannerDismissed() { return hooks.onBannerDismissed; },
    set onChange(fn) { hooks.onChange = typeof fn === 'function' ? fn : null; },
    get onChange() { return hooks.onChange; },
  };
}

module.exports = { createActivity, badgeLabel, recentUnique, sanitizeDelivery, DELIVERY_PREFIX, BANNERS_KEY };
