import assert from 'node:assert/strict';
import { test } from 'node:test';

const capture = await import('./phone-capture.ts');
const NOW = new Date('2026-09-24T05:36:00Z'); // KST 14:36

test('Korean numbers in every common spelling fold to one canonical form', () => {
  const canonical = '01012345678';
  for (const raw of ['010-1234-5678', '01012345678', '010 1234 5678', '+82 10-1234-5678', '+82-10-1234-5678',
    '+82 010-1234-5678', '82-10-1234-5678', '821012345678', '0082-10-1234-5678', '(010) 1234.5678', 1012345678]) {
    assert.equal(capture.normalizeKoreanPhone(raw), canonical, String(raw));
  }
  assert.equal(capture.normalizeKoreanPhone('02-123-4567'), '021234567');
  assert.equal(capture.normalizeKoreanPhone('031-1234-5678'), '03112345678');
  assert.equal(capture.normalizeKoreanPhone('+82 2-1234-5678'), '0212345678');
  assert.equal(capture.normalizeKoreanPhone('1588-1234'), '15881234');
  assert.equal(capture.normalizeKoreanPhone('+1 415 555 0100'), '+14155550100');
  for (const bad of ['', '   ', '12345', '{call_number}', null, undefined, {}, '010-12']) {
    assert.equal(capture.normalizeKoreanPhone(bad), null, String(bad));
  }
});

test('durations accept seconds, clock strings and Korean units; nonsense stays unknown', () => {
  const cases = [[252, 252], ['252', 252], ['04:12', 252], ['00:04:12', 252], ['1:00:00', 3600], ['4분 12초', 252],
    ['4m12s', 252], ['1시간 2분', 3720], ['0', 0], [12.4, 12]];
  for (const [raw, expected] of cases) assert.equal(capture.parseDurationSec(raw), expected, String(raw));
  for (const raw of ['', 'abc', '{call_duration}', -1, 90000, null, '4분쯤']) assert.equal(capture.parseDurationSec(raw), null, String(raw));
});

test('occurredAt reads epoch seconds, epoch ms, ISO and zone-less local time as KST', () => {
  const epoch = Math.floor(Date.parse('2026-09-24T05:32:10Z') / 1000);
  assert.equal(capture.parseOccurredAt(epoch, NOW), '2026-09-24T05:32:10.000Z');
  assert.equal(capture.parseOccurredAt(String(epoch), NOW), '2026-09-24T05:32:10.000Z');
  assert.equal(capture.parseOccurredAt(epoch * 1000, NOW), '2026-09-24T05:32:10.000Z');
  assert.equal(capture.parseOccurredAt('2026-09-24 14:32:10', NOW), '2026-09-24T05:32:10.000Z');
  assert.equal(capture.parseOccurredAt('2026-09-24T14:32:10+09:00', NOW), '2026-09-24T05:32:10.000Z');
  // 모르면 받은 시각, 미래면 받은 시각, 7일보다 오래되면 거절(null).
  assert.equal(capture.parseOccurredAt(undefined, NOW), NOW.toISOString());
  assert.equal(capture.parseOccurredAt('{system_time}', NOW), NOW.toISOString());
  assert.equal(capture.parseOccurredAt('2026-09-25 14:32', NOW), NOW.toISOString());
  assert.equal(capture.parseOccurredAt('2026-09-10 14:32', NOW), null);
});

test('lenient body normalization keeps only preview text and never keeps call content', () => {
  const call = capture.normalizePhoneEvent({ type: '통화', number: '010-1234-5678', direction: 'incoming', duration: '00:04:12', text: 'ignored' }, NOW);
  assert.equal(call.ok, true);
  assert.deepEqual(call.event, {
    type: 'call', number: '01012345678', name: null, direction: 'in', durationSec: 252,
    occurredAt: NOW.toISOString(), text: null,
  });
  const kakao = capture.normalizePhoneEvent({ app: 'KakaoTalk', title: '  박해솔   실장님 ', text: `${'가'.repeat(400)}` }, NOW);
  assert.equal(kakao.ok, true);
  assert.equal(kakao.event.type, 'kakao');
  assert.equal(kakao.event.name, '박해솔 실장님');
  assert.equal(kakao.event.number, null);
  assert.equal(kakao.event.text.length, capture.TEXT_PREVIEW_MAX);
  // 매직 텍스트가 그대로 오면 값이 없는 것이다.
  assert.equal(capture.normalizePhoneEvent({ type: 'sms', number: '{sms_number}' }, NOW).error, 'number-required');
  assert.equal(capture.normalizePhoneEvent({ type: 'kakao', text: 'hi' }, NOW).error, 'kakao-name-required');
  assert.equal(capture.normalizePhoneEvent({ type: 'fax', number: '01012345678' }, NOW).error, 'unknown-type');
  assert.equal(capture.normalizePhoneEvent({ type: 'call', number: '01012345678', occurredAt: '2026-09-01 10:00' }, NOW).error, 'stale-event');
  assert.equal(capture.normalizePhoneEvent([], NOW).error, 'invalid-json');
});

