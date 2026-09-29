'use strict';
// Moonlight Pet — 허브 엔드포인트 10종(Mac HubAPI · HubActivityAPI · HubOfficeAPI 이식).
// 모든 함수는 성공 시 평범한 데이터를 돌려주고 실패 시 HubError 를 던진다. 봉투로 감싸는 건 pet-hub.js 몫.
//   GET/POST /api/operator/session        → client.sessionStatus()/logout()
//   GET/POST/PATCH /api/hub/tasks          → tasks()/createTask()/setTask()
//   GET/POST /api/hub/journal              → memo()/saveMemo()
//   GET /api/calendar/google/event         → calendar()/calendarWeek()
//   GET /api/hub/inquiries?filter=unread   → inquiries()
//   POST /api/hub/office/chat              → officeChat()  (자동 재시도 없음, AbortSignal 로만 취소)

const { randomUUID } = require('node:crypto');
const { LIMITS, HUB_PATHS, CHARACTERS } = require('../shared/contract');
const { fail, OFFICE_CHAT_PATH } = require('./pet-hub-client');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_INSTANT_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const OFFICE_CONTRACT_VERSION = '2026-09-22.v3';
const OFFICE_OWNERS = Object.freeze(CHARACTERS.map((c) => c.officeId));
const CHAT_SCOPES = Object.freeze(['all', 'classin', 'personal']);
const INQUIRY_KINDS = Object.freeze({ sales: '영업 문의', support: '지원 문의', partnership: '제휴 문의', general: '일반 문의' });
const INQUIRY_CHANNELS = Object.freeze({ gmail: '메일', webhook: '웹', manual: '직접 등록' });
const DAY_MS = 86400000;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isUuid = (value) => typeof value === 'string' && value.length === 36 && UUID_RE.test(value);
const invalid = (httpStatus = 0) => fail('invalid', 'invalid-response', httpStatus);
// 서버가 UTF-16 길이로 재므로 JS length 가 곧 기준이다. 공백만 있는 글은 빈 글.
const validText = (text, limit) => typeof text === 'string' && text.trim().length > 0 && text.length <= limit;

// ISO 8601 인스턴트(시간대 필수). 소수점 이하는 밀리초까지만 쓴다(마이크로초 문자열 원본은 따로 보존).
function parseInstant(text) {
  if (typeof text !== 'string') return null;
  const match = ISO_INSTANT_RE.exec(text);
  if (!match) return null;
  const fraction = match[2] ? match[2].slice(0, 4) : '';
  const ms = Date.parse(`${match[1]}${fraction}${match[3]}`);
  return Number.isFinite(ms) ? ms : null;
}

// 종일 일정: 앞 10자 YYYY-MM-DD 를 이 PC 달력의 자정으로.
function parseLocalDate(text) {
  if (typeof text !== 'string') return null;
  const parts = text.slice(0, 10).split('-');
  if (parts.length !== 3 || !parts.every((p) => /^\d+$/.test(p))) return null;
  const [y, m, d] = parts.map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date.getTime();
}

const pad = (n) => String(n).padStart(2, '0');
function localDateKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function addLocalDays(ms, days) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()).getTime();
}
function startOfLocalDay(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
// 초 단위 ISO(Z) — Mac ISO8601DateFormatter 기본 출력과 같다(밀리초 없음).
function isoSeconds(ms) {
  return new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');
}

// 월요일 시작 주. input: 'YYYY-MM-DD'(이 PC 날짜) · ISO 인스턴트 · Date · ms · 빈 값(오늘).
function weekBounds(input, now = Date.now()) {
  let ms;
  if (input === undefined || input === null || input === '') ms = now;
  else if (input instanceof Date) ms = input.getTime();
  else if (typeof input === 'number') ms = input;
  else if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) ms = parseLocalDate(input);
  else ms = parseInstant(input);
  if (!Number.isFinite(ms)) throw fail('error', 'invalid-input');
  const day = startOfLocalDay(ms);
  const offset = (new Date(day).getDay() + 6) % 7;
  const start = addLocalDays(day, -offset);
  return { start, end: addLocalDays(start, 7) };
}

