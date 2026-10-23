"use client";

import React from 'react';
import { Button, EmptyState, Skeleton } from './hub-primitives';
import { useDeferredComponent } from './use-deferred-component';

const loadPanel = () => import('./office-workflow-panel').then(module => module.OfficeWorkflowPanel);

// Customer360 mounts this in its existing help section, even while it is folded.
// Only the code is deferred; the panel still owns all read and generation triggers.
export function OfficeWorkflowPanel(props) {
  const { Component, error, retry } = useDeferredComponent(loadPanel);
  const frameRef = React.useRef(null);
  const retryLoad = () => {
    // The retry button disappears during loading. Keep focus inside this drawer.
    frameRef.current?.focus();
    retry();
  };
  return (
    <div ref={frameRef} tabIndex={-1} aria-busy={!Component && !error}>
      {Component ? <Component {...props} /> : error ? (
        <EmptyState title="오피스 도구를 불러오지 못했습니다" action={<Button onClick={retryLoad}>다시 불러오기</Button>} />
      ) : <Skeleton lines={2} label="오피스 도구 불러오는 중" />}
    </div>
  );
}
