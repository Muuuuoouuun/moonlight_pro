"use client";
import React from 'react';
import { createTodayTaskActions } from '@/lib/today-task-actions';

export function useTodayTaskActions(taskToday, onChanged) {
  const refresh = React.useRef(onChanged); refresh.current = onChanged;
  const [client] = React.useState(() => createTodayTaskActions({ onChanged: () => refresh.current?.() }));
  const projected = client.observe(taskToday);
  const state = React.useSyncExternalStore(client.subscribe, client.snapshot, client.snapshot);
  return { ...state, taskToday: projected, run: client.run, remove: client.remove };
}
