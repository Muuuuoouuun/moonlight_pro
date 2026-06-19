// Sales OS persona registry — runtime loader (Supabase-first, preview fallback).
//
// Reads the 5 personas seeded into the agents table (migration 0010) and overlays their live
// status onto the canonical contract. Supabase = source of truth; when it is absent the contract
// is returned with status 'idle' (preview). Used by agents.jsx Orders/Council to render real
// persona config instead of hardcoded arrays, and by the /team loop for live status.
//
// Pure normalize/merge logic lives in persona-contract.js (kept @/-free for unit tests).

import { fetchSupabaseRows, inFilter, withWorkspaceFilter } from "@/lib/server-read";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

import { PERSONA_IDS, mergePersonas } from "@/lib/sales-os/persona-contract";

export async function getPersonas({ workspaceId = resolveDefaultWorkspaceId() } = {}) {
  if (!workspaceId) {
    return { source: "preview", personas: mergePersonas([]) };
  }

  const rows = await fetchSupabaseRows("agents", {
    filters: withWorkspaceFilter([["agent_type", inFilter(PERSONA_IDS)]]),
    order: "name.asc",
    limit: 50,
  });

  if (!rows) {
    return { source: "preview", personas: mergePersonas([]) };
  }

  // Only seeded personas carry config.persona_id — this excludes generic sales/content agents
  // that happen to share an agent_type with a persona.
  const personaRows = rows.filter((r) => r?.config && typeof r.config === "object" && r.config.persona_id);

  return { source: "supabase", personas: mergePersonas(personaRows) };
}
