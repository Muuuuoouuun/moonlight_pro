// One immutable JSON command per draft. Shared by browser and server; no storage,
// credentials, network, or Node-only imports. Row-local receipts are not a journal.
export const REVENUE_CREATE_TABLES = new Set(['leads', 'deals', 'customer_accounts', 'operation_cases']);
export const REVENUE_CREATE_KINDS = new Set(['lead', 'deal', 'account', 'case']);
export const REVENUE_CREATE_RECEIPT = '_revenue_create_v1';
export const validRevenueCreateId = id => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);
export const newRevenueCreateId = () => globalThis.crypto.randomUUID();
export function revenueCreateContent(payload) {
  const { id: _id, op: _op, createId: _createId, ...content } = JSON.parse(JSON.stringify(payload || {}));
  return content;
}
export function canonicalCreateContent(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalCreateContent).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalCreateContent(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const CREATE_UNKNOWN_MESSAGE = '등록 결과를 확인하지 못했습니다. 입력은 유지됩니다. 같은 내용으로 다시 저장하면 처음 등록 명령을 확인합니다.';
export const CREATE_CONFIRMED_MESSAGE = '처음 등록은 확인했습니다. 현재 수정한 입력은 아직 저장하지 않았습니다. 다시 저장하면 같은 기록을 수정합니다.';
