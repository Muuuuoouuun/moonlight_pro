// 휴대폰 기록 후보 — 순수 함수(IO 없음).
//
// 갤럭시의 자동화 앱(MacroDroid·Tasker)이 통화 종료·문자 수신·카카오톡 알림을 HTTP로 보낸다.
// 여기서 하는 일은 세 가지뿐이다:
//   1) 느슨한 입력을 한 모양으로 접는다 — 자동화 앱은 숫자도 문자열로, 시각도 제각각 보낸다.
//   2) 등록된 고객과 맞춘다 — 번호(정규화)나 카톡 표시 이름(정규화·정확 일치·별칭).
//   3) 멱등 키를 만든다 — 같은 사건을 두 번 보내도 후보는 하나.
//
// 개인정보 원칙(운영자 2026-09-24): 고객과 맞지 않는 사건은 내용을 저장하지 않고 버린다.
// 맞은 사건도 번호는 저장하지 않는다(고객 참조로 충분하다). 메시지는 미리보기 길이로 자른다.
// 어떤 것도 자동으로 연락 기록(crm_activities)이 되지 않는다 — 허브에서 확인해야 기록이 된다.

import { createHash } from 'node:crypto';

type JsonRecord = Record<string, unknown>;

// webhook_events.source — 허브의 기록 후보 읽기가 같은 값으로 거른다.
export const PHONE_EVENT_SOURCE = 'phone-capture';

export type PhoneEventType = 'call' | 'sms' | 'kakao';
export type PhoneDirection = 'in' | 'out' | 'missed';

export type PhoneEvent = {
  type: PhoneEventType;
  number: string | null; // 정규화한 번호 — 저장하지 않고 매칭·멱등 키에만 쓴다
  name: string | null; // 폰 주소록 이름(통화·문자) 또는 카톡 표시 이름
  direction: PhoneDirection | null;
  durationSec: number | null;
  occurredAt: string; // ISO
  text: string | null; // 문자·카톡 미리보기(통화는 항상 null)
};

export type PhoneCustomer = {
  kind: 'lead' | 'account' | null;
  id: string | null;
  key: string | null; // 'lead:<id>' | 'account:<id>' | null(연락처만 등록된 사람)
  name: string;
  org: string | null;
  person: string | null;
  companyId: string | null;
  leadId: string | null;
  accountId: string | null;
  contactId: string | null;
  phone?: string | null;
  isUnregistered?: boolean;
};

export type PhoneMatch =
  | { status: 'matched'; customer: PhoneCustomer; matchedOn: 'phone' | 'name' | 'alias' }
  | { status: 'unmatched' }
  | { status: 'ambiguous' };

// 미리보기 길이. 원문 전체 보관은 목적("고객 연락 기록")을 넘는다.
export const TEXT_PREVIEW_MAX = 280;
// 이보다 오래된 사건은 받지 않는다 — 밀린 재전송이 며칠 전 일을 "지금 기록할까요"로 올린다.
export const MAX_EVENT_AGE_MS = 7 * 86400000;
// 폰 시계가 조금 빠를 수 있다. 그보다 미래면 받은 시각으로 둔다.
const FUTURE_SKEW_MS = 10 * 60000;
const MIN_NAME_LENGTH = 2;

const TYPE_ALIASES: Record<string, PhoneEventType> = {
  call: 'call', phone: 'call', 'call.ended': 'call', 전화: 'call', 통화: 'call',
  sms: 'sms', mms: 'sms', message: 'sms', text: 'sms', 문자: 'sms',
  kakao: 'kakao', kakaotalk: 'kakao', 'com.kakao.talk': 'kakao', 카톡: 'kakao', 카카오톡: 'kakao',
};

const DIRECTION_ALIASES: Record<string, PhoneDirection> = {
  in: 'in', incoming: 'in', inbound: 'in', received: 'in', 수신: 'in', 받은: 'in',
  out: 'out', outgoing: 'out', outbound: 'out', sent: 'out', 발신: 'out', 건: 'out',
  missed: 'missed', 부재중: 'missed', rejected: 'missed', 거절: 'missed',
};

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

