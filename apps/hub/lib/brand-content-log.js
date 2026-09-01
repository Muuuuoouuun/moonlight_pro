// 브랜드 컨텐츠 로그 — 크로스 브랜드 콘텐츠 원장을 운영자 첨부 Brand Content Log v5
// 디자인이 요구하는 형태(보드/리스트, 브랜드 아이덴티티 컬러, 채널·검색·정렬 필터)로
// 투영하는 순수 계산 계층. 부수효과·React·fetch 없음 — Supabase 없이도 검증된다.
// (2026-09-01 docs/superpowers/specs/2026-09-01-brand-content-log.md)

// 운영자 첨부 디자인의 8색, 디자인 순서 그대로.
export const BRAND_LOG_PALETTE = [
  "#9ACD32", "#A78BDA", "#E5484D", "#E8B4B8",
  "#A0764B", "#5B9BD5", "#E6C34A", "#4FB8C9",
];

// brands 리포지토리 default("#5274a8" — --accent 별칭)는 "색 미설정"을 뜻한다.
// mapBrands가 모든 행에 이 값을 채워 넣으므로, 이 값 자체를 명시적 지정으로 보면
// 모든 브랜드가 항상 같은 색을 "확정"한 것처럼 보인다 — 그래서 fallback 취급한다.
const ACCENT_DEFAULT_COLOR = "#5274a8";

// 슬러그↔디자인 색 매핑 중 확정된 4개만. classin/moon.classin/정상화/눈이 부시게 ↔
// classmoon/moonpm/politicofficer/sinabro는 미확정 — 운영자 확인 전까지 심지 않는다
// (스펙 §브랜드 아이덴티티 컬러).
const CANONICAL_BRAND_LOG_COLORS = {
  gore: "#4FB8C9",
  holyfuncollector: "#E6C34A",
  bridgemaker: "#5B9BD5",
  "22nomad": "#A0764B",
};

// 브랜드를 찾지 못한 항목(브랜드 미배정)의 중립 폴백 — 브랜드 아이덴티티가 아니므로
// 팔레트 hex가 아니라 토큰 문자열을 그대로 돌려준다. inline style 값으로 유효하다.
const UNASSIGNED_BRAND_COLOR = "var(--fg-faint)";

function normalizedHex(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed;
}

// 브랜드마다 표시 색을 하나로 확정한다. 우선순위:
//   1) brand.colorHex가 설정돼 있고 accent 기본값이 아니면 그 값 (운영자 확정)
//   2) 확정된 슬러그 시드
//   3) BRAND_LOG_PALETTE에서 브랜드가 주어진 순서대로, 이미 쓰인 색을 건너뛰며 결정적으로 배정.
//      8개를 넘으면 처음부터 순환(반복 배정) — 팔레트가 8색뿐이라 완전한 유일성은
//      8개 브랜드까지만 보장된다.
// 같은 입력(같은 브랜드 목록·순서·색 상태)은 항상 같은 결과를 낸다 — 무작위성 없음.
export function resolveBrandLogColors(brands) {
  const list = Array.isArray(brands) ? brands : [];
  const colorByKey = new Map();
  const used = new Set();
  const needsPalette = [];

  for (const brand of list) {
    const key = brand?.key;
    if (!key || colorByKey.has(key)) continue; // 키 없음/중복 브랜드는 방어적으로 건너뜀

    const explicit = normalizedHex(brand?.colorHex);
    if (explicit && explicit.toLowerCase() !== ACCENT_DEFAULT_COLOR) {
      colorByKey.set(key, explicit);
      used.add(explicit.toLowerCase());
      continue;
    }

    const canonical = CANONICAL_BRAND_LOG_COLORS[key];
    if (canonical) {
      colorByKey.set(key, canonical);
      used.add(canonical.toLowerCase());
      continue;
    }

    needsPalette.push(key);
  }

  let cursor = 0;
  for (const key of needsPalette) {
    let chosen = null;
    for (let i = 0; i < BRAND_LOG_PALETTE.length; i += 1) {
      const candidate = BRAND_LOG_PALETTE[(cursor + i) % BRAND_LOG_PALETTE.length];
      if (!used.has(candidate.toLowerCase())) {
        chosen = candidate;
        cursor = (cursor + i + 1) % BRAND_LOG_PALETTE.length;
        break;
      }
    }
    if (!chosen) {
      // 팔레트 8색이 모두 소진됨(9번째 이상 브랜드) — 처음부터 순환하며 재사용한다.
      chosen = BRAND_LOG_PALETTE[cursor % BRAND_LOG_PALETTE.length];
      cursor = (cursor + 1) % BRAND_LOG_PALETTE.length;
    }
    colorByKey.set(key, chosen);
    used.add(chosen.toLowerCase());
  }

  return colorByKey;
}

// content_items status → 로그 3열(기획/제작중/발행). archived는 로그에서 제외된다
// (아카이브는 "현재 진행 상태"가 아니라 종결 상태 — 3열 어디에도 속하지 않는다).
const STATUS_LOG_MAP = {
  idea: { key: "plan", label: "기획" },
  draft: { key: "making", label: "제작중" },
  review: { key: "making", label: "제작중" },
  scheduled: { key: "making", label: "제작중" },
  published: { key: "published", label: "발행" },
};