// Mac HubCalendarEvent.occurs(on:) — 종일 end 는 배타, end 없는 종일은 하루, 시각 일정은 [start, end).
function eventOccursOn(event, dayMs) {
  const day = startOfLocalDay(dayMs);
  const next = addLocalDays(day, 1);
  const finish = event.endMs ?? (event.allDay ? addLocalDays(event.startMs, 1) : event.startMs);
  return event.startMs < next && (finish > day || (finish === event.startMs && event.startMs >= day));
}

// ── 할 일 ────────────────────────────────────────────────────────────────
function decodeTask(row, httpStatus) {
  if (!isObject(row) || !isUuid(row.id) || typeof row.title !== 'string' || typeof row.status !== 'string') throw invalid(httpStatus);
  const stamp = row.updatedAt !== undefined && row.updatedAt !== null ? row.updatedAt : row.updated_at;
  if (stamp !== undefined && stamp !== null && typeof stamp !== 'string') throw invalid(httpStatus);
  return { id: row.id.toLowerCase(), title: row.title, status: row.status, updatedAt: stamp ?? null };
}

function taskCommand(title, id) {
  return { id: isUuid(id) ? id.toLowerCase() : randomUUID(), title, status: 'todo', source: 'desktop-pet' };
}

// ── 메모(journal) ───────────────────────────────────────────────────────
function decodeEntry(entry, httpStatus) {
  if (!isObject(entry) || !isUuid(entry.id) || typeof entry.body !== 'string' || typeof entry.title !== 'string'
    || typeof entry.occurredAt !== 'string' || !Number.isInteger(entry.revision) || !isObject(entry.noteMeta)
    || !Array.isArray(entry.contexts)) throw invalid(httpStatus);
  const contexts = entry.contexts.map((c) => {
    if (!isObject(c) || typeof c.type !== 'string' || typeof c.id !== 'string') throw invalid(httpStatus);
    return { type: c.type, id: c.id };
  });
  return {
    id: entry.id.toLowerCase(), body: entry.body, title: entry.title, occurredAt: entry.occurredAt,
    revision: entry.revision, noteMeta: entry.noteMeta, contexts,
  };
}

// 저장 명령은 불변이다 — 같은 명령으로만 재시도한다(requestId 유지). previous 가 있으면 제목·날짜·메타·맥락을 보존한다.
function memoCommand(body, previous, options = {}) {
  const now = options.now ?? Date.now();
  return {
    action: 'save',
    requestId: isUuid(options.requestId) ? options.requestId.toLowerCase() : randomUUID(),
    entryId: previous ? previous.id : isUuid(options.entryId) ? options.entryId.toLowerCase() : randomUUID(),
    expectedRevision: previous ? previous.revision : 0,
    body,
    title: previous ? previous.title : typeof options.title === 'string' ? options.title : '',
    occurredAt: previous ? previous.occurredAt : parseInstant(options.occurredAt) !== null ? options.occurredAt : isoSeconds(now),
    noteMeta: previous ? previous.noteMeta : { kind: 'note', enhancement: '' },
    contexts: previous ? previous.contexts : [],
  };
}

function validMemoBody(body) {
  return validText(body, LIMITS.memoBody);
}

// ── 일정 ────────────────────────────────────────────────────────────────
function decodeEvent(row, httpStatus) {
  if (!isObject(row) || typeof row.id !== 'string' || typeof row.title !== 'string' || typeof row.start !== 'string'
    || typeof row.allDay !== 'boolean') throw invalid(httpStatus);
  const optionalString = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') throw invalid(httpStatus);
    return value;
  };
  const endText = optionalString(row.end);
  const location = optionalString(row.location);
  const source = optionalString(row.source);
  const parse = row.allDay ? parseLocalDate : parseInstant;
  const startMs = parse(row.start);
  if (startMs === null) throw invalid(httpStatus);
  let endMs = null;
  if (endText) {
    endMs = parse(endText);
    if (endMs === null) throw invalid(httpStatus);
  }
  return {
    key: `${source || 'calendar'}:${row.id}`,
    id: row.id,
    title: row.title,
    // 시각 일정은 UTC ISO, 종일 일정은 이 PC 날짜(YYYY-MM-DD, end 는 배타).
    start: row.allDay ? localDateKey(startMs) : new Date(startMs).toISOString(),
    end: endMs === null ? null : row.allDay ? localDateKey(endMs) : new Date(endMs).toISOString(),
    allDay: row.allDay,
    location,
    source,
    startMs,
    endMs,
  };
}

