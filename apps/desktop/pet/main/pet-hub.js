'use strict';
// Moonlight Pet — 셸이 쓰는 `hub` 객체. 전송(pet-hub-client)·엔드포인트(pet-hub-api)·보류 명령(pet-pending)·
// 알림(pet-activity)·대화(pet-chat)·Council 전달을 한데 묶는다. Electron 을 require 하지 않는다.
//
// 셸 연결 예(main 프로세스):
//   const { createPetHub } = require('./pet/main/pet-hub');
//   const { electronCookieBridge } = require('./pet/main/pet-hub-client');
//   const bridge = electronCookieBridge(session.defaultSession);
//   const hub = createPetHub({ origin: currentHubUrl(), store: petStore, ...bridge,
//     onEvent: (name, payload) => petWindows.forEach((w) => w.webContents.send(name, payload)),
//     canPresentBanner: () => !focusRunning && !panelBusy });
//   ipcMain.handle('pet:tasks-list', () => hub.tasksList());   // 채널 이름 = 메서드 이름(camelCase)
//   hub.startPolling();   // 60초마다 알림 원천 조회(연결된 동안)
//
// 모든 채널 메서드는 { kind, data, error, httpStatus } 로 풀린다(throw 하지 않는다).
// kind: 성공 'live' | 'partial', 실패 'preview' | 'unauthorized' | 'not-configured' | 'conflict' | 'error' | 'invalid'.

const { randomUUID } = require('node:crypto');
const { LIMITS, CHARACTERS } = require('../shared/contract');
const { canonicalOrigin, createHubClient, fail, okEnvelope, errorEnvelope, HubError } = require('./pet-hub-client');
const { createHubApi, isUuid } = require('./pet-hub-api');
const { createPending } = require('./pet-pending');
const { createActivity, badgeLabel } = require('./pet-activity');
const { createChat } = require('./pet-chat');
const { councilHandoffPath, SOURCE_KINDS } = require('./pet-council-handoff');

const HUB_STATUSES = Object.freeze(['connected', 'unauthorized', 'not-configured', 'offline', 'unknown']);

function characterNameByOffice(officeId) {
  const found = CHARACTERS.find((c) => c.officeId === officeId);
  return found ? found.name : officeId;
}

// 봉투 → 연결 상태. 서버 오류·충돌·검증 실패는 연결 상태를 바꾸지 않는다(null).
function statusFromEnvelope(envelope) {
  switch (envelope.kind) {
    case 'live':
    case 'partial':
    case 'preview':
      return 'connected';
    case 'unauthorized':
      return 'unauthorized';
    case 'not-configured':
      return 'not-configured';
    default:
      return envelope.error === 'offline' || envelope.error === 'timeout' ? 'offline' : null;
  }
}

// Council 안건 → 허브 상대 경로(apps/hub council-desktop-handoff 인코딩). 틀리면 던진다.
function councilHandoffUrl(draft, sourceKind = 'text') {
  return councilHandoffPath(draft, sourceKind);
}

function defaultInterval(fn, ms) {
  const timer = setInterval(fn, ms);
  if (timer && typeof timer.unref === 'function') timer.unref();
  return () => clearInterval(timer);
}

