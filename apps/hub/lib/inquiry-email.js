import { createHmac, timingSafeEqual } from 'node:crypto';
import iconv from 'iconv-lite';

export const INQUIRY_EMAIL_BODY_BYTES = 12000;
const EXCLUDED_LABELS = new Set(['SENT', 'DRAFT', 'SPAM', 'TRASH']);
const SOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const EVENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,299}$/;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const GRAPHEMES = new Intl.Segmenter('ko', { granularity: 'grapheme' });
const KOREAN_CHARSETS = new Set(['euckr', 'cp949', 'ms949', 'windows949', 'cseuckr', 'csksc56011987', 'isoir149', 'korean', 'ksc56011987', 'ksc56011989', 'ksc5601']);

function headersObject(headers = {}) {
  if (!Array.isArray(headers)) return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return headers.reduce((result, header) => {
    const key = String(header?.name || '').toLowerCase();
    // Joining duplicates makes a repeated signature fail closed.
    result[key] = result[key] ? `${result[key]}, ${header.value || ''}` : String(header.value || '');
    return result;
  }, {});
}

function decodeCharset(bytes, charset) {
  const label = charset.trim().toLowerCase();
  if (KOREAN_CHARSETS.has(label.replace(/[-_]/g, ''))) {
    // ICU's EUC-KR decoder can silently misread CP949 extension syllables.
    // Use the complete Korean mapping, rejecting its invalid-byte sentinel.
    const text = iconv.decode(bytes, 'cp949');
    if (text.includes('\uFFFD')) throw new Error('invalid-korean-text');
    return text;
  }
  return new TextDecoder(label, { fatal: true }).decode(bytes);
}

function decodeHeader(value = '') {
  const input = String(value).replace(/\r?\n[ \t]+/g, ' ');
  let text = '', end = 0, previousDecoded = false, incomplete = false;
  // Decode once, keeping undecodable words available for inspection (RFC 2047).
  for (const match of input.matchAll(/=\?([^?\s]+)\?([^?\s]+)\?([^?\s]+)\?=/g)) {
    const start = match.index, next = start + match[0].length;
    if ((start && !/[ \t]/.test(input[start - 1])) || (next < input.length && !/[ \t]/.test(input[next]))) continue;
    const between = input.slice(end, start);
    let decoded;
    try {
      const encoded = match[3];
      let bytes;
      if (match[2].toLowerCase() === 'b') {
        if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error('invalid-base64');
        bytes = Buffer.from(encoded, 'base64');
      } else if (match[2].toLowerCase() === 'q') {
        if (/[^\x21-\x7e]|=(?![\da-f]{2})/i.test(encoded)) throw new Error('invalid-quoted-printable');
        bytes = Buffer.from(encoded.replace(/_/g, ' ').replace(/=([\da-f]{2})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16))), 'latin1');
      } else throw new Error('unsupported-header-encoding');
      decoded = decodeCharset(bytes, match[1]);
      if (/[\u0000-\u001f\u007f]/.test(decoded)) throw new Error('invalid-header-control');
    } catch { decoded = undefined; incomplete = true; }
    text += (previousDecoded && decoded !== undefined && /^[ \t]+$/.test(between) ? '' : between) + (decoded ?? match[0]);
    previousDecoded = decoded !== undefined;
    end = next;
  }
  return { text: text + input.slice(end), incomplete };
}

const field = (value, max) => limitText(String(value || '').replace(/\u0000/g, ''), max, text => text.length).text;

function senderDetails(from = '') {
  const text = String(from).replace(/\r?\n[ \t]+/g, ' ').trim();
  const match = text.match(/^(.*?)<([^<>]+)>$/);
  const email = (match?.[2] || text).trim().toLowerCase();
  // Parse the address before decoding display text: encoded angle brackets
  // must never replace the actual sender used to authenticate signed forms.
  const name = decodeHeader(match?.[1]?.trim().replace(/^"|"$/g, ''));
  return { contact: { name: field(name.text, 200), email: email.length <= 320 && EMAIL.test(email) ? email : '', phone: '' },
    incomplete: name.incomplete || name.text.length > 200 };
}

const senderContact = from => senderDetails(from).contact;

function limitText(text, max, sizeOf = value => Buffer.byteLength(value, 'utf8')) {
  if (sizeOf(text) <= max) return { text, truncated: false };
  let length = 0, result = '';
  for (const { segment } of GRAPHEMES.segment(text)) {
    length += sizeOf(segment);
    if (length > max) break;
    result += segment;
  }
  return { text: result, truncated: true };
}

