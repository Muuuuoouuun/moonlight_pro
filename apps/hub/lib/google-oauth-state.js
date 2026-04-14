import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const DEFAULT_STATE_TTL_SECONDS = 10 * 60;

export function resolveGoogleOAuthStateSecret() {
  return (
    process.env.COM_MOON_OAUTH_STATE_SECRET?.trim() ||
    process.env.GOOGLE_CLIENT_SECRET?.trim() ||
    null
  );
}

export function getGoogleOAuthNonceCookieName(provider) {
  return `com_moon_${provider}_oauth_nonce`;
}

export function normalizeGoogleReturnPath(value, fallback) {
  const safeFallback = typeof fallback === "string" && fallback.startsWith("/") ? fallback : "/";
  const candidate = typeof value === "string" ? value.trim() : "";

  if (!candidate) {
    return safeFallback;
  }

  if (/^(?:[a-zA-Z][a-zA-Z\d+\-.]*:|\/\/)/.test(candidate)) {
    return safeFallback;
  }

  if (!candidate.startsWith("/")) {
    return safeFallback;
  }

  try {
    const parsed = new URL(candidate, "http://oauth-state.local");
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || safeFallback;
  } catch {
    return safeFallback;
  }
}

export function createGoogleOAuthStateToken({
  provider,
  data = {},
  ttlSeconds = DEFAULT_STATE_TTL_SECONDS,
} = {}) {
  const secret = resolveGoogleOAuthStateSecret();

  if (!provider || !secret) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString("base64url");
  const payload = {
    provider,
    nonce,
    iat: now,
    exp: now + ttlSeconds,
    data,
  };
  const payloadPart = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(payloadPart).digest("base64url");

  return {
    nonce,
    token: `${payloadPart}.${signature}`,
  };
}

export function decodeGoogleOAuthStateToken({ provider, token } = {}) {
  const secret = resolveGoogleOAuthStateSecret();

  if (!provider || !secret || !token || typeof token !== "string") {
    return null;
  }

  const [payloadPart, signaturePart, ...extra] = token.split(".");

  if (!payloadPart || !signaturePart || extra.length > 0) {
    return null;
  }

  try {
    const expected = Buffer.from(createHmac("sha256", secret).update(payloadPart).digest());
    const received = Buffer.from(signaturePart, "base64url");

    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));

    if (!payload || payload.provider !== provider) {
      return null;
    }

    if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
