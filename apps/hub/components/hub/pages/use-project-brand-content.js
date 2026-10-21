"use client";

import React from 'react';
import { readProjectBrandContentEnvelope } from '@/lib/project-brand-content';

// Lazy read, retained while the detail changes. Errors are retryable and must
// never become a successful empty list. Cleanup also ignores late responses.
export function useProjectBrandContent(openDetail) {
  const [content, setContent] = React.useState({ state: 'idle', items: [] });
  const [retryKey, setRetryKey] = React.useState(0);
  const loaded = React.useRef(false);
  const reload = React.useCallback(() => {
    loaded.current = false;
    setRetryKey(key => key + 1);
  }, []);
  React.useEffect(() => {
    if (!openDetail || loaded.current) return undefined;
    const controller = new AbortController();
    setContent(previous => ({ ...previous, state: 'loading' }));
    (async () => {
      let next;
      try {
        const response = await fetch('/api/hub/content', { cache: 'no-store', signal: controller.signal });
        const data = await response.json().catch(() => null);
        next = readProjectBrandContentEnvelope(data, response.ok);
      } catch {
        next = { state: 'error', items: [] };
      }
      if (controller.signal.aborted) return;
      loaded.current = next.state !== 'error';
      setContent(previous => next.state === 'error' ? { ...previous, state: 'error' } : next);
    })();
    return () => controller.abort();
  }, [openDetail, retryKey]);
  return { ...content, reload };
}
