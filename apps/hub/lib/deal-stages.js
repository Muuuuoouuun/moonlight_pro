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
// `ramp` is a funnel-position luminance index (0=cold → 5=hot) consumed only by
// STAGE_FILL / STAGE_LINE below. It is NOT a Badge/Dot tone — stage chips render
// tone="neutral" per DESIGN.md §5.3 (lifecycle/category never uses semantic color).
export const DEAL_STAGES = [
  { key: "potential", label: "잠재 리드", ramp: 0 },
  { key: "contact", label: "컨택", ramp: 1 },
  { key: "consult", label: "상담", ramp: 2 },
  { key: "quote", label: "견적", ramp: 3 },
  { key: "final", label: "최종미팅", ramp: 4 },
  { key: "closing", label: "클로징", ramp: 5 },
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

// Ramp index -> solid CSS token, for gauge/segment fills (Deals masthead, Daily Brief
// PipelineShapeCard, revenue funnel bar). One map so the instruments can't drift apart.
// DESIGN.md §5.3: chart series must not use success/warning/danger — the funnel reads as a
// moonstone luminance ramp instead (cold=dim → hot=bright), which stays legible in
// monochrome and keeps semantic colors reserved for real urgency.
export const STAGE_FILL = [
  "var(--moon-700)",
  "var(--moon-600)",
  "var(--moon-500)",
  "var(--moon-400)",
  "var(--moon-300)",
  "var(--moon-200)",
];

// Ramp index -> hairline token for the §5.2 inset-stripe idiom (kanban column top
// stripes). Same luminance ramp as STAGE_FILL, one step dimmer so stripes stay hairline-quiet.
export const STAGE_LINE = [
  "var(--line-strong)",
  "var(--moon-700)",
  "var(--moon-600)",
  "var(--moon-500)",
  "var(--moon-400)",
  "var(--moon-300)",
];
