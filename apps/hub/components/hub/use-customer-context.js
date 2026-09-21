"use client";

import React from 'react';

export function useCustomerContext(ref, projectsOnly = false) {
  const [state, setState] = React.useState({ status: 'loading' });
  const [revision, setRevision] = React.useState(0);
  const identity = ref ? `${ref.type}:${ref.id}` : '';
  React.useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading', identity });
    if (!ref) { setState({ status: 'live', identity, customer: null, projects: [] }); return; }
    async function read() {
      try {
        const response = await fetch(`/api/hub/projects/customer?kind=${ref.type}&id=${encodeURIComponent(ref.id)}${projectsOnly ? '&view=projects' : ''}`, { cache: 'no-store', signal: controller.signal });
        const data = await response.json();
        if (!response.ok || data.status === 'error' || data.source === 'error' || !['live', 'partial', 'preview'].includes(data.status)) throw Error(data.message || '고객 연결 정보를 불러오지 못했어요.');
        if (!controller.signal.aborted) setState({ ...data, identity });
      } catch (error) { if (!controller.signal.aborted) setState({ status: 'error', identity, message: error.message }); }
    }
    read();
    return () => controller.abort();
  }, [identity, projectsOnly, revision]);
  return { ...(state.identity === identity ? state : { status: 'loading' }), reload: () => setRevision((value) => value + 1) };
}

