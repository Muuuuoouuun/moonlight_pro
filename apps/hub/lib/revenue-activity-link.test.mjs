import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const serverReadStub = `
export function eqFilter(value) { return value; }
export async function fetchSupabaseRows() { return []; }
`;
const serverWriteStub = `
export function resolveDefaultWorkspaceId() { return null; }
export async function deleteSupabaseRecord() { return { persisted: false }; }
export async function insertSupabaseRecord() { return { persisted: false }; }
export async function updateSupabaseRecord() { return { persisted: false }; }
`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "../server-read.js") {
      return { url: `data:text/javascript,${encodeURIComponent(serverReadStub)}`, shortCircuit: true };
    }
    if (specifier === "../server-write.js") {
      return { url: `data:text/javascript,${encodeURIComponent(serverWriteStub)}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { buildActivityWrite } = await import("./sales-os/revenue-write.js?account-company-link");

test("persists both account and company links for account activity", () => {
  const result = buildActivityWrite({
    type: "call",
    body: "원장님과 다음 데모 일정 확인",
    accountId: "account-1",
    companyId: "company-1",
  });

  assert.deepEqual(result.columns, {
    body: "원장님과 다음 데모 일정 확인",
    kind: "call",
    account_id: "account-1",
    company_id: "company-1",
    entity_type: "account",
  });
});
