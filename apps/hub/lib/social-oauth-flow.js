import { createHash } from "node:crypto";
import { insertSupabaseRecord, updateSupabaseRecord } from "@com-moon/supabase-rest";

const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;
const PROVIDERS = new Set(["instagram_api", "meta_threads"]);

function isValidFlow(state) {
  return state && PROVIDERS.has(state.provider) &&
    typeof state.workspaceId === "string" && state.workspaceId.length > 0 &&
    typeof state.nonce === "string" && /^[A-Za-z0-9_-]{43}$/.test(state.nonce) &&
    Number.isSafeInteger(state.iat) &&
    state.iat <= Date.now() && Date.now() - state.iat <= OAUTH_STATE_MAX_AGE_MS;
}

function hashNonce(nonce) {
  return createHash("sha256").update(nonce).digest("hex");
}

export async function registerSocialOAuthFlow(state) {
  if (!isValidFlow(state)) return false;
  const result = await insertSupabaseRecord("social_oauth_flows", {
    nonce_hash: hashNonce(state.nonce),
    workspace_id: state.workspaceId,
    provider: state.provider,
    expires_at: new Date(state.iat + OAUTH_STATE_MAX_AGE_MS).toISOString(),
  });
  return result.persisted === true;
}

export async function consumeSocialOAuthFlow(state) {
  if (!isValidFlow(state)) return false;
  const result = await updateSupabaseRecord("social_oauth_flows", [
    ["nonce_hash", `eq.${hashNonce(state.nonce)}`],
    ["workspace_id", `eq.${state.workspaceId}`],
    ["provider", `eq.${state.provider}`],
    ["consumed_at", "is.null"],
    ["expires_at", `gt.${new Date().toISOString()}`],
  ], { consumed_at: new Date().toISOString() }, {
    returnRepresentation: true,
    select: "nonce_hash",
  });
  return result.persisted === true && result.record?.nonce_hash === hashNonce(state.nonce);
}
