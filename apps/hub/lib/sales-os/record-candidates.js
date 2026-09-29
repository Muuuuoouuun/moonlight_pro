// 기록 후보 — "이 연락, 기록할까요?" 순수 함수. IO 없음(컴포넌트도 import한다).
//
// 후보는 두 곳에서 온다.
//   · 캘린더: 고객과 맞는 지난 일정인데 기록이 없다(calendar-touchpoints의 findUnrecordedMeetings).
//     읽는 순간 계산하고, 그 고객의 기록이 생기면 저절로 사라진다.
//   · 휴대폰: 갤럭시 자동화 앱 → Engine이 고객과 맞춘 통화·문자·카톡(webhook_events의 phone.*).
//     허브에서 기록하거나 버리기 전까지 received로 남는다.
// 어느 쪽도 자동으로 기록이 되지 않는다 — 운영자가 [기록 남기기]로 시트를 열어 확인해야 기록이다.
//
// 이틀이 지난 후보는 목록에서 빠진다. 쌓여서 죄책감이 되는 목록을 만들지 않는다(목업 04 note B).

import { kstDayKey } from "../kst-day.js";

const HOUR_MS = 3600000;
const DAY_MS = 86400000;

export const CANDIDATE_MAX_AGE_MS = 48 * HOUR_MS;
// 전화 직전에 남긴 메모는 그 통화의 기록이 아니지만, 몇 분 차이는 같은 일이다.
export const PHONE_RECORD_GRACE_MS = 10 * 60000;
export const PHONE_EVENT_SOURCE = "phone-capture";
export const PHONE_EVENT_TYPES = { "phone.call": "call", "phone.sms": "sms", "phone.kakao": "kakao" };
// 캘린더 넛지(crm-nudges)와 같은 키 — 한쪽에서 숨기면 다른 쪽에서도 숨는다.
export const MEETING_RULE = "meeting_unrecorded";

// 내부 변경(딜 단계 이동·AI·update)은 운영자의 연락 기록이 아니다(crm-nudges와 같은 기준).
const AUTO_ACTIVITY_KINDS = new Set(["deal", "ai", "update"]);

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function timeOf(value) {
  const t = new Date(value || "").getTime();
  return Number.isFinite(t) ? t : null;
}

function nowMsOf(now) {
  return now instanceof Date ? now.getTime() : Number(now) || Date.now();
}

export function meetingTriggerKey(eventIdOrStart) {
  return `${MEETING_RULE}:${eventIdOrStart}`;
}

// ── 후보 id ──────────────────────────────────────────────────────────────────
// phone:<webhook_events.id> · calendar:<lead|deal|account>:<대상 id>:<일정 id>(일정 id는 ':'를 품을 수 있어 맨 뒤)
export function parseCandidateId(id) {
  const text = typeof id === "string" ? id.trim() : "";
  if (!text || text.length > 600) return null;
  if (text.startsWith("phone:")) {
    const rowId = text.slice(6);
    return /^[0-9a-f-]{36}$/i.test(rowId) ? { source: "phone", rowId } : null;
  }
  const match = /^calendar:(lead|deal|account):([^:]+):(.+)$/.exec(text);
  return match ? { source: "calendar", subjectType: match[1], subjectId: match[2], eventKey: match[3] } : null;
}

// ── 캘린더 ───────────────────────────────────────────────────────────────────

// 매출 데이터(리드·딜·계약) → 일정 매칭 후보. crm-nudges-source의 toCustomers와 같은 모양에
// 고객 키(lead:/account:)와 표시용 회사명을 더한다.
export function calendarCustomersFrom(revenue = {}) {
  const leads = Array.isArray(revenue.leads) ? revenue.leads : [];
  const deals = Array.isArray(revenue.deals) ? revenue.deals : [];
  const accounts = Array.isArray(revenue.accounts) ? revenue.accounts : [];
  const accountByCompany = new Map();
  for (const a of accounts) if (a?.id && a.companyId && !accountByCompany.has(a.companyId)) accountByCompany.set(a.companyId, a);

  const out = [];
  for (const lead of leads) {
    if (!lead?.id) continue;
    out.push({
      id: lead.id, kind: "lead", key: `lead:${lead.id}`, name: lead.name,
      companyName: lead.companyName || null, companyId: lead.companyId || null,
      suppression: lead.nudgeSuppression || null,
    });
  }
  for (const deal of deals) {
    if (!deal?.id || deal.hidden) continue;
    const account = deal.companyId ? accountByCompany.get(deal.companyId) : null;
    out.push({
      id: deal.id, kind: "deal",
      key: deal.leadId ? `lead:${deal.leadId}` : account ? `account:${account.id}` : null,
      name: deal.name, companyName: deal.companyName || null, companyId: deal.companyId || null,
      // 딜에 걸어 둔 다음 미팅은 이름과 무관한 확정 매칭이다.
      eventId: deal.nextMeeting?.eventId || null,
      suppression: deal.nudgeSuppression || null,
    });
  }
  for (const account of accounts) {
    if (!account?.id) continue;
    out.push({
      id: account.id, kind: "account", key: `account:${account.id}`, name: account.name,
      companyName: null, companyId: account.companyId || null,
      suppression: account.nudgeSuppression || null,
    });
  }
  return out;
}

