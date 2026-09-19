// 운영자 세션 게이트. `lib/route-access.js` 가 판정하고 여기서는 응답만 만든다.
//
// Node 런타임이 필요하다 — `lib/operator-session.js` 가 node:crypto 의 HMAC 를 쓴다
// (Edge 기본 런타임에서는 동작하지 않는다). Next 16 은 이를 지원한다.
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { hasOperatorSessionSecret, verifyOperatorSessionRequest } from "@/lib/operator-session";
import { resolveRouteAccess } from "@/lib/route-access";

export function middleware(request) {
  const { pathname, search } = request.nextUrl;

  const access = resolveRouteAccess({
    pathname,
    host: request.headers.get("host"),
    hasSession: verifyOperatorSessionRequest(request).ok,
    secretConfigured: hasOperatorSessionSecret(),
    // 호스팅 환경에서는 loopback 우회를 아예 끈다 — Host 헤더는 클라이언트가 보낸다.
    allowLoopback: !process.env.VERCEL,
  });

  if (access.action === "allow") return NextResponse.next();

  if (access.action === "unauthorized") {
    return NextResponse.json(
      { status: "unauthorized", error: "operator-session-required" },
      { status: 401 },
    );
  }

  if (access.action === "not-configured") {
    // 세션 비밀키가 없으면 로그인 자체가 불가능하다. 화면도 API 도 닫고 이유를 밝힌다.
    return NextResponse.json(
      {
        status: "not-configured",
        error: "operator-session-secret-missing",
        message: "COM_MOON_OPERATOR_SESSION_SECRET (또는 COM_MOON_HUB_WRITE_SECRET) 를 설정해야 로그인할 수 있습니다.",
      },
      { status: 503 },
    );
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + (search || ""))}`;
  return NextResponse.redirect(url);
}

export const config = {
  // 정적 자산과 Next 내부 경로는 통과시킨다 — 로그인 화면 자체가 렌더되어야 한다.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/|images/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?|ico)$).*)"],
};
