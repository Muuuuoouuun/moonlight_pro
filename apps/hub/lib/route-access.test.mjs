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

test("로컬(loopback)은 세션 없이 통과한다", () => {
  for (const host of ["localhost:3000", "127.0.0.1:3010", "[::1]:3000", "LOCALHOST:3000"]) {
    assert.equal(resolveRouteAccess({ pathname: "/api/hub/revenue", host, secretConfigured: true, hasSession: false }).action, "allow", host);
  }
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

test("열어 둔 경로가 허브 원장 API 를 덮지 않는다", () => {
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
  assert.deepEqual(open, [], `허브 원장 API 가 인증 없이 열려 있다:\n${open.join("\n")}`);
});

test("미들웨어가 판정 로직을 그대로 쓴다", async () => {
  const source = await readFile(new URL("../middleware.js", import.meta.url), "utf8");
  assert.match(source, /resolveRouteAccess/, "미들웨어가 판정 함수를 쓰지 않는다");
  assert.match(source, /runtime = "nodejs"/, "node:crypto HMAC 를 쓰므로 Node 런타임이 필요하다");
  assert.match(source, /verifyOperatorSessionRequest/, "세션 검증이 빠졌다");
});
