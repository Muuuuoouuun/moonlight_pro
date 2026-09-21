import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "./route.js";

test("POST /api/hub/intake/multimodal write guard blocks untrusted cross-origin requests", async () => {
  const origNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const req = new Request("https://moonlight.example/api/hub/intake/multimodal", {
      method: "POST",
      headers: {
        origin: "https://evil.attacker.com",
        "content-type": "application/json",
      },
      body: JSON.stringify({ text: "메모" }),
    });
    const res = await POST(req);
    assert.equal(res.status, 403);
  } finally {
    process.env.NODE_ENV = origNodeEnv;
  }
});

test("POST /api/hub/intake/multimodal rejects empty input over loopback", async () => {
  const req = new Request("http://localhost:3000/api/hub/intake/multimodal", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });
  const res = await POST(req);
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.status, "error");
});

test("POST /api/hub/intake/multimodal returns preview when GEMINI_API_KEY is missing", async () => {
  const origKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const req = new Request("http://localhost:3000/api/hub/intake/multimodal", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ text: "메모 분석" }),
    });
    const res = await POST(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, "preview");
    assert.equal(data.reason, "gemini-not-configured");
  } finally {
    if (origKey !== undefined) process.env.GEMINI_API_KEY = origKey;
    else delete process.env.GEMINI_API_KEY;
  }
});
