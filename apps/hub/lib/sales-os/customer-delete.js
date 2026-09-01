// 고객 삭제 참조 가드 — "잘못 만든 고객만 지운다" (2026-08-19 확정).
//
// 왜 가드가 필요한가. leads·customer_accounts를 가리키는 FK는 두 종류인데 둘 다 조용하다:
//   · deals.lead_id · projects.lead_id · projects.customer_account_id ·
//     operation_cases.customer_account_id → `on delete set null`
//     → 삭제는 성공하고, 딜·프로젝트·케이스는 주인을 잃은 채 원장에 남는다.
//   · crm_activities.lead_id · crm_activities.account_id → `on delete cascade`
//     → 그 고객과의 통화·미팅 기록이 함께 사라진다.
// 어느 쪽이든 실패하지 않고 조용히 일어난다. 그래서 삭제 전에 세고, 하나라도 있으면 막는다.
//
// 왜 company_id까지 세는가. 라이브 원장의 실제 연결 모양이 그렇다 — crm_activities는
// 110행 중 109행이 company_id로만 붙고 lead_id는 1행뿐이며, deals.lead_id도 사실상
// 비어 있다(customers.jsx toRows·reload가 company_id로 조인하는 것과 같은 이유).
// lead_id/account_id만 세면 이력이 가득한 고객이 "참조 0"으로 읽혀 그대로 지워진다.

import { eqFilter, fetchSupabaseRowsDetailed } from "../server-read.js";

// 상수·표시 문자열은 순수 모듈에 둔다 — 클라이언트(customers.jsx)도 같은 단어를 써야 하고,
// 이 파일은 서버 read를 import하므로 번들에 끌려들어가면 안 된다.
export { UNREFERENCED_GUARD, REFERENCE_LABELS, describeReferences } from "./customer-delete-contract.js";

// 차단 판정에는 1건이면 충분하다 — 상한은 사용자에게 보여줄 숫자의 정확도를 위한 것.
const SCAN_LIMIT = 200;

export function isCustomerTable(table) {
  return table === "leads" || table === "customer_accounts";
}

// 고객 종류별 참조 조사 목록. [버킷 키, 테이블, 컬럼, 값]
function referenceProbes({ table, id, companyId }) {
  if (table === "customer_accounts") {
    return [
      ["cases", "operation_cases", "customer_account_id", id],
      ["projects", "projects", "customer_account_id", id],
      ["activities", "crm_activities", "account_id", id],
      ["deals", "deals", "company_id", companyId],
      ["activities", "crm_activities", "company_id", companyId],
    ];
  }
  return [
    ["deals", "deals", "lead_id", id],
    ["projects", "projects", "lead_id", id],
    ["activities", "crm_activities", "lead_id", id],
    ["deals", "deals", "company_id", companyId],
    ["activities", "crm_activities", "company_id", companyId],
  ];
}

// 라이브 스키마에 그 링크 자체가 없는 경우(마이그레이션 미적용 등)를 전송 실패와 구분한다.
// PostgREST: 42703 undefined_column · 42P01 undefined_table.
// 컬럼이 없으면 그 참조는 **존재할 수 없으므로** 0이 추측이 아니라 사실이다. 반면
// 타임아웃·RLS·5xx는 "모른다"이고, 모르는 상태로 삭제하면 이력이 사라진다.
function isMissingLink(error) {
  if (!error) return false;
  if (error.status === 404) return true;
  const detail = String(error.detail || "");
  return detail.includes("42703") || detail.includes("42P01");
}

// { ids } · { ids: null } (읽기 실패 — fail closed) · { ids: [], missing: true } (링크 없음)
async function collectIds(table, column, value, workspaceId) {
  if (!value) return { ids: [] }; // 조인 키가 없는 고객 — 조회할 것이 없다
  const res = await fetchSupabaseRowsDetailed(table, {
    select: "id",
    filters: [[column, eqFilter(value)], ["workspace_id", eqFilter(workspaceId)]],
    limit: SCAN_LIMIT,
  });
  if (!Array.isArray(res.rows)) {
    if (isMissingLink(res.error)) return { ids: [], missing: true };
    // 그 밖의 실패를 빈 배열로 뭉개면 이력 있는 고객이 "참조 0"으로 지워진다 — fail closed.
    return { ids: null, detail: res.error?.detail || res.error?.reason || "" };
  }
  return { ids: res.rows.map(r => r?.id).filter(Boolean) };
}

// { ok: true, counts, total, skipped } — counts는 버킷별 **중복 제거된** 건수.
//   skipped: 라이브 스키마에 링크가 없어 조사하지 못한 "테이블.컬럼" 목록. 그 참조는
//   존재할 수 없으므로 판정은 유효하지만, 검사가 부분적이었다는 사실은 숨기지 않는다.
// { ok: false, reason, table, detail } — 하나라도 못 읽었으면 삭제를 진행하면 안 된다.
export async function countCustomerReferences({ table, id, companyId, workspaceId }) {
  const probes = referenceProbes({ table, id, companyId });
  const results = await Promise.all(
    probes.map(([, tbl, column, value]) => collectIds(tbl, column, value, workspaceId)),
  );

  // 같은 딜이 lead_id와 company_id 양쪽에 걸릴 수 있다 — id로 합집합을 만들어야
  // 사용자에게 "딜 4건"처럼 부풀린 숫자를 보여주지 않는다.
  const buckets = new Map();
  const skipped = [];
  for (let i = 0; i < probes.length; i += 1) {
    const [key, tbl, column] = probes[i];
    const { ids, missing, detail } = results[i];
    if (ids === null) return { ok: false, reason: "reference-read-failed", table: tbl, detail };
    if (missing) skipped.push(`${tbl}.${column}`);
    if (!buckets.has(key)) buckets.set(key, new Set());
    ids.forEach(v => buckets.get(key).add(v));
  }

  const counts = {};
  let total = 0;
  for (const [key, set] of buckets) {
    if (set.size > 0) {
      counts[key] = set.size;
      total += set.size;
    }
  }
  return { ok: true, counts, total, skipped };
}
