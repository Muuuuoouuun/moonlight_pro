// Stores that hold unsent Office text (composer drafts, mentor follow-up questions)
// register here when their module first loads. The Hub shell can then guard leaving
// the page without loading the Office code up front: a store whose module never
// loaded cannot hold a draft.
const loaded = new Set();

export function registerOfficeUnloadStore(store) {
  loaded.add(store);
  return () => loaded.delete(store);
}

export function loadedOfficeUnloadStores() {
  return [...loaded];
}

// One leave-page guard for every in-memory Office input: the composer drafts and the
// mentor follow-up questions. Returns true when it asked the browser to confirm leaving.
export function officeUnloadGuard(stores) {
  return event => {
    if (!(Array.isArray(stores) ? stores : []).some(store => store?.hasUnsentDrafts?.())) return false;
    event.preventDefault();
    event.returnValue = '';
    return true;
  };
}
