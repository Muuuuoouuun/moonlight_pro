// 기록 기반 Guru 추천 입력 조립 — IO만 담당하고 판정은 순수 엔진(guru-recommendations.js)이 한다.
//
// 새 테이블을 만들지 않는다. 넛지와 같은 원천만 읽는다: 매출 데이터(리드·딜·계정)와 최근 활동.
// 실패한 소스는 숨기지 않고 failedSources로 이름을 댄다 — 읽기 실패를 "추천 없음"으로 위장하면
// 운영자는 근거가 없는 것과 못 읽은 것을 구분할 수 없다.

import { getRevenueLedger } from "./revenue-ledger.js";
import { listRecentActivities } from "./crm-activities.js";
import { filterOperatorOwnedRevenue } from "../operator-revenue-scope.js";
import { buildGuruRecommendations } from "../sales-os/guru-recommendations.js";

const DAY_MS = 86400000;
// 반응 판정 30일 + 지난 약속 뒤 기록 여부를 볼 여유. 이 창보다 오래된 약속은 엔진이 판정하지 않는다.
export const RECOMMENDATION_ACTIVITY_WINDOW_DAYS = 45;

export async function getGuruRecommendations({ now = Date.now(), subjectId = null, severity = null } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  const since = new Date(nowMs - RECOMMENDATION_ACTIVITY_WINDOW_DAYS * DAY_MS).toISOString();

  const [revenue, activities] = await Promise.all([
    getRevenueLedger().catch(() => ({ source: "error", leads: [], deals: [], accounts: [] })),
    listRecentActivities({ since, limit: 500 }).catch(() => null),
  ]);

  // 매출 데이터를 못 읽으면 추천의 대상 자체가 없다 — 빈 목록이 아니라 error다.
  if (revenue?.source === "error") {
    return { status: "error", failedSources: ["revenue"], recommendations: [] };
  }
  if (revenue?.source !== "supabase") {
    return { status: "preview", failedSources: [], recommendations: [] };
  }

  const activitiesKnown = Array.isArray(activities);
  const failedSources = activitiesKnown ? [] : ["crm_activities"];
  const owned = filterOperatorOwnedRevenue(revenue);
  const accounts = (Array.isArray(revenue.accounts) ? revenue.accounts : []).filter((account) => account?.owner === "Me");

  let recommendations = buildGuruRecommendations({
    leads: owned.leads,
    deals: owned.deals.filter((deal) => !deal?.hidden),
    accounts,
    activities: activitiesKnown ? activities : [],
    activitiesKnown,
    activitiesSince: since,
    now: nowMs,
    severity,
  });
  if (subjectId) recommendations = recommendations.filter((rec) => String(rec.subject.id) === String(subjectId));

  return {
    status: failedSources.length ? "partial" : "live",
    failedSources,
    activitiesSince: since,
    recommendations,
  };
}