// 숨김은 triggerKey 단위(meta.nudges.dismissed)만 본다. 미루기(snoozedUntil)는 약속 날짜에 대한
// 것이라 "이미 있었던 미팅을 기록할까요"를 가리지 않는다 — 이 후보는 이틀 뒤 저절로 빠진다.
function isDismissed(suppression, key) {
  if (!suppression || typeof suppression !== "object") return false;
  return Boolean(suppression.dismissed?.[key] ?? suppression[key]?.dismissed);
}

export function buildCalendarCandidates({ meetings = [], customers = [], now = Date.now() } = {}) {
  const nowMs = nowMsOf(now);
  const byId = new Map(customers.map((c) => [`${c.kind}:${c.id}`, c]));
  const out = [];
  for (const meeting of meetings || []) {
    const startMs = timeOf(meeting?.startAt);
    if (startMs == null || startMs < nowMs - CANDIDATE_MAX_AGE_MS) continue;
    const subject = meeting.customer || {};
    const customer = byId.get(`${subject.kind}:${subject.id}`);
    if (!customer) continue;
    const eventKey = meeting.eventId || meeting.startAt;
    if (isDismissed(customer.suppression, meetingTriggerKey(eventKey))) continue;
    out.push({
      id: `calendar:${customer.kind}:${customer.id}:${eventKey}`,
      source: "calendar",
      channel: meeting.channel === "call" ? "call" : "meeting",
      occurredAt: new Date(startMs).toISOString(),
      durationSec: null,
      customer: {
        key: customer.key, kind: customer.kind, id: customer.id, name: customer.name || "이름 없는 고객",
        org: customer.companyName && customer.companyName !== customer.name ? customer.companyName : null,
        person: null, companyId: customer.companyId,
      },
      text: null,
      promiseHint: null,
      title: meeting.title || null,
      eventId: meeting.eventId || null,
      confidence: meeting.confidence || "guess",
    });
  }
  return out;
}

// ── 휴대폰 ───────────────────────────────────────────────────────────────────

function belongsTo(activity, customer) {
  if (!activity || !customer) return false;
  const same = (a, b) => a && b && String(a) === String(b);
  return same(activity.leadId, customer.leadId || (customer.kind === "lead" ? customer.id : null))
    || same(activity.accountId, customer.accountId || (customer.kind === "account" ? customer.id : null))
    || same(activity.companyId, customer.companyId)
    || same(activity.contactId, customer.contactId);
}

// 그 사건 이후(조금 앞 포함) 같은 고객의 기록이 있으면 이미 기록한 것이다.
export function phoneEventRecorded(occurredAt, customer, activities = []) {
  const at = timeOf(occurredAt);
  if (at == null) return false;
  return (activities || []).some((a) => {
    if (!a || AUTO_ACTIVITY_KINDS.has(String(a.kind || "").toLowerCase())) return false;
    const t = timeOf(a.occurredAt);
    return t != null && t >= at - PHONE_RECORD_GRACE_MS && belongsTo(a, customer);
  });
}

function phoneIdentity(customer) {
  return customer.key || (customer.contactId ? `contact:${customer.contactId}` : customer.isUnregistered && customer.phone ? `unregistered:${customer.phone}` : null);
}

