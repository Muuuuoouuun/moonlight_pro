import { isCanonicalUuid } from './uuid.js';

export function projectCustomerRef(value) {
  if (!isCanonicalUuid(value?.id)) return null;
  const kind = value.type === 'customer_account' || value.type === 'account' ? 'account'
    : value.type === 'lead' ? 'lead' : null;
  return kind ? { type: kind, id: value.id.toLowerCase() } : null;
}

export function projectCustomerHref(value) {
  const ref = projectCustomerRef(value);
  return ref ? `/dashboard/revenue/customers?customer=${encodeURIComponent(`${ref.type}:${ref.id}`)}` : null;
}

export function projectCustomerPatch(project, customer) {
  if (!isCanonicalUuid(project?.id) || !project.updatedAt) throw Error('프로젝트를 다시 불러온 뒤 연결해 주세요.');
  const ref = customer === null ? null : projectCustomerRef(customer);
  if (customer !== null && !ref) throw Error('연결할 고객을 선택해 주세요.');
  return {
    id: project.id,
    expectedUpdatedAt: project.updatedAt,
    entityRef: ref ? { type: ref.type === 'account' ? 'customer_account' : 'lead', id: ref.id } : null,
  };
}

// Only a customer-specific entry point adds the customer. General project notes
// stay project-only, even when the project has a customer attached.
export function projectMemoContexts(project, customer = null) {
  const contexts = isCanonicalUuid(project?.id) ? [{ type: 'project', id: project.id, label: project.name }] : [];
  const ref = projectCustomerRef(customer);
  if (ref) contexts.push({ ...ref, label: customer.label || customer.name || '고객' });
  return contexts;
}

export function contextMemoKey(contexts = []) {
  return contexts.map(({ type, id }) => `${type}:${id}`).sort().join('|');
}

// A new context memo keeps one note id per tab and context set, so reopening the same
// source screen resumes the same draft (the journal writer stores the draft under that id).
// Every entry point that starts a memo for a context shares this key — the memo drawer and
// the record window's memo mode continue each other's draft instead of forking it.
// `identity` is contextMemoKey(contexts).
export function contextMemoStorageKey(workspaceId, identity) {
  return `moonlight:context-memo:v1:${workspaceId || 'preview'}:${identity}`;
}

// Storage may be blocked or full (private windows, quota). The id is then kept for the life of
// the page, so a remount (mode switch, ESC and back) claims the same id and finds the journal
// store's in-memory copy of the draft again — otherwise every remount would orphan the text.
// The journal writer reports the missing recovery copy itself.
const pageMemoIds = new Map();
export function claimContextMemoId(storage, key, createId = () => crypto.randomUUID()) {
  let id = null;
  try { const stored = storage.getItem(key); if (isCanonicalUuid(stored)) id = stored; } catch { /* writer displays recovery errors */ }
  id ||= pageMemoIds.get(key) || createId();
  try { storage.setItem(key, id); pageMemoIds.delete(key); } catch { pageMemoIds.set(key, id); }
  return id;
}

// After a confirmed save the next memo for the same context starts from a fresh id.
export function releaseContextMemoId(storage, key) {
  pageMemoIds.delete(key);
  try { storage.removeItem(key); } catch { /* draft store reports failures */ }
}
