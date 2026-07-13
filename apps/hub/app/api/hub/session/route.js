import { NextResponse } from "next/server.js";

import {
  HUB_OPERATOR_SESSION_COOKIE,
  HUB_OPERATOR_SESSION_TTL_MS,
  createHubOperatorSession,
  hasValidHubOperatorSession,
  isHubRequestOriginAllowed,
  readHubWriteJson,
} from "../../../../lib/hub-write-guard.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: isProductionRuntime(),
    sameSite: "strict",
    path: "/",
  };
}

export async function GET(req) {
  return NextResponse.json({
    unlocked: hasValidHubOperatorSession(req),
  });
}

export async function POST(req) {
  const parsed = await readHubWriteJson(req);
  if (parsed.error) {
    return parsed.error;
  }

  const secret = typeof parsed.data?.secret === "string" ? parsed.data.secret : "";
  const session = await createHubOperatorSession(secret);
  if (!session) {
    return NextResponse.json({ unlocked: false }, { status: 401 });
  }

  const response = NextResponse.json({ unlocked: true });
  response.cookies.set({
    name: HUB_OPERATOR_SESSION_COOKIE,
    value: session.token,
    ...sessionCookieOptions(),
    expires: new Date(session.expiresAt),
    maxAge: Math.floor(HUB_OPERATOR_SESSION_TTL_MS / 1000),
  });
  return response;
}

export async function DELETE(req) {
  if (!isHubRequestOriginAllowed(req)) {
    return NextResponse.json({ unlocked: false }, { status: 403 });
  }

  const response = NextResponse.json({ unlocked: false });
  response.cookies.set({
    name: HUB_OPERATOR_SESSION_COOKIE,
    value: "",
    ...sessionCookieOptions(),
    expires: new Date(0),
    maxAge: 0,
  });
  return response;
}
