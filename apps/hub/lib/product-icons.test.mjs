import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

import { PRODUCT_ICON_SRC, productIconSrc } from "./product-icons.js";

test("제품 아이콘 주소는 모두 public에 실제 파일이 있고, 없는 제품은 모노그램으로 떨어진다", () => {
  for (const [id, src] of Object.entries(PRODUCT_ICON_SRC)) {
    assert.match(src, /^\/icons\/products\/[0-9a-f]{8}\.png$/, id);
    assert.ok(existsSync(new URL(`../public${src}`, import.meta.url)), src);
  }
  assert.equal(productIconSrc({ id: "unknown", slug: "nope" }), null);
});
