"use client";

import React from 'react';
import { Button, Drawer, EmptyState, Skeleton } from './hub-primitives';
import { useDeferredComponent } from './use-deferred-component';

const loadDrawer = () => import('./contact-record-form').then(module => module.ContactRecordDrawer);

// Home and Today only need the record editor after an operator opens it.
export function ContactRecordDrawer(props) {
  const { Component, error, retry } = useDeferredComponent(loadDrawer);
  if (Component) return <Component {...props} />;
  return (
    <Drawer title="연락 기록" subtitle={props.subtitle || props.target?.name} presentation="compact" width="min(520px, 96vw)" onClose={props.onClose}>
      {error ? (
        <EmptyState title="기록창을 불러오지 못했습니다" action={<Button onClick={retry}>다시 불러오기</Button>} />
      ) : <Skeleton lines={4} label="연락 기록창 불러오는 중" />}
    </Drawer>
  );
}
