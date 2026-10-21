// Names are labels, never record identity. A create command's UUID is also the
// saved primary key, so acknowledgement/ledger refresh does not change this key.
export function accountKey(account) {
  const id = account?.id || account?.createId;
  return typeof id === 'string' && id.trim() ? id : null;
}

// Recovery belongs to both the business workspace and the selected record type.
// A Personal quick-create must not resume an unresolved Company command hidden
// by the current filter (or the reverse).
export function accountCreateScope(account) {
  return JSON.stringify([account?.workspace || null, account?.type === 'personal' ? 'personal' : 'company']);
}

export function resolveAccountReference(accounts, reference) {
  if (!reference) return { status: 'missing', account: null };
  const identified = accounts.filter(account => accountKey(account));
  const exact = identified.find(account => accountKey(account) === reference);
  if (exact) return { status: 'matched', account: exact };
  // Keep old ?account=<name> links only when they identify exactly one scoped row.
  const named = identified.filter(account => account.name === reference);
  return named.length === 1 ? { status: 'matched', account: named[0] }
    : { status: named.length > 1 ? 'ambiguous' : 'missing', account: null };
}

// Explicit rename submissions are serialized per identity, not globally. Older
// completions cannot roll back newer input; a failed latest write rolls back to
// the last confirmed name rather than another failed optimistic rename.
export function queueAccountRename(queue, key, previousName, nextName, send) {
  const state = queue.get(key) || { confirmedName: previousName, pending: Promise.resolve() };
  const intent = Symbol('rename');
  state.intent = intent;
  const pending = state.pending.then(() => send(nextName)).catch(() => ({ ok: false, status: 'error' })).then(result => {
    if (result.ok) state.confirmedName = nextName;
    const current = state.intent === intent;
    if (current) queue.delete(key);
    return { ...result, current, confirmedName: state.confirmedName };
  });
  state.pending = pending;
  queue.set(key, state);
  return pending;
}
