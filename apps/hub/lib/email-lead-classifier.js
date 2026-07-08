// Pure, dependency-free Gmail message -> lead disposition classifier. No IO,
// no `@/` alias — mirrors sheets-normalize.js / card-intake-core.js so it can
// be unit-tested directly and imported from both the Hub repository layer and
// a future `check:*` node self-test.
//
// v1 is rule-based only (keyword heuristics). A v2 hook can swap this out for
// a Gemini classify call (see apps/hub/lib/repositories/gmail-intake.js) but
// this module itself must stay LLM-free and synchronous.
//
// Design choice: this module does NOT compute `match_key`. sheets-normalize.js
// (computeMatchKey) already owns dedupe-key logic for every intake source, and
// importing it here would pull an `@/lib` dependency into an otherwise
// alias-free, pure module. Instead we export `normalized` without match_key
// and the caller (gmail-intake.js repository) calls computeMatchKey itself —
// same division of labor as card-intake-core.js -> card-intake.js.

// --- keyword constants (exported so the UI can render real rules, not copy) -

export const BULK_SENDER_PATTERNS = [
  "noreply@",
  "no-reply@",
  "newsletter@",
  "notifications@",
  "notification@",
  "@github.com",
  "@google.com",
  "@slack.com",
  "mailer-daemon@",
  "@substack.com",
];

export const UNSUBSCRIBE_HINTS = ["unsubscribe", "구독 취소", "수신 거부"];

export const SUPPORT_KEYWORDS = ["오류", "장애", "환불", "버그", "error", "refund", "bug"];

export const LEAD_INQUIRY_KEYWORDS = [
  "문의", "도입", "견적", "데모", "상담", "협업", "제안",
  "demo", "pricing", "inquiry", "partnership",
];

// Free/personal mail providers — not "business domain" senders even though
// they aren't bulk/no-reply addresses.
export const PERSONAL_EMAIL_DOMAINS = [
  "gmail.com", "naver.com", "daum.net", "hanmail.net", "kakao.com",
  "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "nate.com",
];

function clean(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function lower(value) {
  return clean(value).toLowerCase();
}

function extractEmail(from) {
  const raw = clean(from);
  const match = raw.match(/<([^<>]+)>/);
  const email = (match ? match[1] : raw).trim().toLowerCase();
  return email.includes("@") ? email : "";
}

function extractDisplayName(from) {
  const raw = clean(from);
  const match = raw.match(/^([^<]+)<[^<>]+>$/);
  if (match) {
    return match[1].trim().replace(/^"|"$/g, "");
  }
  // No angle-bracket form — `from` is just an email address, no display name.
  return "";
}

function domainOf(email) {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1) : "";
}

function isBulkSender(email) {
  return BULK_SENDER_PATTERNS.some((pattern) => email.includes(pattern));
}

function hasUnsubscribeHint(text) {
  return UNSUBSCRIBE_HINTS.some((hint) => text.includes(hint.toLowerCase()));
}

function matchesKeyword(text, keywords) {
  return keywords.some((kw) => text.includes(kw.toLowerCase()));
}

function guessCompanyName(email, displayName) {
  const domain = domainOf(email);
  if (domain && !PERSONAL_EMAIL_DOMAINS.includes(domain)) {
    const label = domain.split(".")[0];
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : domain;
  }
  return displayName || null;
}

/**
 * Classify one inbox email for lead potential.
 * @param {{ from: string, subject: string, snippet: string }} message
 * @returns {{ disposition: 'lead'|'support'|'personal'|'ignore', reason: string, normalized: object|null }}
 */
export function classifyEmailForLead({ from, subject, snippet } = {}) {
  const email = extractEmail(from);
  const displayName = extractDisplayName(from);
  const subjectText = lower(subject);
  const snippetText = lower(snippet);
  const bodyText = `${subjectText} ${snippetText}`.trim();

  if (!email) {
    return { disposition: "ignore", reason: "발신자 이메일을 찾을 수 없음", normalized: null };
  }

  if (isBulkSender(email)) {
    return { disposition: "ignore", reason: "발신 패턴이 대량/알림성 메일과 일치", normalized: null };
  }

  if (hasUnsubscribeHint(bodyText)) {
    return { disposition: "ignore", reason: "마케팅 수신거부 문구 포함", normalized: null };
  }

  if (matchesKeyword(bodyText, SUPPORT_KEYWORDS)) {
    return { disposition: "support", reason: "문의 유형 키워드(오류/장애/환불 등) 감지", normalized: null };
  }

  const domain = domainOf(email);
  const isBusinessDomain = domain && !PERSONAL_EMAIL_DOMAINS.includes(domain);
  const hitsInquiryKeyword = matchesKeyword(bodyText, LEAD_INQUIRY_KEYWORDS);

  if (isBusinessDomain && hitsInquiryKeyword) {
    const normalized = {
      name: guessCompanyName(email, displayName),
      contact_name: displayName || null,
      email,
      phone: null,
      title: null,
      address: null,
      status: "new",
      source: "gmail",
    };
    return { disposition: "lead", reason: "업무용 도메인 발신 + 문의 키워드 일치", normalized };
  }

  if (!isBusinessDomain) {
    return { disposition: "personal", reason: "개인 메일 도메인(gmail/naver 등) 발신", normalized: null };
  }

  return { disposition: "ignore", reason: "리드/문의 키워드와 일치하지 않음", normalized: null };
}
