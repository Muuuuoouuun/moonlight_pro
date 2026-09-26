'use strict';
// Moonlight Pet — 셸이 쓰는 `hub` 객체. 전송(pet-hub-client)·엔드포인트(pet-hub-api)·보류 명령(pet-pending)·
// 알림(pet-activity)·대화(pet-chat)·Council 전달을 한데 묶는다. Electron 을 require 하지 않는다.
//
// 셸 연결 — 두 가지 모양을 모두 받는다.
//   (a) 셸 hubContext 그대로(pet-main 의 loadDefaultHub → createPetHub(ctx) → hub.attach(ctx)):
//       ctx = { emit, store, getHubUrl, session, openMainUrl, getState, ... }. origin·쿠키·이벤트·대화 표시 여부를
//       ctx 에서 읽고, attach 가 60초 폴링을 시작하며, hub.invoke(channel, payload) 가 채널을 메서드로 보낸다.
//       hub.hubUrlChanged(url) 은 허브 주소 변경.
//   (b) 직접 옵션:
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
const { canonicalOrigin, createHubClient, electronCookieBridge, fail, okEnvelope, errorEnvelope, HubError } = require('./pet-hub-client');
const { createHubApi, isUuid } = require('./pet-hub-api');
const { createPending } = require('./pet-pending');
const { createActivity, badgeLabel } = require('./pet-activity');
const { createChat } = require('./pet-chat');
const { councilHandoffPath, SOURCE_KINDS } = require('./pet-council-handoff');

const HUB_STATUSES = Object.freeze(['connected', 'unauthorized', 'not-configured', 'offline', 'unknown']);
// invoke(channel) 가 부를 수 있는 채널 메서드(계약의 허브 채널 — 집중 타이머·셸 채널은 셸 소유).
const CHANNEL_METHODS = Object.freeze([
  'session', 'tasksList', 'tasksAdd', 'tasksToggle', 'journalRead', 'journalSave', 'calendarWeek',
  'noticesList', 'noticesRead', 'noticesHide', 'noticesReadAll', 'chatSend', 'chatCancel', 'chatSession', 'councilHandoff',
]);
// 이 상태에서는 폴링이 알림 원천(문의·일정)을 읽지 않고 세션만 가볍게 확인한다 — 401 을 60초마다 쌓지 않는다.
const PROBE_ONLY_STATUSES = Object.freeze(['unauthorized', 'not-configured']);

// IPC 로 온 payload 는 null·배열·원시값일 수 있다 — 채널 메서드는 던지지 않고 빈 객체로 읽는다.
const payloadOf = (value) => (value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {});

// 세션 응답 → 연결 상태.
function statusFromSession(data) {
  if (!data || !data.configured) return 'not-configured';
  return data.status === 'authenticated' ? 'connected' : 'unauthorized';
}

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

// 이 상태에서 알림 목록을 달라고 하면 목록 대신 이 실패 봉투를 준다(빈 목록을 'live' 로 위장하지 않는다).
function probeFailure(status) {
  return status === 'not-configured' ? fail('not-configured', 'operator-login-not-configured') : fail('unauthorized', 'unauthorized');
}

// 셸(pet-bridge)이 봉투만 보고 정하는 상태 — live/partial/conflict=connected. 허브 모델의 판단과 다르면 뒤이어 바로잡는다.
function shellReadStatus(envelope) {
  if (!envelope) return null;
  if (envelope.kind === 'unauthorized') return 'unauthorized';
  if (envelope.kind === 'not-configured') return 'not-configured';
  if (envelope.kind === 'live' || envelope.kind === 'partial' || envelope.kind === 'conflict') return 'connected';
  return null;
}