// 자동화 앱은 값이 없을 때 매직 텍스트를 그대로("{call_name}") 보내기도 한다 — 빈 값으로 본다.
function cleanString(value: unknown, max: number): string | null {
  if (value == null) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value)
    .normalize('NFKC')
    .replace(/\u0000/g, '')
    .replace(/[\uD800-\uDFFF]/gu, '') // 짝 없는 서러게이트 — Postgres UTF-8이 거절한다
    .replace(/\s+/g, ' ')
    .trim();
  if (!text || /^\{[a-z_]+\}$/i.test(text)) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function normalizeKoreanPhone(raw: unknown): string | null {
  if (raw == null || (typeof raw !== 'string' && typeof raw !== 'number')) return null;
  const text = String(raw).normalize('NFKC').trim();
  if (!text || text.length > 40) return null;
  const international = text.startsWith('+');
  let digits = text.replace(/\D/g, '');
  if (!digits) return null;

  let countryStripped = false;
  if (digits.startsWith('0082')) { digits = digits.slice(4); countryStripped = true; }
  else if (digits.startsWith('82') && (international || digits.length >= 11)) { digits = digits.slice(2); countryStripped = true; }
  else if (international) {
    // 한국 밖 번호는 국제 형식 그대로 — 같은 형식으로 저장된 연락처와만 맞는다.
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }

  if (/^1[5-8]\d{6}$/.test(digits)) return digits; // 1588-xxxx 같은 대표번호
  // 국가번호 뒤에는 지역·이동통신 번호의 0이 빠진다(+82 10-…, +82 2-…).
  if (!digits.startsWith('0') && (countryStripped ? /^[1-9]\d{7,9}$/.test(digits) : /^1[016789]\d{7,8}$/.test(digits))) digits = `0${digits}`;
  return /^0\d{8,10}$/.test(digits) ? digits : null;
}

// "252", 252, "04:12", "00:04:12", "4분 12초", "1시간 2분", "4m12s" → 초. 모르면 null.
export function parseDurationSec(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 && raw <= 86400 ? Math.round(raw) : null;
  if (typeof raw !== 'string') return null;
  const text = raw.normalize('NFKC').trim().toLowerCase();
  if (!text || /^\{[a-z_]+\}$/.test(text)) return null;
  let seconds: number | null = null;
  if (/^\d+(?:\.\d+)?$/.test(text)) seconds = Number(text);
  else {
    const clock = /^(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?$/.exec(text);
    if (clock) {
      const [a, b, c] = [clock[1], clock[2], clock[3]].map((part) => (part == null ? null : Number(part)));
      seconds = c == null ? (a as number) * 60 + (b as number) : (a as number) * 3600 + (b as number) * 60 + c;
    } else {
      const unit = /^(?:(\d+)\s*(?:시간|h|hr|hours?))?\s*(?:(\d+)\s*(?:분|m|min|minutes?))?\s*(?:(\d+)\s*(?:초|s|sec|seconds?))?$/.exec(text);
      if (unit && (unit[1] || unit[2] || unit[3])) {
        seconds = Number(unit[1] || 0) * 3600 + Number(unit[2] || 0) * 60 + Number(unit[3] || 0);
      }
    }
  }
  return seconds != null && Number.isFinite(seconds) && seconds >= 0 && seconds <= 86400 ? Math.round(seconds) : null;
}

// epoch 초({system_time})·epoch ms·ISO·"YYYY-MM-DD HH:mm[:ss]"(시간대 없으면 KST) → ms. 모르면 null.
export function parseInstant(raw: unknown): number | null {
  let ms: number | null = null;
  if (typeof raw === 'number' && Number.isFinite(raw)) ms = raw < 1e11 ? raw * 1000 : raw;
  else if (typeof raw === 'string') {
    const text = raw.normalize('NFKC').trim();
    if (/^\d{9,13}(?:\.\d+)?$/.test(text)) {
      const n = Number(text);
      ms = n < 1e11 ? n * 1000 : n;
    } else {
      const local = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
      if (local) {
        const [, y, mo, d, h, mi, s] = local;
        ms = Date.parse(`${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${mi}:${(s || '00').padStart(2, '0')}+09:00`);
      } else if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
        ms = Date.parse(text);
      }
    }
  }
  return ms != null && Number.isFinite(ms) ? ms : null;
}

