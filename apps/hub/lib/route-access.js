// 허브 라우트 접근 판정 — 미들웨어가 쓰는 순수 로직.
//
// 2026-09-20 이전에는 `apps/hub/app/api/hub/` 의 read 라우트 51개 중 인증을 검사하는
// 것이 0개였다. 운영자 세션(`lib/operator-session.js`)은 완성돼 있었지만 실제로
// 강제되는 곳이 없어, 배포에 Supabase 키를 넣는 순간 컨택·리드·딜이 URL 만 알면
// 읽히는 상태였다. 라우트 51개를 각각 고치는 대신 미들웨어 한 곳에서 막는다.
//
// 이 파일은 Next 런타임 없이 테스트할 수 있도록 판정만 담당한다.

// 세션 없이 도달해야 하는 경로. 전부 *자체* 인증을 갖고 있거나(cron·webhook·agent),
// 세션을 만들기 위한 입구(로그인)이거나, 외부가 리다이렉트로 돌려보내는 곳이다.
export const OPEN_PREFIXES = [
  "/api/operator/session", // 로그인·로그아웃 — 여기를 막으면 세션을 만들 수 없다
  "/api/cron/", // Vercel Cron — CRON_SECRET Bearer 자체 검증
  "/api/webhooks/", // 외부 웹훅 — provider secret 자체 검증
  "/api/agent/v1/", // Agent API — authorizeAgentRequest 자체 검증
  "/api/health", // 상태 점검 — 기록 데이터를 반환하지 않는다
  "/login", // 로그인 화면
];

// OAuth 제공자가 돌려보내는 콜백. 세션 쿠키가 없을 수 있으므로 열어 둔다.
// 명시 목록으로 둔다 — 접미사 매칭은 새 경로가 조용히 열리는 길을 만든다(fail-closed).
export const OPEN_EXACT = [
  "/api/calendar/google/callback",
  "/api/email/gmail/callback",
  "/api/integrations/sheets/callback",
  "/api/social/instagram/callback",
  "/api/social/meta/threads/callback",
];

export function isOpenPath(pathname) {
  const path = String(pathname || "");
  return OPEN_EXACT.includes(path) || OPEN_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

// 로컬 개발은 운영자 본인 기기에서만 닿는다. 저장소 선례가 이미 loopback 을 특별
// 취급한다(`hub-write-guard.js` 의 isLoopbackOrigin). Vercel 에서는 host 가 배포
// 도메인이므로 이 분기가 배포를 열어 주지 않는다.
export function isLoopbackHost(host) {
  const raw = String(host || "").toLowerCase().trim();
  // Host 헤더의 IPv6 는 `[::1]:3000` 형태라 포트만 떼려고 ":" 로 자르면 주소가 망가진다.
  const name = raw.startsWith("[") ? raw.slice(1, raw.indexOf("]")) : raw.split(":")[0];
  return name === "localhost" || name === "127.0.0.1" || name === "::1" || name === "0.0.0.0";
}

/**
 * @returns {{action: 'allow'|'unauthorized'|'login'|'not-configured', reason: string}}
 *   allow           그대로 통과
 *   unauthorized    API — 401 JSON
 *   login           화면 — /login 으로 이동
 *   not-configured  세션 비밀키가 없어 로그인 자체가 불가능 — 닫아 둔다
 */
export function resolveRouteAccess({ pathname, host, hasSession, hasServerCredential = false, secretConfigured, allowLoopback = true } = {}) {
  if (isOpenPath(pathname)) return { action: "allow", reason: "open-path" };
  // Host 는 클라이언트가 보내는 값이다. 실측(2026-09-20)으로 Vercel 은 위조된 Host 를
  // 앱에 도달시키지 않고 404 DEPLOYMENT_NOT_FOUND 로 끊지만, 그 플랫폼 동작 하나에
  // 기대지 않는다. 프로덕션 런타임에서는 loopback 우회 자체를 끈다.
  if (allowLoopback && isLoopbackHost(host)) return { action: "allow", reason: "loopback" };
  const isApi = String(pathname || "").startsWith("/api/");
  if (isApi && hasServerCredential) return { action: "allow", reason: "server-credential" };
  // 비밀키가 없으면 아무도 세션을 만들 수 없다. 통과시키면 지금의 무방비 상태가
  // 그대로 배포되므로 닫는다 — 잘못된 설정은 조용히 열리는 대신 시끄럽게 막힌다.
  if (!secretConfigured) return { action: "not-configured", reason: isApi ? "api" : "page" };
  if (hasSession) return { action: "allow", reason: "session" };
  return { action: isApi ? "unauthorized" : "login", reason: "no-session" };
}
