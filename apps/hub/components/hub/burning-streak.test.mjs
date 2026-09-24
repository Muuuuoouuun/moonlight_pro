import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { StreakMark, streakLevel } from "./burning-streak.jsx";

const render = (level, size = 18) => renderToStaticMarkup(React.createElement(StreakMark, { level, size }));

test("streak days map to five flame levels with a one-month top step", () => {
  const cases = [[0, 0], [1, 1], [2, 1], [3, 2], [6, 2], [7, 3], [13, 3], [14, 4], [29, 4], [30, 5], [120, 5]];
  for (const [days, level] of cases) assert.equal(streakLevel(days), level, `${days}일`);
});

test("each level draws a distinct flame, growing weak to strong", () => {
  const drawings = [0, 1, 2, 3, 4, 5].map((level) => render(level).replace(/streak-core-[\w-]+/g, "id"));
  assert.equal(new Set(drawings).size, 6);
  assert.match(drawings[0], /stroke-dasharray/, "0: 점선 빈 불꽃");
  assert.match(drawings[1], /<circle/, "1: 불씨");
  assert.match(drawings[2], /<path[^>]+stroke="var\(--fg-muted\)"/, "2: 윤곽 불꽃");
  assert.match(drawings[3], /<path[^>]+fill="var\(--fg\)"/, "3: 채운 불꽃");
  assert.equal((drawings[4].match(/hub-streak-spark/g) || []).length, 2, "4: 불티 둘");
  assert.equal((drawings[5].match(/hub-streak-spark/g) || []).length, 3, "5: 불티 셋");
  assert.match(drawings[5], /<circle cx="12" cy="12" r="11"/, "5: 한 달 배지 원");
});

test("only levels 4 and 5 ignite once, and the core is cut through with a unique mask", () => {
  for (const level of [0, 1, 2, 3]) assert.doesNotMatch(render(level), /hub-streak-ignite|<mask/);
  for (const level of [4, 5]) {
    const markup = render(level);
    assert.match(markup, /hub-streak-ignite/);
    const id = markup.match(/<mask id="([^"]+)"/)?.[1];
    assert.ok(id && /^[\w-]+$/.test(id), "mask id는 url()에 안전한 문자만");
    assert.match(markup, new RegExp(`mask="url\\(#${id}\\)"`));
  }
});

test("the flame stays monochrome and decorative (§4·§5.3)", () => {
  for (const level of [0, 1, 2, 3, 4, 5]) {
    const markup = render(level);
    assert.match(markup, /aria-hidden="true"/);
    assert.doesNotMatch(markup, /#[0-9a-f]{3,8}\b|oklch|rgb|--warning|--danger|--success/i);
  }
});

test("ignite motion is one-shot, token-timed and off under reduced motion", () => {
  const css = readFileSync(new URL("./hub-tokens.css", import.meta.url), "utf8");
  const ignite = css.slice(css.indexOf("@keyframes mlFlameIgnite"), css.indexOf("@media (prefers-reduced-motion: reduce) {\n  .hub-app .hub-streak-pop"));
  assert.match(ignite, /animation: mlFlameIgnite var\(--dur-celebrate\) var\(--ease-hub\) both;/);
  assert.doesNotMatch(ignite, /infinite/);
  assert.match(css, /\.hub-app \.hub-streak-ignite \.hub-streak-spark \{\n\s+animation: none;/);
});

test("every streak surface reads the shared level function", () => {
  for (const file of ["./rhythm-today.jsx", "./rhythm-history.jsx", "./pages/daily-brief.jsx"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /function streakLevel/, file);
    for (const call of source.match(/<StreakMark[^>]*>/g) || []) assert.match(call, /level=\{streakLevel\(/, `${file}: ${call}`);
  }
});
