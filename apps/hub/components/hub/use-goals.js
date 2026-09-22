"use client";
import React from 'react';
import { GOALS_CHANGED_EVENT, createGoalCommandClient, createGoalReadClient, readGoalLocal, writeGoalLocal } from '@/lib/goal-client';

const empty = { objectives: [], metrics: [], observations: [], links: [], asOf: null };
const reads = createGoalReadClient();

export function useGoals(query = '', enabled = true) {
  const [state, setState] = React.useState({ ...empty, status: 'loading', query });
  const [refreshKey, requestRefresh] = React.useReducer(value => value + 1, 0);
  const refresh = React.useCallback(() => { reads.invalidate(query); requestRefresh(); }, [query]);
  React.useEffect(() => {
    if (!enabled) return;
    let active = true;
    setState(previous => previous.query === query ? { ...previous, refreshing: true } : { ...empty, status: 'loading', query });
    reads.read(query).then(data => { if (active) setState({ ...data, query, refreshing: false }); });
    return () => { active = false; };
  }, [query, refreshKey, enabled]);
  React.useEffect(() => {
    if (!enabled) return;
    window.addEventListener(GOALS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(GOALS_CHANGED_EVENT, refresh);
  }, [enabled, refresh]);
  return { ...(state.query === query ? state : { ...empty, status: 'loading' }), refresh };
}

export function useGoalDraft(key, initial) {
  const [draft, setDraft] = React.useState(() => {
    const defaults = typeof initial === 'function' ? initial() : initial;
    const saved = readGoalLocal(`draft:${key}`, defaults);
    return Object.fromEntries(Object.entries(defaults).map(([field, value]) => [field, typeof saved?.[field] === typeof value ? saved[field] : value]));
  });
  const change = React.useCallback((name, value) => setDraft(current => {
    const next = { ...current, [name]: value }; writeGoalLocal(`draft:${key}`, next); return next;
  }), [key]);
  const clear = React.useCallback(() => writeGoalLocal(`draft:${key}`, null), [key]);
  return [draft, change, clear, setDraft];
}

export function useGoalCommand(key, onSaved) {
  const callback = React.useRef(onSaved); callback.current = onSaved;
  const [client] = React.useState(() => createGoalCommandClient({ pending: readGoalLocal(`command:${key}`), onPending: pending => writeGoalLocal(`command:${key}`, pending) }));
  const [result, setResult] = React.useState({ state: client.pending ? 'unknown' : 'idle' });
  const busy = React.useRef(false);
  async function run(method, ...args) {
    if (busy.current) return { state: 'saving' };
    busy.current = true;
    setResult({ state: 'saving' });
    try {
      const next = await client[method](...args); setResult(next);
      if (next.state === 'saved') {
        reads.invalidate();
        window.dispatchEvent(new Event(GOALS_CHANGED_EVENT));
        callback.current?.(next);
      }
      return next;
    } finally { busy.current = false; }
  }
  return { ...result, pending: client.pending, locked: result.state === 'saving' || Boolean(client.pending), submit: (...args) => run('submit', ...args), retry: () => run('retry'), checkReceipt: () => run('checkReceipt'), reset: () => { if (!client.pending) setResult({ state: 'idle' }); } };
}
