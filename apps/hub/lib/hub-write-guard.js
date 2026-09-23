import { timingSafeEqual } from "crypto";

import { NextResponse } from "next/server.js";

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

  if (
    (sameOrigin && (!isProductionRuntime() || isLoopbackOrigin(requestOrigin))) ||
    equivalentLoopback
  ) {
    return null;
  }

  // 원격 배포에는 로그인 레이어가 없다 — same-origin 브라우저 쓰기를 허용하면 기록이
  // 공개된다. 그래서 거절 자체는 유지하고, 운영자가 읽는 문구만 다음 행동을 지시하는
  // 한국어로 낸다(DESIGN.md §10). Origin/Referer가 있으면 브라우저에서 온 요청이다.
  const fromBrowser = Boolean(requestOrigin);

  return NextResponse.json(
    {
      status: "forbidden",
      error: fromBrowser
        ? "이 배포에서는 저장할 수 없습니다 — 로컬 Hub에서 입력하세요."
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