// webhook_events 행들 → 고객·채널당 후보 하나(가장 최근 것이 대표, 개수는 count).
export function buildPhoneCandidates({ rows = [], activities = [], nameByKey = null, now = Date.now() } = {}) {
  const nowMs = nowMsOf(now);
  const groups = new Map();
  for (const row of rows || []) {
    const channel = PHONE_EVENT_TYPES[row?.event_type];
    const payload = row?.payload;
    if (!channel || row.status !== "received" || !payload || payload.v !== 1) continue;
    const customer = payload.customer && typeof payload.customer === "object" ? payload.customer : null;
    const identity = customer ? phoneIdentity(customer) : null;
    const at = timeOf(payload.occurredAt);
    if (!identity || at == null || at < nowMs - CANDIDATE_MAX_AGE_MS || at > nowMs + 10 * 60000) continue;
    if (phoneEventRecorded(payload.occurredAt, customer, activities)) continue;
    const groupKey = `${identity}|${channel}`;
    const list = groups.get(groupKey) || [];
    list.push({ row, payload, customer, at });
    groups.set(groupKey, list);
  }

  const out = [];
  for (const list of groups.values()) {
    list.sort((a, b) => b.at - a.at);
    const latest = list[0];
    const hinted = list.map((e) => extractPromiseHint(e.payload.text, e.payload.occurredAt)).find(Boolean) || null;
    const c = latest.customer;
    const currentName = c.key && nameByKey?.get(c.key);
    out.push({
      id: `phone:${latest.row.id}`,
      source: "phone",
      channel: PHONE_EVENT_TYPES[latest.row.event_type],
      occurredAt: new Date(latest.at).toISOString(),
      durationSec: Number.isFinite(latest.payload.durationSec) ? latest.payload.durationSec : null,
      customer: {
        key: c.key || null,
        kind: c.kind === "lead" || c.kind === "account" ? c.kind : null,
        id: c.id || null,
        name: currentName || c.name || c.person || c.phone || "이름 없는 고객",
        org: c.org && c.org !== (currentName || c.name) ? c.org : null,
        person: c.person || null,
        companyId: c.companyId || null,
        ...(c.isUnregistered ? { isUnregistered: true, phone: c.phone || null } : {}),
      },
      text: typeof latest.payload.text === "string" ? latest.payload.text : null,
      promiseHint: hinted,
      direction: latest.payload.direction || null,
      count: list.length,
    });
  }
  return out;
}

export function mergeCandidates(...lists) {
  return lists.flat().filter(Boolean).sort((a, b) => (timeOf(b.occurredAt) || 0) - (timeOf(a.occurredAt) || 0));
}

// ── 약속 후보(카톡·문자에서 날짜·시각 찾기) ─────────────────────────────────

