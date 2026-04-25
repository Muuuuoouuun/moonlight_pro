import { timingSafeEqual } from "crypto";

import { NextResponse } from "next/server";

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

export function assertHubWriteAllowed(req) {
  const expectedSecret = resolveHubWriteSecret();

  if (isHubWriteAllowedBySecret(req, expectedSecret)) {
    return null;
  }

  const requestOrigin = resolveRequestOrigin(req);
  const expectedOrigins = resolveExpectedOrigins(req);

  if (requestOrigin && expectedOrigins.has(requestOrigin)) {
    return null;
  }

  return NextResponse.json(
    {
      status: "forbidden",
      error:
        "Hub write routes require a same-origin request or a valid Hub write secret.",
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
