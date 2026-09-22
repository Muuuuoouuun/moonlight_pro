const GOOGLE_PROVIDERS = [
  ["calendar", "Calendar"],
  ["gmail", "Gmail"],
  ["sheets", "Sheets"],
];

export function summarizeGoogleOAuthProviders(health = {}) {
  const providers = health?.integrations?.googleOAuth || {};

  return GOOGLE_PROVIDERS.map(([key, provider]) => {
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
