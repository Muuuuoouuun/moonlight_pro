const GOOGLE_PROVIDER_DEFINITIONS = {
  calendar: {
    callbackPath: "/api/calendar/google/callback",
    scopes: ["https://www.googleapis.com/auth/calendar.events"],
  },
  gmail: {
    callbackPath: "/api/email/gmail/callback",
    scopes: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
  },
  sheets: {
    callbackPath: "/api/integrations/sheets/callback",
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
  },
};

function present(value) {
  return Boolean(typeof value === "string" ? value.trim() : value);
}

export function resolveOAuthStateSecret(env = process.env) {
  return String(env.COM_MOON_OAUTH_STATE_SECRET || "").trim();
}

function enabledGoogleProviders(env) {
  return new Set(
    String(env.GOOGLE_OAUTH_ENABLED_PROVIDERS || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isGoogleOAuthProviderEnabled(provider, env = process.env) {
  return enabledGoogleProviders(env).has(String(provider || "").trim().toLowerCase());
}

export function resolveGoogleOAuthProviderReadiness(env = process.env) {
  const hasClient = present(env.GOOGLE_CLIENT_ID) && present(env.GOOGLE_CLIENT_SECRET);
  const enabled = enabledGoogleProviders(env);

  return Object.fromEntries(
    Object.entries(GOOGLE_PROVIDER_DEFINITIONS).map(([provider, definition]) => {
      const providerEnabled = enabled.has(provider);
      const configured = hasClient && providerEnabled;
      const reason = !hasClient
        ? "missing-oauth-client"
        : providerEnabled
          ? "ok"
          : "provider-not-enabled";

      return [
        provider,
        {
          configured,
          enabled: providerEnabled,
          reason,
          callbackPath: definition.callbackPath,
          scopes: definition.scopes,
        },
      ];
    }),
  );
}

export function resolveSecretReadiness(env = process.env) {
  const values = {
    oauthState: String(env.COM_MOON_OAUTH_STATE_SECRET || "").trim(),
    sharedWebhook: String(env.COM_MOON_SHARED_WEBHOOK_SECRET || "").trim(),
    hubWrite: String(env.COM_MOON_HUB_WRITE_SECRET || "").trim(),
    openclawSync: String(env.OPENCLAW_SYNC_SECRET || "").trim(),
  };
  const names = Object.keys(values);
  const coupled = [];

  for (let leftIndex = 0; leftIndex < names.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < names.length; rightIndex += 1) {
      const left = names[leftIndex];
      const right = names[rightIndex];

      if (values[left] && values[left] === values[right]) {
        coupled.push(`${left}:${right}`);
      }
    }
  }

  return {
    oauthState: { configured: Boolean(values.oauthState) },
    sharedWebhook: { configured: Boolean(values.sharedWebhook) },
    hubWrite: { configured: Boolean(values.hubWrite) },
    openclawSync: { configured: Boolean(values.openclawSync) },
    separated: coupled.length === 0,
    coupled,
  };
}

function endpointState({ configured, reachable, reason }) {
  return {
    configured,
    reachable,
    status: !configured ? "disabled" : reachable ? "live" : "degraded",
    reason,
  };
}

async function probeJson(url, { timeoutMs, fetchImpl }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    const ok = response.ok && payload?.status === "ok";

    return {
      reachable: ok,
      reason: ok ? "ok" : `http-${response.status}`,
    };
  } catch (error) {
    return {
      reachable: false,
      reason: error?.name === "AbortError" ? "timeout" : "request-failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function healthUrl(base, path) {
  const url = new URL(base);
  url.pathname = path;
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function resolveEndpoint(url, path, options) {
  const configured = present(url);

  if (!configured) {
    return endpointState({ configured: false, reachable: false, reason: "missing-url" });
  }

  try {
    const probe = await probeJson(healthUrl(url, path), options);
    return endpointState({ configured: true, ...probe });
  } catch {
    return endpointState({ configured: true, reachable: false, reason: "invalid-url" });
  }
}

export async function resolveControlPlaneReadiness(env = process.env, options = {}) {
  const probeOptions = {
    timeoutMs: options.timeoutMs ?? 1500,
    fetchImpl: options.fetchImpl || fetch,
  };
  const [engine, openclawRelay] = await Promise.all([
    resolveEndpoint(env.COM_MOON_ENGINE_URL, "/api/health", probeOptions),
    resolveEndpoint(env.OPENCLAW_LOCAL_URL, "/health", probeOptions),
  ]);

  return {
    engine,
    openclawRelay,
  };
}
