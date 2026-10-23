"use client";

import React from 'react';

// Remember successful loads across openings; a failed chunk must remain retryable.
const loadedComponents = new WeakMap();

export function useDeferredComponent(load) {
  const [state, setState] = React.useState(() => ({ Component: loadedComponents.get(load) || null, error: false }));
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    if (loadedComponents.has(load)) {
      setState({ Component: loadedComponents.get(load), error: false });
      return undefined;
    }
    let active = true;
    load().then(Component => {
      loadedComponents.set(load, Component);
      if (active) setState({ Component, error: false });
    }, () => {
      if (active) setState({ Component: null, error: true });
    });
    return () => { active = false; };
  }, [load, attempt]);

  const retry = () => {
    setState({ Component: null, error: false });
    setAttempt(value => value + 1);
  };
  return { ...state, retry };
}
