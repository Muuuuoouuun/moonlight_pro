import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "./route.js";

test("POST /api/hub/journal/analyze write guard blocks cross-origin requests", async () => {
  const origNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const req = new Request("https://moonlight.example/api/hub/journal/analyze", {
      method: "POST",
      headers: {
        origin: "https://evil.attacker.com",
        "content-type": "application/json",
      },
      body: JSON.stringify({ requestId: "11111111-1111-4111-8111-111111111111", range: "7d" }),
    });
    const res = await POST(req);
    assert.equal(res.status, 403);
  } finally {
    process.env.NODE_ENV = origNodeEnv;
  }
});

test("POST /api/hub/journal/analyze validates requestId and noteIds/range", async () => {
  const req = new Request("http://localhost:3000/api/hub/journal/analyze", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify({ noteIds: [] }),
  });
  const res = await POST(req);
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.status, "invalid-input");
});

test("POST /api/hub/journal/analyze accepts range 7d and returns preview when DB unconfigured", async () => {
  const origUrl = process.env.SUPABASE_URL;
  delete process.env.SUPABASE_URL;
  try {
    const req = new Request("http://localhost:3000/api/hub/journal/analyze", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        requestId: "33333333-3333-4333-8333-333333333333",
        goal: "weekly_synthesis",
        range: "7d",
      }),
    });
    const res = await POST(req);
    assert.equal(res.status, 202);
    const data = await res.json();
    assert.equal(data.status, "preview");
  } finally {
    if (origUrl !== undefined) process.env.SUPABASE_URL = origUrl;
    else delete process.env.SUPABASE_URL;
  }
});
