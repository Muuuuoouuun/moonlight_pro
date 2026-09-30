"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button, TruthBadge, useToast } from '../hub-primitives';
import { useContentSchedule } from './use-content-schedule';
import { PublishDueView } from './publish-due-view';

const SNOOZE_MS = 30 * 60 * 1000;

// 홈의 '지금 올릴 글' — 올릴 시각이 된 예약과 놓친 예약. 올리는 것은 직접 하고(알림 방식), 없으면 아무것도 그리지 않는다.
export function PublishDue() {
  const schedules = useContentSchedule('action');
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState('');
  const reload = schedules.reload;
  React.useEffect(() => {
    const refreshVisible = () => { if (document.visibilityState === 'visible') reload(); };
    const timer = window.setInterval(refreshVisible, 60000);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refreshVisible); };
  }, [reload]);
  const items = schedules.schedules.filter((row) => row.state === 'due' || row.state === 'missed');

  if (schedules.status === 'loading') return null;
  if (schedules.status === 'error') return <div className="publish-due-note"><TruthBadge state="error" label="예약 확인 실패" /><Button size="xs" onClick={schedules.reload}>다시 불러오기</Button></div>;
  if (schedules.status === 'preview') return <div className="publish-due-note"><TruthBadge state="preview" label="예약 저장소 연결 필요" /></div>;
  if (!items.length) return null;

  const open = (row) => router.push(`/dashboard/content/studio?item=${encodeURIComponent(row.contentId)}&variant=${encodeURIComponent(row.variantId)}`);
  const snooze = async (row) => {
    setBusy(row.variantId);
    const result = await schedules.set({ variantId: row.variantId, contentId: row.contentId, scheduledAt: new Date(Date.now() + SNOOZE_MS).toISOString(), title: row.title, channel: row.channel, expectedRevision: row.revision });
    setBusy('');
    if (['saved', 'duplicate'].includes(result.status)) toast.success('30분 뒤에 다시 알려 드릴게요.');
    else toast.error(result.message || '시각을 바꾸지 못했습니다.');
  };

  return <PublishDueView items={items} busy={busy} onOpen={open} onSnooze={snooze} />;
}
