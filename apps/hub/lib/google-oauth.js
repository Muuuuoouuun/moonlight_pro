// Shared Google OAuth helpers (raw `fetch`, no `googleapis` SDK).
//
// Generic counterpart to the inline OAuth logic in `google-gmail.js`. New
// integrations (Sheets, etc.) build on this so the token-exchange / refresh /
// signed-state apparatus lives in one place. `google-gmail.js` is intentionally
// left untouched; a future refactor can fold it onto these helpers.

import { createHmac, timingSafeEqual } from "crypto";

import { resolveOAuthStateSecret } from "@/lib/integration-readiness";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

export function resolveGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret };
}

export function hasOAuthStateSecret() {
  return Boolean(resolveOAuthStateSecret());
}

function signStatePayload(payload) {
  const secret = resolveOAuthStateSecret();

  if (!secret) {
    return "";
  }

  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEquals(a, b) {
  const aBuffer = Buffer.from(String(a || ""));
  const bBuffer = Buffer.from(String(b || ""));

  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

export function encodeState(value) {
  const payload = Buffer.from(
    JSON.stringify({ ...value, iat: Date.now() }),
    "utf8",
  ).toString("base64url");
  const signature = signStatePayload(payload);

  return signature ? `${payload}.${signature}` : payload;
}

export function decodeState(value) {
  if (!value) {
    return {};
  }

  try {
    const raw = String(value);
    const [payload, signature] = raw.split(".");
    const expected = signStatePayload(payload);

    if (!expected || !signature || !safeEquals(expected, signature)) {
      return { invalid: true };
    }

    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { invalid: true };
  }
}

export function sanitizeReturnPath(value, fallback) {
  const path = typeof value === "string" ? value.trim() : "";

  if (!path || !path.startsWith("/") || path.startsWith("//")) {
    return fallback;
  }

  return path;
}

export function buildGoogleAuthUrl({ scopes, redirectUri, state, prompt = "consent" }) {
  const oauth = resolveGoogleOAuthConfig();

  if (!oauth || !hasOAuthStateSecret()) {
    return null;
  }

  const params = new URLSearchParams({
    client_id: oauth.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt,
    scope: (scopes || []).join(" "),
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

async function exchangeGoogleToken(params) {
  const oauth = resolveGoogleOAuthConfig();

  if (!oauth) {
    return null;
  }

  const body = new URLSearchParams({
    client_id: oauth.clientId,
    client_secret: oauth.clientSecret,
    ...params,
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Google token exchange failed with ${response.status}`);
  }

  return await response.json();
}

export async function exchangeGoogleCode({ code, redirectUri }) {
  return exchangeGoogleToken({
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
}

export async function refreshGoogleAccessToken(refreshToken) {
  if (!refreshToken) {
    return null;
  }

  return exchangeGoogleToken({
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
}

export async function fetchGoogleUserEmail(accessToken) {
  if (!accessToken) {
    return null;
  }

  try {
    const response = await fetch(GOOGLE_USERINFO_URL, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    return typeof payload?.email === "string" ? payload.email.trim() || null : null;
  } catch {
    return null;
  }
}
