#!/usr/bin/env node
// 릴리스 서명 키를 한 번 만든다: keystore/moonlight-release.jks + keystore.properties(무작위 비밀번호).
// 둘 다 .gitignore 대상이다. 이미 있으면 덮어쓰지 않는다 — 키를 잃으면 같은 앱으로 업데이트할 수 없다.
// 비밀번호는 화면에 출력하지 않고 keystore.properties 에만 적는다. keytool 은 JAVA_HOME/bin 또는 PATH 에서 찾는다.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const STORE_REL = "keystore/moonlight-release.jks";
const storePath = join(APP_DIR, STORE_REL);
const propsPath = join(APP_DIR, "keystore.properties");

if (existsSync(storePath) || existsSync(propsPath)) {
  console.error("[moonlight-android] keystore 또는 keystore.properties 가 이미 있습니다. 덮어쓰지 않습니다.");
  process.exit(1);
}

const password = randomBytes(24).toString("base64url");
const keytool = process.env.JAVA_HOME
  ? join(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "keytool.exe" : "keytool")
  : "keytool";

mkdirSync(dirname(storePath), { recursive: true });
const result = spawnSync(
  keytool,
  [
    "-genkeypair", "-v",
    "-storetype", "PKCS12",
    "-keystore", storePath,
    "-alias", "moonlight",
    "-keyalg", "RSA", "-keysize", "4096",
    "-validity", "10000",
    "-dname", "CN=Moonlight, O=Moonlight, C=KR",
    "-storepass:env", "MOONLIGHT_KEYSTORE_PASSWORD",
    "-keypass:env", "MOONLIGHT_KEYSTORE_PASSWORD",
  ],
  { stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, MOONLIGHT_KEYSTORE_PASSWORD: password } },
);
if (result.status !== 0) {
  console.error("[moonlight-android] keytool 실패. JAVA_HOME 을 JDK 17 로 지정했는지 확인하세요.");
  process.exit(result.status ?? 1);
}

writeFileSync(
  propsPath,
  [
    "# 생성: scripts/create-keystore.mjs — 커밋 금지. 잃어버리면 같은 서명으로 업데이트할 수 없다.",
    `storeFile=${STORE_REL}`,
    `storePassword=${password}`,
    "keyAlias=moonlight",
    `keyPassword=${password}`,
    "",
  ].join("\n"),
  { mode: 0o600 },
);
console.log(`[moonlight-android] 릴리스 키 생성: ${STORE_REL} (비밀번호는 keystore.properties 에만 기록)`);
