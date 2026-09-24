import { randomBytes } from "node:crypto";

import { createOperatorPasswordHash } from "../apps/hub/lib/operator-session.js";

const username = process.argv[2] || "moonlight";
if (!/^[A-Za-z0-9._-]{3,64}$/.test(username)) {
  process.stderr.write("아이디는 영문·숫자·._-만 사용하고 3–64자여야 합니다.\n");
  process.exitCode = 1;
} else {
  const password = randomBytes(24).toString("base64url");
  const hash = await createOperatorPasswordHash(password);
  const sessionSecret = randomBytes(32).toString("base64url");
  process.stdout.write([
    "이 출력은 한 번만 표시됩니다. 비밀번호를 안전한 비밀번호 관리자에 저장하세요.",
    `아이디: ${username}`,
    `비밀번호: ${password}`,
    "",
    "Vercel Production 환경 변수:",
    `COM_MOON_OPERATOR_USERNAME=${username}`,
    `COM_MOON_OPERATOR_PASSWORD_HASH=${hash}`,
    `COM_MOON_OPERATOR_SESSION_SECRET=${sessionSecret}`,
    "",
  ].join("\n"));
}
