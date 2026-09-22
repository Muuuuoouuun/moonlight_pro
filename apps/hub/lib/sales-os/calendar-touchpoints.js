// 캘린더 접점 — 일정과 고객을 잇고, 기록이 빠진 미팅을 찾는다. 순수 함수.
//
// 넛지의 첫 계기(`meeting_unrecorded`)가 여기서 나온다: 어제 미팅이 캘린더에 있는데 그
// 고객의 기록이 없으면 "기록 안 남긴 미팅"으로 올린다. 새 입력을 요구하지 않고 이미 연결된
// 것(Google Calendar + crm_activities)만 읽는다.
//
// 매칭 규칙은 `scripts/enrich-eeocrm-leads.mjs`가 쓰던 것을 그대로 옮겼다(사본 금지 —
// 스크립트도 이제 여기서 import한다). 정규화한 고객·회사명이 3자 이상이고 제목+장소에
// 통째로 들어 있을 때만 맞춘다. 짧은 이름(2자)은 흔한 단어와 충돌해 오탐이 크다.

import { normalizeEntityName } from "./lead-enrichment.js";

const HOUR_MS = 3600000;

// 일정 시작 2시간 전부터 종료 24시간 뒤까지를 "그 미팅의 기록"으로 인정한다.
// 앞: 미팅 직전에 미리 메모를 남기는 경우. 뒤: 당일 늦게 또는 다음 날 아침에 정리하는 경우.
export const RECORD_WINDOW_BEFORE_MS = 2 * HOUR_MS;
export const RECORD_WINDOW_AFTER_MS = 24 * HOUR_MS;

// 오탐이 큰 짧은 이름은 매칭에서 제외한다.
export const MIN_MATCH_NAME_LENGTH = 3;

// 제목에서 접점 종류를 읽는다. 스크립트와 같은 어휘.
export function classifyCalendarTitle(title) {
  const text = String(title || "").toLowerCase();
  if (/설명회|세미나|웨비나/.test(text)) return "infoSession";
  if (/미팅|회의|meeting|방문|상담/.test(text)) return "meeting";
  if (/콜|전화|call/.test(text)) return "call";
  return "other";
}

// 접점 종류 → 기록창 채널 프리셋.
const CHANNEL_BY_CLASS = { infoSession: "meeting", meeting: "meeting", call: "call", other: "meeting" };

export function channelForCalendarClass(kind) {
  return CHANNEL_BY_CLASS[kind] || "meeting";
}

function eventStart(event) {
  return event?.start?.dateTime || event?.start?.date || "";
}

function eventEnd(event) {
  return event?.end?.dateTime || event?.end?.date || eventStart(event);
}

function timeOf(value) {
  const t = new Date(value || "").getTime();
  return Number.isFinite(t) ? t : null;
}

// 일정 하나가 가리키는 고객 후보들. 이름이 길수록(더 구체적일수록) 먼저 온다.
// candidates: [{ id, kind, name, companyName?, companyId?, eventId? }]
export function matchEventToCustomers(event, candidates = []) {
  const haystack = normalizeEntityName(`${event?.summary || ""} ${event?.location || ""}`);
  const eventId = event?.id || null;
  const matches = [];

  for (const c of candidates) {
    if (!c) continue;
    // 딜에 걸어 둔 다음 미팅(meta.next_meeting.eventId)은 이름과 무관하게 확정 매칭이다 —
    // 운영자가 직접 이은 것이라 추측보다 강하다.
    if (eventId && c.eventId && String(c.eventId) === String(eventId)) {
      matches.push({ ...c, confidence: "confirmed", matchedOn: "eventId" });
      continue;
    }
    if (!haystack) continue;
    const names = [c.name, c.companyName].filter(Boolean).map(normalizeEntityName);
    const hit = names.find((n) => n.length >= MIN_MATCH_NAME_LENGTH && haystack.includes(n));
    if (hit) matches.push({ ...c, confidence: "guess", matchedOn: "name", matchedName: hit });
  }

  // 확정이 먼저, 그다음 더 긴(구체적인) 이름이 먼저.
  return matches.sort((a, b) => {
    if (a.confidence !== b.confidence) return a.confidence === "confirmed" ? -1 : 1;
    return (b.matchedName?.length || 0) - (a.matchedName?.length || 0);
  });
}

// 이 일정에 해당하는 기록이 이미 있는가. 같은 고객의 활동이 창 안에 하나라도 있으면 있다고 본다.
export function hasRecordFor(event, customer, activities = []) {
  const start = timeOf(eventStart(event));
  if (start == null) return false;
  const end = timeOf(eventEnd(event)) ?? start;
  const from = start - RECORD_WINDOW_BEFORE_MS;
  const to = end + RECORD_WINDOW_AFTER_MS;

  return (activities || []).some((a) => {
    if (!a) return false;
    const at = timeOf(a.occurredAt);
    if (at == null || at < from || at > to) return false;
    // 활동은 대부분 회사 기준으로 연결된다(라이브 115행 중 company_id 109·lead_id 0) —
    // 고객 id만 보면 사실상 아무것도 맞지 않는다.
    if (customer?.id && a.leadId && String(a.leadId) === String(customer.id)) return true;
    if (customer?.id && a.dealId && String(a.dealId) === String(customer.id)) return true;
    if (customer?.id && a.accountId && String(a.accountId) === String(customer.id)) return true;
    if (customer?.companyId && a.companyId && String(a.companyId) === String(customer.companyId)) return true;
    return false;
  });
}

// 지난 일정 중 고객과 맞는데 기록이 없는 것. 넛지 `meeting_unrecorded`의 입력.
//
// ignoredEventIds: 운영자가 "고객 아님"으로 넘긴 일정(브라우저 저장).
// now: 아직 끝나지 않은 일정은 대상이 아니다 — 끝나야 기록할 것이 생긴다.
export function findUnrecordedMeetings({
  events = [],
  candidates = [],
  activities = [],
  ignoredEventIds = [],
  now = Date.now(),
} = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  const ignored = new Set((ignoredEventIds || []).map(String));
  const out = [];

  for (const event of events || []) {
    const id = event?.id ? String(event.id) : null;
    if (id && ignored.has(id)) continue;

    const start = timeOf(eventStart(event));
    const end = timeOf(eventEnd(event)) ?? start;
    if (start == null) continue;
    // 종일 일정은 개인 일정·휴가가 대부분이라 미기록 판정 대상에서 뺀다.
    if (event?.start?.date && !event?.start?.dateTime) continue;
    if ((end ?? start) > nowMs) continue; // 아직 안 끝남

    const matched = matchEventToCustomers(event, candidates);
    const customer = matched[0];
    if (!customer) continue; // 고객을 못 찾은 일정은 넛지로 올리지 않는다(오탐 방지)
    if (hasRecordFor(event, customer, activities)) continue;

    const kind = classifyCalendarTitle(event?.summary);
    out.push({
      eventId: id,
      title: event?.summary || "(제목 없는 일정)",
      startAt: eventStart(event),
      endAt: eventEnd(event),
      kind,
      channel: channelForCalendarClass(kind),
      customer: {
        id: customer.id,
        kind: customer.kind || "lead",
        name: customer.name,
        companyId: customer.companyId || null,
      },
      confidence: customer.confidence,
    });
  }

  // 최근 것이 위로.
  return out.sort((a, b) => (timeOf(b.startAt) || 0) - (timeOf(a.startAt) || 0));
}
