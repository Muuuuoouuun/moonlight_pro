import { createHmac, randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "node:util";

export const OPERATOR_SESSION_COOKIE = "com_moon_operator_session";
const DEFAULT_TTL_SECONDS = 12 * 60 * 60;
const derivePassword = promisify(scrypt);
const SCRYPT_OPTIONS = { N: 1 << 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const PASSWORD_HASH_PATTERN = /^scrypt\$131072\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/;

function resolveSessionSecret() {
  return process.env.COM_MOON_OPERATOR_SESSION_SECRET?.trim() || "";
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

function configuredPasswordHash() {
  return PASSWORD_HASH_PATTERN.exec(process.env.COM_MOON_OPERATOR_PASSWORD_HASH?.trim() || "");
}

export function hasOperatorLoginCredentials() {
  const username = process.env.COM_MOON_OPERATOR_USERNAME?.trim() || "";
  return Boolean(username && username.length <= 128 && configuredPasswordHash());
}

export async function operatorLoginCredentialsMatch(username, password) {
  const configuredUsername = process.env.COM_MOON_OPERATOR_USERNAME?.trim() || "";
  const match = configuredPasswordHash();
  if (!configuredUsername || !match || typeof username !== "string" || typeof password !== "string") return false;
  if (Buffer.byteLength(username, "utf8") > 128 || Buffer.byteLength(password, "utf8") > 1024) return false;

  const [, saltHex, hashHex] = match;
  const actual = await derivePassword(password, Buffer.from(saltHex, "hex"), 64, SCRYPT_OPTIONS);
  const expected = Buffer.from(hashHex, "hex");
  const passwordMatches = timingSafeEqual(actual, expected);
  const usernameMatches = safeEquals(configuredUsername, username.trim());
  return usernameMatches && passwordMatches;
}

export async function createOperatorPasswordHash(password) {
  if (typeof password !== "string" || !password || Buffer.byteLength(password, "utf8") > 1024) {
    throw new TypeError("Password must be 1–1024 UTF-8 bytes.");
  }
  const salt = randomBytes(16);
  const hash = await derivePassword(password, salt, 64, SCRYPT_OPTIONS);
  return `scrypt$131072$8$1$${salt.toString("hex")}$${hash.toString("hex")}`;
}
