// Canonical deal-pipeline stage taxonomy — single source for both the server-side ledger
// (revenue-ledger.js, revenue-write.js) and any client component that renders stage columns
// (daily-brief.jsx's pipeline widget). Operator-confirmed funnel (2026-07-15, extending
// docs/operator-workflow-profile.md §6): 잠재 리드 -> 컨택 -> 상담 -> 견적 -> 최종미팅 -> 클로징.
//
// Persistence contract: the live `deals.stage` CHECK constraint only permits
// prospect/proposal/negotiation/won/lost, so the *display* stage persists in
// `meta.stage_detail` (jsonb, no CHECK) while the column keeps a proven-coarse value
// (see STAGE_KEY_TO_DB in revenue-write.js). Read side prefers meta.stage_detail and falls
// back to the column aliases below for rows written before this taxonomy. Widening the CHECK
// (and adding "데모") still needs a migration against the real constraint once Supabase
// access is available.
//
// Colors are a cold→hot heat read along the funnel (existing Dot/Badge tokens only):
// dim silver -> blue -> silver -> amber -> hot -> won-green.
export const DEAL_STAGES = [
  { key: "potential", label: "잠재 리드", color: "neutral" },
  { key: "contact", label: "컨택", color: "info" },
  { key: "consult", label: "상담", color: "moon" },
  { key: "quote", label: "견적", color: "warning" },
  { key: "final", label: "최종미팅", color: "danger" },
  { key: "closing", label: "클로징", color: "success" },
];

// Raw `deals.stage` DB values (current schema + legacy alias words seen in older rows) ->
// canonical display key. Anything not listed falls back to "potential" in normalizeStage().
// "consult" has no column alias on purpose — it only ever arrives via meta.stage_detail.
export const STAGE_ALIASES = {
  prospect: "potential",
  lead: "potential",
  new: "potential",
  qualified: "contact",
  nurturing: "contact",
  qual: "contact",
  proposal: "quote",
  prop: "quote",
  negotiation: "final",
  neg: "final",
  won: "closing",
  lost: "lost",
};

// Every raw stage token getRevenueLedger() should fetch — legacy long-form words, legacy short
// codes, and the current canonical keys — so a deal never silently disappears from the ledger
// after this rename.
export const LEGACY_DB_STAGE_VALUES = [
  "prospect", "lead", "new", "qualified", "nurturing", "qual",
  "proposal", "prop", "negotiation", "neg", "won", "lost",
];