// 사건 시각. 모르면 받은 시각, 폰 시계가 앞서 있으면 받은 시각. 7일보다 오래되면 null — 호출측이 stale로 거절한다.
export function parseOccurredAt(raw: unknown, now: Date = new Date()): string | null {
  const nowMs = now.getTime();
  const ms = parseInstant(raw);
  if (ms == null) return new Date(nowMs).toISOString();
  if (ms > nowMs + FUTURE_SKEW_MS) return new Date(nowMs).toISOString();
  if (ms < nowMs - MAX_EVENT_AGE_MS) return null;
  return new Date(Math.floor(ms / 1000) * 1000).toISOString();
}

// 통화 시간을 직접 못 보내는 자동화 앱은 "통화 시작 시각"을 보낸다(MacroDroid: 통화 활성 트리거에서
// {system_time}을 변수에 담아 둔다). 종료 시각과의 차이 — 4시간을 넘거나 음수면 믿지 않는다.
const MAX_DERIVED_CALL_MS = 4 * 3600000;
function durationFromStart(startRaw: unknown, occurredAt: string): number | null {
  const start = parseInstant(startRaw);
  const end = Date.parse(occurredAt);
  if (start == null || !Number.isFinite(end)) return null;
  const ms = end - start;
  return ms >= 0 && ms <= MAX_DERIVED_CALL_MS ? Math.round(ms / 1000) : null;
}

function pick(body: JsonRecord, keys: string[]): unknown {
  for (const key of keys) {
    const value = body[key];
    if (value != null && value !== '') return value;
  }
  return undefined;
}

function resolveType(body: JsonRecord): PhoneEventType | null {
  const direct = cleanString(pick(body, ['type', 'kind', 'event']), 40);
  if (direct && TYPE_ALIASES[direct.toLowerCase()]) return TYPE_ALIASES[direct.toLowerCase()];
  // 알림 트리거는 앱 이름·패키지로만 카톡임을 알려 주기도 한다.
  const app = cleanString(pick(body, ['app', 'package', 'appName']), 80)?.toLowerCase() || '';
  if (app.includes('kakao') || app.includes('카카오')) return 'kakao';
  return null;
}

// 자동화 앱은 매직 텍스트를 JSON 문자열 안에 그대로 끼워 넣는다 — 메시지에 줄바꿈이나 따옴표가 있으면
// 본문이 깨진 JSON이 된다. 엄격한 JSON이 실패하면 알려진 키를 경계로 평평한 객체만 관대하게 읽는다.
// (값 안에 `","occurredAt":` 같은 키 모양이 그대로 들어 있으면 그 지점에서 잘린다 — 미리보기라 감수한다.)
const BODY_KEYS = ['type', 'kind', 'event', 'app', 'package', 'appName', 'number', 'phone', 'from', 'sender', 'name', 'title',
  'contact', 'senderName', 'direction', 'dir', 'duration', 'durationSec', 'duration_sec', 'startedAt', 'started_at', 'callStart',
  'occurredAt', 'occurred_at', 'time', 'timestamp', 'text', 'message', 'body', 'preview'];
const KEY_PATTERN = new RegExp(`"(${BODY_KEYS.join('|')})"\\s*:`, 'g');

export function parsePhoneBody(raw: string): JsonRecord | null {
  try {
    return record(JSON.parse(raw));
  } catch { /* 아래에서 관대하게 */ }
  const text = String(raw || '').trim();
  if (!text.startsWith('{') || !text.endsWith('}')) return null;
  const inner = text.slice(1, -1);
  const marks = [...inner.matchAll(KEY_PATTERN)];
  if (!marks.length) return null;
  const out: JsonRecord = {};
  marks.forEach((mark, index) => {
    const start = (mark.index ?? 0) + mark[0].length;
    const end = index + 1 < marks.length ? marks[index + 1].index ?? inner.length : inner.length;
    const value = inner.slice(start, end).trim().replace(/,$/, '').trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      out[mark[1]] = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n');
    } else if (/^-?\d+(?:\.\d+)?$/.test(value)) out[mark[1]] = Number(value);
    else if (value === 'null') out[mark[1]] = null;
  });
  return Object.keys(out).length ? out : null;
}

