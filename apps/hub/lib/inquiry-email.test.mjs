import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { classifyInquiryEmail, decodeGmailMessage, canonicalFormSubmission } from './inquiry-email.js';
const email = { from: '고객 <customer@gmail.com>', subject: '도입 관련', body: '가격과 데모 상담이 궁금합니다.', labelIds: ['INBOX'] };
const raw = (body, more = {}) => ({ id: 'm1', threadId: 't1', internalDate: '1789257600000', payload: { mimeType: 'text/plain', headers: [{ name: 'From', value: email.from }, { name: 'Subject', value: email.subject }], body: { data: Buffer.from(body).toString('base64url') } }, ...more });

test('personal Gmail, Naver and company domains can be inquiries', () => {
  for (const from of ['customer@gmail.com', 'customer@naver.com', 'customer@example.com']) assert.equal(classifyInquiryEmail({ ...email, from }).classification, 'inquiry');
  assert.equal(classifyInquiryEmail({ ...email, subject: '로그인 오류 문의', body: '로그인이 안 됩니다. 도와주세요.' }).kind, 'support');
  assert.equal(classifyInquiryEmail({ ...email, subject: '협업 요청', body: '공동 웨비나를 제안합니다.' }).kind, 'partnership');
});
test('body-only inquiry is detected but quoted messages and signatures are not', () => {
  assert.equal(classifyInquiryEmail({ ...email, subject: '안녕하세요', body: '다음 주 데모를 요청합니다.' }).classification, 'inquiry');
  assert.notEqual(classifyInquiryEmail({ ...email, subject: '주간 리포트', body: '감사합니다.\n-- \n문의: help@example.com\n> 견적 문의합니다' }).classification, 'inquiry');
  assert.notEqual(classifyInquiryEmail({ ...email, subject: 'Re: 안녕하세요', body: '감사합니다.\nOn Mon, Customer wrote:\n가격과 상담이 필요합니다.' }).classification, 'inquiry');
});
test('automatic errors and newsletters are ignored without discarding human unsubscribe footers', () => {
  assert.equal(classifyInquiryEmail({ ...email, from: 'noreply@github.com', subject: 'Error in build', body: 'error' }).classification, 'ignored');
  assert.equal(classifyInquiryEmail({ ...email, from: 'digest@example.com', subject: '주간 뉴스레터', body: '이번 주 데모 소개와 가격 소식입니다.', headers: { 'list-id': '<digest.example.com>' } }).classification, 'ignored');
  assert.equal(classifyInquiryEmail({ ...email, body: '견적 요청합니다.\n수신 거부' }).classification, 'inquiry');
});
test('Gmail MIME decoding prefers plain text, keeps date and identity', () => {
  const message = decodeGmailMessage(raw('', { payload: { headers: [{ name: 'From', value: email.from }, { name: 'Subject', value: '문의' }], parts: [{ mimeType: 'text/html', body: { data: Buffer.from('<script>bad()</script><p>ignored</p>').toString('base64url') } }, { mimeType: 'text/plain', body: { data: Buffer.from('상담 문의합니다.').toString('base64url') } }] } }));
  assert.equal(message.body, '상담 문의합니다.');
  assert.equal(message.threadId, 't1');
  assert.equal(message.contact.email, 'customer@gmail.com');
  assert.equal(message.receivedAt, new Date(1789257600000).toISOString());
});
test('HTML-only body becomes safe text, and unsupported/missing MIME bodies require review', () => {
  const html = decodeGmailMessage(raw('', { payload: { mimeType: 'text/html', body: { data: Buffer.from('<script>evil()</script><p>도입 &amp; 상담</p>').toString('base64url') } } }));
  assert.equal(html.body, '도입 & 상담');
  const missing = decodeGmailMessage(raw('', { snippet: '상담', payload: { mimeType: 'text/plain', body: { attachmentId: 'body-attachment', size: 20000 } } }));
  assert.equal(missing.incomplete, true);
  assert.equal(classifyInquiryEmail(missing).classification, 'review');
});
test('body byte truncation retains UTF-8 and forces review instead of silently ignoring unseen content', () => {
  const message = decodeGmailMessage(raw('한'.repeat(5000)), { maxBodyBytes: 100 });
  assert.equal(message.incomplete, true);
  assert.ok(Buffer.byteLength(message.body) <= 100);
  assert.equal(message.body.includes('\uFFFD'), false);
  assert.equal(classifyInquiryEmail(message).classification, 'review');
});

