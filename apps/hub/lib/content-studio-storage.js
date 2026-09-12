const DB = 'moonlight-content-studio';
const STORE = 'drafts';
let writes = Promise.resolve();

function open() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('browser-storage-unavailable')); return; }
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('browser-storage-blocked'));
  });
}
export function mergeStudioMirror(previous, patch) {
  return { pendingSave: null, pendingMutation: null, ...previous, ...patch };
}
export function studioDocumentPointerKey({ scope, contentId, variantId, draftKey }) {
  return 'document:v3:' + [scope || 'all', contentId || 'new', contentId ? variantId || 'active' : draftKey].map((value) => encodeURIComponent(value || '')).join(':');
}
export async function readStudioMirror(key) {
  await writes.catch(() => {});
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(key);
    let value;
    request.onsuccess = () => { value = request.result || null; };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}
export async function readStudioDocumentMirror(identity) {
  const matches = (record) => record?.draft && (!record.scope || record.scope === identity.scope) &&
    (!identity.contentId || record.draft.contentId === identity.contentId) &&
    (!identity.variantId || record.draft.variantId === identity.variantId);
  const pointer = await readStudioMirror(studioDocumentPointerKey(identity));
  if (pointer?.mirrorKey) {
    const record = await readStudioMirror(pointer.mirrorKey);
    if (matches(record)) return record;
  }
  // Older records had only a scoped active pointer. Use it only for the exact
  // requested document, never for another item or a new draft identity.
  const active = await readStudioMirror('active:v2:' + identity.scope);
  const same = identity.contentId ? active?.contentId === identity.contentId && (!identity.variantId || active.variantId === identity.variantId)
    : identity.draftKey && active?.draftKey === identity.draftKey;
  if (same && active?.mirrorKey) {
    const record = await readStudioMirror(active.mirrorKey);
    if (matches(record)) return record;
  }
  return null;
}
export function writeStudioMirror(key, value, scope, { previousKey, draftKey, clearMutationKey } = {}) {
  const patch = structuredClone(value);
  const operation = writes.catch(() => {}).then(async () => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const savedAt = new Date().toISOString();
      if (clearMutationKey && clearMutationKey !== key) {
        const sourceRead = store.get(clearMutationKey);
        sourceRead.onsuccess = () => {
          if (sourceRead.result) store.put({ ...sourceRead.result, pendingMutation: null, savedAt });
        };
      }
      const read = store.get(previousKey || key);
      read.onsuccess = () => {
        const record = { ...mergeStudioMirror(read.result, patch), key, scope, draftKey, savedAt };
        store.put(record);
        // Creation acknowledgement also updates its stable pre-save address.
        if (previousKey && previousKey !== key) store.put({ ...record, key: previousKey });
        const pointer = { mirrorKey: key, contentId: record.draft.contentId, variantId: record.draft.variantId, draftKey, savedAt };
        store.put({ key: 'active:v2:' + scope, ...pointer });
        store.put({ key: studioDocumentPointerKey({ scope, ...record.draft, draftKey }), ...pointer });
        if (record.draft.contentId) store.put({ key: studioDocumentPointerKey({ scope, contentId: record.draft.contentId }), ...pointer });
        if (draftKey) store.put({ key: studioDocumentPointerKey({ scope, draftKey }), ...pointer });
      };
      tx.oncomplete = () => { db.close(); resolve(savedAt); };
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error('browser-storage-failed')); };
    });
  });
  writes = operation;
  return operation;
}