export const CONTENT_LOG_STATUS_ORDER = [
  { key: "plan", label: "기획" },
  { key: "making", label: "제작중" },
  { key: "published", label: "발행" },
];

const TIME_ZONE = "Asia/Seoul";

function resolveAt(item) {
  return item?.publishedAt || item?.scheduledAt || item?.updatedAt || item?.createdAt || null;
}

// "MM.DD" — Asia/Seoul 고정(엔진/서버는 UTC로 실행되므로 타임존 미고정 시 자정 부근
// 항목의 표시 날짜가 실제와 하루 어긋난다). en-CA는 YYYY-MM-DD 순서가 고정이라
// 로케일별 파트 순서 추측 없이 안전하게 잘라 쓸 수 있다.
function formatWhenSeoul(iso) {
  if (!iso) return "미정";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "미정";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date); // "YYYY-MM-DD"
  const [, mm, dd] = parts.split("-");
  return `${mm}.${dd}`;
}

// content-ledger의 mapItems() 산출물(id/title/summary/status/kind/channel/
// scheduledAt/publishedAt/createdAt/updatedAt/brandKey/brandName)을 로그 행으로 편다.
// metricValue/metricLabel은 라이브 성과 소스가 아직 없어 오늘은 항상 정직한 0/"—" —
// 실제 지표가 생기기 전까지 절대 지어내지 않는다(Phase 2 백로그).
export function buildContentLogEntries(items, brands) {
  const list = Array.isArray(items) ? items : [];
  const colorByKey = resolveBrandLogColors(Array.isArray(brands) ? brands : []);

  const entries = [];
  for (const item of list) {
    const status = STATUS_LOG_MAP[item?.status];
    if (!status) continue; // archived + 알 수 없는 상태는 로그에서 제외

    const at = resolveAt(item);
    entries.push({
      id: item.id,
      at,
      when: formatWhenSeoul(at),
      brandKey: item.brandKey || null,
      brandName: item.brandName || "No brand",
      color: (item.brandKey && colorByKey.get(item.brandKey)) || UNASSIGNED_BRAND_COLOR,
      title: item.title || "",
      memo: item.summary || "",
      channel: item.channel || "",
      type: item.kind || "",
      status: status.key,
      statusLabel: status.label,
      metricValue: 0,
      metricLabel: "—",
    });
  }
  return entries;
}

// brand/channel은 정확히 일치, query는 제목·메모·브랜드명 3필드에 대해 대소문자
// 구분 없는 부분일치, status는 plan|making|published 키와 비교.
export function filterContentLogEntries(entries, { brand = null, channel = null, query = "", status = null } = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const q = String(query || "").trim().toLowerCase();

  return list.filter((entry) => {
    if (brand && entry.brandKey !== brand) return false;
    if (channel && entry.channel !== channel) return false;
    if (status && entry.status !== status) return false;
    if (q) {
      const haystack = `${entry.title || ""} ${entry.memo || ""} ${entry.brandName || ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function compareAt(a, b, direction) {
  if (a.at == null && b.at == null) return 0;
  if (a.at == null) return 1; // null은 최신순·오래된순 모두에서 항상 맨 뒤
  if (b.at == null) return -1;
  if (a.at === b.at) return 0;
  const order = a.at < b.at ? -1 : 1;
  return direction === "desc" ? -order : order;
}

// 'latest' at desc(null 마지막) · 'oldest' at asc(null 마지막) · 'metrics' metricValue desc.
// 입력 배열은 건드리지 않는다(slice 후 정렬) — Array.prototype.sort는 안정 정렬이므로
// 동률 항목은 주어진 순서를 유지한다.
export function sortContentLogEntries(entries, sort) {
  const list = Array.isArray(entries) ? entries.slice() : [];
  if (sort === "latest") return list.sort((a, b) => compareAt(a, b, "desc"));
  if (sort === "oldest") return list.sort((a, b) => compareAt(a, b, "asc"));
  if (sort === "metrics") return list.sort((a, b) => (b.metricValue || 0) - (a.metricValue || 0));
  return list;
}

// 등장 빈도 내림차순, 동률은 라벨 오름차순(한국어 로케일). 빈 채널은 제외.
export function contentLogChannelOptions(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const counts = new Map();
  for (const entry of list) {
    const channel = String(entry?.channel || "").trim();
    if (!channel) continue;
    counts.set(channel, (counts.get(channel) || 0) + 1);
  }
  return [...counts.keys()].sort((a, b) => {
    const diff = (counts.get(b) || 0) - (counts.get(a) || 0);
    return diff !== 0 ? diff : a.localeCompare(b, "ko");
  });
}

// 보드 뷰의 3열 — 주어진 entries 순서를 그대로 보존해 분배한다(sort는 호출 전 적용).
export function contentLogStatusColumns(entries) {
  const list = Array.isArray(entries) ? entries : [];
  return CONTENT_LOG_STATUS_ORDER.map((column) => ({
    key: column.key,
    label: column.label,
    items: list.filter((entry) => entry.status === column.key),
  }));
}
