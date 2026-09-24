// 고객 목록(dashboard/revenue/customers)의 순수 판정 — 2026-09-24 영업·매출 재설계 목업 02.
//
// Leads(영업 중)·Accounts(계약)·고객 DB가 같은 사람을 세 번 보여 주던 것을 한 목록으로 합쳤다.
// "리드냐 계정이냐"는 사람이 바뀌는 게 아니라 단계가 바뀌는 것이므로 여기서는 단계(phase)
// 하나로 읽는다. 정본은 약속이다(CRM 스펙 §0.5): next_action(무엇) + meta.next_action_at(언제)
// + dormant(기약 없음). 목록의 기본 정렬도 "다음 약속이 급한 순"이라 목록이 곧 할 일 순서다.
//
// import는 같은 폴더의 순수 모듈만 — node --test로 그대로 돈다.

import { REACTIONS } from "./contact-record.js";
import { subjectLabels } from "./lead-labels.js";

// 행동 기준 4개 + 전체. 기본은 '진행 중' — 매일 챙길 사람만 보인다.
export const CUSTOMER_SEGMENTS = [
  { key: "active", label: "진행 중" },
  { key: "won", label: "계약 고객" },
  { key: "new", label: "새로 들어옴" },
  { key: "dormant", label: "기약 없음" },
  { key: "all", label: "전체" },
];
export const DEFAULT_CUSTOMER_SEGMENT = "active";

// 예전 세그먼트(⭐ 중요 고객 · 확인 필요)는 지우지 않고 접힌 필터 안의 보조 조건으로 남긴다.
export const CUSTOMER_FOCUS_FILTERS = [
  { value: "", label: "전체" },
  { value: "important", label: "⭐ 중요 고객" },
  { value: "risk", label: "확인 필요 (점수 40 미만)" },
];

// 단계 라벨은 중립이다(DESIGN §5.3) — LifecycleBadge의 아이콘 + 직접 라벨로만 구분한다.
export const CUSTOMER_PHASES = {
  new: { label: "신규", lifecycle: "queued", order: 0 },
  contact: { label: "연락 중", lifecycle: "active", order: 1 },
  qualified: { label: "검증", lifecycle: "active", order: 2 },
  won: { label: "계약", lifecycle: "done", order: 3 },
  dormant: { label: "기약 없음", lifecycle: "waiting", order: 4 },
  lost: { label: "종료", lifecycle: "cancelled", order: 5 },
};

// 리드 status(mapLead의 표시 단계) → 목록 단계. 계약 고객(account)은 언제나 won.
// 기약 없음(dormant)은 열린 리드에서만 단계를 덮는다 — 계약·종료는 약속이 없어도 그대로다.
export function customerPhase(row = {}) {
  if (row.kind === "account") return "won";
  const stage = String(row.stage || "");
  if (stage === "Lost") return "lost";
  if (stage === "Customer") return "won";
  if (row.dormant) return "dormant";
  if (stage === "Contact") return "contact";
  if (stage === "Qualified") return "qualified";
  return "new";
}

export function customerPhaseLabel(row = {}) {
  return CUSTOMER_PHASES[customerPhase(row)].label;
}

const OPEN_PHASES = new Set(["new", "contact", "qualified"]);

export function inCustomerSegment(row = {}, segment = DEFAULT_CUSTOMER_SEGMENT) {
  const phase = customerPhase(row);
  if (segment === "active") return OPEN_PHASES.has(phase);
  if (segment === "won") return phase === "won";
  if (segment === "new") return phase === "new";
  // 계약 고객도 약속이 '기약 없음'일 수 있다 — 세그먼트는 배타적이지 않다(전체가 상위집합).
  if (segment === "dormant") return Boolean(row.dormant) && phase !== "lost";
  return true;
}

export function matchesCustomerFocus(row = {}, focus = "") {
  if (focus === "important") return row.focusOverride === "raise";
  if (focus === "risk") return row.health === "risk" && !row.dormant;
  return true;
}

export function customerSegmentCounts(rows = []) {
  const counts = {};
  for (const segment of CUSTOMER_SEGMENTS) {
    counts[segment.key] = rows.filter((row) => inCustomerSegment(row, segment.key)).length;
  }
  return counts;
}