// ── 문의 ────────────────────────────────────────────────────────────────
function decodeInquiry(row, httpStatus) {
  const bad = () => invalid(httpStatus);
  if (!isObject(row) || !isUuid(row.id)) throw bad();
  const inbound = row.last_inbound_seq;
  const read = row.last_read_seq;
  if (row.unread !== true || !Number.isInteger(inbound) || !Number.isInteger(read) || read < 0 || inbound <= read
    || inbound > Number.MAX_SAFE_INTEGER) throw bad();
  if (!['new', 'in_progress', 'waiting'].includes(row.status) || !['inquiry', 'review'].includes(row.classification)) throw bad();
  if (typeof row.subject !== 'string' || !row.subject.trim()) throw bad();
  const kindLabel = Object.hasOwn(INQUIRY_KINDS, row.kind) ? INQUIRY_KINDS[row.kind] : null;
  if (!kindLabel || !Array.isArray(row.sources) || !row.sources.every((s) => typeof s === 'string' && Object.hasOwn(INQUIRY_CHANNELS, s))) throw bad();
  const channels = ['gmail', 'webhook', 'manual'].filter((s) => row.sources.includes(s)).map((s) => INQUIRY_CHANNELS[s]);
  const stampText = row.updated_at !== undefined && row.updated_at !== null ? row.updated_at : row.received_at;
  let updatedAt = null;
  if (stampText !== undefined && stampText !== null) {
    const ms = parseInstant(stampText);
    if (ms === null) throw bad();
    updatedAt = new Date(ms).toISOString();
  }
  const id = row.id.toLowerCase();
  return {
    id,
    title: row.subject.trim(),
    subtitle: [kindLabel, ...channels].join(' · '),
    updatedAt,
    // 서버가 준 URL 은 쓰지 않는다 — 정규 UUID 로 고정 경로만 만든다.
    path: HUB_PATHS.inquiry(id),
    // 새 수신 메시지만 신원을 바꾼다(읽음·분류·제목 편집은 그대로).
    token: `inquiry:${id}:${inbound}`,
  };
}

// ── Office 대화 ─────────────────────────────────────────────────────────
function validateChatCommand(command) {
  if (!isObject(command) || !OFFICE_OWNERS.includes(command.ownerId) || !CHAT_SCOPES.includes(command.scope)) return false;
  if (!validText(command.message, LIMITS.chatMessage)) return false;
  const history = command.history ?? [];
  if (!Array.isArray(history) || history.length > LIMITS.chatHistoryItems) return false;
  if (!history.every((h) => isObject(h) && (h.role === 'user' || h.role === 'assistant') && validText(h.text, LIMITS.chatMessage))) return false;
  // 서버는 항목을 trim 한 뒤 JSON.stringify 길이를 잰다.
  const normalized = history.map((h) => ({ role: h.role, text: h.text.trim() }));
  return JSON.stringify(normalized).length <= LIMITS.chatHistoryJson;
}

function chatRequestBody(command) {
  return {
    ownerId: command.ownerId,
    mode: 'chat',
    scope: command.scope,
    message: command.message,
    participants: [],
    lens: null,
    history: (command.history ?? []).map((h) => ({ role: h.role, text: h.text })),
    includeProjects: false,
  };
}

// 개별 대화 응답이 Council 결과나 Legend 렌즈로 둔갑하지 않았는지, 담당·범위가 요청과 같은지 확인한다.
function decodeChatReply(json, command) {
  if (!isObject(json) || !Object.hasOwn(json, 'lens') || json.lens !== null) return null;
  if (['recommendation', 'evidence', 'dissent', 'discussion'].some((key) => Object.hasOwn(json, key))) return null;
  const { context, log } = json;
  if (json.status !== 'generated' || json.version !== OFFICE_CONTRACT_VERSION || json.ownerId !== command.ownerId
    || json.scope !== command.scope || json.mode !== 'chat' || json.simulation !== false || !Array.isArray(json.participants)
    || json.participants.length !== 0 || json.businessWrites !== false || !validText(json.answer, 10000)
    || !validText(json.nextAction, 1000)) return null;
  if (!isObject(context) || context.scope !== command.scope || context.source !== 'provided' || !Array.isArray(context.projects)
    || context.projects.length !== 0 || !validText(context.note, 1000)) return null;
  if (!isObject(log) || typeof log.persisted !== 'boolean') return null;
  const runId = log.runId ?? null;
  if (log.persisted) {
    if (!isUuid(runId)) return null;
  } else if (runId !== null) return null;
  return {
    answer: json.answer,
    nextAction: json.nextAction,
    contextNote: context.note,
    contextSource: context.source,
    persisted: log.persisted,
    runId: runId ? runId.toLowerCase() : null,
  };
}

