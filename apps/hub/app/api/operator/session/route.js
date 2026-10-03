import { NextResponse } from "next/server.js";

import { areEquivalentLoopbackOrigins } from "@/lib/hub-write-guard";
import {
  OPERATOR_SESSION_COOKIE,
  createOperatorSessionToken,
  hasOperatorLoginCredentials,
  hasOperatorSessionSecret,
  operatorLoginCredentialsMatch,
  operatorSessionCookieOptions,
  verifyOperatorSessionRequest,
} from "@/lib/operator-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Each scrypt verification needs ~128 MiB. Bound active work per process; do not queue
// untrusted login attempts or let them allocate one expensive verification each.
const MAX_CONCURRENT_LOGIN_VERIFICATIONS = 2;
let loginVerificationsInFlight = 0;

async function readJson(req) {
  const maxBytes = 4096;
  if (Number(req.headers.get("content-length")) > maxBytes) return { error: "too-large" };
  const reader = req.body?.getReader();
  let size = 0;
  const chunks = [];
  if (reader) {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          return { error: "too-large" };
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? { value } : { error: "invalid-json" };
  } catch {
    return { error: "invalid-json" };
  }
}

export async function GET(req) {
  const session = verifyOperatorSessionRequest(req);
  return NextResponse.json({
    status: session.ok ? "authenticated" : "anonymous",
    reason: session.reason,
    configured: hasOperatorSessionSecret() && hasOperatorLoginCredentials(),
  });
}

export async function POST(req) {
  const requestOrigin = new URL(req.url).origin;
  const suppliedOrigin = req.headers.get("origin");
  const suppliedReferer = req.headers.get("referer");
  let browserOrigin;
  try {
    browserOrigin = new URL(suppliedOrigin || suppliedReferer).origin;
  } catch {
    browserOrigin = null;
  }
  // NextRequest normalizes 127.0.0.1 to localhost; accept that alias only in development.
  const equivalentDevelopmentLoopback = process.env.NODE_ENV !== "production" &&
    process.env.VERCEL_ENV !== "production" &&
    areEquivalentLoopbackOrigins(browserOrigin, requestOrigin);
  if (browserOrigin !== requestOrigin && !equivalentDevelopmentLoopback) {
    return NextResponse.json({ status: "forbidden", error: "same-origin-required" }, { status: 403 });
  }

  const parsed = await readJson(req);
  if (parsed.error === "too-large") {
    return NextResponse.json({ status: "payload-too-large", error: "Login request is too large." }, { status: 413 });
  }
  if (parsed.error) {
    return NextResponse.json(
      { status: "invalid-json", error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }
  const body = parsed.value;

  const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "login";
  if (action === "logout") {
    const response = NextResponse.json({ status: "logged_out" });
    response.cookies.set(OPERATOR_SESSION_COOKIE, "", operatorSessionCookieOptions({ maxAge: 0 }));
    return response;
  }

  if (!hasOperatorSessionSecret() || !hasOperatorLoginCredentials()) {
    return NextResponse.json({ status: "not-configured", error: "operator-login-not-configured" }, { status: 503 });
  }

  if (loginVerificationsInFlight >= MAX_CONCURRENT_LOGIN_VERIFICATIONS) {
    return NextResponse.json(
      { status: "busy", error: "Login is busy. Please try again shortly." },
      { status: 429, headers: { "Retry-After": "1" } },
    );
  }

  loginVerificationsInFlight += 1;
  let credentialsMatch;
  try {
    credentialsMatch = await operatorLoginCredentialsMatch(body.username, body.password);
  } finally {
    loginVerificationsInFlight -= 1;
  }

  if (!credentialsMatch) {
    return NextResponse.json(
      { status: "unauthorized", error: "invalid-operator-credentials" },
      { status: 401 },
    );
  }

  const token = createOperatorSessionToken({ subject: "operator" });
  if (!token) {
    return NextResponse.json(
      { status: "not-configured", error: "Operator session secret is not configured." },
      { status: 503 },
    );
  }

  const response = NextResponse.json({ status: "authenticated" });
  response.cookies.set(OPERATOR_SESSION_COOKIE, token, operatorSessionCookieOptions());
  return response;
}
