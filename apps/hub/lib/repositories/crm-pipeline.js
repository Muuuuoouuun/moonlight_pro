// Read-through repository for the classin_home CRM snapshot (Sales OS v1.4, P0a).
//
// Read-only projection — moonlight never writes here. classin_home pushes rows via the
// Engine webhook intake (P0b, not yet built); this repo only reads what's already landed.
// See docs/sales-os-crm-integration-plan.md §2-4 for the integration decision (push snapshot)
// and §3.1 for the classin_crm_snapshot table shape.
//
// Table doesn't exist yet (pre-migration) — fetchSupabaseRows degrades to null on a missing
// table exactly like every other repository here, so this is safe to wire in before P0b lands.
//
// KNOWN GAP (blocks P1, not P0a): moonlight's local `deals.id` has no stored reference to
// classin_home's Xiaoshouyi deal id. Until the sheets-sync deal shape carries that external id,
// passing `dealId: deal.id` here will simply never match a snapshot row — which degrades to the
// same honest `null` this function already returns for "no snapshot yet". Resolving the join key
// is P1 scope (classin_home push producer + moonlight deals schema), not this file's job.

import { eqFilter, fetchSupabaseRows } from "@/lib/server-read";

// One deal's realized CRM facts, or null when no snapshot row matches (table missing, no
// config, or no push received yet for this deal).
export async function getCrmPipeline({ ownerId, dealId } = {}) {
  if (!ownerId || !dealId) return null;

  const rows = await fetchSupabaseRows("classin_crm_snapshot", {
    limit: 1,
    filters: [
      ["owner_id", eqFilter(ownerId)],
      ["external_deal_id", eqFilter(dealId)],
    ],
  });
  if (!rows || !rows.length) return null;

  const row = rows[0];
  return {
    stage: row.stage ?? null,
    amount: Number.isFinite(row.amount) ? Number(row.amount) : null,
    paymentStatus: row.payment_status ?? null,
    lastContactAt: row.last_contact_at ?? null,
    syncedAt: row.synced_at ?? null,
  };
}
