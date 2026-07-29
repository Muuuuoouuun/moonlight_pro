import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getContentStudioReadiness,
  hasContentStudioDraft,
} from "./content-studio-readiness.js";

test("blog handoff requires both a title and body", () => {
  assert.deepEqual(
    getContentStudioReadiness({ mode: "blog", title: "", body: "" }),
    { ready: false, message: "제목을 입력하세요." },
  );
  assert.deepEqual(
    getContentStudioReadiness({ mode: "blog", title: "Decision note", body: "" }),
    { ready: false, message: "본문을 입력하세요." },
  );
  assert.deepEqual(
    getContentStudioReadiness({ mode: "blog", title: "Decision note", body: "Evidence" }),
    { ready: true, message: "발행 준비됨" },
  );
});

test("carousel handoff requires meaningful copy on every slide", () => {
  assert.equal(
    getContentStudioReadiness({ mode: "carousel", slides: [{ title: "  ", sub: "" }] }).ready,
    false,
  );
  assert.equal(
    getContentStudioReadiness({ mode: "carousel", slides: [{ title: "", sub: "Operator OS" }] }).ready,
    true,
  );
  assert.equal(
    getContentStudioReadiness({
      mode: "carousel",
      slides: [
        { title: "Operator OS", sub: "" },
        { title: "", sub: "" },
      ],
    }).ready,
    false,
  );
  assert.equal(
    getContentStudioReadiness({ mode: "carousel", slides: [{ title: "New slide", sub: "" }] }).ready,
    false,
  );
});

test("draft save becomes available as soon as any meaningful content exists", () => {
  assert.equal(hasContentStudioDraft({ mode: "blog", title: "", body: "" }), false);
  assert.equal(hasContentStudioDraft({ mode: "blog", title: "Working title", body: "" }), true);
  assert.equal(hasContentStudioDraft({ mode: "carousel", slides: [{ title: "", sub: "" }] }), false);
  assert.equal(hasContentStudioDraft({ mode: "carousel", slides: [{ title: "Slide 1", sub: "" }] }), true);
});
