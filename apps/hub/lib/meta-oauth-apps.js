const BRANDS = Object.freeze({
  bridgemaker: { appKey: "moonlight", handle: "ml_bridgemaker" },
  politicofficer: { appKey: "politic_officer", handle: "politic_officer" },
  classmoon: { appKey: "classmoon", handle: "moon.classin" },
});

const PROVIDERS = Object.freeze({
  instagram_api: {
    prefix: "COM_MOON_INSTAGRAM",
    defaultScopes: ["instagram_business_basic", "instagram_business_content_publish"],
  },
  meta_threads: {
    prefix: "COM_MOON_META_THREADS",
    defaultScopes: ["threads_basic", "threads_content_publish"],
  },
});

function normalizeHandle(value) {
  return typeof value === "string" ? value.trim().replace(/^@+/, "").toLowerCase() : "";
}

function scopesFor(provider) {
  const entry = PROVIDERS[provider];
  const scopes = process.env[`${entry.prefix}_SCOPES`]?.split(/[,\s]+/).filter(Boolean);
  return scopes?.length ? scopes : entry.defaultScopes;
}

function appCredentials(provider, appKey) {
  const prefix = PROVIDERS[provider].prefix;
  if (appKey === "moonlight") {
    if (provider === "instagram_api") {
      return {
        appId: process.env.COM_MOON_INSTAGRAM_APP_ID?.trim() || process.env.INSTAGRAM_APP_ID?.trim() || process.env.INSTAGRAM_CLIENT_ID?.trim() || "",
        appSecret: process.env.COM_MOON_INSTAGRAM_APP_SECRET?.trim() || process.env.INSTAGRAM_APP_SECRET?.trim() || process.env.INSTAGRAM_CLIENT_SECRET?.trim() || "",
      };
    }
    return {
      appId: process.env.COM_MOON_META_THREADS_APP_ID?.trim() || process.env.META_THREADS_APP_ID?.trim() || process.env.THREADS_APP_ID?.trim() || "",
      appSecret: process.env.COM_MOON_META_THREADS_APP_SECRET?.trim() || process.env.META_THREADS_APP_SECRET?.trim() || process.env.THREADS_APP_SECRET?.trim() || "",
    };
  }
  const suffix = appKey === "politic_officer" ? "POLITIC_OFFICER" : "CLASSMOON";
  return {
    appId: process.env[`${prefix}_${suffix}_APP_ID`]?.trim() || "",
    appSecret: process.env[`${prefix}_${suffix}_APP_SECRET`]?.trim() || "",
  };
}

export function resolveMetaOAuthApp({ provider, brandKey, brandHandle }) {
  if (!PROVIDERS[provider]) return null;
  const key = brandKey == null ? "bridgemaker" : brandKey;
  const brand = BRANDS[key];
  if (!brand || normalizeHandle(brandHandle) !== brand.handle) return null;
  const credentials = appCredentials(provider, brand.appKey);
  const duplicateAppId = brand.appKey !== "moonlight" && Boolean(credentials.appId) &&
    Object.values(BRANDS).some((other) => other.appKey !== brand.appKey &&
      appCredentials(provider, other.appKey).appId === credentials.appId);
  return {
    ...credentials,
    appKey: brand.appKey,
    brandKey: key,
    brandHandle: brand.handle,
    scopes: scopesFor(provider),
    configured: Boolean(credentials.appId && credentials.appSecret && !duplicateAppId),
    hasAppId: Boolean(credentials.appId),
    hasAppSecret: Boolean(credentials.appSecret),
  };
}

export function resolveMetaOAuthAppFromState(state) {
  if (!state || typeof state.appId !== "string" || !state.appId ||
    typeof state.appKey !== "string" || !state.appKey) return null;
  const app = resolveMetaOAuthApp(state);
  return app?.configured && app.appId === state.appId && app.appKey === state.appKey ? app : null;
}

export function matchesMetaOAuthConnection(row, app, accountId = "") {
  if (!row?.config || !app?.configured ||
    (accountId && row.account_key !== accountId) ||
    normalizeHandle(row.config.username) !== app.brandHandle ||
    normalizeHandle(row.config.brandHandle) !== app.brandHandle) return false;

  const storedBrandKey = row.config.brandKey || null;
  if (app.brandKey === "bridgemaker") {
    if (storedBrandKey && storedBrandKey !== "bridgemaker") return false;
  } else if (storedBrandKey !== app.brandKey) {
    return false;
  }

  if (row.config.oauthAppId || row.config.oauthAppKey) {
    return row.config.oauthAppId === app.appId && row.config.oauthAppKey === app.appKey;
  }
  return app.brandKey === "bridgemaker" && app.appKey === "moonlight";
}

export function isValidMetaOAuthAppIdentity(state) {
  return typeof state?.appId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(state.appId) &&
    typeof state?.appKey === "string" && ["moonlight", "politic_officer", "classmoon"].includes(state.appKey);
}

export function configuredMetaOAuthApps(provider) {
  if (!PROVIDERS[provider]) return [];
  return Object.entries(BRANDS).map(([brandKey, brand]) =>
    resolveMetaOAuthApp({ provider, brandKey, brandHandle: brand.handle }),
  ).filter((app) => app.configured);
}
