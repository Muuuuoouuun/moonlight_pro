import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const serverReadStub = `
export function eqFilter(value) { return value; }
export async function fetchSupabaseRows() { return []; }
export async function fetchSupabaseRowsDetailed() { return { rows: [] }; }
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

// 리드 드로어의 기록 탭도 같은 계약을 쓴다: 두 링크를 함께 남겨야 이후 회사 단위 조회
// (라이브 crm_activities의 실제 조인 축)에도 이 기록이 걸린다.
test("persists both lead and company links for lead activity", () => {
  const result = buildActivityWrite({
    type: "kakao",
    body: "견적 회신 요청",
    leadId: "lead-1",
    companyId: "company-1",
  });

  assert.deepEqual(result.columns, {
    body: "견적 회신 요청",
    kind: "kakao",
    company_id: "company-1",
    lead_id: "lead-1",
    entity_type: "lead",
  });
});

// 회사 없는 리드는 lead_id 단독으로도 저장돼야 한다(조회는 leadId 폴백이 받는다).
test("a company-less lead activity still records its lead link", () => {
  const result = buildActivityWrite({ type: "note", body: "첫 통화 메모", leadId: "lead-2" });
  assert.equal(result.columns.lead_id, "lead-2");
  assert.equal(result.columns.entity_type, "lead");
});
