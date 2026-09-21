import { isTemplateNextAction } from "./sales-os/lead-enrichment.js";
import { kstDayKey } from "./kst-day.js";

export function filterOperatorOwnedRevenue(revenue = {}) {
  const owned = (records) => (
    Array.isArray(records)
      ? records.filter((record) => record?.owner === "Me")
      : []
  );

  return {
    ...revenue,
    leads: owned(revenue.leads),
    deals: owned(revenue.deals),
  };
}

// 운영자 수동 포커스 오버라이드 (spec §7: 전환 가능성은 숫자 편집이 아니라
// 올리기/기본/내리기 3단 조정만). 'lower'는 포커스 후보에서 제외, 'raise'는
// 점수 동률·근소 차이를 뒤집을 만큼만 가산한다 — 원점수는 건드리지 않는다.
const FOCUS_OVERRIDE_BOOST = { raise: 1, default: 0, lower: -1 };

// 약속이 임박(오늘 기준 +3일 이내)하거나 이미 지난 건을 먼저 본다. 날짜가 없는 실제 약속도
// 후보에서 빼지 않는다 — 날짜를 요구하면 첫 화면이 빈 채로 시작한다(§8.3의 자동 후보 조건은
// 후속 단계). 정렬에서만 뒤로 보낸다.
const DUE_SOON_DAYS = 3;

function dueRank(lead, todayKey, soonKey) {
  const key = kstDayKey(lead?.nextActionAt);
  if (!key) return 1;
  return key <= soonKey ? 0 : 1;
}

// limit: §2 확정 "집중 고객 3~5건" — 기존 소비자(신호 큐)는 3, 첫 화면 슬롯은 5까지.
//
// 2026-09-21 0c: 이전 조건은 `priorityLane === "customer_success"` 하나였고, 그 lane은
// lead-enrichment의 resolvePipelineLane이 `status === "won"`일 때만 붙인다 — 즉 진행 중인
// 리드는 구조적으로 집중 고객이 될 수 없었다(프로필 §8의 정의와 반대). 동시에 그 lane의
// nextAction은 대부분 이관 템플릿이라 첫 화면 5행이 같은 문장을 반복했다.
export function selectOperatorFocusLeads(revenue = {}, { limit = 3, now = new Date() } = {}) {
  const todayKey = kstDayKey(now instanceof Date ? now : new Date(now));
  const soonKey = kstDayKey(new Date((now instanceof Date ? now.getTime() : Number(now) || Date.now()) + DUE_SOON_DAYS * 86400000));

  const ranked = filterOperatorOwnedRevenue(revenue).leads
    .filter((lead) => (
      typeof lead?.nextAction === "string" &&
      lead.nextAction.trim() &&
      // 이관 템플릿은 운영자의 약속이 아니다 — 행이 아무 말도 하지 않게 만드는 주범.
      !isTemplateNextAction(lead.nextAction) &&
      lead.focusOverride !== "lower" &&
      lead.stage !== "Lost" &&
      !lead.dormant
    ))
    .sort((left, right) => {
      const overrideDelta =
        (FOCUS_OVERRIDE_BOOST[right.focusOverride] || 0) - (FOCUS_OVERRIDE_BOOST[left.focusOverride] || 0);
      if (overrideDelta) return overrideDelta;
      const dueDelta = dueRank(left, todayKey, soonKey) - dueRank(right, todayKey, soonKey);
      if (dueDelta) return dueDelta;
      const scoreDelta = (Number(right.score) || 0) - (Number(left.score) || 0);
      if (scoreDelta) return scoreDelta;
      return String(left.id) < String(right.id) ? -1 : String(left.id) > String(right.id) ? 1 : 0;
    });

  // §2/§7의 슬롯 단위는 "고객"이다 — 같은 학원에 리드 레코드가 여러 개면(시트 재이관·중복
  // 인테이크) 첫 화면이 같은 이름을 3번 그리며 5칸을 소모했다: 구분 불가 + 실제로는 고객 2곳
  // (2026-08-07 사용성 재감사 F). 회사당 최고 우선순위 리드 1건만 남긴다. 회사 정보가 없는
  // 리드는 자기 자신이 고객 단위다.
  const seenCompanies = new Set();
  const perCompany = [];
  for (const lead of ranked) {
    const companyKey = lead.companyId || lead.companyName || `lead:${lead.id}`;
    if (seenCompanies.has(companyKey)) continue;
    seenCompanies.add(companyKey);
    perCompany.push(lead);
    if (perCompany.length >= limit) break;
  }
  return perCompany;
}
