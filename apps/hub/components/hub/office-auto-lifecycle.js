import React from 'react';

// The discussion stays mounted across Office tabs; visibility ends an auto run.
export function useOfficeAutoLifecycle({ active, scope, store, breakdowns, abortRef }) {
  React.useEffect(() => {
    if (!active) return;
    return () => {
      const stopped = breakdowns.stopAuto(scope, 'left');
      abortRef.current?.abort();
      abortRef.current = null;
      if (!stopped?.savedDraft) return;
      const session = store.get(scope);
      if (!session.draft.trim() || session.draft === session.pending?.rawDraft) {
        store.update(scope, { draft: stopped.savedDraft });
      }
    };
  }, [active, scope, store, breakdowns, abortRef]);
}
