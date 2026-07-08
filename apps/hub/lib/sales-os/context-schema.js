// 360 operating_context — pure schema logic (IO-free). Implements docs/sales-os/context-spine.md
// §1 (logical schema) and §3 step8 (code camelCase -> logical snake_case normalization).
//
// The async assembler (context-assembler.js) pulls the ledgers and feeds these pure functions;
// keeping the normalization here (no @/) lets check-context-assembler unit-test it standalone.
// Invariant: a missing source is never a silent blank — it leaves null/[] + a {source,reason}
// in missing[], and the loop continues.

export const OWNER_ID = "3935704427463307"; // 문준혁 — eeoCRM ownerId, always the entity owner.

// classmoon brand SSOT fallback (context-spine §1.1). Used when the brands ledger has no classmoon row.
export const BRAND_FALLBACK = {
  voice: "classmoon",
  rules: ["사례·가치 우선", "교육현장 존중", "정직한 경계 (감→기준→데이터)"],
  forbidden: ["과장된 성과·보장·단정 표현", "제품홍보만", "현장 없는 조언", "혁신적·차세대·시너지 등 default SaaS 톤"],
};

// getRecentOutcomes element (camelCase) -> logical recent_outcomes element.
// occurredAt -> at (rename, ISO kept); asset_id is null (not in getRecentOutcomes per spine §3).
// deal_id/company_id/channel are operational extras kept alongside the 6 contract keys.
export function normalizeOutcome(o) {
  if (!o || typeof o !== "object") return null;
  return {
    lead_id: o.leadId ?? null,
    play: o.play ?? null,
    asset_id: o.assetId ?? null,
    action: o.action ?? null,
    at: o.occurredAt ?? null,
    note: o.note ?? null,
    // operational extras (spine §3 step8: preserve if needed; personas read only the 6 above)
    deal_id: o.dealId ?? null,
    company_id: o.companyId ?? null,
    channel: o.channel ?? null,
  };
}

// Filter normalized outcomes down to one entity (client-side, since getRecentOutcomes has no lead scope).
export function outcomesForEntity(normalized, { leadId = null, dealId = null, companyId = null } = {}) {
  return (Array.isArray(normalized) ? normalized : []).filter(
    (o) =>
      (leadId && o.lead_id === leadId) ||
      (dealId && o.deal_id === dealId) ||
      (companyId && o.company_id === companyId),
  );
}

// content cadence object -> short status string (spine §3 step4).
export function cadenceStatusString(cadence) {
  if (!cadence || typeof cadence !== "object") return null;
  const published = Number.isFinite(cadence.published) ? cadence.published : 0;
  const goal = Number.isFinite(cadence.goal) ? cadence.goal : 0;
  return `${published}/${goal} 발행 · ${cadence.behind ? "behind" : "on-track"}`;
}

// Pick the classmoon brand guardrails from the brands ledger, falling back to the SSOT constant.
export function selectBrand(brands) {
  const list = Array.isArray(brands) ? brands : [];
  const cm = list.find((b) => b && (b.key === "classmoon" || b.name === "classmoon"));
  if (!cm) return { ...BRAND_FALLBACK };
  return {
    voice: "classmoon",
    rules: Array.isArray(cm.rules) && cm.rules.length ? cm.rules : BRAND_FALLBACK.rules,
    forbidden: Array.isArray(cm.forbidden) && cm.forbidden.length ? cm.forbidden : BRAND_FALLBACK.forbidden,
  };
}

// Assemble one deal's operating_context (spine §1, item_type "deal": entity·crm_facts·ledger filled,
// content/social empty). `deal`/`account`/`lead` are the revenue-ledger *projections* — mapLead
// now carries score/nextAction/contactName, so a matched lead fills those slots; anything still
// unavailable is recorded honestly in missing[].
export function buildFocusOperatingContext({ deal = null, account = null, lead = null, entityOutcomes = [], brand = BRAND_FALLBACK } = {}) {
  if (!deal) {
    return {
      item_id: null,
      item_type: "deal",
      found: false,
      missing: [{ source: "deals", reason: "focus ref가 딜과 매칭 안 됨" }],
    };
  }

  const sorted = [...(Array.isArray(entityOutcomes) ? entityOutcomes : [])].sort(
    (a, b) => String(b.at || "").localeCompare(String(a.at || "")),
  );
  const lastTouch = sorted[0]?.at || null;

  const contact = lead?.contactName
    ? lead.contactEmail
      ? `${lead.contactName} <${lead.contactEmail}>`
      : lead.contactName
    : null;

  const missing = [];
  if (!lead) {
    missing.push({ source: "leads", reason: "focus deal과 매칭되는 리드 없음 (score/next_action 미보강)" });
    missing.push({ source: "contacts", reason: "리드 미매칭 — contact 미보강" });
  } else if (!contact) {
    missing.push({ source: "contacts", reason: "리드에 연결된 연락처 없음" });
  }
  missing.push({ source: "eeoCRM", reason: "MCP 미연결 — crm_facts 보강 없음" });

  return {
    item_id: deal.id,
    item_type: "deal",
    found: true,
    entity: {
      company: account?.name || deal.name || null,
      contact,
      lead_id: lead?.id || null,
      deal_id: deal.id,
      stage: deal.stage || null,
      amount: Number.isFinite(deal.value) ? deal.value : null,
      owner_id: OWNER_ID,
    },
    crm_facts: null,
    ledger: {
      recent_outcomes: Array.isArray(entityOutcomes) ? entityOutcomes : [],
      last_touch: lastTouch,
      score: Number.isFinite(lead?.score) && lead.score > 0 ? lead.score : null,
      next_action_hint: lead?.nextAction || null,
    },
    content: { cadence_status: null, idea_queue_top: [], recent_published: [] },
    social_signals: { winners: [], losers: [] },
    brand,
    missing,
  };
}