export type NormalizedPhoneBody = { ok: true; event: PhoneEvent } | { ok: false; error: string };

export function normalizePhoneEvent(input: unknown, now: Date = new Date()): NormalizedPhoneBody {
  const body = record(input);
  if (!body) return { ok: false, error: 'invalid-json' };
  const type = resolveType(body);
  if (!type) return { ok: false, error: 'unknown-type' };

  const occurredAt = parseOccurredAt(pick(body, ['occurredAt', 'occurred_at', 'time', 'timestamp']), now);
  if (!occurredAt) return { ok: false, error: 'stale-event' };

  const rawDirection = cleanString(pick(body, ['direction', 'dir']), 20)?.toLowerCase() || '';
  const direction = DIRECTION_ALIASES[rawDirection] || null;
  const number = type === 'kakao' ? null : normalizeKoreanPhone(pick(body, ['number', 'phone', 'from', 'sender']));
  const name = cleanString(pick(body, ['name', 'title', 'contact', 'senderName']), 100);
  const durationSec = type === 'call'
    ? parseDurationSec(pick(body, ['durationSec', 'duration', 'duration_sec'])) ?? durationFromStart(pick(body, ['startedAt', 'started_at', 'callStart']), occurredAt)
    : null;
  const text = type === 'call' ? null : cleanString(pick(body, ['text', 'message', 'body', 'preview']), TEXT_PREVIEW_MAX);

  if (type === 'kakao' && !name) return { ok: false, error: 'kakao-name-required' };
  if (type !== 'kakao' && !number && !name) return { ok: false, error: 'number-required' };

  return { ok: true, event: { type, number, name, direction, durationSec, occurredAt, text } };
}

// 연결되지 않은 통화(부재중·0초)는 기록할 대화가 없다. 다시 걸 일은 폰의 부재중 알림이 이미 말한다.
export function isConversation(event: PhoneEvent): boolean {
  if (event.type !== 'call') return true;
  if (event.direction === 'missed') return false;
  return event.durationSec !== 0;
}

// 이름 비교 키 — 공백·기호·대소문자를 지운다. 카톡 표시 이름의 호칭("실장님")을 뗀 형태도 같이 본다.
export function normalizePersonName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]/g, '');
}

const HONORIFIC = /(부원장|원장|실장|대표|선생|강사|팀장|과장|부장|차장|이사|교수|매니저|상담사)?(님|쌤)?$/;

export function nameKeys(value: unknown): string[] {
  const full = normalizePersonName(value);
  const bare = full.replace(HONORIFIC, '');
  return [...new Set([full, bare])].filter((key) => key.length >= MIN_NAME_LENGTH);
}

// ── 고객 디렉터리 ──────────────────────────────────────────────────────────────
// 원본 행(leads·customer_accounts·contacts·companies)을 "이 번호/이름이면 이 고객" 색인으로 접는다.

export type DirectoryRows = {
  leads?: JsonRecord[] | null;
  accounts?: JsonRecord[] | null;
  contacts?: JsonRecord[] | null;
  companies?: JsonRecord[] | null;
};

type Target = { customer: PhoneCustomer; on: 'phone' | 'name' | 'alias' };

export type PhoneDirectory = {
  byPhone: Map<string, Target[]>;
  byName: Map<string, Target[]>;
  size: number;
};

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function aliasList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => str(v)).filter((v): v is string => Boolean(v)).slice(0, 20);
  const one = str(value);
  return one ? one.split(',').map((v) => v.trim()).filter(Boolean).slice(0, 20) : [];
}

function add(map: Map<string, Target[]>, key: string | null, target: Target) {
  if (!key) return;
  const list = map.get(key) || [];
  list.push(target);
  map.set(key, list);
}

