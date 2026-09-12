import { isCanonicalUuid } from './uuid.js';

let fallbackTabId;
const volatileCopies = new Map();
export function journalTabId() {
  try {
    let id = sessionStorage.getItem('moonlight:journal-tab:v1');
    if (!id) { id = crypto.randomUUID(); sessionStorage.setItem('moonlight:journal-tab:v1', id); }
    return id;
  } catch { return fallbackTabId ||= crypto.randomUUID(); }
}
export function lastJournalWorkspace() {
  try { const id = sessionStorage.getItem('moonlight:journal-workspace:v1'); return isCanonicalUuid(id) ? id : null; }
  catch { return null; }
}
export function rememberJournalWorkspace(id) {
  try {
    if (isCanonicalUuid(id)) sessionStorage.setItem('moonlight:journal-workspace:v1', id);
    else sessionStorage.removeItem('moonlight:journal-workspace:v1');
  } catch { /* The editor reports storage failures when it writes a draft. */ }
}
export function createJournalStore({ storage, workspaceId, tabId }) {
  const prefix = `moonlight:journal:v1:${workspaceId || 'preview'}:${tabId}:`;
  const key = (id) => {
    if (!isCanonicalUuid(id)) throw Error('invalid-note-id');
    return prefix + id;
  };
  function read(id) {
    if (volatileCopies.has(key(id))) return structuredClone(volatileCopies.get(key(id)));
    const raw = storage.getItem(key(id));
    if (!raw) return null;
    const doc = JSON.parse(raw);
    if (doc.version !== 1 || doc.draft?.id !== id || typeof doc.draft?.body !== 'string') throw Error('invalid-recovery-copy');
    return doc;
  }
  return {
    read,
    remove(id) { storage.removeItem(key(id)); volatileCopies.delete(key(id)); },
    write(id, state) {
      const doc = { version: 1, draft: state.draft, entry: state.entry || null, dirty: Boolean(state.dirty),
        pending: state.pending || null, reuseDraft: state.reuseDraft || null, updatedAt: new Date().toISOString() };
      try { storage.setItem(key(id), JSON.stringify(doc)); volatileCopies.delete(key(id)); }
      catch (error) { volatileCopies.set(key(id), { ...doc, volatile: true }); throw error; }
    },
    list() {
      const names = new Set([...volatileCopies.keys()].filter((name) => name.startsWith(prefix)));
      try {
        for (let index = 0; index < storage.length; index++) {
          const name = storage.key(index); if (name?.startsWith(prefix)) names.add(name);
        }
      } catch (error) { if (!names.size) throw error; }
      const docs = [];
      for (const name of names) {
        const doc = read(name.slice(prefix.length));
        if (doc && (doc.pending || (doc.dirty && doc.draft.body.trim()))) docs.push(doc);
      }
      return docs.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
    },
  };
}
