import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { EnergyMoon } from "./energy-moon.jsx";

const render = (props) => renderToStaticMarkup(React.createElement(EnergyMoon, props));

test("energy 1~5 draw five distinct moon phases, weak to strong", () => {
  const drawings = new Set([1, 2, 3, 4, 5].map((level) => render({ level })));
  assert.equal(drawings.size, 5);

  assert.match(render({ level: 1 }), /stroke-dasharray/, "지침은 점선 빈 달");
  assert.doesNotMatch(render({ level: 1 }), /<path|fill="currentColor"/, "지침은 밝은 면이 없다");
  for (const level of [2, 3, 4]) {
    const markup = render({ level });
    assert.match(markup, /<circle[^>]+fill="none"/, `${level}: 달 윤곽`);
    assert.match(markup, /<path[^>]+fill="currentColor"/, `${level}: 밝은 면`);
  }
  assert.match(render({ level: 5 }), /<circle[^>]+fill="currentColor"/, "활기는 보름");
});

test("the moon carries no color of its own and stays decorative", () => {
  for (const level of [1, 2, 3, 4, 5]) {
    const markup = render({ level, size: 22 });
    assert.match(markup, /aria-hidden="true"/);
    assert.match(markup, /width="22"[^>]+height="22"/);
    assert.match(markup, new RegExp(`data-level="${level}"`));
    // §5.3 — 값은 넓이가 말한다. 색 리터럴·의미색 토큰 금지.
    assert.doesNotMatch(markup, /#[0-9a-f]{3,8}|oklch|rgb|var\(--/i);
  }
});

test("out-of-range energy falls back to the empty moon", () => {
  assert.equal(render({ level: 0 }), render({ level: 1 }));
  assert.equal(render({ level: null }), render({ level: 1 }));
});

test("both energy input surfaces draw the moon", () => {
  const cue = readFileSync(new URL("./daily-review-cue.jsx", import.meta.url), "utf8");
  const composer = readFileSync(new URL("./pages/daily-review-composer.jsx", import.meta.url), "utf8");
  assert.match(cue, /<EnergyMoon level=\{energy\}/);
  assert.match(composer, /<EnergyMoon level=\{key\}/);
  assert.doesNotMatch(composer, /EnergyGlyph/);
});