// client: createHubClient() 결과(또는 같은 request 모양의 대역).
function createHubApi(client) {
  async function read(path) {
    const response = await client.request(path, { method: 'GET' });
    if (response.preview) throw fail('preview', 'preview', response.httpStatus);
    if (response.status !== 'live' && response.status !== 'partial') throw fail('error', 'invalid-status', response.httpStatus);
    if (!response.json) throw invalid(response.httpStatus);
    return response;
  }
  async function write(path, method, body, options) {
    const response = await client.request(path, { method, body, signal: options && options.signal });
    if (response.preview) throw fail('preview', 'preview', response.httpStatus);
    if (response.status !== 'saved' && response.status !== 'duplicate') throw fail('error', 'save-not-verified', response.httpStatus);
    if (!response.json) throw invalid(response.httpStatus);
    return response;
  }

  async function tasks() {
    const response = await read('/api/hub/tasks');
    const { json } = response;
    if (!Array.isArray(json.tasks) || (json.partial !== undefined && json.partial !== null && typeof json.partial !== 'boolean')) {
      throw invalid(response.httpStatus);
    }
    return { tasks: json.tasks.map((row) => decodeTask(row, response.httpStatus)), partial: response.status === 'partial' || json.partial === true };
  }

  // command: taskCommand() 결과. 영수증의 id·제목·상태가 요청과 같아야 저장으로 인정한다.
  async function createTask(command) {
    if (!isObject(command) || !isUuid(command.id) || !validText(command.title, LIMITS.taskTitle)) throw fail('error', 'invalid-input');
    const body = { id: command.id.toLowerCase(), title: command.title, status: 'todo', source: 'desktop-pet' };
    const response = await write('/api/hub/tasks', 'POST', body);
    if (!isObject(response.json.task)) throw fail('error', 'save-not-verified', response.httpStatus);
    const task = decodeTask(response.json.task, response.httpStatus);
    if (task.id !== body.id || task.title !== body.title || task.status !== body.status) throw fail('error', 'save-not-verified', response.httpStatus);
    return task;
  }

  // 낙관적 잠금: 읽은 updatedAt 문자열을 그대로(마이크로초 포함) 보낸다. 없으면 보내지 않는다.
  async function setTask(task, done) {
    if (!isObject(task) || !isUuid(task.id)) throw fail('error', 'invalid-input');
    if (typeof task.updatedAt !== 'string' || !task.updatedAt) throw fail('conflict', 'missing-version');
    const body = { id: task.id.toLowerCase(), status: done ? 'done' : 'todo', expectedUpdatedAt: task.updatedAt };
    const response = await write('/api/hub/tasks', 'PATCH', body);
    if (!isObject(response.json.task)) throw fail('error', 'save-not-verified', response.httpStatus);
    const saved = decodeTask(response.json.task, response.httpStatus);
    if (saved.id !== body.id || (saved.status === 'done') !== Boolean(done)) throw fail('error', 'save-not-verified', response.httpStatus);
    return saved;
  }

  async function memo(id) {
    if (!isUuid(id)) throw fail('error', 'invalid-input');
    const entryId = id.toLowerCase();
    const response = await read(`/api/hub/journal?note=${entryId}`);
    if (!isObject(response.json.entry)) throw fail('error', 'save-not-verified', response.httpStatus);
    const entry = decodeEntry(response.json.entry, response.httpStatus);
    if (entry.id !== entryId) throw fail('error', 'save-not-verified', response.httpStatus);
    return entry;
  }

  // 저장 → 영수증(id 일치, 본문 일치, revision ≥ expected+1) → 같은 id 를 다시 읽어 본문·revision 비교.
  async function saveMemo(command) {
    if (!isObject(command) || !validMemoBody(command.body) || !isUuid(command.requestId) || !isUuid(command.entryId)
      || !Number.isInteger(command.expectedRevision) || command.expectedRevision < 0) throw fail('error', 'invalid-input');
    const response = await write('/api/hub/journal', 'POST', command);
    if (!isObject(response.json.entry)) throw fail('error', 'save-not-verified', response.httpStatus);
    const written = decodeEntry(response.json.entry, response.httpStatus);
    if (written.id !== command.entryId.toLowerCase()) throw fail('error', 'save-not-verified', response.httpStatus);
    if (written.body !== command.body || written.revision < command.expectedRevision + 1) throw fail('conflict', 'memo-conflict', response.httpStatus);
    const verified = await memo(written.id);
    if (verified.body !== command.body || verified.revision !== written.revision) throw fail('conflict', 'memo-conflict');
    return verified;
  }

  async function calendar(from, to) {
    const params = new URLSearchParams({ timeMin: isoSeconds(from.getTime()), timeMax: isoSeconds(to.getTime()) });
    const response = await read(`/api/calendar/google/event?${params.toString()}`);
    if (!Array.isArray(response.json.events)) throw invalid(response.httpStatus);
    const events = response.json.events.map((row) => decodeEvent(row, response.httpStatus)).sort((a, b) => a.startMs - b.startMs);
    return { events, partial: response.status === 'partial' };
  }

  // 월~일 주. 각 일정에 이 주 안에서 걸치는 날짜(dates)를 붙인다.
  async function calendarWeek(dateInput, now = Date.now()) {
    const { start, end } = weekBounds(dateInput, now);
    const page = await calendar(new Date(start), new Date(end));
    const days = Array.from({ length: 7 }, (_, i) => addLocalDays(start, i));
    const events = page.events.map((event) => ({ ...event, dates: days.filter((d) => eventOccursOn(event, d)).map(localDateKey) }));
    return {
      events,
      partial: page.partial,
      status: page.partial ? 'partial' : 'live',
      weekStart: localDateKey(start),
      weekEnd: localDateKey(end),
      timeMin: isoSeconds(start),
      timeMax: isoSeconds(end),
    };
  }

  // 이 원장은 완전한 개수를 주거나 오류다 — partial 도 성공이 아니다.
  async function inquiries() {
    const response = await client.request(`/api/hub/inquiries?filter=unread&pageSize=${LIMITS.inquiriesPage}`, { method: 'GET' });
    if (response.preview) throw fail('preview', 'preview', response.httpStatus);
    const { json } = response;
    if (response.status !== 'live' || !json || json.source !== 'supabase' || !Array.isArray(json.rows)
      || !Number.isInteger(json.unreadCount) || json.unreadCount < 0 || json.rows.length > LIMITS.inquiriesPage
      || json.rows.length > json.unreadCount) throw fail('error', 'invalid-status', response.httpStatus);
    const items = json.rows.map((row) => decodeInquiry(row, response.httpStatus));
    if (new Set(items.map((item) => item.id)).size !== items.length) throw invalid(response.httpStatus);
    return { inquiries: items, unreadCount: json.unreadCount };
  }

  // 모델 호출 한 번. 멱등 키가 없으므로 재시도는 호출자가 사용자의 새 요청으로만 한다.
  async function officeChat(command, options = {}) {
    if (!validateChatCommand(command)) throw fail('error', 'invalid-input');
    const response = await client.request(OFFICE_CHAT_PATH, { method: 'POST', body: chatRequestBody(command), signal: options.signal });
    if (response.preview) throw fail('preview', 'preview', response.httpStatus);
    if (response.status !== 'generated') throw invalid(response.httpStatus);
    const reply = decodeChatReply(response.json, command);
    if (!reply) throw invalid(response.httpStatus);
    return reply;
  }

  return {
    sessionStatus: () => client.sessionStatus(),
    logout: () => client.logout(),
    tasks, createTask, setTask, memo, saveMemo, calendar, calendarWeek, inquiries, officeChat,
  };
}

module.exports = {
  createHubApi,
  taskCommand, memoCommand, validMemoBody, validText, isUuid,
  decodeTask, decodeEntry, decodeEvent, decodeInquiry, decodeChatReply, validateChatCommand, chatRequestBody,
  parseInstant, parseLocalDate, localDateKey, addLocalDays, startOfLocalDay, isoSeconds, weekBounds, eventOccursOn,
  OFFICE_CONTRACT_VERSION, OFFICE_OWNERS, CHAT_SCOPES, DAY_MS,
};
