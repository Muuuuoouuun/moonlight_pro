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

export function classifyWorkspaceGoogleMcp({ serverStatus, toolCount = 0, probeResult } = {}) {
  if (serverStatus !== "ok") {
    return {
      level: "WARN",
      detail: `process ${serverStatus || "unknown"}; provider not probed`,
    };
  }

  const errorText = typeof probeResult?.error === "string" ? probeResult.error : "";
  if (/authentication required/i.test(errorText)) {
    return {
      level: "INFO",
      detail: `process ok; ${toolCount} tools; provider authentication required`,
    };
  }

  const calendars = Array.isArray(probeResult)
    ? probeResult
    : Array.isArray(probeResult?.calendars)
      ? probeResult.calendars
      : null;

  if (calendars) {
    return {
      level: "PASS",
      detail: `authenticated provider read; ${toolCount} tools; ${calendars.length} calendars`,
    };
  }

  return {
    level: "WARN",
    detail: `process ok; ${toolCount} tools; provider probe failed`,
  };
}
