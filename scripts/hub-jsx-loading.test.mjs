import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("the normal Node test entrypoint loads JSX and renders real React elements", async () => {
  const { TestCard } = await import("./fixtures/hub-jsx-module.jsx");
  assert.equal(
    renderToStaticMarkup(createElement(TestCard, { title: "메모 <하나>" })),
    '<section aria-label="초안"><strong>메모 &lt;하나&gt;</strong><span>검토 &amp; 적용</span></section>',
  );
});
