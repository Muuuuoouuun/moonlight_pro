import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BrandIcon } from "./brand-icons.jsx";

test("canonical brands receive distinct recognizable vector marks", () => {
  const expected = new Map([
    ["22nomad", "robot"],
    ["bridgemaker", "cross"],
    ["classmoon", "education"],
    ["classin_side", "classin-side"],
    ["holyfuncollector", "angel"],
    ["moonpm", "workflow"],
    ["politicofficer", "balance"],
    ["studyseagull", "seagull"],
    ["gore", "whale"],
    ["sinabro", "pen"],
  ]);
  const drawings = new Set();

  for (const [key, identity] of expected) {
    const markup = renderToStaticMarkup(React.createElement(BrandIcon, { brand: { key }, size: 18 }));
    assert.match(markup, new RegExp(`data-brand-icon="${identity}"`), key);
    assert.match(markup, /<svg[^>]+width="18"[^>]+height="18"/, key);
    assert.match(markup, /aria-hidden="true"/, key);
    assert.match(markup, /<path|<circle|<rect/, key);
    drawings.add(markup.replace(/data-brand-icon="[^"]+"/, ""));
  }
  assert.equal(drawings.size, expected.size, "every brand should have its own geometry");
});

test("an academy without a brand mark receives an education symbol; other new brands remain neutral", () => {
  const academy = renderToStaticMarkup(React.createElement(BrandIcon, { brand: { key: "new-academy", name: "새 학원" } }));
  const unknown = renderToStaticMarkup(React.createElement(BrandIcon, { brand: { key: "new-brand", name: "새 브랜드" } }));
  assert.match(academy, /data-brand-icon="academy"/);
  assert.match(unknown, /data-brand-icon="generic"/);
});