// options:
//   origin            허브 주소(설정값). 비었거나 규칙 밖이면 모든 채널이 not-configured('hub-url-missing').
//   fetch             fetch 구현(기본 globalThis.fetch)
//   cookieHeader      async (url) → Cookie 헤더 값(메인 창 세션 공유)
//   storeCookies      async (setCookie[], url) → void (선택)
//   store             { get(key), set(key, value) } — userData/pet-store.json
//   onEvent           (name, payload) → void — contract.PET_EVENTS 이름으로 부른다
//   canPresentBanner  (notice) → boolean — 집중·누름·패널 사용 중이면 false(말풍선 보류, 나중에 presentNext)
//   now, uuid, schedule(fn, ms)→cancel, setInterval(fn, ms)→cancel — 테스트 주입
function createPetHub(options = {}) {
  const clock = options.now || Date.now;
  const uuid = options.uuid || randomUUID;
  const store = options.store || null;
  const startInterval = options.setInterval || defaultInterval;
  let onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
  let bannerGate = typeof options.canPresentBanner === 'function' ? options.canPresentBanner : () => true;

  let conn = null; // { origin, client, api, pending, ready }
  let hubStatus = 'unknown';
  let lastBadge = 0;
  let stopPollingFn = null;
  let pollInFlight = null;

  function emit(name, payload) {
    try {
      onEvent(name, payload);
    } catch {
      // 창이 닫혀 있어도 모델은 계속된다.
    }
  }

  function setHubStatus(next) {
    if (!next || !HUB_STATUSES.includes(next) || next === hubStatus) return;
    hubStatus = next;
    emit('pet:hub-status', { status: hubStatus });
  }

  const activity = createActivity({ store, now: clock, schedule: options.schedule });
  activity.onBanner = (notice) => {
    let allowed = false;
    try {
      allowed = bannerGate(notice) === true;
    } catch {
      allowed = false;
    }
    if (allowed) emit('pet:notice', { notice });
    return allowed;
  };
  activity.onChange = (snapshot) => {
    if (snapshot.unreadCount !== lastBadge) {
      lastBadge = snapshot.unreadCount;
      emit('pet:badge', { count: snapshot.unreadCount, label: badgeLabel(snapshot.unreadCount) });
    }
  };

  const chat = createChat({
    now: clock, uuid, activity, characterName: characterNameByOffice,
    onReply: (payload) => emit('pet:chat-reply', payload),
  });

  function connect(originInput) {
    const origin = canonicalOrigin(originInput);
    if (conn && origin === conn.origin) return conn.ready;
    conn = null;
    if (!origin) {
      chat.configure({ service: null, origin: null });
      const ready = activity.configure({ service: null, origin: null });
      setHubStatus('not-configured');
      return ready.then(() => undefined);
    }
    const client = createHubClient({
      origin, fetch: options.fetch, cookieHeader: options.cookieHeader, storeCookies: options.storeCookies,
      setTimeout: options.setTimeout, clearTimeout: options.clearTimeout,
    });
    const api = createHubApi(client);
    const pending = createPending({ api, store, origin, now: clock });
    const next = { origin, client, api, pending, ready: null };
    chat.configure({ service: api, origin });
    next.ready = Promise.all([pending.load(), activity.configure({ service: api, origin })]).then(() => undefined);
    conn = next;
    setHubStatus('unknown');
    return next.ready;
  }

  // 공통 실행기: 연결 확인 → 실행 → 봉투. 도중에 origin 이 바뀌면 늦은 결과를 현재 화면에 넣지 않는다.
  async function run(fn) {
    const current = conn;
    if (!current) return errorEnvelope(fail('not-configured', 'hub-url-missing'));
    await current.ready;
    let envelope;
    try {
      const result = await fn(current);
      envelope = okEnvelope(result.kind || 'live', result.data);
    } catch (error) {
      envelope = errorEnvelope(error instanceof HubError ? error : fail('error', 'unexpected'));
    }
    if (current !== conn) return errorEnvelope(fail('error', 'stale-origin'));
    setHubStatus(statusFromEnvelope(envelope));
    return envelope;
  }

  const sortTasks = (tasks) => tasks.filter((t) => t.status !== 'cancelled')
    .map((t, index) => ({ t, index }))
    .sort((a, b) => (a.t.status === 'done') - (b.t.status === 'done') || a.index - b.index)
    .map(({ t }) => t);

  // ── 채널 ─────────────────────────────────────────────────────────────
  const hub = {
    // 'pet:hub-session' → { status:'authenticated'|'anonymous', configured, reason }
    async session() {
      const envelope = await run(async (c) => ({ data: await c.client.sessionStatus() }));
      if (envelope.kind === 'live') {
        const { status, configured } = envelope.data;
        setHubStatus(!configured ? 'not-configured' : status === 'authenticated' ? 'connected' : 'unauthorized');
      }
      return envelope;
    },

    // 'pet:tasks-list' → { tasks, partial, pending }
    tasksList() {
      return run(async (c) => {
        const page = await c.api.tasks();
        return { kind: page.partial ? 'partial' : 'live', data: { tasks: sortTasks(page.tasks), partial: page.partial, pending: c.pending.summary() } };
      });
    },

    // 'pet:tasks-add' {title, id?} → { task, title(확인된 명령의 제목), replayed, recovered, pending }
    tasksAdd(payload = {}) {
      return run(async (c) => {
        const result = await c.pending.addTask({ title: payload.title, id: payload.id });
        return { data: { ...result, pending: c.pending.summary() } };
      });
    },

    // 'pet:tasks-toggle' {id, status:'done'|'todo', expectedUpdatedAt} → { task }
    tasksToggle(payload = {}) {
      return run(async (c) => {
        if (!isUuid(payload.id) || (payload.status !== 'done' && payload.status !== 'todo')) throw fail('error', 'invalid-input');
        const task = await c.api.setTask({ id: payload.id, updatedAt: payload.expectedUpdatedAt }, payload.status === 'done');
        return { data: { task } };
      });
    },

    // 'pet:journal-read' {entryId?} → { entry|null, pending } — entryId 가 없으면 이 펫이 마지막으로 저장한 메모.
    journalRead(payload = {}) {
      return run(async (c) => {
        const id = isUuid(payload.entryId) ? payload.entryId : c.pending.savedMemoId();
        const entry = id ? await c.api.memo(id) : null;
        return { data: { entry, pending: c.pending.summary() } };
      });
    },

    // 'pet:journal-save' {body, requestId?, entryId?, expectedRevision?, title?, occurredAt?, asNew?, finish?}
    //   → { entry, verified:true, replayed, unchanged, pending }
    //   asNew:true = '새 항목으로 Hub에 저장'(충돌 복구). finish:true = 빠른 캡처 끝(다음 입력은 새 메모).
    journalSave(payload = {}) {
      return run(async (c) => {
        const result = await c.pending.saveMemo(payload);
        return { data: { ...result, pending: c.pending.summary() } };
      }).then((envelope) => {
        const current = conn;
        if (envelope.kind !== 'live' && envelope.error !== 'stale-origin' && current && envelope.data === null) {
          envelope.data = { pending: current.pending.summary() };
        }
        return envelope;
      });
    },

    // 확인된 캡처를 끝낸다(렌더러가 finish 플래그 대신 따로 부를 때).
    memoFinishCapture(entry) {
      return Boolean(conn && conn.pending.finishMemoCapture(entry));
    },

    // 'pet:calendar-week' {dateISO} → { events:[{key,id,title,start,end,allDay,location,source,startMs,endMs,dates}], status, weekStart, weekEnd, partial }
    calendarWeek(payload = {}) {
      return run(async (c) => {
        const week = await c.api.calendarWeek(payload.dateISO, clock());
        return { kind: week.partial ? 'partial' : 'live', data: week };
      });
    },

    // 'pet:notices-list' → { notices, unreadCount, badge(표시 문자열: ''|'1'…'99'|'99+'), totalInquiryCount, message,
    //   bannersEnabled, sources:{inquiry, event}('ok'|오류 코드) }
    // 한 원천만 실패하면 partial, 둘 다 실패하면 그 오류 kind — 어느 쪽이든 이전 목록(data)은 함께 준다.
    async noticesList() {
      if (!conn) return errorEnvelope(fail('not-configured', 'hub-url-missing'));
      await conn.ready;
      if (!activity.isLoaded()) await hub.tick();
      const list = activity.list();
      const failed = activity.sourceErrors();
      if (!failed.length) return okEnvelope('live', list);
      if (failed.length === 1) return okEnvelope('partial', list);
      return { ...errorEnvelope(failed[0]), data: list };
    },

    // 'pet:notices-read' {id} → { target, …목록 } — target: {type:'hub',path} | {type:'calendar',dateISO} | {type:'chat',ownerId,scope}
    // 허브의 미확인 상태는 바꾸지 않는다(허브 상세 화면이 읽음 처리를 한다).
    noticesRead(payload = {}) {
      const target = activity.read(payload.id);
      if (!target) return Promise.resolve(errorEnvelope(fail('error', 'invalid-input')));
      return Promise.resolve(okEnvelope('live', { target, ...activity.list() }));
    },
    noticesHide(payload = {}) {
      if (!activity.hide(payload.id)) return Promise.resolve(errorEnvelope(fail('error', 'invalid-input')));
      return Promise.resolve(okEnvelope('live', activity.list()));
    },
    noticesReadAll() {
      activity.readAll();
      return Promise.resolve(okEnvelope('live', activity.list()));
    },

    // 'pet:chat-send' {ownerId, scope, message} → { turn, userTurn }
    async chatSend(payload = {}) {
      const current = conn;
      if (current) await current.ready;
      const envelope = await chat.send(payload);
      if (current && current === conn) setHubStatus(statusFromEnvelope(envelope));
      return envelope;
    },
    // 'pet:chat-cancel' {} → { cancelled }
    chatCancel() {
      return Promise.resolve(okEnvelope('live', { cancelled: chat.cancel() }));
    },
    // 'pet:chat-session' {ownerId, scope, draft?} → { turns, draft, busy, sending, error }
    // 이 대화를 '보고 있음'으로 표시하고 그 대화의 답변 알림을 거둔다. 창을 접으면 셸이 hub.chatLeave() 를 부른다.
    chatSession(payload = {}) {
      try {
        const data = chat.session(payload);
        chat.view(payload);
        activity.acknowledgeAgentReplies(payload.ownerId, payload.scope);
        return Promise.resolve(okEnvelope('live', data));
      } catch (error) {
        return Promise.resolve(errorEnvelope(error));
      }
    },
    chatLeave() {
      chat.clearViewing();
    },

    // 'pet:council-handoff' {draft, source?:'text'|'memo'|'task'} → { path, url }
    // path 는 허브 상대 경로 — 셸이 'pet:open-hub' 와 같은 방식으로 메인 창에서 연다. AI 호출은 허브에서 사용자가 누를 때만.
    councilHandoff(payload = {}) {
      if (!conn) return Promise.resolve(errorEnvelope(fail('not-configured', 'hub-url-missing')));
      const kind = SOURCE_KINDS.includes(payload.source) ? payload.source : 'text';
      try {
        const path = councilHandoffUrl(payload.draft, kind);
        return Promise.resolve(okEnvelope('live', { path, url: conn.origin + path }));
      } catch {
        return Promise.resolve(errorEnvelope(fail('error', 'invalid-input')));
      }
    },
    councilHandoffUrl,

    // ── 셸용 ─────────────────────────────────────────────────────────
    setOrigin: connect,
    get origin() {
      return conn ? conn.origin : null;
    },
    get status() {
      return hubStatus;
    },
    badge() {
      const count = activity.unreadCount();
      return { count, label: badgeLabel(count) };
    },
    // 알림 원천을 한 번 읽는다(폴링 한 칸). 결과로 연결 상태도 갱신한다.
    async tick(nowMs) {
      const current = conn;
      if (!current) return { skipped: true };
      await current.ready;
      if (pollInFlight) return pollInFlight;
      pollInFlight = (async () => {
        const result = await activity.tick(nowMs ?? clock());
        if (current === conn && !result.skipped) {
          if (result.succeeded > 0) setHubStatus('connected');
          else if (result.errors.length) setHubStatus(statusFromEnvelope(errorEnvelope(result.errors[0])));
        }
        return result;
      })();
      try {
        return await pollInFlight;
      } finally {
        pollInFlight = null;
      }
    },
    startPolling(intervalMs = LIMITS.pollMs) {
      if (stopPollingFn) return;
      hub.tick().catch(() => {});
      stopPollingFn = startInterval(() => {
        hub.tick().catch(() => {});
      }, intervalMs);
    },
    stopPolling() {
      if (stopPollingFn) stopPollingFn();
      stopPollingFn = null;
    },
    presentNext: () => activity.presentNext(),
    dismissBanner: () => activity.dismissBanner(),
    setBannersEnabled: (enabled) => activity.setBannersEnabled(enabled),
    setBannerGate(fn) {
      bannerGate = typeof fn === 'function' ? fn : () => true;
    },
    setEventSink(fn) {
      onEvent = typeof fn === 'function' ? fn : () => {};
    },
    // 공유 세션이라 메인 창도 로그아웃된다 — 사용자가 명시적으로 고를 때만.
    logout() {
      return run(async (c) => ({ data: await c.client.logout() }));
    },
    dispose() {
      hub.stopPolling();
      chat.configure({ service: null, origin: null });
      activity.configure({ service: null, origin: null }).catch(() => {});
      conn = null;
    },
    // 내부 모듈(테스트·진단용)
    activity,
    chat,
  };

  connect(options.origin);
  return hub;
}

module.exports = { createPetHub, councilHandoffUrl, statusFromEnvelope, characterNameByOffice, HUB_STATUSES };
