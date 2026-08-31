// 브랜드 디렉터리 — "이 브랜드가 지금 어떤 상태인가"를 콘텐츠 원장에서 만든다.
// (2026-08-29 브랜드 탭 설계 §6)
//
// 브랜드 탭이 생기기 전까지 브랜드는 PMS의 폴더이자 Studio의 드롭다운이었고,
// brands.meta에 들어 있던 정체성(철학·보이스·규칙·금지어)은 AI 프롬프트만 읽었다.
// 이 모듈은 그 meta를 운영자가 읽을 수 있는 상태로 바꾸는 순수 계산 계층이다.
// Supabase 없이 검증되도록 부수효과와 전역 시각을 두지 않는다 — `now`는 주입한다.

const DAY_MS = 24 * 60 * 60 * 1000;

// 마이그레이션 20260427_0004가 브랜드마다 심어둔 cadence 문자열.
// 여기서 유도하는 주당 목표는 운영자가 확정한 값이 **아니라 권장값**이다.
// meta.weekly_goal이 들어오면 그것이 이기고, 그때만 `confirmed`가 된다.
const CADENCE_WEEKLY_GOAL = {
  high_frequency_viral: 5,
  challenge_based: 3,
  mid_frequency_reflective: 2,
  low_frequency_high_quality: 1,
  low_frequency_moment_based: 1,
  personal_archive: 1,
};

const CADENCE_LABEL = {
  high_frequency_viral: "고빈도 · 확산",
  challenge_based: "챌린지 단위",
  mid_frequency_reflective: "중빈도 · 사유",
  low_frequency_high_quality: "저빈도 · 고품질",
  low_frequency_moment_based: "저빈도 · 순간 중심",
  personal_archive: "개인 아카이브",
};

export function cadenceLabel(cadence) {
  const key = String(cadence || "").trim();
  return CADENCE_LABEL[key] || (key ? key : "리듬 미정");
}

// 주당 발행 목표와 그 목표의 확실성. 확실성은 색이 아니라 라벨·테두리로 표현되므로
// 여기서는 의미만 돌려주고 표현은 CertaintyBadge가 소유한다 (DESIGN §5.3).
export function resolveWeeklyGoal(brand) {
  const explicit = Number(brand?.weeklyGoal);
  if (Number.isFinite(explicit) && explicit > 0) {
    return { value: explicit, certainty: "confirmed" };
  }
  const derived = CADENCE_WEEKLY_GOAL[String(brand?.cadence || "").trim()];
  if (derived) return { value: derived, certainty: "recommended" };
  return { value: null, certainty: "unknown" };
}

// 정체성이 실제로 채워졌는지 — 비어 있으면 브랜드 탭이 "확인 필요"로 표시한다.
// 철학·보이스·규칙 셋이 브랜드를 운영 가능하게 만드는 최소 집합이다.
export function identityCompleteness(brand) {
  const missing = [];
  if (!String(brand?.philosophy || "").trim()) missing.push("철학");
  if (!String(brand?.voice || "").trim()) missing.push("보이스");
  if (!(Array.isArray(brand?.rules) && brand.rules.length)) missing.push("콘텐츠 규칙");
  return {
    missing,
    state: missing.length === 0 ? "confirmed" : missing.length === 3 ? "unknown" : "recommended",
  };
}

