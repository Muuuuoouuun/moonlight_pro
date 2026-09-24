import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";

import { OPEN_EXACT, OPEN_PREFIXES, isLoopbackHost, isOpenPath, resolveRouteAccess } from "./route-access.js";

const deployed = (over = {}) => resolveRouteAccess({ host: "moonlight-pro-hub.vercel.app", secretConfigured: true, hasSession: false, ...over });

test("배포 호스트에서 세션 없이 허브 read API 를 부르면 401", () => {
  for (const path of ["/api/hub/projects", "/api/hub/revenue", "/api/hub/overview", "/api/hub/memos"]) {
    assert.equal(deployed({ pathname: path }).action, "unauthorized", path);
  }
});

test("배포 호스트에서 세션 없이 화면을 열면 로그인으로 보낸다", () => {
  for (const path of ["/dashboard", "/dashboard/work/projects", "/"]) {
    assert.equal(deployed({ pathname: path }).action, "login", path);
  }
});

test("유효한 세션이 있으면 통과한다", () => {
  assert.equal(deployed({ pathname: "/api/hub/revenue", hasSession: true }).action, "allow");
  assert.equal(deployed({ pathname: "/dashboard", hasSession: true }).action, "allow");
});

test("자체 인증을 가진 경로는 세션 없이 통과한다", () => {
  // cron 은 CRON_SECRET, webhook 은 provider secret, agent 는 authorizeAgentRequest 로
  // 각자 검증한다. 여기서 막으면 자동화가 조용히 죽는다.
  for (const path of [
    "/api/cron/inquiries-sync", "/api/cron/followup-autopilot",
    "/api/webhooks/project-test", "/api/agent/v1/query", "/api/health",
    "/api/operator/session", "/login",
  ]) {
    assert.equal(deployed({ pathname: path }).action, "allow", path);
  }
});

test("OAuth 콜백은 세션 없이 통과한다", () => {
  for (const path of OPEN_EXACT) assert.equal(deployed({ pathname: path }).action, "allow", path);
});

test("Meta의 서명 검증 콜백은 공개하고 인접 경로는 닫는다", () => {
  for (const path of ["/api/social/meta/threads/deauthorize", "/api/social/meta/threads/data-deletion"]) {
    assert.equal(deployed({ pathname: path }).action, "allow", path);
    assert.equal(deployed({ pathname: `${path}/other` }).action, "unauthorized", path);
  }
});

test("공개 법률·앱 소개 페이지만 비로그인 접근을 허용한다", () => {
  for (const path of ["/legal/privacy", "/legal/terms", "/legal/data-deletion", "/legal/about"]) {
    assert.equal(deployed({ pathname: path }).action, "allow", path);
    assert.equal(deployed({ pathname: path, secretConfigured: false }).action, "allow", path);
  }
  for (const path of ["/legal", "/legal/private", "/legal/privacy/archive", "/dashboard", "/api/hub/revenue"]) {
    assert.notEqual(deployed({ pathname: path }).action, "allow", path);
  }
});

test("로컬(loopback)은 세션 없이 통과한다", () => {
  for (const host of ["localhost:3000", "127.0.0.1:3010", "[::1]:3000", "LOCALHOST:3000"]) {
    assert.equal(resolveRouteAccess({ pathname: "/api/hub/revenue", host, secretConfigured: true, hasSession: false }).action, "allow", host);
  }
});

test("호스팅 환경에서는 loopback 우회가 아예 꺼진다", () => {
  // Host 는 클라이언트가 보내는 값이다. Vercel 이 위조 Host 를 404 로 끊는 것을 실측했지만
  // (2026-09-20) 그 플랫폼 동작 하나에 기대지 않는다 — 미들웨어가 VERCEL 일 때 이 값을 false 로 준다.
  const onVercel = { pathname: "/api/hub/revenue", secretConfigured: true, hasSession: false, allowLoopback: false };
  for (const host of ["localhost:3000", "127.0.0.1", "[::1]:3000"]) {
    assert.equal(resolveRouteAccess({ ...onVercel, host }).action, "unauthorized", host);
  }
  // 자체 인증 경로와 유효 세션은 그래도 통과한다.
  assert.equal(resolveRouteAccess({ ...onVercel, host: "localhost", pathname: "/api/cron/inquiries-sync" }).action, "allow");
  assert.equal(resolveRouteAccess({ ...onVercel, host: "localhost", hasSession: true }).action, "allow");
});

test("미들웨어가 프로덕션 런타임에서 loopback 우회를 끈다", async () => {
  const source = await readFile(new URL("../middleware.js", import.meta.url), "utf8");
  // `!process.env.VERCEL` 은 축이 틀렸다 — 자체 호스팅·터널 뒤에서 우회가 다시 켜진다.
  assert.doesNotMatch(source, /allowLoopback:\s*!process\.env\.VERCEL/, "VERCEL 축은 자체 호스팅에서 뚫린다");
  assert.match(source, /allowLoopback:\s*process\.env\.NODE_ENV !== "production"/, "프로덕션 런타임에서 loopback 우회를 끄는 배선이 없다");
});