// ── 날짜 ─────────────────────────────────────────────────────────────────────
// 약속 날짜는 기록창이 "YYYY-MM-DD"로 저장한다. 날짜만 있는 문자열을 Date로 파싱하면 UTC
// 자정이 되어 KST 오전 9시 전후로 하루가 밀린다 — 그래서 문자열은 그대로 읽고, 시각이 붙은
// 값만 런타임 로컬 날짜로 접는다(운영자는 KST 한 명).
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function localDateKey(value) {
  if (value == null || value === "") return null;
  if (typeof value === "string" && DATE_ONLY.test(value.trim())) return value.trim();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function keyToUtc(key) {
  const match = DATE_ONLY.exec(key || "");
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : NaN;
}

// to - from (일). 둘 중 하나라도 못 읽으면 null.
export function dayOffset(fromKey, toKey) {
  const diff = keyToUtc(toKey) - keyToUtc(fromKey);
  return Number.isFinite(diff) ? Math.round(diff / 86400000) : null;
}

export function shortDateLabel(key) {
  const match = DATE_ONLY.exec(key || "");
  return match ? `${Number(match[2])}/${Number(match[3])}` : "";
}

// 날짜 프리셋(내일·3일 뒤·다음 주) — DateQuickPresets와 같은 로컬 날짜 문자열.
export function addDaysKey(today, days) {
  const base = keyToUtc(localDateKey(today));
  if (!Number.isFinite(base)) return null;
  const next = new Date(base + days * 86400000);
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

// ── 다음 약속 ────────────────────────────────────────────────────────────────
// state: dated(날짜 있는 약속) · undated(무엇만 있고 날짜 없음) · none(아직 안 정함)
//        · dormant(기약 없음) · closed(종료된 고객)
export function customerPromise(row = {}, today = new Date()) {
  const todayKey = localDateKey(today);
  const phase = customerPhase(row);
  const what = String(row.nextAction || "").trim();
  if (phase === "lost") return { state: "closed", what, at: null, offset: null, late: 0, whenLabel: "" };
  const at = localDateKey(row.nextActionAt);
  if (at) {
    const offset = dayOffset(todayKey, at);
    const late = offset != null && offset < 0 ? -offset : 0;
    const whenLabel = late ? `${late}일 지남`
      : offset === 0 ? "오늘"
      : offset === 1 ? "내일"
      : shortDateLabel(at);
    return { state: "dated", what, at, offset, late, whenLabel, dateLabel: shortDateLabel(at) };
  }
  if (row.dormant) {
    const since = localDateKey(row.dormantSince);
    const days = since ? dayOffset(since, todayKey) : null;
    return { state: "dormant", what: "", at: null, offset: null, late: 0, whenLabel: "", since, days };
  }
  if (what) return { state: "undated", what, at: null, offset: null, late: 0, whenLabel: "날짜 없음" };
  return { state: "none", what: "", at: null, offset: null, late: 0, whenLabel: "" };
}

// 진행 중인데 날짜 있는 약속이 없는 사람 — 히어로 eyebrow의 "약속 없는 진행 중".
export function countOpenWithoutPromise(rows = [], today = new Date()) {
  return rows.filter((row) => inCustomerSegment(row, "active") && customerPromise(row, today).state !== "dated").length;
}

// ── 마지막 연락 ──────────────────────────────────────────────────────────────
// 목록 한 줄에 쓸 수 있는 사실은 기록이 준다: 리드의 last_touch_at(없으면 updated_at/created_at
// 폴백)과 record_contact_outcome이 남긴 마지막 반응. 채널은 목록 기록에 없어서 쓰지 않는다
// (드로어 타임라인에만 있다). 반응도 없고 시각이 생성 시각과 같으면 연락이 없었던 것이다.
const REACTION_LABEL = Object.fromEntries(REACTIONS.map((r) => [r.key, r.label]));

export function agoLabel(days) {
  if (days == null) return "";
  if (days <= 0) return "오늘";
  if (days === 1) return "어제";
  return `${days}일 전`;
}

// 기록 타임라인의 시각 — 한 달 안은 "N일 전", 그 뒤는 M/D. 못 읽으면 fallback(서버 라벨·"방금").
export function recordTimeLabel(value, today = new Date(), fallback = "") {
  const key = localDateKey(value);
  if (!key) return fallback;
  const days = dayOffset(key, localDateKey(today));
  if (days == null) return fallback;
  return days < 30 ? agoLabel(days) : shortDateLabel(key);
}

export function customerLastContact(row = {}, today = new Date()) {
  const reaction = REACTION_LABEL[row.lastReaction] || null;
  if (row.kind === "account") {
    // 계정은 원시 시각이 목록 기록에 없다 — 서버가 만든 상대 시각 문자열을 그대로 쓴다.
    const label = row.last && row.last !== "—" ? row.last : "";
    return { known: Boolean(label), reaction: null, days: null, label: label || "기록 없음" };
  }
  const at = row.lastContactAt || null;
  const neverTouched = !at || (!reaction && row.createdAt && at === row.createdAt);
  if (neverTouched) return { known: false, reaction: null, days: null, label: "아직 없음" };
  const days = dayOffset(localDateKey(at), localDateKey(today));
  const ago = agoLabel(days);
  return { known: true, reaction, days, label: [reaction, ago].filter(Boolean).join(" · ") };
}

// ── 정렬 ─────────────────────────────────────────────────────────────────────
// 다음 약속: 날짜 있는 약속 → 날짜 없는 약속 → 약속 없음. 날짜 없는 쪽은 방향과 무관하게
// 항상 뒤(null last) — 뒤집어도 "약속 없음"이 맨 위로 올라와 급한 사람을 가리지 않는다.
const PROMISE_RANK = { dated: 0, undated: 1, none: 2, dormant: 3, closed: 4 };

function byName(a, b) {
  return String(a.name || "").localeCompare(String(b.name || ""), "ko");
}

export function sortCustomers(rows = [], sort = { key: "promise", dir: "asc" }, today = new Date()) {
  if (!sort || !sort.key) return [...rows];
  const dir = sort.dir === "desc" ? -1 : 1;
  const decorated = rows.map((row) => ({ row, promise: customerPromise(row, today) }));
  const compare = (a, b) => {
    if (sort.key === "promise") {
      const rank = PROMISE_RANK[a.promise.state] - PROMISE_RANK[b.promise.state];
      if (rank) return rank;
      if (a.promise.state === "dated") {
        const diff = dayOffset(b.promise.at, a.promise.at);
        if (diff) return diff * dir;
      }
      return byName(a.row, b.row);
    }
    if (sort.key === "phase") {
      const diff = CUSTOMER_PHASES[customerPhase(a.row)].order - CUSTOMER_PHASES[customerPhase(b.row)].order;
      return diff ? diff * dir : byName(a.row, b.row);
    }
    if (sort.key === "last") {
      const at = (row) => {
        const t = row.lastContactAt ? new Date(row.lastContactAt).getTime() : NaN;
        return Number.isFinite(t) ? t : null;
      };
      const av = at(a.row), bv = at(b.row);
      if (av == null || bv == null) return av == null && bv == null ? byName(a.row, b.row) : av == null ? 1 : -1;
      return (av - bv) * dir || byName(a.row, b.row);
    }
    if (sort.key === "value") {
      return ((Number(a.row.valueNum) || 0) - (Number(b.row.valueNum) || 0)) * dir || byName(a.row, b.row);
    }
    return byName(a.row, b.row) * dir;
  };
  return decorated.sort(compare).map((item) => item.row);
}

export function sortCaption(sort) {
  if (!sort || !sort.key) return "기록 순서";
  const label = { promise: "다음 약속", phase: "단계", last: "마지막 연락", value: "금액", name: "이름" }[sort.key] || sort.key;
  if (sort.key === "promise") return sort.dir === "desc" ? "다음 약속이 먼 순" : "다음 약속이 급한 순";
  return `${label} ${sort.dir === "desc" ? "내림차순" : "오름차순"}`;
}

// ── 검색 ─────────────────────────────────────────────────────────────────────
// 이름 · 학원 · 담당자 · 과목·장르 · 전화번호 뒷자리. 숫자만 친 검색은 전화번호 숫자열에도 맞춘다.
export function customerSearchText(row = {}) {
  const phoneDigits = String(row.phone || "").replace(/\D/g, "");
  return [
    row.name, row.person, row.personTitle, row.sub, row.email, row.phone, phoneDigits,
    row.nextAction, ...subjectLabels(row.subjects), ...(row.genres || []),
  ].filter(Boolean).join(" ").toLocaleLowerCase("ko");
}

export function matchesCustomerSearch(row = {}, term = "") {
  const tokens = String(term || "").trim().toLocaleLowerCase("ko").split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const haystack = customerSearchText(row);
  return tokens.every((token) => {
    if (haystack.includes(token)) return true;
    // "1234" · "010-1234" 처럼 숫자·하이픈만 친 경우만 전화번호 숫자열로 다시 맞춘다.
    const digits = /^[\d-]+$/.test(token) ? token.replace(/\D/g, "") : "";
    return digits.length >= 3 && haystack.includes(digits);
  });
}

// ── 기록 시트 프리필 ─────────────────────────────────────────────────────────
// "했어요 · 기록"은 약속 문장에서 채널만 미리 고른다. 키워드가 없으면 고르지 않는다(기본 통화).
const CHANNEL_HINTS = [
  { kind: "kakao", pattern: /카톡|카카오|문자/ },
  { kind: "email", pattern: /메일|이메일/ },
  { kind: "meeting", pattern: /미팅|회의|만나/ },
  { kind: "visit", pattern: /방문/ },
  { kind: "demo", pattern: /데모|시연/ },
  { kind: "call", pattern: /전화|통화|콜/ },
];

export function channelFromPromise(what = "") {
  const text = String(what || "");
  return CHANNEL_HINTS.find((hint) => hint.pattern.test(text))?.kind || null;
}

// ── 표시 이름 ────────────────────────────────────────────────────────────────
// 목업은 사람을 먼저("김지현 원장"), 소속을 아래에 둔다. 담당자가 없으면 기록 이름 하나.
export function customerDisplayName(row = {}) {
  if (row.person) return [row.person, row.personTitle].filter(Boolean).join(" ");
  return row.name || "이름 없음";
}

export function customerOrgLabel(row = {}) {
  return row.person ? row.name || "" : "";
}