export function buildPhoneDirectory(rows: DirectoryRows): PhoneDirectory {
  const companies = new Map<string, JsonRecord>();
  for (const c of rows.companies || []) if (str(c?.id)) companies.set(String(c.id), c);
  const contactsById = new Map<string, JsonRecord>();
  for (const c of rows.contacts || []) if (str(c?.id)) contactsById.set(String(c.id), c);

  const leadCustomers = new Map<string, PhoneCustomer>();
  const leadByContact = new Map<string, PhoneCustomer>();
  const customersByCompany = new Map<string, PhoneCustomer[]>();

  const companyName = (id: unknown) => (str(id) ? str(companies.get(String(id))?.name) : null);

  for (const lead of rows.leads || []) {
    const id = str(lead?.id);
    if (!id) continue;
    const companyId = str(lead.company_id);
    const contactId = str(lead.contact_id);
    const contact = contactId ? contactsById.get(contactId) : null;
    const org = companyName(companyId);
    const customer: PhoneCustomer = {
      kind: 'lead', id, key: `lead:${id}`,
      name: str(lead.name) || org || str(contact?.name) || '이름 없는 고객',
      org, person: str(contact?.name), companyId, leadId: id, accountId: null, contactId,
    };
    leadCustomers.set(id, customer);
    if (contactId) leadByContact.set(contactId, customer);
    // 잃은 리드는 같은 회사의 다른 고객보다 뒤에 둔다 — 회사 번호가 걸렸을 때의 대표 고객 선택.
    if (companyId) {
      const list = customersByCompany.get(companyId) || [];
      if (String(lead.status || '').toLowerCase() === 'lost') list.push(customer);
      else list.unshift(customer);
      customersByCompany.set(companyId, list);
    }
  }
  const accountCustomers = new Map<string, PhoneCustomer>();
  for (const account of rows.accounts || []) {
    const id = str(account?.id);
    if (!id) continue;
    const companyId = str(account.company_id);
    const org = companyName(companyId);
    const customer: PhoneCustomer = {
      kind: 'account', id, key: `account:${id}`,
      name: str(account.name) || org || '이름 없는 고객',
      org, person: null, companyId, leadId: null, accountId: id, contactId: null,
    };
    accountCustomers.set(id, customer);
    if (companyId) {
      const list = customersByCompany.get(companyId) || [];
      list.push(customer);
      customersByCompany.set(companyId, list);
    }
  }

  const byPhone = new Map<string, Target[]>();
  const byName = new Map<string, Target[]>();

  for (const lead of rows.leads || []) {
    const customer = leadCustomers.get(String(lead?.id));
    if (!customer) continue;
    add(byPhone, normalizeKoreanPhone(lead.phone), { customer, on: 'phone' });
    for (const key of nameKeys(lead.name)) add(byName, key, { customer, on: 'name' });
    for (const alias of aliasList(lead.kakao_names)) for (const key of nameKeys(alias)) add(byName, key, { customer, on: 'alias' });
  }
  for (const account of rows.accounts || []) {
    const customer = accountCustomers.get(String(account?.id));
    if (!customer) continue;
    for (const key of nameKeys(account.name)) add(byName, key, { customer, on: 'name' });
    for (const alias of aliasList(account.kakao_names)) for (const key of nameKeys(alias)) add(byName, key, { customer, on: 'alias' });
  }
  for (const company of rows.companies || []) {
    const id = str(company?.id);
    const owner = id ? customersByCompany.get(id)?.[0] : null;
    // 리드·계약 고객이 없는 회사는 고객이 아니다 — 회사 번호만으로는 저장하지 않는다.
    if (owner) add(byPhone, normalizeKoreanPhone(company.phone), { customer: owner, on: 'phone' });
  }
  for (const contact of rows.contacts || []) {
    const id = str(contact?.id);
    if (!id) continue;
    const companyId = str(contact.company_id);
    const person = str(contact.name);
    const base = leadByContact.get(id) || (companyId ? customersByCompany.get(companyId)?.[0] : null) || null;
    const customer: PhoneCustomer = base
      ? { ...base, person: person || base.person, contactId: id }
      : {
        kind: null, id: null, key: null, name: person || '이름 없는 연락처',
        org: companyName(companyId), person, companyId, leadId: null, accountId: null, contactId: id,
      };
    add(byPhone, normalizeKoreanPhone(contact.phone), { customer, on: 'phone' });
    for (const key of nameKeys(contact.name)) add(byName, key, { customer, on: 'name' });
    for (const alias of aliasList(contact.kakao_names)) for (const key of nameKeys(alias)) add(byName, key, { customer, on: 'alias' });
  }

  return { byPhone, byName, size: leadCustomers.size + accountCustomers.size + contactsById.size };
}

