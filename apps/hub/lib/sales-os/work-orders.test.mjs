import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  claimApprovedWorkOrderForExecution,
  decideWorkOrder,
} from "./work-orders.js";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;
const WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";
const ORDER_ID = "11111111-1111-1111-1111-111111111111";

let rows;

function filterValue(raw) {
  return String(raw || "").replace(/^eq\./, "");
}

function matches(row, params) {
  for (const [key, value] of params.entries()) {
    if (key === "select" || key === "limit" || key === "order") continue;
    const column = key;
    if (String(row[column] ?? "") !== filterValue(value)) return false;
  }
  return true;
}

function installSupabaseFetch() {
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").pop();
    assert.equal(table, "work_orders");

    if ((init.method || "GET") === "PATCH") {
      const patch = JSON.parse(String(init.body || "{}"));
      const matched = rows.filter((row) => matches(row, url.searchParams));
      matched.forEach((row) => Object.assign(row, patch));
      const prefer = String(init.headers?.prefer || init.headers?.Prefer || "");
      if (prefer.includes("return=representation")) {
        return new Response(JSON.stringify(matched), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(null, { status: 204 });
    }

    return new Response(JSON.stringify(rows.filter((row) => matches(row, url.searchParams))), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    SUPABASE_URL: "https://supabase.example.com",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    COM_MOON_DEFAULT_WORKSPACE_ID: WORKSPACE_ID,
  };
  rows = [{
    id: ORDER_ID,
    workspace_id: WORKSPACE_ID,
    persona: "production",
    kind: "email_send",
    title: "Email approval",
    body: {
      recipientEmail: "lead@example.com",
      subject: "ClassIn demo",
      body: "Hello",
      channel: "resend",
    },
    status: "approved",
    gate: "human_approval",
    source: "manual",
    proposed_at: "2026-06-20T00:00:00.000Z",
  }];
  installSupabaseFetch();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
});

test("claimApprovedWorkOrderForExecution atomically claims one approved order", async () => {
  const first = await claimApprovedWorkOrderForExecution({
    id: ORDER_ID,
    kind: "email_send",
    expectedBody: {
      recipientEmail: "lead@example.com",
      subject: "ClassIn demo",
      body: "Hello",
      channel: "resend",
    },
  });

  assert.equal(first.ok, true);
  assert.equal(first.order.status, "executing");
  assert.equal(rows[0].status, "executing");

  const second = await claimApprovedWorkOrderForExecution({
    id: ORDER_ID,
    kind: "email_send",
  });

  assert.equal(second.ok, false);
  assert.equal(second.reason, "not-approved");
  assert.equal(rows[0].status, "executing");
});

test("decideWorkOrder keeps executed and dismissed states terminal", async () => {
  rows[0].status = "executed";
  const reopenExecuted = await decideWorkOrder({ id: ORDER_ID, status: "approved" });
  assert.equal(reopenExecuted.persisted, false);
  assert.equal(reopenExecuted.reason, "invalid-transition-executed-to-approved");

  rows[0].status = "dismissed";
  const reopenDismissed = await decideWorkOrder({ id: ORDER_ID, status: "approved" });
  assert.equal(reopenDismissed.persisted, false);
  assert.equal(reopenDismissed.reason, "invalid-transition-dismissed-to-approved");
});

test("decideWorkOrder only allows proposed orders to be approved or dismissed", async () => {
  rows[0].status = "proposed";

  const invalid = await decideWorkOrder({ id: ORDER_ID, status: "executed" });
  assert.equal(invalid.persisted, false);
  assert.equal(invalid.reason, "invalid-transition-proposed-to-executed");

  const approved = await decideWorkOrder({ id: ORDER_ID, status: "approved" });
  assert.equal(approved.persisted, true);
  assert.equal(rows[0].status, "approved");
});
