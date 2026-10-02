import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// 2026-09-26 안드로이드(1080×2400, CSS 412px) WebView에서 시스템 글자 크기를 키우면 로그인 카드가
// 오른쪽으로 넘쳤다. 한 칸 grid 트랙이 기본 auto라 카드 min-content(입력 칸의 고유 폭)만큼 자랐기
// 때문이다. 트랙을 minmax(0, 1fr)로 묶고 카드가 그 폭을 넘지 않게 한 계약을 고정한다.
const source = readFileSync(new URL("./page.jsx", import.meta.url), "utf8");

test("login card never grows past a phone viewport", () => {
  assert.match(source, /display: "grid", gridTemplateColumns: "minmax\(0, 1fr\)", placeItems: "center"/);
  assert.match(source, /<Card style=\{\{ width: "min\(380px, 100%\)", maxWidth: "100%", minWidth: 0, boxSizing: "border-box"/);
});
