// In-memory plan edits only. The account-keyed Hub shell owns this store.
// brandId comes from the item row; orgScope/brandKey may change with a partial catalog read.
export const contentPlanKey = (item) => JSON.stringify([item?.id ?? null, item?.brandId ?? null]);

export function createContentPlanStore() {
  const entries = new Map(), listeners = new Set();
  const get = (key) => {
    if (!entries.has(key)) entries.set(key, {});
    return entries.get(key);
  };
  return {
    get,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    patch(key, next) {
      const current = get(key);
      entries.set(key, { ...current, ...(typeof next === 'function' ? next(current) : next) });
      listeners.forEach((listener) => listener());
    },
    hasUnsentDrafts() {
      return [...entries.values()].some((entry) => entry.status === 'saving' || Object.keys(entry.edits || {}).length > 0);
    },
  };
}