function startOfIsoWeek(date) {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNr = (utc.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  utc.setUTCDate(utc.getUTCDate() - dayNr);
  return utc;
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// 달력 일수 차이 — 시각이 아니라 날짜로 센다. "8/26 발행 → 8/29 오늘"은 3일이지
// 2.6일이 아니다. 기준은 UTC 날짜이며, 이는 content-ledger의 isoWeek과 같은 전제다.
// 워크스페이스 시간대(Asia/Seoul)로의 정밀화는 스케줄 탭에서 함께 다룬다.
function calendarDaysBetween(from, to) {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((b - a) / DAY_MS);
}

// 스코프는 사이드바 셸의 3단(all/classin/personal)을 그대로 받는다.
// 브랜드의 orgScope는 'classin' 아니면 나머지 전부(개인)라는 workspace-map의
// 규칙과 같은 판정을 쓴다 — 알 수 없는 브랜드가 양쪽에서 사라지면 안 된다.
export function brandMatchesScope(brand, scope) {
  if (scope !== "classin" && scope !== "personal") return true;
  const isClassin = String(brand?.orgScope || "personal") === "classin";
  return scope === "classin" ? isClassin : !isClassin;
}

function countsFor(items) {
  const counts = { ideas: 0, drafts: 0, scheduled: 0, published: 0 };
  for (const item of items) {
    const status = item?.status || item?.statusKey || "";
    if (status === "idea") counts.ideas += 1;
    else if (status === "draft" || status === "review") counts.drafts += 1;
    else if (status === "scheduled") counts.scheduled += 1;
    else if (status === "published") counts.published += 1;
  }
  return counts;
}

// 정렬 = "지금 손이 필요한 순". 목표 대비 얼마나 밀렸는지를 먼저 보고,
// 목표를 모르는 브랜드는 조용한 날수로 뒤따른다. 이름은 마지막 안정 정렬 키다.
function attentionRank(entry) {
  const goal = entry.weeklyGoal.value;
  const behind = goal ? Math.max(0, goal - entry.publishedThisWeek) / goal : 0;
  const quiet = entry.quietDays == null ? 1 : Math.min(1, entry.quietDays / 30);
  return -(behind * 2 + quiet);
}

/**
 * 콘텐츠 원장(`/api/hub/content`의 응답 모양)에서 브랜드 디렉터리를 만든다.
 * 원장이 live가 아니면 브랜드 행은 있어도 계측값을 만들지 않는다 — preview 숫자와
 * live 숫자를 섞지 않는 것이 이 저장소의 규칙이다.
 */
export function buildBrandDirectory(ledger = {}, { now = new Date(), scope = "all" } = {}) {
  const live = ledger.source === "supabase";
  const brands = (Array.isArray(ledger.brands) ? ledger.brands : [])
    .filter((brand) => brand && brand.key)
    .filter((brand) => brandMatchesScope(brand, scope));

  if (!live) {
    return {
      state: ledger.source === "error" ? "error" : "preview",
      scope,
      brands: brands.map((brand) => ({
        ...brand,
        cadenceLabel: cadenceLabel(brand.cadence),
        weeklyGoal: resolveWeeklyGoal(brand),
        identity: identityCompleteness(brand),
        counts: null,
        publishedThisWeek: null,
        lastPublishedAt: null,
        quietDays: null,
        failedPublishes: 0,
      })),
      totals: null,
    };
  }

  const items = Array.isArray(ledger.items) ? ledger.items : [];
  const publishLogs = Array.isArray(ledger.publishLogs) ? ledger.publishLogs : [];
  const brandKeyById = new Map(
    brands.filter((brand) => brand.id).map((brand) => [brand.id, brand.key]),
  );
  const keyOf = (record) => record?.brandKey || brandKeyById.get(record?.brandId) || null;
  const weekStart = startOfIsoWeek(now);

  const entries = brands.map((brand) => {
    const brandItems = items.filter((item) => keyOf(item) === brand.key);
    const published = brandItems
      .map((item) => toDate(item.publishedAt))
      .filter(Boolean)
      .sort((a, b) => b.getTime() - a.getTime());
    const lastPublished = published[0] || null;

    return {
      ...brand,
      cadenceLabel: cadenceLabel(brand.cadence),
      weeklyGoal: resolveWeeklyGoal(brand),
      identity: identityCompleteness(brand),
      counts: countsFor(brandItems),
      publishedThisWeek: published.filter((date) => date >= weekStart).length,
      lastPublishedAt: lastPublished ? lastPublished.toISOString() : null,
      quietDays: lastPublished ? Math.max(0, calendarDaysBetween(lastPublished, now)) : null,
      // 발행 실패는 브랜드 탭에서 danger를 쓰는 두 경우 중 하나다 (§6 상태 문법).
      failedPublishes: publishLogs.filter(
        (log) => keyOf(log) === brand.key && log?.status === "failed",
      ).length,
    };
  });

  const ranked = entries
    .map((entry, index) => ({ entry, index, rank: attentionRank(entry) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ entry }) => entry);

  return {
    state: "live",
    scope,
    brands: ranked,
    totals: {
      brands: ranked.length,
      quiet: ranked.filter((brand) => brand.quietDays == null || brand.quietDays >= 14).length,
      behind: ranked.filter((brand) => (
        brand.weeklyGoal.value != null && brand.publishedThisWeek < brand.weeklyGoal.value
      )).length,
      failedPublishes: ranked.reduce((sum, brand) => sum + brand.failedPublishes, 0),
    },
  };
}

// 브랜드 하나를 키로 고른다. 딥링크(`?b=`)가 스코프 밖이나 삭제된 브랜드를 가리킬 수
// 있으므로 실패를 조용히 흡수하지 않고 null을 돌려준다 — 호출부가 상태를 표시한다.
export function selectBrand(directory, key) {
  if (!key) return null;
  return (directory?.brands || []).find((brand) => brand.key === key) || null;
}

// "12일 조용함" 같은 사람이 읽는 문구. 조용함은 손실이 아니므로 danger가 아니다.
export function quietLabel(quietDays) {
  if (quietDays == null) return "발행 기록 없음";
  if (quietDays === 0) return "오늘 발행";
  if (quietDays === 1) return "어제 발행";
  return `${quietDays}일 조용함`;
}