function channelMethod(channel) {
  if (channel === 'pet:hub-session') return 'session';
  if (typeof channel !== 'string' || !channel.startsWith('pet:')) return null;
  return channel.slice(4).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
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
//   isChatVisible     () → boolean — 대화 화면이 지금 보이는가(패널이 열려 있고 모드가 office). 보고 있던 대화라도
//                     이 값이 false 면 새 답변은 'reply' 알림이 된다. 셸 ctx 의 getState() 가 있으면 거기서 읽는다.
//   now, uuid, schedule(fn, ms)→cancel, setInterval(fn, ms)→cancel — 테스트 주입
// 셸 hubContext 모양(emit·getHubUrl·session·getState)도 받는다 — 위 옵션이 비어 있을 때만 거기서 채운다.
function fromShellContext(input) {
  const options = input !== null && typeof input === 'object' ? { ...input } : {};
  if (options.origin === undefined && typeof options.getHubUrl === 'function') {
    try {
      options.origin = options.getHubUrl();
    } catch {
      options.origin = null;
    }
  }
  if (!options.cookieHeader && options.session && options.session.cookies) {
    Object.assign(options, electronCookieBridge(options.session));
  }
  if (!options.onEvent && typeof options.emit === 'function') options.onEvent = options.emit;
  if (!options.isChatVisible && typeof options.getState === 'function') options.isChatVisible = chatVisibleFrom(options.getState);
  // 셸 ctx 로 만들면 말풍선 줄은 셸(pet-timing 말풍선 줄)이 가진다 — 허브는 알림을 넘기기만 하고 바로 다음 후보로 간다.
  if (options.bannerHandoff === undefined && typeof options.emit === 'function') options.bannerHandoff = true;
  return options;
}

// 대화(담당 Office 에게 묻고 답 읽기)는 Council 모드 화면이다(renderer/modes/council.js). Office 모드는 허브로 가는 카드.
const CHAT_MODE = 'council';
function chatVisibleFrom(getState) {
  return () => {
    const state = getState();
    return Boolean(state && state.mode === CHAT_MODE && state.panelOpen === true);
  };
}

function createPetHub(input = {}) {
  const options = fromShellContext(input);
  const clock = options.now || Date.now;
  const uuid = options.uuid || randomUUID;
  const store = options.store || null;
  const startInterval = options.setInterval || defaultInterval;
  let onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
  let bannerGate = typeof options.canPresentBanner === 'function' ? options.canPresentBanner : () => true;
  let chatVisible = typeof options.isChatVisible === 'function' ? options.isChatVisible : () => true;

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
    if (allowed) {
      emit('pet:notice', { notice });
      // 넘겨주기: 셸이 8초 보이기·1초 간격을 맡는다. 허브가 이 말풍선을 계속 쥐고 있으면 다음 새 알림이 영영 뜨지 않는다.
      if (options.bannerHandoff) queueMicrotask(() => activity.dismissBanner());
    }
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
    isVisible: () => chatVisible(),
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
  // statusOf(envelope) 가 있으면 연결 상태를 그 값으로 한 번만 정한다(세션 확인처럼 성공 봉투가 곧 '연결됨'이 아닐 때).
  // fn 이 HubError 가 아닌 예외를 던지면 error 'unexpected'.
  async function run(fn, statusOf = statusFromEnvelope) {
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
    setHubStatus(statusOf(envelope));
    return envelope;
  }

  // 실패 봉투에도 보류 명령 요약을 싣는다 — 로그인 필요·오프라인 뒤 다시 보낼 할 일/메모가 있는지 렌더러가 바로 안다.
  function withPendingOnFailure(envelope) {
    const current = conn;
    if (envelope.kind !== 'live' && envelope.kind !== 'partial' && envelope.error !== 'stale-origin' && current && envelope.data === null) {
      envelope.data = { pending: current.pending.summary() };
    }
    return envelope;
  }

  const sortTasks = (tasks) => tasks.filter((t) => t.status !== 'cancelled')
    .map((t, index) => ({ t, index }))
    .sort((a, b) => (a.t.status === 'done') - (b.t.status === 'done') || a.index - b.index)
    .map(({ t }) => t);

  // ── 채널 ─────────────────────────────────────────────────────────────
  const hub = {
    // 'pet:hub-session' → { status:'authenticated'|'anonymous', configured, reason }
    session() {
      return run(async (c) => ({ data: await c.client.sessionStatus() }),
        (envelope) => (envelope.kind === 'live' ? statusFromSession(envelope.data) : statusFromEnvelope(envelope)));
    },

    // 'pet:tasks-list' → { tasks, partial, pending }
    tasksList() {
      return run(async (c) => {
        const page = await c.api.tasks();
        return { kind: page.partial ? 'partial' : 'live', data: { tasks: sortTasks(page.tasks), partial: page.partial, pending: c.pending.summary() } };
      });
    },

    // 'pet:tasks-add' {title, id?} → { task, title(확인된 명령의 제목), replayed, recovered, pending }
    tasksAdd(input) {
      const payload = payloadOf(input);
      return run(async (c) => {
        const result = await c.pending.addTask({ title: payload.title, id: payload.id });
        return { data: { ...result, pending: c.pending.summary() } };
      }).then(withPendingOnFailure);
    },

    // 'pet:tasks-toggle' {id, status:'done'|'todo', expectedUpdatedAt} → { task }
    tasksToggle(input) {
      const payload = payloadOf(input);
      return run(async (c) => {
        if (!isUuid(payload.id) || (payload.status !== 'done' && payload.status !== 'todo')) throw fail('error', 'invalid-input');
        const task = await c.api.setTask({ id: payload.id, updatedAt: payload.expectedUpdatedAt }, payload.status === 'done');
        return { data: { task } };
      });
    },

    // 'pet:journal-read' {entryId?} → { entry|null, pending } — entryId 가 없으면 이 펫이 마지막으로 저장한 메모.
    // 읽을 메모가 없으면(확인된 캡처 메모 없음) Hub 에 묻지 않고 보류 요약만 준다 — 그 성공 봉투로 연결 상태를 바꾸지 않는다.
    journalRead(input) {
      const payload = payloadOf(input);
      let asked = false;
      return run(async (c) => {
        const explicit = isUuid(payload.entryId);
        // 대상 없는 읽기는 캡처 메모 — 캡처 충돌 중에는 요약(summary.savedMemoId)과 같이 비워 둔다.
        const id = explicit ? payload.entryId : c.pending.summary().savedMemoId;
        asked = Boolean(id);
        const entry = id ? await c.api.memo(id) : null;
        // 렌더러가 그 메모를 다시 읽었다 — 명시 편집 충돌 표시를 거둔다(다음 저장은 새 revision 으로 다시 확인된다).
        if (explicit && entry) c.pending.noteMemoRead(payload.entryId);
        return { data: { entry, pending: c.pending.summary() } };
      }, (envelope) => (asked || envelope.kind !== 'live' ? statusFromEnvelope(envelope) : null));
    },

    // 'pet:journal-save' {body, requestId?, entryId?, expectedRevision?, title?, occurredAt?, asNew?, finish?}
    //   → { entry, verified:true, replayed, unchanged, pending }
    //   asNew:true = '새 항목으로 Hub에 저장'(충돌 복구). finish:true = 빠른 캡처 끝(다음 입력은 새 메모).
    journalSave(input) {
      const payload = payloadOf(input);
      return run(async (c) => {
        const result = await c.pending.saveMemo(payload);
        return { data: { ...result, pending: c.pending.summary() } };
      }).then(withPendingOnFailure);
    },

    // 확인된 캡처를 끝낸다(렌더러가 finish 플래그 대신 따로 부를 때).
    memoFinishCapture(entry) {
      return Boolean(conn && conn.pending.finishMemoCapture(entry));
    },

    // 'pet:calendar-week' {dateISO} → { events:[{key,id,title,start,end,allDay,location,source,startMs,endMs,dates}], status, weekStart, weekEnd, partial }
    calendarWeek(input) {
      const payload = payloadOf(input);
      return run(async (c) => {
        const week = await c.api.calendarWeek(payload.dateISO, clock());
        return { kind: week.partial ? 'partial' : 'live', data: week };
      });
    },

    // 'pet:notices-list' → { notices, unreadCount, badge(숫자 = unreadCount), badgeLabel(표시 문자열: ''|'1'…'99'|'99+'), totalInquiryCount, message,
    //   bannersEnabled, sources:{inquiry, event}('ok'|오류 코드) }
    // 한 원천만 실패하면 partial, 둘 다 실패하면 그 오류 kind — 어느 쪽이든 이전 목록(data)은 함께 준다.
    // 로그인 필요·허브 로그인 미설정이면(세션을 한 번 다시 확인한 뒤에도) 목록을 'live' 로 주지 않고 그 실패 봉투를 준다 —
    // 읽지 못한 목록을 빈 목록·예전 목록으로 위장하지 않는다(CLAUDE.md 읽기 실패 봉투 규칙).
    async noticesList() {
      const current = conn;
      if (!current) return errorEnvelope(fail('not-configured', 'hub-url-missing'));
      await current.ready;
      if (!activity.isLoaded() || PROBE_ONLY_STATUSES.includes(hubStatus)) await hub.tick();
      if (current !== conn) return errorEnvelope(fail('error', 'stale-origin'));
      const list = activity.list();
      if (PROBE_ONLY_STATUSES.includes(hubStatus)) return { ...errorEnvelope(probeFailure(hubStatus)), data: list };
      const failed = activity.sourceErrors();
      if (!activity.isLoaded()) return { ...errorEnvelope(failed[0] || fail('error', 'not-loaded')), data: list };
      if (!failed.length) return okEnvelope('live', list);
      if (failed.length === 1) return okEnvelope('partial', list);
      return { ...errorEnvelope(failed[0]), data: list };
    },

    // 'pet:notices-read' {id} → { target, …목록 } — target: {type:'hub',path} | {type:'calendar',dateISO} | {type:'chat',ownerId,scope}
    // 허브의 미확인 상태는 바꾸지 않는다(허브 상세 화면이 읽음 처리를 한다).
    noticesRead(input) {
      const payload = payloadOf(input);
      const target = activity.read(payload.id);
      if (!target) return Promise.resolve(errorEnvelope(fail('error', 'invalid-input')));
      return Promise.resolve(okEnvelope('live', { target, ...activity.list() }));
    },
    noticesHide(input) {
      const payload = payloadOf(input);
      if (!activity.hide(payload.id)) return Promise.resolve(errorEnvelope(fail('error', 'invalid-input')));
      return Promise.resolve(okEnvelope('live', activity.list()));
    },
    noticesReadAll() {
      activity.readAll();
      return Promise.resolve(okEnvelope('live', activity.list()));
    },

    // 'pet:chat-send' {ownerId, scope, message} → { turn, userTurn }
    async chatSend(input) {
      const current = conn;
      if (current) await current.ready;
      const envelope = await chat.send(payloadOf(input));
      if (current && current === conn) setHubStatus(statusFromEnvelope(envelope));
      return envelope;
    },
    // 'pet:chat-cancel' {} → { cancelled }
    chatCancel() {
      return Promise.resolve(okEnvelope('live', { cancelled: chat.cancel() }));
    },
    // 'pet:chat-session' {ownerId, scope, draft?} → { turns, draft, busy(이 대화가 보내는 중: boolean), sending(=busy), busyWith(보내는 대화 {ownerId,scope,message}|null), error }
    // 이 대화를 '보고 있음'으로 표시하고 그 대화의 답변 알림을 거둔다. 실제로 보이는지는 isChatVisible()(셸 ctx 면
    // 패널이 열려 있고 모드가 office)로 답이 올 때 다시 확인한다 — 다른 모드로 옮기거나 접으면 답변은 알림이 된다.
    // payload.leave === true 면 보고 있음을 지운다(렌더러가 대화 화면을 떠날 때).
    chatSession(input) {
      const payload = payloadOf(input);
      if (payload.leave === true) {
        chat.clearViewing();
        return Promise.resolve(okEnvelope('live', { left: true }));
      }
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
    setChatVisibility(fn) {
      chatVisible = typeof fn === 'function' ? fn : () => true;
    },

    // 'pet:council-handoff' {draft, source?:'text'|'memo'|'task'} → { path, url }
    // path 는 허브 상대 경로(조각 '#moonlight-council=…' 포함) — 셸이 'pet:open-hub' 와 같은 방식(widget-window.resolveMainPath,
    // 같은 origin 의 경로·쿼리·조각 허용)으로 메인 창에서 연다. pathname·hash 는 조각을 따로 다루는 셸을 위한 같은 값의 분해.
    // AI 호출은 허브에서 사용자가 누를 때만.
    councilHandoff(input) {
      const payload = payloadOf(input);
      if (!conn) return Promise.resolve(errorEnvelope(fail('not-configured', 'hub-url-missing')));
      const kind = SOURCE_KINDS.includes(payload.source) ? payload.source : 'text';
      try {
        const path = councilHandoffUrl(payload.draft, kind);
        const hashAt = path.indexOf('#');
        return Promise.resolve(okEnvelope('live', {
          path, url: conn.origin + path, pathname: path.slice(0, hashAt), hash: path.slice(hashAt),
        }));
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
    // 로그인 필요·허브 로그인 미설정 상태에서는 원천을 읽지 않고 세션만 확인한다 — 메인 창에서 로그인하면
    // 다음 칸에서 'connected' 로 돌아와 그 칸에서 바로 원천을 읽는다.
    async tick(nowMs) {
      const current = conn;
      if (!current) return { skipped: true };
      await current.ready;
      if (pollInFlight) return pollInFlight;
      pollInFlight = (async () => {
        if (PROBE_ONLY_STATUSES.includes(hubStatus)) {
          await hub.session();
          if (current !== conn || hubStatus !== 'connected') return { skipped: true, probed: true, status: hubStatus };
        }
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
    // 공유 세션이라 메인 창도 로그아웃된다 — 사용자가 명시적으로 고를 때만. 성공하면 곧바로 '로그인 필요'.
    logout() {
      return run(async (c) => ({ data: await c.client.logout() }),
        (envelope) => (envelope.kind === 'live' ? 'unauthorized' : statusFromEnvelope(envelope)));
    },
    // ── 셸 hubContext 연결(pet-main) ──────────────────────────────────
    // 채널 이름 → 메서드. 셸이 봉투로 상태를 정한 뒤(live=connected) 허브 모델의 판단과 다르면
    // 다음 틱에 'pet:hub-status' 를 다시 보내 바로잡는다(예: 세션 확인은 live 지만 anonymous → unauthorized).
    async invoke(channel, payload) {
      const name = channelMethod(channel);
      const method = name && CHANNEL_METHODS.includes(name) ? hub[name] : null;
      if (typeof method !== 'function') return errorEnvelope(fail('error', 'invalid-input'));
      const envelope = await method(payload);
      const naive = shellReadStatus(envelope);
      if (naive && naive !== hubStatus) {
        const status = hubStatus;
        const timer = setTimeout(() => {
          if (status === hubStatus) emit('pet:hub-status', { status });
        }, 0);
        if (timer && typeof timer.unref === 'function') timer.unref();
      }
      return envelope;
    },
    // 이벤트·대화 표시 여부를 셸 ctx 에서 다시 읽는다. 폴링은 셸이 창을 다 띄운 뒤 startPolling() 으로 따로 켠다.
    attach(ctx) {
      const context = ctx !== null && typeof ctx === 'object' ? ctx : {};
      if (typeof context.emit === 'function') {
        onEvent = context.emit;
        if (options.bannerHandoff === undefined) options.bannerHandoff = true;
      }
      if (typeof context.getState === 'function' && typeof input.isChatVisible !== 'function') chatVisible = chatVisibleFrom(context.getState);
    },
    // 설정 저장마다 불린다(주소가 같아도). 같은 origin 이면 연결을 유지한 채 한 번 확인하고, 끝나면 지금 상태를
    // 반드시 다시 알린다 — 셸이 저장 순간 상태를 'unknown' 으로 돌려 놓았어도 거기 멈춰 있지 않게.
    // 돌려주는 Promise 는 그 확인까지 끝난 뒤 풀린다.
    hubUrlChanged(url) {
      const ready = connect(url);
      return ready
        .then(() => (conn ? hub.tick() : null))
        .catch(() => {})
        .then(() => { emit('pet:hub-status', { status: hubStatus }); });
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

module.exports = {
  createPetHub, councilHandoffUrl, statusFromEnvelope, statusFromSession, characterNameByOffice, channelMethod,
  HUB_STATUSES, PROBE_ONLY_STATUSES, CHANNEL_METHODS,
};