const encodedWord = (text, charset = 'UTF-8') => `=?${charset}?B?${Buffer.from(text).toString('base64')}?=`;
const withHeaders = (body, headers) => {
  const message = raw(body);
  message.payload.headers = Object.entries(headers).map(([name, value]) => ({ name, value }));
  return message;
};

test('encoded Korean subject and sender decode before classification without changing sender identity', () => {
  const message = decodeGmailMessage(withHeaders('안녕하세요.', {
    Subject: `${encodedWord('도입 ')}\r\n\t${encodedWord('문의 👋')}`,
    From: `${encodedWord(Buffer.from('c8abb1e6b5bf', 'hex'), 'EUC-KR')} <customer@example.com>`,
  }));
  assert.equal(message.subject, '도입 문의 👋');
  assert.equal(message.contact.name, '홍길동');
  assert.equal(message.contact.email, 'customer@example.com');
  assert.equal(message.incomplete, false);
  assert.equal(classifyInquiryEmail(message).kind, 'sales');
  const spoofed = decodeGmailMessage(withHeaders('상담 문의', { From: `${encodedWord('다른 이름 <forged@example.com>')} <real@example.com>` }));
  assert.equal(spoofed.contact.name, '다른 이름 <forged@example.com>');
  assert.equal(spoofed.contact.email, 'real@example.com');
});

test('header length limits apply to decoded text and keep CP949 extension names', () => {
  const subject = '문의'.repeat(100);
  const input = withHeaders('내용', {
    Subject: subject.match(/.{1,10}/gu).map(part => encodedWord(part)).join('\r\n '),
    From: `${encodedWord(Buffer.from('8c63b9e6b0a2c7cf', 'hex'), 'CP949')} <customer@example.com>`,
  });
  const message = decodeGmailMessage(input);
  assert.equal(message.subject, subject);
  assert.equal(message.contact.name, '똠방각하');
  assert.equal(message.incomplete, false);
});

test('Q-encoded words decode bytes and folded whitespace without decoding literal text twice', () => {
  const message = decodeGmailMessage(withHeaders('내용', {
    Subject: 'Re: =?utf-8?q?=ED=95=9C=EA=B8=80_?=\r\n =?EUC-KR?Q?=B9=AE=C0=C7?= ticket_1',
  }));
  assert.equal(message.subject, 'Re: 한글 문의 ticket_1');
  const literal = '문자 그대로 👩🏽‍💻 cafe\u0301 한글'.normalize('NFD');
  assert.equal(decodeGmailMessage(withHeaders('내용', { Subject: literal })).subject, literal);
  const looksEncoded = encodedWord('문의');
  assert.equal(decodeGmailMessage(withHeaders('내용', { Subject: encodedWord(looksEncoded) })).subject, looksEncoded);
});

test('decomposed Korean detects inquiries and quote boundaries without changing the original text', () => {
  const subject = '도입 문의'.normalize('NFD'), body = '안녕하세요'.normalize('NFD');
  const message = decodeGmailMessage(withHeaders(body, { Subject: encodedWord(subject), From: email.from }));
  assert.equal(classifyInquiryEmail(message).kind, 'sales');
  assert.equal(message.subject, subject);
  assert.equal(message.body, body);
  assert.equal(classifyInquiryEmail({ ...email, subject: '안녕하세요', body: '가격 문의'.normalize('NFD') }).kind, 'sales');
  for (const footer of ['문의: help@example.com', '보낸 사람: 고객\n도입 상담을 요청합니다.']) {
    assert.equal(classifyInquiryEmail({ ...email, subject: '주간 리포트', body: `감사합니다.\n${footer}`.normalize('NFD') }).classification, 'ignored');
  }
});

test('unsupported and invalid encoded headers stay inspectable and require review', () => {
  for (const subject of ['=?X-UNKNOWN?B?/w==?=', '=?UTF-8?Q?=GG?=', '=?UTF-8?B?////?=', '=?UTF-8?B?YQ=?=', '=?UTF-8?X?abc?=', encodedWord('숨은\r\n헤더')]) {
    const message = decodeGmailMessage(withHeaders('도입 문의', { Subject: subject }));
    assert.equal(message.subject, subject);
    assert.equal(message.incomplete, true);
    assert.equal(classifyInquiryEmail(message).classification, 'review');
  }
});

