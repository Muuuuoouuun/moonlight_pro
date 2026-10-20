import { canonicalCreateContent, revenueCreateContent, validRevenueCreateId, CREATE_UNKNOWN_MESSAGE, CREATE_CONFIRMED_MESSAGE } from '../../../lib/sales-os/revenue-create-command.js';

// Memory-only unresolved drafts survive tab/drawer remounts. Reload/restart and
// hard deletion are explicitly outside this row-local receipt guarantee.
const commands = new Map();
const keyFor = (kind, id) => `${kind}:${id}`;
const clone = value => JSON.parse(JSON.stringify(value));
const signature = record => canonicalCreateContent(revenueCreateContent(record));
const unknown = () => ({ ok: false, status: 'unknown', message: CREATE_UNKNOWN_MESSAGE });
const confirmed = () => ({ ok: false, status: 'conflict', reason: 'original-create-confirmed', message: CREATE_CONFIRMED_MESSAGE });
export function rememberRevenueDraft(kind, record) {
  const entry = commands.get(keyFor(kind, record?.createId));
  if (entry && (entry.original.workspace || null) === (record.workspace || null)) entry.current = clone(record);
}
export function pendingRevenueCreates(kind) {
  return [...commands.values()].filter(entry => entry.kind === kind).map(entry => clone(entry.current));
}
export function hasPendingRevenueCreate(kind, record) {
  return commands.has(keyFor(kind, record?.createId));
}
export function mergeRevenueDrafts(records, drafts) {
  const hidden = new Set(drafts.flatMap(row => [row.id, row.createId]).filter(Boolean));
  return [...drafts, ...records.filter(row => !hidden.has(row.id))];
}

export function saveRevenueCreate(kind, record, send) {
  if (!validRevenueCreateId(record?.createId)) return Promise.resolve({ ok: false, status: 'error', reason: 'missing-or-invalid-create-id', message: '등록 식별자가 없습니다. 새 입력에서 다시 시작하세요.' });
  const key = keyFor(kind, record.createId);
  let entry = commands.get(key);
  if (!entry) {
    entry = { kind, original: clone(record), current: clone(record), confirmedId: null, pending: null };
    commands.set(key, entry);
  } else {
    if ((entry.original.workspace || null) !== (record.workspace || null)) return Promise.resolve({
      ok: false, status: 'conflict', reason: 'create-scope-changed',
      message: '등록을 시작한 범위가 바뀌었습니다. 기존 입력은 원래 범위에 유지됩니다. 이 창을 닫고 현재 범위에서 새로 입력하세요.',
    });
    entry.current = clone(record);
  }
  if (entry.pending) return entry.pending;

  const recoverOriginal = () => {
    if (entry.pending) return entry.pending;
    // This POST happens ONLY after the user selects the explicit recovery action.
    entry.pending = send('create', entry.original).then(result => {
      if (result.ok) { entry.confirmedId = result.id; return confirmed(); }
      return { ...result, retryOriginal: recoverOriginal };
    }).catch(() => ({ ...unknown(), retryOriginal: recoverOriginal })).finally(() => { entry.pending = null; });
    return entry.pending;
  };
  const changed = signature(entry.current) !== signature(entry.original);
  const submitted = clone(entry.current);
  const operation = entry.confirmedId ? 'update' : changed ? 'confirm-create' : 'create';
  const body = operation === 'confirm-create' ? entry.original
    : operation === 'update' ? { ...submitted, id: entry.confirmedId } : entry.original;
  entry.pending = Promise.resolve().then(() => send(operation, body)).then(result => {
    if (result.ok) {
      if (operation === 'confirm-create' || signature(entry.current) !== signature(submitted)) {
        entry.confirmedId = result.id;
        return confirmed(); // original receipt != saved current edits; keep editor dirty
      }
      commands.delete(key);
      return result;
    }
    if (operation === 'create' && ['error', 'failed', 'preview'].includes(result.status)) commands.delete(key);
    return operation === 'confirm-create' && result.status === 'unknown'
      ? { ...result, message: '처음 등록 결과가 아직 불명확합니다. 수정한 입력은 유지됩니다. 처음 내용으로 등록을 재시도해 결과를 확인하세요.', retryOriginal: recoverOriginal }
      : result;
  }).catch(() => unknown()).finally(() => { entry.pending = null; });
  return entry.pending;
}

export function notifyRevenueSaveFailure(toast, result, fallback) {
  toast.error(result.message || fallback, result.retryOriginal ? { action: {
    label: '처음 등록 재시도', onClick: async () => {
      const recovered = await result.retryOriginal();
      toast.info(recovered.message || CREATE_UNKNOWN_MESSAGE);
    },
  } } : undefined);
}
