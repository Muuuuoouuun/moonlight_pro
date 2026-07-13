import { createHmac, randomBytes, timingSafeEqual, webcrypto } from "crypto";

import { NextResponse } from "next/server.js";

import { classifyWritePersistence } from "./write-response.js";

export const HUB_WRITE_SECRET_HEADER = "x-com-moon-hub-write-secret";
export const HUB_OPERATOR_SESSION_COOKIE = "moonlight_operator_session";
export const HUB_OPERATOR_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_MAX_JSON_BYTES = 64 * 1024;

function normalizeOrigin(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function resolveBearerToken(req) {
  const header = req.headers.get("authorization")?.trim() || "";

  if (!header.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  return header.slice(7).trim() || null;
}

function safeEquals(expected, candidate) {
  const expectedBuffer = Buffer.from(String(expected || ""));
  const candidateBuffer = Buffer.from(String(candidate || ""));

  return (
    expectedBuffer.length === candidateBuffer.length &&
    timingSafeEqual(expectedBuffer, candidateBuffer)
  );
}

function safeSignatureEquals(expected, candidate) {
  if (typeof candidate !== "string" || !/^[A-Za-z0-9_-]+$/.test(candidate)) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, "base64url");
  const candidateBuffer = Buffer.from(candidate, "base64url");
  const comparisonBuffer = Buffer.alloc(expectedBuffer.length);
  candidateBuffer.copy(comparisonBuffer, 0, 0, expectedBuffer.length);

  const signaturesMatch = timingSafeEqual(expectedBuffer, comparisonBuffer);
  return candidateBuffer.length === expectedBuffer.length && signaturesMatch;
}

function resolveNow(now) {
  const value = typeof now === "function" ? now() : now;
  return Number.isFinite(value) ? value : Date.now();
}

function signOperatorSessionPayload(encodedPayload, secret) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

async function signOperatorSessionPayloadWithWebCrypto(encodedPayload, secret) {
  const key = await webcrypto.subtle.importKey(
    "raw",
    Buffer.from(secret, "utf8"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await webcrypto.subtle.sign(
    "HMAC",
    key,
    Buffer.from(encodedPayload, "utf8"),
  );

  return Buffer.from(signature).toString("base64url");
}

function resolveCookie(req, name) {
  const cookieHeader = req.headers.get("cookie") || "";

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const cookieName = part.slice(0, separator).trim();
    if (cookieName !== name) {
      continue;
    }

    const cookieValue = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(cookieValue);
    } catch {
      return null;
    }
  }

  return null;
}

function resolveExpectedOrigins(req) {
  const origins = new Set();
  const requestOrigin = normalizeOrigin(req.url);
  const hubOrigin = normalizeOrigin(process.env.COM_MOON_HUB_URL);
  const appOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL);

  [requestOrigin, hubOrigin, appOrigin].forEach((origin) => {
    if (origin) {
      origins.add(origin);
    }
  });

  return origins;
}

function resolveRequestOrigin(req) {
  const origin = normalizeOrigin(req.headers.get("origin"));
  if (origin) {
    return origin;
  }

  return normalizeOrigin(req.headers.get("referer"));
}

function resolveHubWriteSecret() {
  return process.env.COM_MOON_HUB_WRITE_SECRET?.trim() || "";
}

function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function isHubWriteAllowedBySecret(req, expectedSecret) {
  if (!expectedSecret) {
    return false;
  }

  const candidate =
    req.headers.get(HUB_WRITE_SECRET_HEADER)?.trim() ||
    resolveBearerToken(req) ||
    "";

  return Boolean(candidate) && safeEquals(expectedSecret, candidate);
}

export async function createHubOperatorSession(
  candidateSecret,
  {
    now = Date.now,
    nonce = randomBytes(18).toString("base64url"),
    ttlMs = HUB_OPERATOR_SESSION_TTL_MS,
  } = {},
) {
  const expectedSecret = resolveHubWriteSecret();
  if (
    !expectedSecret ||
    typeof candidateSecret !== "string" ||
    !safeEquals(expectedSecret, candidateSecret.trim())
  ) {
    return null;
  }

  const issuedAt = resolveNow(now);
  const sessionTtlMs = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : HUB_OPERATOR_SESSION_TTL_MS;
  const payload = {
    v: 1,
    exp: issuedAt + sessionTtlMs,
    nonce: String(nonce),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = await signOperatorSessionPayloadWithWebCrypto(encodedPayload, expectedSecret);

  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt: payload.exp,
  };
}

export function verifyHubOperatorSessionToken(token, { now = Date.now } = {}) {
  const expectedSecret = resolveHubWriteSecret();
  if (!expectedSecret || typeof token !== "string") {
    return false;
  }

  const tokenParts = token.split(".");
  if (tokenParts.length !== 2) {
    return false;
  }

  const [encodedPayload, candidateSignature] = tokenParts;
  const expectedSignature = signOperatorSessionPayload(encodedPayload, expectedSecret);
  if (!safeSignatureEquals(expectedSignature, candidateSignature)) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    const checkedAt = resolveNow(now);

    return (
      payload?.v === 1 &&
      Number.isFinite(payload?.exp) &&
      payload.exp > checkedAt &&
      typeof payload?.nonce === "string" &&
      payload.nonce.length > 0
    );
  } catch {
    return false;
  }
}

export function hasValidHubOperatorSession(req, options) {
  const token = resolveCookie(req, HUB_OPERATOR_SESSION_COOKIE);
  return Boolean(token) && verifyHubOperatorSessionToken(token, options);
}

export function assertHubWriteAllowed(req, options) {
  const expectedSecret = resolveHubWriteSecret();

  if (isHubWriteAllowedBySecret(req, expectedSecret)) {
    return null;
  }

  if (hasValidHubOperatorSession(req, options)) {
    return null;
  }

  if (!isProductionRuntime()) {
    const requestOrigin = resolveRequestOrigin(req);
    const expectedOrigins = resolveExpectedOrigins(req);

    if (requestOrigin && expectedOrigins.has(requestOrigin)) {
      return null;
    }
  }

  if (!expectedSecret) {
    const classification = classifyWritePersistence({
      persisted: false,
      reason: "write-secret-not-configured",
    });

    return NextResponse.json(
      {
        ...classification,
        error: "Hub write secret is not configured.",
      },
      { status: classification.httpStatus },
    );
  }

  const classification = classifyWritePersistence({
    persisted: false,
    reason: "unauthorized",
  });

  return NextResponse.json(
    {
      ...classification,
      error: "Hub write routes require a valid Hub write secret.",
    },
    { status: classification.httpStatus },
  );
}

export async function readHubWriteJson(req, { maxBytes = DEFAULT_MAX_JSON_BYTES } = {}) {
  const contentLength = Number.parseInt(req.headers.get("content-length") || "0", 10);

  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return {
      error: NextResponse.json(
        {
          status: "payload-too-large",
          error: `JSON payload must be ${maxBytes} bytes or smaller.`,
        },
        { status: 413 },
      ),
    };
  }

  const text = await req.text();

  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    return {
      error: NextResponse.json(
        {
          status: "payload-too-large",
          error: `JSON payload must be ${maxBytes} bytes or smaller.`,
        },
        { status: 413 },
      ),
    };
  }

  try {
    return {
      data: text ? JSON.parse(text) : {},
    };
  } catch {
    return {
      error: NextResponse.json(
        {
          status: "invalid-json",
          error: "Request body must be valid JSON.",
        },
        { status: 400 },
      ),
    };
  }
}