test('Korean MIME charset variants preserve EUC-KR and CP949 text', () => {
  for (const charset of ['EUC-KR', 'ks_c_5601-1987', 'windows-949', 'CP949', 'MS949']) {
    const input = withHeaders('', { 'Content-Type': `text/plain; CHARSET = "${charset}"; format=flowed` });
    input.payload.body.data = Buffer.from('b9aec0c7208c63b9e6b0a2c7cf', 'hex').toString('base64url');
    const message = decodeGmailMessage(input);
    assert.equal(message.body, '문의 똠방각하', charset);
    assert.equal(message.incomplete, false, charset);
  }
});

test('unreadable MIME bytes use the Gmail snippet for review, never lossy replacement decoding', () => {
  for (const charset of ['UTF-8', 'X-UNKNOWN', 'EUC-KR']) {
    const input = withHeaders('', { 'Content-Type': `text/plain; charset=${charset}` });
    input.payload.body.data = Buffer.from([0xff]).toString('base64url');
    input.snippet = '확인이 필요한 문의';
    const message = decodeGmailMessage(input);
    assert.equal(message.body, input.snippet);
    assert.equal(message.incomplete, true);
    assert.equal(message.formPayloadText, null);
    assert.equal(classifyInquiryEmail(message).classification, 'review');
  }
  const utf8 = '한글 · 이모지 👩🏽‍💻';
  const fallback = decodeGmailMessage(withHeaders(utf8, { 'Content-Type': 'text/plain; charset=X-UNKNOWN' }));
  assert.equal(fallback.body, utf8);
  assert.equal(fallback.incomplete, true);
});

test('display caps retain whole emoji and decomposed Korean grapheme clusters', () => {
  for (const text of ['👩🏽‍💻', '🇰🇷', '가'.normalize('NFD'), 'e\u0301']) {
    assert.equal(decodeGmailMessage(raw(`앞${text}뒤`), { maxBodyBytes: 3 + Buffer.byteLength(text) - 1 }).body, '앞');
    const subject = 'x'.repeat(499) + text;
    const name = 'x'.repeat(199) + text;
    const message = decodeGmailMessage(withHeaders('내용', { Subject: subject, From: `${name} <sender@example.com>` }));
    assert.equal(message.subject, 'x'.repeat(499));
    assert.equal(message.contact.name, 'x'.repeat(199));
    assert.equal(message.incomplete, true);
  }
});

test('HTML numeric entities preserve emoji without introducing invalid Unicode', () => {
  const input = raw('<p>한글 &#x1F44B; &#xD800; &#55296; &#1114112;</p>');
  input.payload.mimeType = 'text/html';
  const message = decodeGmailMessage(input);
  assert.equal(message.body, '한글 👋 &#xD800; &#55296; &#1114112;');
  assert.equal(message.body.isWellFormed(), true);
});
test('existing thread replies without keywords remain inbound, excluded labels stay ignored', () => {
  assert.equal(classifyInquiryEmail({ ...email, subject: 'Re: 안녕하세요', body: '네, 내일 가능합니다.' }, { knownThread: true }).classification, 'inquiry');
  for (const label of ['SENT', 'DRAFT', 'SPAM', 'TRASH']) assert.equal(classifyInquiryEmail({ ...email, labelIds: [label] }, { knownThread: true }).classification, 'ignored');
  assert.equal(classifyInquiryEmail({ ...email, labelIds: [] }).classification, 'inquiry');
});