test('without a duration, a call start time (MacroDroid variable) derives it; stale or empty starts do not', () => {
  const end = Math.floor(Date.parse('2026-09-24T05:36:00Z') / 1000);
  const derive = (startedAt) => capture.normalizePhoneEvent({ type: 'call', number: '01012345678', occurredAt: String(end), startedAt }, NOW).event.durationSec;
  assert.equal(derive(String(end - 252)), 252);
  assert.equal(derive(''), null); // 비어 있는 변수
  assert.equal(derive('[v=callStart]'), null);
  assert.equal(derive(String(end - 5 * 3600)), null); // 지난 통화의 시작값이 남아 있던 경우
  assert.equal(derive(String(end + 60)), null);
  // 명시한 통화 시간이 이긴다.
  assert.equal(capture.normalizePhoneEvent({ type: 'call', number: '01012345678', duration: '10', startedAt: String(end - 252) }, NOW).event.durationSec, 10);
});

test('bodies broken by raw magic text (newlines, quotes) are still read by known keys', () => {
  assert.deepEqual(capture.parsePhoneBody('{"type":"sms","number":"010"}'), { type: 'sms', number: '010' });
  const broken = '{"type":"kakao","title":"박가온 실장님","text":"내일 "4시" 가능할까요?\n자료도 부탁드려요","occurredAt":"1790227930"}';
  assert.throws(() => JSON.parse(broken));
  assert.deepEqual(capture.parsePhoneBody(broken), {
    type: 'kakao', title: '박가온 실장님', text: '내일 "4시" 가능할까요?\n자료도 부탁드려요', occurredAt: '1790227930',
  });
  assert.deepEqual(capture.parsePhoneBody('{"type": "call", "duration": 252, "name": null}'), { type: 'call', duration: 252, name: null });
  for (const bad of ['', 'not json', '[1,2]', '{"unknown":x}', '{broken']) assert.equal(capture.parsePhoneBody(bad), null, bad);
});

test('missed and zero-second calls are not conversations; unknown duration still is', () => {
  const event = (patch) => ({ type: 'call', number: '01012345678', name: null, direction: 'in', durationSec: 60, occurredAt: NOW.toISOString(), text: null, ...patch });
  assert.equal(capture.isConversation(event({})), true);
  assert.equal(capture.isConversation(event({ direction: 'missed' })), false);
  assert.equal(capture.isConversation(event({ durationSec: 0 })), false);
  assert.equal(capture.isConversation(event({ durationSec: null })), true);
  assert.equal(capture.isConversation(event({ type: 'sms', durationSec: null })), true);
});

const rows = () => ({
  companies: [
    { id: 'co-1', name: '해솔수학학원', phone: '02-555-0101' },
    { id: 'co-2', name: '가온영어', phone: null },
    { id: 'co-3', name: '고객 아닌 회사', phone: '02-555-0303' },
  ],
  contacts: [
    { id: 'ct-1', name: '김해솔', phone: '010-1111-2222', company_id: 'co-1', kakao_names: null },
    { id: 'ct-2', name: '박가온 실장', phone: '+82 10-3333-4444', company_id: 'co-2', kakao_names: ['가온쌤'] },
    { id: 'ct-3', name: '이동명', phone: null, company_id: 'co-1', kakao_names: null },
    { id: 'ct-4', name: '이동명', phone: null, company_id: 'co-2', kakao_names: null },
    { id: 'ct-5', name: '최홀로', phone: '010-5555-6666', company_id: null, kakao_names: null },
  ],
  leads: [
    { id: 'lead-1', name: '해솔수학학원', phone: null, company_id: 'co-1', contact_id: 'ct-1', status: 'new', kakao_names: null },
    { id: 'lead-2', name: '가온영어', phone: '010-7777-8888', company_id: 'co-2', contact_id: null, status: 'qualified', kakao_names: null },
  ],
  accounts: [{ id: 'acc-1', name: '해솔수학학원', company_id: 'co-1', kakao_names: null }],
});

const eventOf = (patch) => ({ type: 'call', number: null, name: null, direction: 'in', durationSec: 120, occurredAt: NOW.toISOString(), text: null, ...patch });

