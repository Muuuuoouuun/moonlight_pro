// Pure, dependency-free normalization for Sheets/CSV lead intake.
//
// No imports, no `@/` alias, no IO — so it is unit-testable by a plain Node
// script (`scripts/check-sheets-normalize.mjs`) without a test framework, and
// safe to import from both Next.js and Node. Keep it that way.

// Sheet header (KR/EN) -> internal field. Lower-cased, whitespace-stripped keys.
export const DEFAULT_HEADER_MAP = {
  // name / institution
  상호: "name", 상호명: "name", 학원명: "name", 기관명: "name", 업체명: "name",
  name: "name", company: "name", academy: "name", institution: "name",
  // phone
  전화: "phone", 전화번호: "phone", 연락처: "phone", 휴대폰: "phone", 핸드폰: "phone",
  phone: "phone", tel: "phone", mobile: "phone", contact: "phone",
  // address
  주소: "address", 소재지: "address", 지역: "address", address: "address", region: "address",
  // contact person
  담당자: "contact_name", 원장: "contact_name", 대표: "contact_name", 이름: "contact_name",
  contact_name: "contact_name", owner: "contact_name", manager: "contact_name",
  // email
  이메일: "email", 메일: "email", email: "email", "e-mail": "email",
  // status / stage
  상태: "status", 단계: "status", status: "status", stage: "status",
  // source / channel
  소스: "source", 출처: "source", source: "source", 채널: "channel", channel: "channel",
  // free note
  메모: "note", 비고: "note", note: "note", memo: "note", notes: "note",
};

const STATUS_MAP = {
  new: "new", 신규: "new", 미접촉: "new", lead: "new", prospect: "new",
  qualified: "qualified", 검증: "qualified", 적격: "qualified",
  nurturing: "nurturing", 컨택: "nurturing", 접촉: "nurturing", contact: "nurturing", contacted: "nurturing",
  won: "won", 계약: "won", 성사: "won", closed: "won",
  lost: "lost", 실패: "lost", 종료: "lost", dropped: "lost",
};

const LEAD_STATUSES = new Set(["new", "qualified", "nurturing", "won", "lost"]);

function normKey(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

export function normalizeName(raw) {
  const value = String(raw ?? "").trim().replace(/\s+/g, " ");
  return value || null;
}

export function normalizeAddress(raw) {
  const value = String(raw ?? "").trim().replace(/\s+/g, " ");
  return value || null;
}

// Korean-aware phone normalization: digits only, +82 -> leading 0.
export function normalizePhone(raw) {
  let digits = String(raw ?? "").replace(/[^\d+]/g, "");
  if (!digits) return null;

  if (digits.startsWith("+82")) {
    digits = "0" + digits.slice(3);
  } else if (digits.startsWith("82") && digits.length >= 11) {
    digits = "0" + digits.slice(2);
  }
  digits = digits.replace(/\D/g, "");

  // KR landline/mobile are 9-11 digits. Anything shorter is noise.
  if (digits.length < 9 || digits.length > 11) return null;
  return digits;
}

export function toLeadStatus(raw) {
  const key = normKey(raw);
  if (!key) return "new";
  if (LEAD_STATUSES.has(key)) return key;
  return STATUS_MAP[key] || "new";
}

// Deterministic dedupe key. Phone is the strongest signal; fall back to
// name+address, then name alone. Returns null when nothing is identifiable.
export function computeMatchKey({ phone, name, address } = {}) {
  const p = normalizePhone(phone);
  if (p) return `phone:${p}`;

  const n = normalizeName(name);
  const a = normalizeAddress(address);
  if (n && a) return `na:${n.toLowerCase()}|${a.toLowerCase()}`;
  if (n) return `n:${n.toLowerCase()}`;
  return null;
}

// values: 2D array from Sheets API (`values.get`). First non-empty row = header.
// Returns array of objects keyed by raw header text.
export function rowsToObjects(values) {
  if (!Array.isArray(values) || values.length === 0) return [];
  const [header, ...rows] = values;
  if (!Array.isArray(header)) return [];

  return rows
    .filter((row) => Array.isArray(row) && row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row, index) => {
      const obj = { __row: index + 2 }; // 1-based + header row, matches Sheets UI
      header.forEach((key, i) => {
        const field = String(key ?? "").trim();
        if (field) obj[field] = row[i] ?? "";
      });
      return obj;
    });
}

// Map one header-keyed row object into the internal intake shape, applying the
// header map (custom map merged over defaults). Unmapped columns are preserved
// under `extra` so nothing is silently dropped.
export function mapRowToIntake(rowObject, headerMap = {}) {
  const map = { ...DEFAULT_HEADER_MAP, ...headerMap };
  const out = { name: null, phone: null, address: null, contact_name: null, email: null, status: "new", source: "google_sheets", note: null, extra: {} };

  for (const [header, value] of Object.entries(rowObject)) {
    if (header === "__row") continue;
    const field = map[normKey(header)];
    if (!field) {
      out.extra[header] = value;
      continue;
    }
    out[field] = value;
  }

  const normalized = {
    name: normalizeName(out.name),
    phone: normalizePhone(out.phone),
    address: normalizeAddress(out.address),
    contact_name: normalizeName(out.contact_name),
    email: out.email ? String(out.email).trim() || null : null,
    status: toLeadStatus(out.status),
    source: out.source ? String(out.source).trim() : "google_sheets",
    note: out.note ? String(out.note).trim() || null : null,
    extra: out.extra,
    source_ref: rowObject.__row != null ? `row:${rowObject.__row}` : null,
  };
  normalized.match_key = computeMatchKey(normalized);
  return normalized;
}
