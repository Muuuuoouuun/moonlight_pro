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

export function selectOperatorFocusLeads(revenue = {}) {
  return filterOperatorOwnedRevenue(revenue).leads
    .filter((lead) => (
      lead?.priorityLane === "customer_success" &&
      typeof lead.nextAction === "string" &&
      lead.nextAction.trim()
    ))
    .sort((left, right) => {
      const scoreDelta = (Number(right.score) || 0) - (Number(left.score) || 0);
      if (scoreDelta) return scoreDelta;
      return String(left.id) < String(right.id) ? -1 : String(left.id) > String(right.id) ? 1 : 0;
    })
    .slice(0, 3);
}