test('numbers match contacts, leads and the owning customer of a company line', () => {
  const directory = capture.buildPhoneDirectory(rows());
  const contact = capture.matchPhoneEvent(eventOf({ number: '01011112222' }), directory);
  assert.equal(contact.status, 'matched');
  assert.equal(contact.customer.key, 'lead:lead-1');
  assert.equal(contact.customer.person, '김해솔');
  assert.equal(contact.customer.org, '해솔수학학원');
  assert.equal(contact.matchedOn, 'phone');

  // 같은 회사의 리드·계약은 한 고객이다 — 리드가 대표.
  const company = capture.matchPhoneEvent(eventOf({ number: '025550101' }), directory);
  assert.equal(company.status, 'matched');
  assert.equal(company.customer.key, 'lead:lead-1');

  assert.equal(capture.matchPhoneEvent(eventOf({ number: '01077778888' }), directory).customer.key, 'lead:lead-2');
  assert.equal(capture.matchPhoneEvent(eventOf({ number: '01033334444' }), directory).customer.person, '박가온 실장');

  // 리드·계약이 없는 회사 번호는 고객이 아니다.
  assert.equal(capture.matchPhoneEvent(eventOf({ number: '025550303' }), directory).status, 'unmatched');
  assert.equal(capture.matchPhoneEvent(eventOf({ number: '01099990000' }), directory).status, 'unmatched');

  // 연락처만 등록된 사람은 고객 키 없이 맞는다.
  const loner = capture.matchPhoneEvent(eventOf({ number: '01055556666' }), directory);
  assert.equal(loner.status, 'matched');
  assert.equal(loner.customer.key, null);
  assert.equal(loner.customer.contactId, 'ct-5');
});

test('kakao names match exactly after normalization, honorifics and aliases; collisions are refused', () => {
  const directory = capture.buildPhoneDirectory(rows());
  const kakao = (name) => capture.matchPhoneEvent(eventOf({ type: 'kakao', name, durationSec: null }), directory);
  assert.equal(kakao('박가온 실장님').customer.key, 'lead:lead-2');
  assert.equal(kakao('박가온').customer.key, 'lead:lead-2');
  assert.equal(kakao('가온쌤').matchedOn, 'alias');
  assert.equal(kakao('김해솔 원장님').customer.key, 'lead:lead-1');
  assert.equal(kakao('해솔 수학학원').customer.key, 'lead:lead-1');
  // 부분 일치는 하지 않는다.
  assert.equal(kakao('김해').status, 'unmatched');
  assert.equal(kakao('해솔').status, 'unmatched');
  // 두 학원에 같은 이름 — 추측하지 않는다.
  assert.equal(kakao('이동명').status, 'ambiguous');
  // 한 글자 이름은 매칭 키가 되지 않는다.
  assert.equal(kakao('김').status, 'unmatched');
});

test('calls without a usable number fall back to the phone contact name', () => {
  const directory = capture.buildPhoneDirectory(rows());
  const match = capture.matchPhoneEvent(eventOf({ number: null, name: '김해솔' }), directory);
  assert.equal(match.status, 'matched');
  assert.equal(match.customer.key, 'lead:lead-1');
});

test('dedupe keys are stable per event, differ per message and never contain the number', () => {
  const sms = eventOf({ type: 'sms', number: '01011112222', durationSec: null, text: '자료 잘 받았습니다' });
  const key = capture.phoneEventDedupeKey(sms);
  assert.equal(key, capture.phoneEventDedupeKey({ ...sms }));
  assert.match(key, /^phone:sms:[0-9a-f]{40}$/);
  assert.doesNotMatch(key, /01011112222/);
  assert.notEqual(key, capture.phoneEventDedupeKey({ ...sms, text: '다른 메시지' }));
  assert.notEqual(key, capture.phoneEventDedupeKey({ ...sms, occurredAt: '2026-09-24T05:37:00.000Z' }));
  const call = eventOf({ number: '01011112222' });
  assert.equal(capture.phoneEventDedupeKey(call), capture.phoneEventDedupeKey({ ...call, durationSec: 130 }));
});

test('stored payload carries the customer reference and preview but not the number', () => {
  const directory = capture.buildPhoneDirectory(rows());
  const event = eventOf({ type: 'sms', number: '01011112222', durationSec: null, text: '내일 3시에 뵐게요' });
  const match = capture.matchPhoneEvent(event, directory);
  const payload = capture.phoneCandidatePayload(event, match);
  assert.equal(payload.v, 1);
  assert.equal(payload.channel, 'sms');
  assert.equal(payload.text, '내일 3시에 뵐게요');
  assert.equal(payload.customer.key, 'lead:lead-1');
  assert.doesNotMatch(JSON.stringify(payload), /01011112222|1111-2222/);
  assert.equal(capture.phoneNotice(eventOf({ number: '01011112222', durationSec: 252 }), match.customer), '김해솔 · 해솔수학학원 4분 통화 — 허브에서 기록할까요');
});
