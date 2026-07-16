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

export function selectOperatorFocusLeads(revenue = {}) {
  return filterOperatorOwnedRevenue(revenue).leads
    .filter((lead) => (
      lead?.priorityLane === "customer_success" &&
      typeof lead.nextAction === "string" &&
      lead.nextAction.trim() &&
      lead.focusOverride !== "lower"
    ))
    .sort((left, right) => {
      const overrideDelta =
        (FOCUS_OVERRIDE_BOOST[right.focusOverride] || 0) - (FOCUS_OVERRIDE_BOOST[left.focusOverride] || 0);
      if (overrideDelta) return overrideDelta;
      const scoreDelta = (Number(right.score) || 0) - (Number(left.score) || 0);
      if (scoreDelta) return scoreDelta;
      return String(left.id) < String(right.id) ? -1 : String(left.id) > String(right.id) ? 1 : 0;
    })
    .slice(0, 3);
}