test("matcher 가 확장자 캐치올로 게이트를 끄지 않는다", async () => {
  // `.*\.(png|svg|…)$` 대안은 정적 디렉터리 한정이 아니라 경로 어디든 그 확장자로 끝나면
  // 미들웨어를 통째로 끈다. 실측(2026-09-20): `/api/hub/inquiries/x.png` 가 200 으로 통과했다.
  const source = await readFile(new URL("../middleware.js", import.meta.url), "utf8");
  const matcher = /matcher:\s*\[([^\]]*)\]/.exec(source);
  assert.ok(matcher, "matcher 를 찾지 못했다");
  assert.doesNotMatch(matcher[1], /\.\*\\\\\./, "확장자 캐치올(.*\\.) 이 남아 있다");

  // 실제 정규식으로 허브 API 가 걸러지지 않는지 확인한다.
  const pattern = new RegExp(`^${JSON.parse(matcher[1].trim().replace(/,$/, ""))}$`);
  for (const path of ["/api/hub/revenue", "/api/hub/inquiries/x.png", "/dashboard/revenue.png", "/dashboard"]) {
    assert.ok(pattern.test(path), `${path} 가 미들웨어 대상에서 빠졌다`);
  }
  for (const path of [
    "/_next/static/chunk.js", "/fonts/SUIT-Variable.woff2", "/favicon.ico", "/manifest.json",
    "/icon.svg", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/apple-touch-icon.png",
  ]) {
    assert.ok(!pattern.test(path), `${path} 는 정적 자산이라 통과해야 한다`);
  }
  for (const path of ["/icon-512.png/private", "/icon-512.png.evil", "/api/hub/icon-512.png"]) {
    assert.ok(pattern.test(path), `${path} 는 자산 이름을 흉내 내도 인증을 거쳐야 한다`);
  }
});

test("dev 서버가 loopback 에만 바인딩된다", async () => {
  // `next dev` 기본값은 0.0.0.0 이라 같은 네트워크의 아무 기기나 닿는다. 그 상태에서
  // Host: localhost 를 위조하면 loopback 분기가 열려 기록이 통째로 나갔다(2026-09-20 실측: 183KB).
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(pkg.scripts.dev, /-H 127\.0\.0\.1/, "dev 서버가 LAN 에 노출된다");
});

test("배포 도메인이 loopback 으로 오인되지 않는다", () => {
  for (const host of ["moonlight-pro-hub.vercel.app", "localhost.attacker.com", "127.0.0.1.attacker.com", ""]) {
    assert.equal(isLoopbackHost(host), false, host);
  }
});

test("세션 비밀키가 없으면 통과가 아니라 차단이다", () => {
  // 통과시키면 지금의 무방비 상태가 그대로 배포된다. 잘못된 설정은 조용히 열리는 대신 막힌다.
  const r = deployed({ pathname: "/api/hub/revenue", secretConfigured: false });
  assert.equal(r.action, "not-configured");
  assert.equal(deployed({ pathname: "/dashboard", secretConfigured: false }).action, "not-configured");
});

test("열어 둔 경로가 허브 기록 API 를 덮지 않는다", () => {
  // OPEN_PREFIXES 에 `/api/hub` 같은 광범위한 값이 들어가면 게이트가 통째로 무력해진다.
  for (const prefix of [...OPEN_PREFIXES, ...OPEN_EXACT]) {
    assert.equal(isOpenPath("/api/hub/revenue"), false, `${prefix} 가 허브 API 를 열었다`);
  }
});

// 새 라우트가 생겼을 때 게이트가 자동으로 막는지 — 화이트리스트에 없는 API 는 전부 닫혀야 한다.
test("저장소의 모든 허브 API 라우트가 게이트 대상이다", async () => {
  const root = new URL("../app/api/hub/", import.meta.url);
  const paths = [];
  const walk = async (dir, prefix) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) await walk(new URL(`${entry.name}/`, dir), `${prefix}/${entry.name}`);
      else if (entry.name === "route.js") paths.push(`/api/hub${prefix}`);
    }
  };
  await walk(root, "");
  assert.ok(paths.length >= 40, `허브 API 라우트를 찾지 못했다 (${paths.length}개)`);

  const open = paths.filter((path) => isOpenPath(path));
  assert.deepEqual(open, [], `허브 기록 API 가 인증 없이 열려 있다:\n${open.join("\n")}`);
});

test("미들웨어가 판정 로직을 그대로 쓴다", async () => {
  const source = await readFile(new URL("../middleware.js", import.meta.url), "utf8");
  assert.match(source, /resolveRouteAccess/, "미들웨어가 판정 함수를 쓰지 않는다");
  assert.match(source, /runtime = "nodejs"/, "node:crypto HMAC 를 쓰므로 Node 런타임이 필요하다");
  assert.match(source, /verifyOperatorSessionRequest/, "세션 검증이 빠졌다");
});
