const DAY_MS = 24 * 60 * 60 * 1000;

/** Pure metadata check; never contacts a provider or refreshes credentials. */
export function getMetaTokenStatus(connection, now = Date.now()) {
  if (!connection?.hasAccessToken) return "reauthorization-required";
  const expiry = Date.parse(connection.expiresAt);
  if (!Number.isFinite(expiry)) return "expiry-unknown";
  if (expiry <= now) return "reauthorization-required";
  return expiry <= now + 7 * DAY_MS ? "refresh-required" : "connected";
}

export function isRefreshGrantExpiringSoon(expiresAt, now = Date.now()) {
  const expiry = Date.parse(expiresAt);
  return Number.isFinite(expiry) && expiry > now && expiry <= now + 7 * DAY_MS;
}

/** Only stable codes escape. Provider descriptions, URLs and bodies are private. */
export async function socialTokenFailure(response, provider, operation) {
  const payload = await response.json().catch(() => null);
  const error = payload?.error;
  let reason = "failed";
  if (response.status === 429 || response.status >= 500 || error === "temporarily_unavailable" || error?.is_transient) {
    reason = "retryable";
  } else if (error === "invalid_grant" || Number(error?.code) === 190) {
    reason = "reauthorization-required";
  } else if (["invalid_client", "unauthorized_client"].includes(error)) {
    reason = "client-config-error";
  } else if (["admin_policy_enforced", "access_denied"].includes(error) || [10, 200].includes(Number(error?.code))) {
    reason = "permission-required";
  }
  return new Error(`${provider}-${operation}-${reason}`);
}

export async function fetchSocialToken(url, options, provider, operation) {
  let response;
  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
  } catch {
    throw new Error(`${provider}-${operation}-retryable`);
  }
  if (!response.ok) throw await socialTokenFailure(response, provider, operation);
  try { return await response.json(); }
  catch { throw new Error(`${provider}-${operation}-invalid-response`); }
}

export function safeSocialCallbackError(error, provider) {
  const message = error instanceof Error ? error.message : "";
  const allowed = new Set([
    ...["token-exchange", "long-lived-token-exchange", "token-refresh"].flatMap(op =>
      ["failed", "retryable", "reauthorization-required", "client-config-error", "permission-required", "invalid-response"].map(reason => `${provider}-${op}-${reason}`)),
    "social-account-mismatch", "social-account-brand-mismatch", "social-account-app-mismatch",
    "social-account-read-failed", "connection-not-persisted",
  ]);
  return allowed.has(message) ? message : `${provider}-connect-failed`;
}
