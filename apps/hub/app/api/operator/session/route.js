import { NextResponse } from "next/server";

import {
  OPERATOR_SESSION_COOKIE,
  createOperatorSessionToken,
  hasOperatorSessionSecret,
  operatorLoginSecretMatches,
  operatorSessionCookieOptions,
  verifyOperatorSessionRequest,
} from "@/lib/operator-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readJson(req) {
  const text = await req.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return null;
  }
}

export async function GET(req) {
  const session = verifyOperatorSessionRequest(req);
  return NextResponse.json({
    status: session.ok ? "authenticated" : "anonymous",
    reason: session.reason,
    configured: hasOperatorSessionSecret(),
  });
}

export async function POST(req) {
  const body = await readJson(req);
  if (!body) {
    return NextResponse.json(
      { status: "invalid-json", error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "login";
  if (action === "logout") {
    const response = NextResponse.json({ status: "logged_out" });
    response.cookies.set(OPERATOR_SESSION_COOKIE, "", operatorSessionCookieOptions({ maxAge: 0 }));
    return response;
  }

  const secret = typeof body.secret === "string" ? body.secret.trim() : "";
  if (!operatorLoginSecretMatches(secret)) {
    return NextResponse.json(
      { status: "unauthorized", error: "Valid Hub write secret is required to create an operator session." },
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
