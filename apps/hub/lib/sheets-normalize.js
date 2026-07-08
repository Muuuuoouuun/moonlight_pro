// Pure, dependency-free normalization for Sheets/CSV lead intake.
//
// No imports, no `@/` alias, no IO — so it is unit-testable by a plain Node
// script (`scripts/check-sheets-normalize.mjs`) without a test framework, and
// safe to import from both Next.js and Node. Keep it that way.

// Sheet header (KR/EN) -> internal field. Lower-cased, whitespace-stripped keys.
export const DEFAULT_HEADER_MAP = {
  // name / institution
  상호: "name", 상호명: "name", 학원명: "name", 기관명: "name", 업체명: "name",
  고객명: "name", 원명: "name", full_name: "name", fullname: "name",
  name: "name", company: "name", academy: "name", institution: "name",
  // phone
  전화: "phone", 전화번호: "phone", 연락처: "phone", 휴대폰: "phone", 핸드폰: "phone",
  phone: "phone", phone_number: "phone", phonenumber: "phone", "phone number": "phone",
  tel: "phone", mobile: "phone", contact: "phone",
  // address
  주소: "address", 소재지: "address", 지역: "address", address: "address", region: "address",
  // contact person
  담당자: "contact_name", 원장: "contact_name", 대표: "contact_name", 이름: "contact_name",
  성명: "contact_name", contact_name: "contact_name", owner: "contact_name", manager: "contact_name",
  // email
  이메일: "email", 메일: "email", email: "email", "e-mail": "email",
  // external lead identifiers (Meta Lead Ads, manual sheets)
  리드id: "external_id", 메타리드id: "external_id", leadgen_id: "external_id",
  leadgenid: "external_id", lead_id: "external_id", leadid: "external_id", meta_lead_id: "external_id",
  // status / stage
  상태: "status", 단계: "status", status: "status", stage: "status",
  // source / channel
  소스: "source", 출처: "source", source: "source", 채널: "channel", channel: "channel",
  // Meta/marketing attribution
  캠페인: "campaign_name", 캠페인명: "campaign_name", campaign: "campaign_name", campaign_name: "campaign_name",
  광고: "ad_name", 광고명: "ad_name", 소재: "ad_name", ad: "ad_name", ad_name: "ad_name",
  광고세트: "adset_name", adset: "adset_name", adset_name: "adset_name",
  광고id: "ad_id", ad_id: "ad_id", adid: "ad_id",
  폼: "form_name", 폼명: "form_name", form: "form_name", form_name: "form_name",
  폼id: "form_id", form_id: "form_id", formid: "form_id",
  생성일: "created_time", 신청일: "created_time", created_time: "created_time", createdtime: "created_time",
  // ClassIn sales-specific intent / KPI fields
  설명회: "intent", 설명회신청: "intent", 행사: "intent", 이벤트: "intent",
  program: "intent", intent: "intent", event: "intent", briefing: "intent", session: "intent",
  유효: "validity", 유효리드: "validity", validity: "validity", valid: "validity",
  대수: "unit_count", 수량: "unit_count", unit: "unit_count", units: "unit_count", unit_count: "unit_count",
  하드웨어: "unit_count", hardware: "unit_count",
  매출: "revenue_cny", 금액: "revenue_cny", 위안: "revenue_cny", cny: "revenue_cny",
  revenue: "revenue_cny", amount: "revenue_cny", revenue_cny: "revenue_cny",
  통화: "currency", currency: "currency",
  crm단계: "crm_stage", crm_stage: "crm_stage", kpi: "crm_stage",
  고객상태: "customer_state", 만료: "customer_state", 소진: "customer_state", 충전: "customer_state",
  customer_state: "customer_state",
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

function textOrNull(raw) {
  const value = String(raw ?? "").trim().replace(/\s+/g, " ");
  return value || null;
}

function numberOrNull(raw) {
  const value = String(raw ?? "")
    .replace(/[,，]/g, "")
    .replace(/[^\d.\-]/g, "")
    .trim();
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function inferSource(out) {
  const explicit = String(out.source || "").trim();
  const hay = [
    explicit,
    out.channel,
    out.campaign_name,
    out.ad_name,
    out.adset_name,
    out.ad_id,
    out.form_id,
    out.created_time,
    out.note,
  ].filter(Boolean).join(" ").toLowerCase();

  if (/(meta|facebook|fb|leadgen|lead ads|광고|캠페인)/.test(hay)) return "meta_ads";
  if (/(threads|thread|스레드)/.test(hay)) return "threads";
  if (/(기존|고객|existing|customer)/.test(hay)) return "existing_customer";
  return explicit || "google_sheets";
}

export function normalizeName(raw) {
  return textOrNull(raw);
}

export function normalizeAddress(raw) {
  return textOrNull(raw);
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
  const out = {
    name: null,
    phone: null,
    address: null,
    contact_name: null,
    email: null,
    external_id: null,
    status: "new",
    source: "google_sheets",
    channel: null,
    campaign_name: null,
    ad_name: null,
    adset_name: null,
    ad_id: null,
    form_name: null,
    form_id: null,
    created_time: null,
    intent: null,
    validity: null,
    unit_count: null,
    revenue_cny: null,
    currency: null,
    crm_stage: null,
    customer_state: null,
    note: null,
    extra: {},
  };

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
    external_id: textOrNull(out.external_id),
    status: toLeadStatus(out.status),
    source: inferSource(out),
    channel: textOrNull(out.channel),
    campaign_name: textOrNull(out.campaign_name),
    ad_name: textOrNull(out.ad_name),
    adset_name: textOrNull(out.adset_name),
    ad_id: textOrNull(out.ad_id),
    form_name: textOrNull(out.form_name),
    form_id: textOrNull(out.form_id),
    created_time: textOrNull(out.created_time),
    intent: textOrNull(out.intent),
    validity: textOrNull(out.validity),
    unit_count: numberOrNull(out.unit_count),
    revenue_cny: numberOrNull(out.revenue_cny),
    currency: textOrNull(out.currency),
    crm_stage: textOrNull(out.crm_stage),
    customer_state: textOrNull(out.customer_state),
    note: textOrNull(out.note),
    extra: out.extra,
    source_ref: textOrNull(out.external_id) || (rowObject.__row != null ? `row:${rowObject.__row}` : null),
  };
  normalized.match_key = computeMatchKey(normalized);
  return normalized;
}
