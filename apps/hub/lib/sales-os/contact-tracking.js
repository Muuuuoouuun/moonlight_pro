// Workspace-level cutover for contact/follow-up tracking.
//
// Existing CRM imports can be years old. Once a cutover is configured, only
// leads/deals registered on or after that instant participate in overdue alerts,
// and only outcomes recorded after it participate in contact counts.

import { eqFilter, fetchSupabaseRows } from "../server-read.js";

export const CONTACT_TRACKING_META_KEY = "contact_tracking_started_at";

export function normalizeContactTrackingStartedAt(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function contactTrackingStartedAtFromWorkspace(workspace) {
  const meta = workspace?.meta && typeof workspace.meta === "object" ? workspace.meta : {};
  return normalizeContactTrackingStartedAt(meta[CONTACT_TRACKING_META_KEY]);
}

export function isContactTrackingEligible(record, startedAt) {
  const cutover = normalizeContactTrackingStartedAt(startedAt);
  if (!cutover) return true;

  const createdAt = new Date(record?.created_at || "").getTime();
  if (!Number.isFinite(createdAt)) return false;

  return createdAt >= new Date(cutover).getTime();
}

export function isContactOutcomeEligible(outcome, scope) {
  if (!scope) return true;
  if (outcome?.lead_id && scope.leadIds.has(outcome.lead_id)) return true;
  if (outcome?.deal_id && scope.dealIds.has(outcome.deal_id)) return true;
  return false;
}

export async function getContactTrackingStartedAt(workspaceId) {
  if (!workspaceId) return null;

  const rows = await fetchSupabaseRows("workspaces", {
    select: "id,meta",
    filters: [["id", eqFilter(workspaceId)]],
    limit: 1,
  });

  return contactTrackingStartedAtFromWorkspace(Array.isArray(rows) ? rows[0] : null);
}

export async function getContactTrackingScope(workspaceId, startedAt) {
  const cutover = normalizeContactTrackingStartedAt(startedAt);
  if (!workspaceId || !cutover) return null;

  const filters = [
    ["workspace_id", eqFilter(workspaceId)],
    ["created_at", `gte.${cutover}`],
  ];
  const [leads, deals] = await Promise.all([
    fetchSupabaseRows("leads", { select: "id", filters, limit: 1000 }),
    fetchSupabaseRows("deals", { select: "id", filters, limit: 1000 }),
  ]);

  return {
    leadIds: new Set((leads || []).map((row) => row.id)),
    dealIds: new Set((deals || []).map((row) => row.id)),
  };
}
