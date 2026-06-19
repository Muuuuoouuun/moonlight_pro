// Sales OS persona contract — pure, IO-free (mirrors docs/sales-os/personas/registry.json).
//
// The /team (substrate B, local Claude Code) command reads registry.json directly as the
// canonical contract; migration 0010 seeds the same 5 personas into the agents table as the
// runtime mirror. This module is the offline fallback + the pure normalize/merge logic the
// hub uses to render real persona config with live status. Kept @/-free so check-persona-registry
// can unit-test it (mirrors sheets-normalize.js). scripts/check-persona-registry.mjs asserts this
// stays in sync with registry.json — edit both together.

// Canonical order (matches registry.json + migration 0010 seed). 'order' always runs first.
export const PERSONA_IDS = ["order", "sales", "content", "production", "review"];

export const PERSONA_CONTRACT = [
  {
    id: "order",
    nameKo: "오더",
    nameEn: "Dispatch",
    role: "신호 읽고 작업지시서 발행 + 360 조립 + 건별 활성 페르소나 선택",
    emits: "work_order[]",
    gate: "n/a",
    file: "docs/sales-os/personas/00-order-dispatch.md",
  },
  {
    id: "sales",
    nameKo: "세일즈",
    nameEn: "Deals & Follow-up",
    role: "딜 다음수 + 반론 대응 + 팔로업 위생(최대 잡무)",
    emits: "{ next_action, objection, followups[] }",
    gate: "outbound→codex",
    file: "docs/sales-os/personas/01-sales-followup.md",
  },
  {
    id: "content",
    nameKo: "콘텐츠",
    nameEn: "Ideas & Cadence",
    role: "아이디어 큐 + 발행 케이던스 + 앵글·랭킹 (작성 대행 아님; 마케팅 신호 흡수)",
    emits: "{ ideas[], cadence_note, today_pick }",
    gate: "internal→auto / publish→production",
    file: "docs/sales-os/personas/02-content.md",
  },
  {
    id: "production",
    nameKo: "제작",
    nameEn: "Asset Scaffold",
    role: "승인 앵글 → 채널 포맷 골격(카드뉴스·릴스·스레드) — 발행 마찰 제거",
    emits: "{ channel, format, skeleton, thread_split?, notes }",
    gate: "outbound→codex",
    file: "docs/sales-os/personas/03-production.md",
  },
  {
    id: "review",
    nameKo: "검수",
    nameEn: "Review & Gate",
    role: "내부 브랜드·사실 셀프리뷰 → Codex 외부 적대 게이트 (브랜딩 흡수)",
    emits: "{ internal_review, gate, codex_verdict?, disposition, reasons[], regeneration }",
    gate: "orchestrates",
    file: "docs/sales-os/personas/04-review-gate.md",
  },
];

const CONTRACT_BY_ID = new Map(PERSONA_CONTRACT.map((p) => [p.id, p]));

export function personaById(id) {
  return CONTRACT_BY_ID.get(String(id || "").trim()) || null;
}

// Map one agents-table row (with jsonb `config`) to a normalized persona shape.
// Returns null if the row carries no resolvable persona id.
export function normalizePersona(row) {
  if (!row || typeof row !== "object") return null;
  const config = row.config && typeof row.config === "object" ? row.config : {};
  const id = String(config.persona_id || row.agent_type || "").trim();
  if (!id) return null;
  return {
    id,
    agentId: row.id || null,
    nameKo: row.name || personaById(id)?.nameKo || null,
    role: config.role || personaById(id)?.role || null,
    emits: config.emits || personaById(id)?.emits || null,
    gate: config.gate || personaById(id)?.gate || null,
    file: config.file || personaById(id)?.file || null,
    status: row.status || "idle",
    source: "supabase",
  };
}

// Overlay live agents-table rows onto the canonical contract, preserving PERSONA_IDS order.
// Contract personas with no live row come back as status 'idle' / source 'contract'.
// Live personas outside the contract (forward-compat) are appended.
export function mergePersonas(liveRows = []) {
  const liveById = new Map();
  for (const row of Array.isArray(liveRows) ? liveRows : []) {
    const p = normalizePersona(row);
    if (p && p.id) liveById.set(p.id, p);
  }

  const merged = PERSONA_CONTRACT.map((base) => {
    const live = liveById.get(base.id);
    liveById.delete(base.id);
    return live
      ? { ...base, status: live.status, agentId: live.agentId, source: "supabase" }
      : { ...base, status: "idle", agentId: null, source: "contract" };
  });

  for (const extra of liveById.values()) merged.push(extra);
  return merged;
}