const form = { eventId: 's1', formId: 'f1', contact: { name: '실제 문의자', email: 'real@example.com' }, subject: '서비스 도입', message: '도입 상담을 요청합니다.', submittedAt: '2026-09-13T01:00:00.000Z' };
const trustedForms = [{ id: 'site1', sender: 'no-reply@forms.example.com', formId: 'f1', orgScope: 'personal', verificationSecret: 'synthetic-secret' }];
const formEmail = { ...email, from: 'Forms <no-reply@forms.example.com>', subject: 'New form submission', body: JSON.stringify(form), headers: { 'authentication-results': 'mx.google.com; dkim=pass header.d=forms.example.com' } };
function signedEmail(payload = form) {
  // The provider signs the documented fixed-order fields, not arbitrary header text.
  const fields = JSON.stringify({ eventId: payload.eventId, formId: payload.formId, contact: { name: payload.contact?.name || '', email: payload.contact?.email || '', phone: payload.contact?.phone || '' }, subject: payload.subject || '', message: payload.message, submittedAt: payload.submittedAt });
  return { ...formEmail, body: JSON.stringify(payload), headers: { 'x-moonlight-submission-signature': `sha256=${createHmac('sha256', 'synthetic-secret').update(fields, 'utf8').digest('hex')}` } };
}
test('only HMAC-signed form fields establish cross-channel identity and actual contact', () => {
  const result = classifyInquiryEmail(signedEmail(), { trustedForms });
  assert.equal(result.canonicalKey, 'form:site1:f1:s1');
  assert.equal(result.contact.email, 'real@example.com');
  assert.equal(result.subject, '서비스 도입');
  assert.equal(result.body, '도입 상담을 요청합니다.');
  assert.equal(result.orgScope, 'personal');
  assert.equal(JSON.parse(canonicalFormSubmission(form)).contact.phone, '');
});
test('mail decoding preserves signed Korean and emoji form values without Unicode normalization', () => {
  const text = '한글 문의 👩🏽‍💻 🇰🇷 · 가'.normalize('NFD') + ' · cafe\u0301';
  const payload = { ...form, subject: text, message: text, contact: { name: text, email: 'real@example.com' } };
  const signed = signedEmail(payload);
  const decoded = decodeGmailMessage(withHeaders(signed.body, {
    From: `${encodedWord('폼 접수 알림')} <no-reply@forms.example.com>`,
    Subject: encodedWord('새 문의 📬'), ...signed.headers,
  }));
  const result = classifyInquiryEmail(decoded, { trustedForms });
  assert.equal(result.canonicalKey, 'form:site1:f1:s1');
  assert.equal(result.subject, text);
  assert.equal(result.body, text);
  assert.equal(result.contact.name, text);
  assert.equal(decoded.formPayloadText, signed.body);
});
test('forged auth headers, altered signed payload and wrong sender never gain form identity', () => {
  for (const message of [formEmail, { ...signedEmail(), body: JSON.stringify({ ...form, message: 'tampered' }) }, { ...signedEmail(), from: 'attacker@example.com' }]) {
    const result = classifyInquiryEmail(message, { trustedForms });
    assert.equal(result.canonicalKey, undefined);
  }
  assert.equal(classifyInquiryEmail(formEmail, { trustedForms }).classification, 'review');
  assert.equal(classifyInquiryEmail({ ...formEmail, from: 'no-reply@unknown.example.com' }).classification, 'review');
});

test('oversized headers are bounded for the inquiry ledger and visibly require review', () => {
  const message = decodeGmailMessage(raw('문의합니다.', { payload: { mimeType: 'text/plain', headers: [{ name: 'From', value: `${'고'.repeat(250)} <customer@example.com>` }, { name: 'Subject', value: '제'.repeat(600) }], body: { data: Buffer.from('문의합니다.').toString('base64url') } } }));
  assert.ok(message.subject.length <= 500); assert.ok(message.contact.name.length <= 200);
  assert.equal(message.incomplete, true); assert.equal(classifyInquiryEmail(message).classification, 'review');
});
test('contact-only signature lines do not turn a report into an inquiry', () => {
  const result = classifyInquiryEmail({ ...email, subject: '주간 리포트', body: '이번 주 처리 내역입니다.\n\n홍길동 드림\n견적 문의: contact@example.com' });
  assert.notEqual(result.classification, 'inquiry');
});

test('full signed form envelope is verified before its display body is truncated', () => {
  const payload = { ...form, eventId: `s${'a'.repeat(200)}`, message: 'x'.repeat(13000) };
  const signed = signedEmail(payload);
  const decoded = decodeGmailMessage(raw(signed.body, { payload: { mimeType: 'text/plain', headers: [{ name: 'From', value: signed.from }, { name: 'Subject', value: signed.subject }, ...Object.entries(signed.headers).map(([name, value]) => ({ name, value }))], body: { data: Buffer.from(signed.body).toString('base64url') } } }));
  const result = classifyInquiryEmail(decoded, { trustedForms });
  assert.equal(result.canonicalKey, `form:site1:f1:${payload.eventId}`);
  assert.equal(result.contact.email, 'real@example.com'); assert.equal(result.classification, 'review');
  assert.ok(Buffer.byteLength(result.body) <= 12000);
});