function htmlToText(html) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return html.replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, key) => {
      if (key[0] !== '#') return entities[key.toLowerCase()] || whole;
      const point = key[1].toLowerCase() === 'x' ? Number.parseInt(key.slice(2), 16) : Number(key.slice(1));
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : whole;
    }).replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function mimeText(part) {
  if (!part || part.filename) return { text: '', incomplete: false, available: false };
  const parts = Array.isArray(part.parts) ? part.parts : [];
  if (parts.length) {
    const decoded = parts.map(mimeText);
    // multipart/alternative is common, including roots with no mimeType in fixtures.
    const plain = parts.map((p, i) => ({ p, decoded: decoded[i] })).filter(({ p, decoded: d }) => p.mimeType === 'text/plain' && d.available);
    const chosen = plain.length && (part.mimeType === 'multipart/alternative' || parts.some(p => p.mimeType === 'text/html')) ? plain.map(x => x.decoded) : decoded.filter(d => d.available);
    return { text: chosen.map(d => d.text).filter(Boolean).join('\n\n'), incomplete: chosen.some(d => d.incomplete) || !chosen.length, available: chosen.length > 0 };
  }
  if (!['text/plain', 'text/html'].includes(part.mimeType)) return { text: '', incomplete: false, available: false };
  if (typeof part.body?.data !== 'string') return { text: '', incomplete: true, available: true };
  const bytes = Buffer.from(part.body.data, 'base64url');
  const charset = headersObject(part.headers)['content-type']?.match(/(?:^|;)\s*charset\s*=\s*["']?([^\s;"']+)/i)?.[1] || 'utf-8';
  let text, incomplete = false;
  try { text = decodeCharset(bytes, charset); }
  catch {
    incomplete = true;
    // A bad charset declaration may accompany valid UTF-8. Only accept a
    // lossless fallback; otherwise use Gmail's snippet and require review.
    try { text = decodeCharset(bytes, 'utf-8'); } catch { text = ''; }
  }
  if (part.body.size > bytes.length) incomplete = true;
  return { text: part.mimeType === 'text/html' ? htmlToText(text) : text, incomplete, available: true };
}

export function decodeGmailMessage(raw, { maxBodyBytes = INQUIRY_EMAIL_BODY_BYTES } = {}) {
  const headers = headersObject(raw?.payload?.headers);
  const subject = decodeHeader(headers.subject), sender = senderDetails(headers.from);
  const decoded = mimeText(raw?.payload);
  const original = (decoded.text || raw?.snippet || '').replace(/\r\n?/g, '\n').replace(/\u0000/g, '');
  const bounded = limitText(original, maxBodyBytes);
  const internalDate = Number(raw?.internalDate);
  const validDate = Number.isFinite(internalDate) && internalDate > 0 && !Number.isNaN(new Date(internalDate).getTime());
  return {
    id: raw?.id || '', threadId: raw?.threadId || null, headers,
    from: headers.from || '', subject: field(subject.text, 500), contact: sender.contact,
    labelIds: Array.isArray(raw?.labelIds) ? raw.labelIds : [], body: bounded.text,
    // Verify a complete signed envelope before applying the smaller display cap.
    formPayloadText: decoded.available && !decoded.incomplete && Buffer.byteLength(original, 'utf8') <= 64 * 1024 ? original : null,
    internalDate: validDate ? internalDate : null, receivedAt: validDate ? new Date(internalDate).toISOString() : null,
    incomplete: !decoded.available || decoded.incomplete || bounded.truncated || !validDate || subject.incomplete || subject.text.length > 500 || sender.incomplete,
  };
}

function freshText(body) {
  const result = [];
  // Normalize only the matching copy, including quote/signature boundaries.
  for (const line of String(body || '').normalize('NFC').split('\n')) {
    if (/^\s*(--\s*$|On .{1,400}wrote:|-----\s*(Original|Forwarded)|Sent from my |보낸 사람\s*:|발신\s*:|_{5,}|본 메일은)/i.test(line)) break;
    if (/^\s*>/.test(line)) continue;
    if (/^\s*(견적\s*)?(문의|상담|contact|support|sales)\s*[:：]\s*(?:[\w.+-]+@[^\s]+|[+()\d -]{7,})\s*$/i.test(line)) continue;
    result.push(line);
  }
  return result.join('\n').trim();
}

// Fixed key ordering and explicit empty optional fields are the signing contract.
// Never sign arbitrary JSON.stringify(payload): object key order may differ.
export function canonicalFormSubmission(value) {
  return JSON.stringify({
    eventId: value.eventId, formId: value.formId,
    contact: { name: value.contact?.name || '', email: value.contact?.email || '', phone: value.contact?.phone || '' },
    subject: value.subject || '', message: value.message, submittedAt: value.submittedAt,
  });
}

function verifiedForm(message, trustedForms) {
  let value;
  try { value = JSON.parse(message.formPayloadText || message.body); } catch { return null; }
  if (!value || !EVENT_ID.test(value.eventId || '') || !SOURCE_ID.test(value.formId || '') || typeof value.message !== 'string' || !value.message.trim() || value.message.length > 20000 || value.message.includes('\u0000')
    || typeof value.submittedAt !== 'string' || !Number.isFinite(Date.parse(value.submittedAt))
    || !value.contact || typeof value.contact !== 'object'
    || (value.subject !== undefined && (typeof value.subject !== 'string' || value.subject.length > 500))
    || ['name', 'email', 'phone'].some(key => value.contact[key] !== undefined && typeof value.contact[key] !== 'string')
    || (value.contact.name || '').length > 200 || (value.contact.email || '').length > 320 || (value.contact.phone || '').length > 100
    || !(EMAIL.test(value.contact.email || '') || Boolean((value.contact.phone || '').trim()))) return null;
  const sender = senderContact(message.from).email;
  const signature = headersObject(message.headers)['x-moonlight-submission-signature'] || '';
  if (!/^sha256=[a-f0-9]{64}$/.test(signature)) return null;
  for (const form of trustedForms || []) {
    if (!SOURCE_ID.test(form?.id || '') || form.formId !== value.formId || String(form.sender || '').trim().toLowerCase() !== sender
      || typeof form.verificationSecret !== 'string' || !form.verificationSecret) continue;
    const expected = createHmac('sha256', form.verificationSecret).update(canonicalFormSubmission(value), 'utf8').digest();
    if (timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'))) return { value, form };
  }
  return null;
}

export function classifyInquiryEmail(message, { knownThread = false, trustedForms = [] } = {}) {
  const contact = message.contact || senderContact(message.from);
  const base = { kind: 'general', classification: 'ignored', reason: '문의 신호 없음', contact, orgScope: 'unclassified' };
  if ((message.labelIds || []).some(label => EXCLUDED_LABELS.has(label))) return { ...base, reason: '발신·임시보관·스팸·휴지통 제외' };
  const form = verifiedForm(message, trustedForms);
  if (form) {
    const bounded = limitText(form.value.message, INQUIRY_EMAIL_BODY_BYTES);
    const detection = classifyInquiryEmail({ from: form.value.contact.email, subject: form.value.subject, body: bounded.text, incomplete: bounded.truncated, labelIds: [] });
    return { ...detection, classification: bounded.truncated ? 'review' : 'inquiry', reason: bounded.truncated ? '서명된 폼 문의 · 본문 일부만 수집' : '서명이 검증된 등록 폼 문의',
      subject: form.value.subject || '제목 없는 문의', body: bounded.text, contact: { name: form.value.contact.name || '', email: String(form.value.contact.email || '').toLowerCase(), phone: form.value.contact.phone || '' },
      orgScope: ['classin', 'personal', 'unclassified'].includes(form.form.orgScope) ? form.form.orgScope : 'unclassified', canonicalKey: `form:${form.form.id}:${form.value.formId}:${form.value.eventId}` };
  }
  if (message.incomplete) return { ...base, classification: 'review', reason: '본문 또는 수신 시각을 완전히 확인하지 못함' };
  const headers = headersObject(message.headers);
  const text = `${message.subject || ''}\n${freshText(message.body)}`.normalize('NFC');
  const auto = /(^|[._-])(no-?reply|noreply|do-?not-?reply)([._@-]|$)/i.test(contact.email || '')
    || (headers['auto-submitted'] && headers['auto-submitted'].toLowerCase() !== 'no') || /^(bulk|list|junk)$/i.test(headers.precedence || '') || Boolean(headers['list-id']);
  const formNotice = /form|submission|제출|폼\s*(접수|문의)|고객 이메일/i.test(text);
  if (auto) return { ...base, classification: formNotice ? 'review' : 'ignored', reason: formNotice ? '폼 안내 메일 · 제출 서명 확인 필요' : '자동 알림·뉴스레터 제외' };
  if (knownThread) return { ...base, classification: 'inquiry', reason: '기존 문의 대화의 고객 회신' };
  if (/협업|제휴|공동\s*(웨비나|행사|제작)|partnership|collaborat/i.test(text)) return { ...base, kind: 'partnership', classification: 'inquiry', reason: '협업·제휴 요청 감지' };
  if (/도와주|사용법|기술\s*지원|지원\s*요청|로그인.*(오류|안\s*됩|불가)|오류.*(문의|해결|도움)|문제.*(해결|도와)|help\s+(me|us)|support\s+request|cannot\s+(log\s*in|sign\s*in)/i.test(text)) return { ...base, kind: 'support', classification: 'inquiry', reason: '사용·오류 해결 요청 감지' };
  if (/견적|도입|데모|상담|구매|가격|quote|pricing|demo|purchase/i.test(text)) return { ...base, kind: 'sales', classification: 'inquiry', reason: '가격·도입·상담 요청 감지' };
  if (/문의|질문|궁금|알려주|inquir|question/i.test(text)) return { ...base, classification: 'inquiry', reason: '일반 문의 감지' };
  if (/오류|에러|error|안\s*(돼|됩)/i.test(text)) return { ...base, classification: 'review', reason: '지원 요청 여부 확인 필요' };
  return base;
}
