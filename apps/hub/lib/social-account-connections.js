import {
  fetchSupabaseRowsDetailed,
  upsertSupabaseRecords,
} from "@com-moon/supabase-rest";

const CONFLICT_KEY = "workspace_id,provider,account_key";

export function isValidSocialBrandKey(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value);
}

export async function resolveSocialBrandKey(workspaceId, brandKey) {
  if (brandKey == null || brandKey === "") return null;
  if (!workspaceId || !isValidSocialBrandKey(brandKey)) {
    throw new Error("social-brand-invalid");
  }
  const result = await fetchSupabaseRowsDetailed("brands", {
    select: "id",
    filters: [["workspace_id", `eq.${workspaceId}`], ["slug", `eq.${brandKey}`]],
    limit: 1,
  });
  if (!result.configured || result.error) throw new Error("social-brand-read-failed");
  if (!result.rows?.[0]?.id) throw new Error("social-brand-not-found");
  return brandKey;
}

export async function listSocialAccountConnections(provider, workspaceId, accountId = "") {
  if (!workspaceId) return { connections: [], available: false };
  const filters = [
    ["workspace_id", `eq.${workspaceId}`],
    ["provider", `eq.${provider}`],
  ];
  if (accountId) filters.push(["account_key", `eq.${accountId}`]);
  const result = await fetchSupabaseRowsDetailed("integration_connections", {
    filters,
    order: "created_at.desc",
    limit: accountId ? 1 : 100,
  });
  return {
    connections: result.rows || [],
    available: result.configured && !result.error,
  };
}

export async function saveSocialAccountConnection({
  workspaceId,
  provider,
  accountId,
  config,
  status = "connected",
}) {
  if (!workspaceId || !provider || !accountId || typeof accountId !== "string") {
    throw new Error("social-account-id-missing");
  }
  let storedConfig = config || {};
  if (storedConfig.brandKey == null) {
    const previous = await listSocialAccountConnections(provider, workspaceId, accountId);
    if (!previous.available) throw new Error("social-account-read-failed");
    storedConfig = {
      ...storedConfig,
      brandKey: previous.connections[0]?.config?.brandKey || null,
    };
  }
  const result = await upsertSupabaseRecords("integration_connections", {
    workspace_id: workspaceId,
    provider,
    account_key: accountId,
    external_account_id: accountId,
    status,
    config: storedConfig,
    last_synced_at: new Date().toISOString(),
  }, {
    onConflict: CONFLICT_KEY,
    returnRepresentation: true,
  });
  if (result.persisted && !result.id) {
    return { ...result, persisted: false, reason: "no-returned-row" };
  }
  return result;
}