function kstParts(ms) {
  const key = kstDayKey(new Date(ms));
  const [y, m, d] = key.split("-").map(Number);
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(new Date(ms)).split(":").map(Number);
  return { y, m, d, hour: hm[0], minute: hm[1], weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

function addDays({ y, m, d }, days) {
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

const dayNumber = ({ y, m, d }) => Date.UTC(y, m - 1, d) / DAY_MS;
const pad = (n) => String(n).padStart(2, "0");

function findDate(text, base) {
  const md = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(text) || /(?<![\d:])(\d{1,2})\s*\/\s*(\d{1,2})(?![\d:])/.exec(text);
  if (md) {
    const m = Number(md[1]), d = Number(md[2]);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    let date = { y: base.y, m, d };
    if (dayNumber(date) < dayNumber(base) - 180) date = { ...date, y: base.y + 1 };
    return date;
  }
  const relative = /(오늘|금일|내일|낼|모레|글피)/.exec(text);
  if (relative) return addDays(base, { 오늘: 0, 금일: 0, 내일: 1, 낼: 1, 모레: 2, 글피: 3 }[relative[1]]);
  const week = /(이번\s*주|금주|다음\s*주|담주|다다음\s*주)?\s*([월화수목금토일])요일/.exec(text);
  if (week) {
    const target = WEEKDAYS.indexOf(week[2]);
    const monIndex = (w) => (w + 6) % 7; // 월=0 … 일=6
    const scope = (week[1] || "").replace(/\s/g, "");
    if (!scope) return addDays(base, ((target - base.weekday + 7) % 7) || 7);
    const offset = scope === "다다음주" ? 14 : scope === "다음주" || scope === "담주" ? 7 : 0;
    return addDays(base, -monIndex(base.weekday) + offset + monIndex(target));
  }
  return null;
}

function findTime(text) {
  const korean = /(오전|오후|아침|저녁|밤|낮)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분|\s*(반))?/.exec(text);
  const clock = /(?<!\d)(\d{1,2}):(\d{2})(?!\d)/.exec(text);
  const hit = korean || clock;
  if (!hit) return null;
  const meridiem = korean ? korean[1] || "" : "";
  let hour = Number(korean ? korean[2] : clock[1]);
  const minute = korean ? (korean[4] ? 30 : Number(korean[3] || 0)) : Number(clock[2]);
  // 오전/오후 없이 1~11시면 둘 다 가능하다 — 날짜가 없을 때 호출측이 가장 가까운 쪽을 고른다.
  const ambiguous = !meridiem && hour >= 1 && hour <= 11;
  if (["오후", "저녁", "밤"].includes(meridiem) && hour < 12) hour += 12;
  else if (meridiem === "낮" && hour < 6) hour += 12;
  else if (!meridiem && hour >= 1 && hour <= 7) hour += 12; // 업무 약속의 "4시"는 오후다
  if (hour > 23 || minute > 59) return null;
  return { hour, minute, ambiguous };
}

// 약속처럼 보이는 날짜·시각. 없으면 null. dueAt은 시각을 알면 KST ISO, 날짜만 알면 'YYYY-MM-DD'.
export function extractPromiseHint(text, occurredAt) {
  const body = typeof text === "string" ? text.normalize("NFKC").trim() : "";
  const at = timeOf(occurredAt);
  if (!body || at == null) return null;
  const base = kstParts(at);
  let date = findDate(body, base);
  const time = findTime(body);
  if (!date && !time) return null;
  if (!date) {
    // 시각만 있으면 메시지 이후 가장 가까운 그 시각 — 17시에 받은 "8시에"는 오늘 20시다.
    const after = (hour) => hour > base.hour || (hour === base.hour && time.minute > base.minute);
    const options = time.ambiguous ? [time.hour % 12, (time.hour % 12) + 12].sort((a, b) => a - b) : [time.hour];
    const today = options.find(after);
    if (today != null) { time.hour = today; date = { y: base.y, m: base.m, d: base.d }; }
    else date = addDays(base, 1);
  }
  // 지난 날짜는 약속이 아니라 회고다("9/20 미팅 감사합니다"). 너무 먼 날짜도 믿지 않는다.
  const ahead = dayNumber(date) - dayNumber(base);
  if (ahead < 0 || ahead > 120) return null;
  const dayKey = `${date.y}-${pad(date.m)}-${pad(date.d)}`;
  const weekday = WEEKDAYS[new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay()];
  const clock = time ? `${pad(time.hour)}:${pad(time.minute)}` : null;
  const firstLine = body.split(/[\n.?!]/)[0].trim() || body;
  return {
    title: firstLine.length > 40 ? `${firstLine.slice(0, 39)}…` : firstLine,
    dueAt: clock ? `${dayKey}T${clock}:00+09:00` : dayKey,
    label: `${date.m}/${date.d}(${weekday})${clock ? ` ${clock}` : ""}`,
  };
}

// ── 표시 문구 ────────────────────────────────────────────────────────────────

export function candidateWhen(occurredAt, now = Date.now()) {
  const at = timeOf(occurredAt);
  if (at == null) return "";
  const p = kstParts(at);
  const today = kstParts(nowMsOf(now));
  const diff = dayNumber(today) - dayNumber(p);
  const day = diff === 0 ? "오늘" : diff === 1 ? "어제" : `${p.m}/${p.d}(${WEEKDAYS[p.weekday]})`;
  return `${day} ${pad(p.hour)}:${pad(p.minute)}`;
}

export function durationLabel(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return "";
  return sec < 60 ? `${sec}초` : `${Math.round(sec / 60)}분`;
}

// 받침이 있으면 '과', 없으면 '와'. 한글이 아니면 '와'.
export function withJosa(word) {
  const last = String(word || "").trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return "와";
  return code % 28 ? "과" : "와";
}

const PHONE_SOURCE_LABEL = { call: "갤럭시 통화 기록", sms: "갤럭시 문자", kakao: "카톡 알림" };
const CHANNEL_WORD = { call: "통화", sms: "문자", kakao: "카톡" };

// 행 하나의 말. { when, name(굵게), tail, meta, quote }
export function describeCandidate(candidate, now = Date.now()) {
  const c = candidate || {};
  const customer = c.customer || {};
  const when = candidateWhen(c.occurredAt, now);
  if (c.source === "calendar") {
    return {
      when,
      name: customer.name,
      tail: ` ${c.channel === "call" ? "통화 일정" : "미팅"} — 기록이 없어요`,
      meta: [
        c.title ? `캘린더 '${c.title}'` : "캘린더",
        c.confidence === "confirmed" ? "딜에 걸어 둔 일정" : "고객 이름으로 연결",
      ].join(" · "),
      quote: null,
    };
  }
  const name = customer.person || customer.name;
  const context = customer.isUnregistered
    ? "미등록 연락처"
    : customer.person && customer.person !== customer.name ? customer.name : customer.org;
  const minutes = durationLabel(c.durationSec);
  const tail = c.channel === "call"
    ? `${withJosa(name)} ${minutes ? `${minutes} ` : ""}통화`
    : ` ${CHANNEL_WORD[c.channel] || "연락"}`;
  const meta = [
    context && context !== name ? context : null,
    PHONE_SOURCE_LABEL[c.channel] || "갤럭시",
    c.count > 1 ? `${CHANNEL_WORD[c.channel] || "연락"} ${c.count}건` : null,
    c.promiseHint ? `약속 후보 ${c.promiseHint.label}` : null,
  ].filter(Boolean).join(" · ");
  return { when, name, tail, meta, quote: c.channel === "call" ? null : c.text || null };
}
