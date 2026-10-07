import React from 'react';
import { createCheckWriteIntent, UNKNOWN_WRITE } from '@/lib/check-write-intent';

export function useCheckWrite(key, fetchImpl) {
  const intent = React.useMemo(() => createCheckWriteIntent(key), [key]);
  const active = React.useRef(true), generation = React.useRef(0), busyRef = React.useRef(false);
  const [busy, setBusy] = React.useState(false), [locked, setLocked] = React.useState(false);
  React.useEffect(() => { generation.current++; active.current = true; return () => { active.current = false; generation.current++; }; }, [intent]);
  async function run(input, makeIds, perform) {
    if (busyRef.current) return { ok: false, stale: true };
    const ticket = generation.current;
    const isCurrent = () => active.current && generation.current === ticket;
    busyRef.current = true; setBusy(true); setLocked(true);
    try {
      const command = await intent.begin(fetchImpl, input, makeIds);
      if (!isCurrent()) return { ok: false, stale: true };
      if (!command.ok) return command;
      const ownedFetch = (url, init) => {
        if (!isCurrent()) throw new Error('panel-closed');
        return intent.ownedFetch(fetchImpl, url, init, isCurrent);
      };
      const result = await perform(ownedFetch, command);
      const confirmed = await intent.finish(fetchImpl, result);
      if (!isCurrent()) return { ok: false, stale: true };
      return confirmed ? result : { ok: false, message: UNKNOWN_WRITE };
    } catch { return { ok: false, message: UNKNOWN_WRITE }; }
    finally {
      busyRef.current = false;
      if (isCurrent()) setBusy(false);
    }
  }
  return { run, busy, locked };
}