// 같은 회사를 가리키면 같은 고객이다(리드·계약·연락처가 한 학원에 겹쳐 있다).
function identityOf(customer: PhoneCustomer) {
  return customer.companyId ? `company:${customer.companyId}` : customer.key || `contact:${customer.contactId}`;
}

const KIND_RANK: Record<string, number> = { lead: 0, account: 1 };

function choose(targets: Target[]): PhoneMatch {
  const identities = new Set(targets.map((t) => identityOf(t.customer)));
  // 서로 다른 고객 둘 이상이면 추측하지 않는다 — 잘못 붙은 기록 후보는 없는 것보다 나쁘다.
  if (identities.size !== 1) return { status: 'ambiguous' };
  const ranked = [...targets].sort((a, b) => {
    const kind = (KIND_RANK[a.customer.kind ?? ''] ?? 2) - (KIND_RANK[b.customer.kind ?? ''] ?? 2);
    if (kind) return kind;
    // 사람(연락처)까지 아는 쪽이 낫다 — "이수진 대표와 통화"로 말할 수 있다.
    return Number(Boolean(b.customer.person)) - Number(Boolean(a.customer.person));
  });
  const best = ranked[0];
  const person = best.customer.person || ranked.find((t) => t.customer.person)?.customer.person || null;
  return { status: 'matched', customer: { ...best.customer, person }, matchedOn: best.on };
}

export function matchPhoneEvent(event: PhoneEvent, directory: PhoneDirectory): PhoneMatch {
  if (event.number) {
    const hits = directory.byPhone.get(event.number);
    if (hits?.length) return choose(hits);
  }
  // 번호가 없거나 안 맞으면 이름으로 — 카톡은 늘, 통화·문자는 폰 주소록 이름이 있을 때만.
  if (event.name) {
    const hits = nameKeys(event.name).flatMap((key) => directory.byName.get(key) || []);
    if (hits.length) return choose(hits);
  }
  return { status: 'unmatched' };
}

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

// 멱등 키 — (종류, 번호 또는 이름, 시각[, 내용]). 번호·내용은 해시로만 남는다.
export function phoneEventDedupeKey(event: PhoneEvent): string {
  const who = event.number || `name:${normalizePersonName(event.name)}`;
  const parts = [event.type, who, event.occurredAt, event.type === 'call' ? '' : sha(event.text || '')];
  return `phone:${event.type}:${sha(parts.join('|')).slice(0, 40)}`;
}

// 폰 알림에 띄울 짧은 확인 문구(선택). 번호는 싣지 않는다.
export function phoneNotice(event: PhoneEvent, customer: PhoneCustomer): string {
  const who = customer.person && customer.person !== customer.name ? `${customer.person} · ${customer.name}` : customer.name;
  if (event.type === 'call') {
    const minutes = event.durationSec == null ? null : Math.max(1, Math.round(event.durationSec / 60));
    return `${who} ${minutes ? `${minutes}분 ` : ''}통화 — 허브에서 기록할까요`;
  }
  return `${who} ${event.type === 'sms' ? '문자' : '카톡'} — 허브에서 기록할까요`;
}

// webhook_events에 남길 모양. 번호는 넣지 않는다.
export function phoneCandidatePayload(event: PhoneEvent, match: Extract<PhoneMatch, { status: 'matched' }>) {
  return {
    v: 1,
    channel: event.type,
    direction: event.direction,
    occurredAt: event.occurredAt,
    durationSec: event.durationSec,
    text: event.text,
    matchedOn: match.matchedOn,
    customer: match.customer,
  };
}
