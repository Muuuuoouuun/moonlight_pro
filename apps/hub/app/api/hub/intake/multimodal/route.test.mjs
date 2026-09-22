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

function requestFor(body, headers = {}) {
  return new Request("http://localhost:3000/api/hub/intake/multimodal", {
    method: "POST",
    headers: { origin: "http://localhost:3000", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("multimodal returns a JSON error envelope for malformed inputs", async () => {
  for (const body of [null, [], { text: 12 }, { text: [] }, { text: {} }, { text: "memo", instruction: [] }, { mediaBase64: "?", mimeType: "image/jpeg" }]) {
    const response = await POST(requestFor(body));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).status, "error");
  }
  const malformed = await POST(new Request("http://localhost:3000/api/hub/intake/multimodal", {
    method: "POST", headers: { origin: "http://localhost:3000" }, body: "{",
  }));
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).status, "error");
  const aborted = requestFor({ text: "메모" });
  aborted.text = async () => { throw new Error("stream aborted"); };
  const readFailure = await POST(aborted);
  assert.equal(readFailure.status, 400);
  assert.equal((await readFailure.json()).status, "error");
});

test("multimodal accepts 14 MiB plus base64 overhead and rejects larger media", async () => {
  const original = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const accepted = await POST(requestFor({ mediaBase64: Buffer.alloc(14 * 1024 * 1024).toString("base64"), mimeType: "audio/mpeg" }));
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).status, "preview");
    const rejected = await POST(requestFor({ mediaBase64: Buffer.alloc(14 * 1024 * 1024 + 1).toString("base64"), mimeType: "audio/mpeg" }));
    assert.equal(rejected.status, 413);
    const envelope = await rejected.json();
    assert.equal(envelope.status, "error");
    assert.match(envelope.error, /14MB/);
    const oversized = await POST(requestFor({}, { "content-length": "20000001" }));
    assert.equal(oversized.status, 413);
    assert.equal((await oversized.json()).status, "error");
  } finally {
    if (original === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = original;
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
