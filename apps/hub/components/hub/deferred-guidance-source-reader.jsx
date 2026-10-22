"use client";

import React from 'react';
import { Button, EmptyState, Skeleton } from './hub-primitives';
import { useDeferredComponent } from './use-deferred-component';

const loadReader = () => import('./guidance-source-reader').then(module => module.GuidanceSourceReader);

export function GuidanceSourceReader(props) {
  const { Component, error, retry } = useDeferredComponent(loadReader);
  if (Component) return <Component {...props} />;
  return (
    <section id={props.id} className={props.className} aria-busy={!error}>
      {error ? (
        <EmptyState title="참고 원문을 불러오지 못했습니다" action={<Button onClick={retry}>다시 불러오기</Button>} />
      ) : <Skeleton lines={4} label="참고 원문 불러오는 중" />}
    </section>
  );
}
