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
    // Host 헤더는 클라이언트가 보내는 값이므로 loopback 분기는 개발 런타임에서만 연다.
    // `!process.env.VERCEL` 은 축이 틀렸다 — `next start` 자체 호스팅·vercel dev·ngrok
    // 같은 터널 뒤에서는 VERCEL 이 없어 우회가 다시 켜진다. 프로덕션 빌드면 무조건 닫는다.
    allowLoopback: process.env.NODE_ENV !== "production",
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
  // 정적 자산과 Next 내부 경로만 통과시킨다 — 로그인 화면 자체가 렌더되어야 한다.
  //
  // 확장자 캐치올(`.*\.(png|svg|…)$`)은 쓰지 않는다. 그 대안은 정적 디렉터리 한정이 아니라
  // **경로 어디든** 그 확장자로 끝나면 미들웨어를 통째로 끈다 — `/api/hub/inquiries/x.png`
  // 가 게이트를 우회했다(2026-09-20 실측). 지금은 `[id]` 라우트의 UUID 검증이 앵커돼 있어
  // 데이터가 새지 않았을 뿐이고, 동적 API 가 하나 늘면 바로 유출이 된다.
  // public/ 에 실제로 있는 것만 접두사로 뺀다: fonts/ · icon.svg · manifest.json.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg|manifest\\.json|fonts/).*)"],
};
