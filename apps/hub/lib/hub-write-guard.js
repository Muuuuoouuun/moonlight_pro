import { timingSafeEqual } from "crypto";

import { NextResponse } from "next/server.js";
import { hasOperatorLoginCredentials, hasOperatorSessionSecret, verifyOperatorSessionRequest } from "./operator-session.js";

export const HUB_WRITE_SECRET_HEADER = "x-com-moon-hub-write-secret";
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

function isLoopbackOrigin(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function areEquivalentLoopbackOrigins(left, right) {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    const resolvePort = (url) => url.port || (url.protocol === "https:" ? "443" : "80");

    return (
      isLoopbackOrigin(leftUrl.origin) &&
      isLoopbackOrigin(rightUrl.origin) &&
      leftUrl.protocol === rightUrl.protocol &&
      resolvePort(leftUrl) === resolvePort(rightUrl)
    );
  } catch {
    return false;
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

// Server callers use the same credential at the route gate and the write guard.
// This deliberately excludes the browser Origin/Referer fallback.
export function hasHubServerCredential(req) {
  return isHubWriteAllowedBySecret(req, resolveHubWriteSecret());
}

export function assertHubWriteAllowed(req) {
  const expectedSecret = resolveHubWriteSecret();

  if (isHubWriteAllowedBySecret(req, expectedSecret)) {
    return null;
  }

  const requestOrigin = resolveRequestOrigin(req);
  const expectedOrigins = resolveExpectedOrigins(req);
  const sameOrigin = Boolean(requestOrigin && expectedOrigins.has(requestOrigin));
  const equivalentLoopback = Boolean(
    requestOrigin && areEquivalentLoopbackOrigins(requestOrigin, req.url),
  );
  const authenticatedProductionBrowser = Boolean(
    isProductionRuntime() &&
    hasOperatorSessionSecret() &&
    hasOperatorLoginCredentials() &&
    requestOrigin &&
    requestOrigin === normalizeOrigin(req.url) &&
    verifyOperatorSessionRequest(req).ok
  );

  if (
    authenticatedProductionBrowser ||
    (!isProductionRuntime() && (sameOrigin || equivalentLoopback))
  ) {
    return null;
  }

  // 브라우저 쓰기는 인증된 세션과 정확한 same-origin 요청만 통과한다.
  // Origin/Referer가 없으면 서버 호출로 간주하고 서버용 시크릿을 요구한다.
  const fromBrowser = Boolean(requestOrigin);

  return NextResponse.json(
    {
      status: "forbidden",
      error: fromBrowser
        ? "로그인 후 다시 시도하세요."
        : "Hub 쓰기에는 유효한 Hub write secret이 필요합니다.",
    },
    { status: expectedSecret ? 401 : 403 },
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

  const byteLength = Buffer.byteLength(text, "utf8");
  if (byteLength > maxBytes) {
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
      byteLength,
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
