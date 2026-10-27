const GOOGLE_PROVIDERS = [
  ["calendar", "Calendar"],
  ["gmail", "Gmail"],
  ["sheets", "Sheets"],
];

export function healthRequestOptions(app, env) {
  const secret = String(app === "hub" ? env.COM_MOON_HUB_WRITE_SECRET || "" : env.COM_MOON_SHARED_WEBHOOK_SECRET || "").trim();
  const header = app === "hub" ? "x-com-moon-hub-write-secret" : "x-com-moon-shared-secret";
  // Custom credential headers must never follow a redirect to another endpoint.
  return { headers: secret ? { [header]: secret } : {}, redirect: "error" };
}

export function healthSupabaseOk(data) {
  const supabase = data?.database?.supabase;
  if (!supabase || typeof supabase !== "object") return false;
  if ("reachable" in supabase) return Boolean(supabase.reachable);
  if ("ok" in supabase) return Boolean(supabase.ok);
  return false;
}

export function summarizeGoogleOAuthProviders(health = {}) {
  const providers = health?.integrations?.googleOAuth;

  return GOOGLE_PROVIDERS.map(([key, provider]) => {
    if (!providers) return { provider, level: "INFO", detail: "not checked (server credential required)" };
    const state = providers[key] || {};

    if (state.enabled && state.configured) {
      return { provider, level: "PASS", detail: "enabled/configured" };
    }

    if (state.enabled) {
      return {
        provider,
        level: "WARN",
        detail: `enabled/not-configured (${state.reason || "unknown"})`,
      };
    }

    return {
      provider,
      level: "INFO",
      detail: `disabled (${state.reason || "not-enabled"})`,
    };
  });
}
