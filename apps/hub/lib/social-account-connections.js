import {
  fetchSupabaseRowsDetailed,
  upsertSupabaseRecords,
} from "@com-moon/supabase-rest";
import { resolveMetaOAuthAppFromState } from "./meta-oauth-apps.js";

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

export async function listSocialAccountConnections(provider, workspaceId, accountId = "", offset = 0) {
  if (!workspaceId) return { connections: [], available: false };
  const filters = [
    ["workspace_id", `eq.${workspaceId}`],
    ["provider", `eq.${provider}`],
  ];
  if (accountId) filters.push(["account_key", `eq.${accountId}`]);
  const result = await fetchSupabaseRowsDetailed("integration_connections", {
    filters,
    order: "created_at.desc,id.desc",
    limit: accountId ? 1 : 100,
    offset,
    strictRows: true,
  });
  return {
    connections: result.rows || [],
    available: result.configured && !result.error,
  };
}

export async function resolveExpectedSocialAccountId({ provider, workspaceId, handle, brandKey = null, accountId = null, app = null }) {
  const expectedHandle = typeof handle === "string" ? handle.trim().replace(/^@+/, "").toLowerCase() : "";
  if (!/^[a-z0-9._]{1,30}$/.test(expectedHandle) ||
    (accountId != null && !/^[A-Za-z0-9_-]{1,128}$/.test(accountId))) {
    throw new Error("social-account-mismatch");
  }
  const metaProvider = provider === "instagram_api" || provider === "meta_threads";
  if (metaProvider && (!app?.configured || app.brandHandle !== expectedHandle ||
    app.brandKey !== (brandKey || "bridgemaker") ||
    !resolveMetaOAuthAppFromState({ ...app, provider }))) {
    throw new Error("social-account-app-invalid");
  }
  const expectedBrandKey = metaProvider ? app.brandKey : brandKey;
  const matches = [];
  for (let offset = 0; ; offset += 100) {
    const { connections, available } = await listSocialAccountConnections(provider, workspaceId, "", offset);
    if (!available) throw new Error("social-account-read-failed");
    for (const row of connections) {
      if (row.config?.username?.trim().replace(/^@+/, "").toLowerCase() !== expectedHandle) continue;
      if (row.config?.brandHandle &&
        row.config.brandHandle.trim().replace(/^@+/, "").toLowerCase() !== expectedHandle) {
        throw new Error("social-account-mismatch");
      }
      if (expectedBrandKey && row.config?.brandKey && row.config.brandKey !== expectedBrandKey) {
        throw new Error("social-account-brand-mismatch");
      }
      if (metaProvider) {
        // Meta account IDs can differ between apps. Only the signing app's ID
        // may constrain the next authorization; other app rows remain intact.
        const sameApp = row.config?.oauthAppId === app.appId && row.config?.oauthAppKey === app.appKey;
        const legacyBridge = app.brandKey === "bridgemaker" && app.appKey === "moonlight" &&
          !row.config?.oauthAppId && !row.config?.oauthAppKey;
        if (!sameApp && !legacyBridge) continue;
      }
      matches.push(row);
    }
    if (matches.length > 1) throw new Error("social-account-ambiguous");
    if (connections.length < 100) break;
  }
  const match = matches[0] || null;
  if (accountId != null && (!match || match.account_key !== accountId)) {
    throw new Error("social-account-mismatch");
  }
  if (match && !/^[A-Za-z0-9_-]{1,128}$/.test(match.account_key)) {
    throw new Error("social-account-mismatch");
  }
  return match?.account_key || null;
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
  const previous = await listSocialAccountConnections(provider, workspaceId, accountId);
  if (!previous.available) throw new Error("social-account-read-failed");
  const previousBrandKey = previous.connections[0]?.config?.brandKey || null;
  const previousAppId = previous.connections[0]?.config?.oauthAppId || null;
  const previousAppKey = previous.connections[0]?.config?.oauthAppKey || null;
  if (storedConfig.brandKey != null && previousBrandKey && storedConfig.brandKey !== previousBrandKey) {
    throw new Error("social-account-brand-mismatch");
  }
  if (["instagram_api", "meta_threads"].includes(provider) &&
    ((previousAppId && storedConfig.oauthAppId && storedConfig.oauthAppId !== previousAppId) ||
      (previousAppKey && storedConfig.oauthAppKey && storedConfig.oauthAppKey !== previousAppKey))) {
    throw new Error("social-account-app-mismatch");
  }
  storedConfig = {
    ...storedConfig,
    brandKey: storedConfig.brandKey || previousBrandKey,
    ...(["instagram_api", "meta_threads"].includes(provider) ? {
      oauthAppId: storedConfig.oauthAppId || previousAppId,
      oauthAppKey: storedConfig.oauthAppKey || previousAppKey,
    } : {}),
  };
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
