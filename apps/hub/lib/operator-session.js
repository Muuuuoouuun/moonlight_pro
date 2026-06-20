import { createHmac, timingSafeEqual } from "crypto";

export const OPERATOR_SESSION_COOKIE = "com_moon_operator_session";
const DEFAULT_TTL_SECONDS = 12 * 60 * 60;

function resolveSessionSecret() {
  return (
    process.env.COM_MOON_OPERATOR_SESSION_SECRET?.trim() ||
    process.env.COM_MOON_HUB_WRITE_SECRET?.trim() ||
    process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim() ||
    ""
  );
}

function safeEquals(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && timingSafeEqual(left, right);
}

function sign(payload) {
  const secret = resolveSessionSecret();
  if (!secret) return "";
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createOperatorSessionToken({
  subject = "operator",
  ttlSeconds = DEFAULT_TTL_SECONDS,
  now = Date.now(),
} = {}) {
  const exp = now + Math.max(1, Number(ttlSeconds) || DEFAULT_TTL_SECONDS) * 1000;
  const payload = Buffer.from(JSON.stringify({ sub: subject, iat: now, exp }), "utf8").toString("base64url");
  const signature = sign(payload);
  return signature ? `${payload}.${signature}` : "";
}

export function verifyOperatorSessionToken(token, { now = Date.now() } = {}) {
  if (!token) return { ok: false, reason: "missing" };
  const raw = String(token);
  const [payload, signature] = raw.split(".");
  const expected = sign(payload);
  if (!payload || !signature || !expected || !safeEquals(expected, signature)) {
    return { ok: false, reason: "invalid-signature" };
  }

  try {
    const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!body?.exp || Number(body.exp) <= now) {
      return { ok: false, reason: "expired" };
    }
    return { ok: true, reason: "ok", session: body };
  } catch {
    return { ok: false, reason: "invalid-payload" };
  }
}

function cookieValue(header, name) {
  const cookies = String(header || "").split(";");
  for (const cookie of cookies) {
    const [rawKey, ...rest] = cookie.trim().split("=");
    if (rawKey === name) return rest.join("=");
  }
  return "";
}

export function verifyOperatorSessionRequest(req) {
  const token = cookieValue(req.headers.get("cookie"), OPERATOR_SESSION_COOKIE);
  return verifyOperatorSessionToken(token);
}

function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

export function operatorSessionCookieOptions({ maxAge = DEFAULT_TTL_SECONDS } = {}) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isProductionRuntime(),
    path: "/",
    maxAge,
  };
}

export function hasOperatorSessionSecret() {
  return Boolean(resolveSessionSecret());
}

export function operatorLoginSecretMatches(candidate) {
  const expected = process.env.COM_MOON_HUB_WRITE_SECRET?.trim() || "";
  return Boolean(expected && candidate && safeEquals(expected, candidate));
}
