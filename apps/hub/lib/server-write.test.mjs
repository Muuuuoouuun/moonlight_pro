import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { updateSupabaseRecord } from "./server-write.js";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    SUPABASE_URL: "https://moonlight.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
});

test("representation updates report no-matching-row when Supabase updates zero rows", async () => {
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await updateSupabaseRecord(
    "projects",
    [["id", "eq.missing-project"]],
    { status: "active" },
    { returnRepresentation: true, select: "id" },
  );

  assert.deepEqual(result, {
    persisted: false,
    reason: "no-matching-row",
    record: null,
    id: null,
  });
  assert.equal(request.url, "https://moonlight.supabase.co/rest/v1/projects?select=id&id=eq.missing-project");
  assert.equal(request.options.headers.prefer, "return=representation");
});

test("representation updates return the matched row identity", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify([{ id: "project-1" }]), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  const result = await updateSupabaseRecord(
    "projects",
    [["id", "eq.project-1"]],
    { status: "active" },
    { returnRepresentation: true, select: "id" },
  );

  assert.deepEqual(result, {
    persisted: true,
    reason: "ok",
    record: { id: "project-1" },
    id: "project-1",
  });
});
