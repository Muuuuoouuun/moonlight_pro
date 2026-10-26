import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// CLI 배포(--archive=tgz)는 .gitignore를 읽지 않고, Vercel 기본 제외도 .env.local·.env.*.local뿐이다.
// 이 규칙이 빠지거나 '!'로 되살아나면 env 백업·OAuth 자격 증명·고객 데이터 덤프가 배포 소스에 다시 실린다(2026-10-22).
test(".vercelignore keeps secrets and local customer data out of CLI deploy archives", async () => {
  const rules = (await readFile(new URL("../.vercelignore", import.meta.url), "utf8"))
    .split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  for (const pattern of ["**/.env*", "**/client_secret_*.json", "**/credentials.json", "**/google-credentials*.json", "**/.migration-dump", "**/.mcp.json"]) {
    assert.ok(rules.includes(pattern), `${pattern} must stay excluded from deploy archives`);
  }
  assert.deepEqual(rules.filter((rule) => rule.startsWith("!") && /env|secret|credential|dump|mcp/i.test(rule)), []);
});
