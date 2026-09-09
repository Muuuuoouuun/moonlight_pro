import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "./route.ts";

test("memo capture rejects unauthenticated requests before parsing", async () => {
  const previous = process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
  process.env.COM_MOON_SHARED_WEBHOOK_SECRET = "memo-route-test";
  try {
    const response = await POST(
      new Request("http://engine.test/api/memos/capture", {
        method: "POST",
        body: "not-json",
      }),
    );
    assert.equal(response.status, 401);
  } finally {
    if (previous === undefined)
      delete process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
    else process.env.COM_MOON_SHARED_WEBHOOK_SECRET = previous;
  }
});
test("authenticated memo capture validates shape and size without data access", async () => {
  const previous = process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
  process.env.COM_MOON_SHARED_WEBHOOK_SECRET = "memo-route-test";
  try {
    for (const [body, status] of [
      ["not-json", 400],
      ["[]", 400],
      ["null", 400],
      ["{}", 400],
      ["x".repeat(1048577), 413],
    ]) {
      const response = await POST(
        new Request("http://engine.test/api/memos/capture", {
          method: "POST",
          headers: { "x-com-moon-shared-secret": "memo-route-test" },
          body,
        }),
      );
      assert.equal(response.status, status);
    }
  } finally {
    if (previous === undefined)
      delete process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
    else process.env.COM_MOON_SHARED_WEBHOOK_SECRET = previous;
  }
});
