// 휴대폰 기록 후보 저장 — Supabase IO만. 판정은 phone-capture.ts가 한다.
//
// 저장소 결정: 새 테이블을 만들지 않고 기존 `webhook_events`를 쓴다(마이그레이션 0).
//   · 의미가 같다 — 외부(폰의 자동화 앱)에서 들어온 사건이고, 처리 전(received)·처리됨(processed)·
//     무시(ignored) 생명주기를 이미 갖는다. 허브의 "기록 후보"는 received 상태의 phone.* 사건이다.
//   · 멱등이 이미 있다 — (workspace_id, source, provider_event_id) 부분 유니크 인덱스.
//   · 정본 활동(crm_activities)이 아니다 — 확인 전 후보를 기록처럼 섞지 않는다.
// 행 모양: source='phone-capture', event_type='phone.call'|'phone.sms'|'phone.kakao',
// payload={v:1, channel, direction, occurredAt, durationSec, text, matchedOn, customer}. 번호는 없다.
// 하루 버린 개수는 event_type='phone.discarded', provider_event_id='discarded:<KST 날짜>' 한 행.

import {
  eqFilter,
  inFilter,
  resolveDefaultWorkspaceId,
} from '@com-moon/supabase-rest';
import { fetchSupabaseRows, insertSupabaseRecord, updateSupabaseRecord } from './supabase-rest.ts';
import { PHONE_EVENT_SOURCE, type DirectoryRows, type PhoneEventType } from './phone-capture.ts';

export const PHONE_CANDIDATE_TYPES = ['phone.call', 'phone.sms', 'phone.kakao'];
export const PHONE_DISCARD_TYPE = 'phone.discarded';
// 처리하지 않은 후보·버린 후보의 내용(미리보기·고객 참조)을 지우는 기한.
export const PHONE_RETENTION_DAYS = 7;
const DIRECTORY_LIMIT = 1000;

const KST_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
export const kstDay = (date: Date) => KST_DAY.format(date);

const ws = (workspaceId: string) => ['workspace_id', eqFilter(workspaceId)] as [string, string];

// 매칭에 필요한 열만 읽는다. meta 전체(보강 데이터가 크다) 대신 카톡 별칭만 뽑는다.
export async function loadPhoneDirectory(workspaceId = resolveDefaultWorkspaceId()): Promise<DirectoryRows | null> {
  if (!workspaceId) return null;
  const read = (table: string, select: string) => fetchSupabaseRows(table, { select, filters: [ws(workspaceId)], limit: DIRECTORY_LIMIT });
  const [leads, accounts, contacts, companies] = await Promise.all([
    read('leads', 'id,name,phone,company_id,contact_id,status,kakao_names:meta->kakao_names'),
    read('customer_accounts', 'id,name,company_id,kakao_names:meta->kakao_names'),
    read('contacts', 'id,name,phone,company_id,kakao_names:meta->kakao_names'),
    read('companies', 'id,name,phone'),
  ]);
  // 고객 쪽(리드·계약) 읽기 실패는 전부 실패다 — 모르는 상태에서 "고객 아님"으로 버리면 조용히 잃는다.
  if (!Array.isArray(leads) || !Array.isArray(accounts) || !Array.isArray(contacts) || !Array.isArray(companies)) return null;
  return { leads, accounts, contacts, companies };
}

export async function storePhoneCandidate(
  row: { eventType: string; providerEventId: string; payload: Record<string, unknown>; receivedAt: string },
  workspaceId = resolveDefaultWorkspaceId(),
) {
  if (!workspaceId) return { status: 'failed' as const, reason: 'missing-workspace' };
  const res = await insertSupabaseRecord('webhook_events', {
    workspace_id: workspaceId,
    event_type: row.eventType,
    source: PHONE_EVENT_SOURCE,
    status: 'received',
    provider_event_id: row.providerEventId,
    payload: row.payload,
    received_at: row.receivedAt,
  }, { returnRepresentation: true, select: 'id' });
  if (res.persisted) return { status: 'saved' as const, id: res.id ?? null };
  if (res.reason === 'duplicate') return { status: 'duplicate' as const };
  return { status: 'failed' as const, reason: res.reason };
}

// 버린 개수 +1. 동시에 두 건이 오면 하나를 잃을 수 있다(대략의 숫자 — 표시용).
export async function countPhoneDiscard(type: PhoneEventType, now: Date, workspaceId = resolveDefaultWorkspaceId()) {
  if (!workspaceId) return;
  const day = kstDay(now);
  const key = `discarded:${day}`;
  const bump = async () => {
    const rows = await fetchSupabaseRows('webhook_events', {
      select: 'id,payload',
      filters: [ws(workspaceId), ['source', eqFilter(PHONE_EVENT_SOURCE)], ['provider_event_id', eqFilter(key)]],
      limit: 1,
    });
    if (!Array.isArray(rows) || !rows[0]?.id) return false;
    const current = rows[0].payload && typeof rows[0].payload === 'object' ? rows[0].payload : {};
    const next = { ...current, day, count: (Number(current.count) || 0) + 1, [type]: (Number(current[type]) || 0) + 1 };
    await updateSupabaseRecord('webhook_events', [ws(workspaceId), ['id', eqFilter(rows[0].id)]], { payload: next, processed_at: now.toISOString() });
    return true;
  };
  if (await bump()) return;
  const res = await insertSupabaseRecord('webhook_events', {
    workspace_id: workspaceId,
    event_type: PHONE_DISCARD_TYPE,
    source: PHONE_EVENT_SOURCE,
    status: 'processed',
    provider_event_id: key,
    payload: { day, count: 1, [type]: 1 },
    received_at: now.toISOString(),
    processed_at: now.toISOString(),
  });
  if (!res.persisted && res.reason === 'duplicate') await bump();
}

// 보존 기한이 지난 후보는 내용을 지운다(상태와 무관 — 처리한 것도, 버린 것도, 방치한 것도).
// v=1 행만 건드리고 v=0으로 바꾸므로 같은 행을 다시 고치지 않는다.
export async function redactExpiredPhoneEvents(now: Date, workspaceId = resolveDefaultWorkspaceId()) {
  if (!workspaceId) return;
  const cutoff = new Date(now.getTime() - PHONE_RETENTION_DAYS * 86400000).toISOString();
  await updateSupabaseRecord('webhook_events', [
    ws(workspaceId),
    ['source', eqFilter(PHONE_EVENT_SOURCE)],
    ['event_type', inFilter(PHONE_CANDIDATE_TYPES)],
    ['received_at', `lt.${cutoff}`],
    ['payload->>v', eqFilter(1)],
  ], { payload: { v: 0, redacted: true } });
}
