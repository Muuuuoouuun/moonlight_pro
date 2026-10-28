"use client";
import React from 'react';
import { Button, CheckboxRow } from '../hub-primitives';
import { QuickCaptureForm } from '../quick-capture';
import { dateKeyInZone, MAX_FOCUS_PER_DAY } from '@/lib/task-today';
import { isCanonicalUuid } from '@/lib/uuid';
import { createClientId } from '@/lib/pms-ui';
import { createQuickCaptureSession } from '@/lib/quick-task-capture';

// Capturing and choosing are two existing durable operations. A failed choice
// retries only its saved task; it never submits the capture a second time.
export function TodayTaskCapture({ taskToday, actions, onChanged, onNavigate }) {
  const [pickFocus, setPickFocus] = React.useState(true);
  const [pendingTask, setPendingTask] = React.useState(null);
  const [feedback, setFeedback] = React.useState('');
  const [session] = React.useState(() => createQuickCaptureSession({ createId: createClientId }));
  const capture = React.useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot);
  const canPick = taskToday?.state === 'live' && !taskToday?.stale && taskToday?.focus?.picked < MAX_FOCUS_PER_DAY;
  const willPick = pickFocus && canPick;
  const busy = actions.pendingIds.length > 0 || capture.status === 'saving';
  const date = taskToday?.focus?.date;
  async function choose(task, requestedDate = date) {
    if (requestedDate !== dateKeyInZone(new Date())) {
      setPendingTask(null); setFeedback('할 일은 저장했습니다. 날짜가 바뀌었으니 새 오늘 목록에서 선택하세요.'); onChanged?.(); return;
    }
    const result = await actions.run(task, { focus: { on: true } });
    if (result.ok) { setPendingTask(null); setFeedback(`오늘 3개에 넣었습니다 · ${task.title}`); }
    else { setPendingTask({ ...task, requestedDate }); setFeedback(`할 일은 저장했습니다. ${result.message}`); onChanged?.(); }
  }
  async function saved(result) {
    if (!willPick) { setPendingTask(null); setFeedback('할 일을 추가했습니다. 아래 목록에서 오늘 3개를 골라도 됩니다.'); onChanged?.(); return; }
    if (result.data?.destinationType !== 'task' || !isCanonicalUuid(result.data.destinationId)) {
      setFeedback('할 일은 저장했습니다. 아래 목록을 다시 확인한 뒤 오늘 3개를 선택하세요.'); onChanged?.(); return;
    }
    await choose({ id: result.data.destinationId, title: result.capture.raw }, date);
  }
  return <div className="today-task-capture">
    <QuickCaptureForm taskOnly session={session} inputId="daily-brief-quick-task" inputClassName="daily-brief__quick-input" onNavigate={onNavigate} onSaved={saved}
      disabled={busy} submitLabel={willPick ? '추가하고 오늘 3개로' : '할 일 추가'}
      controls={<div className="today-task-capture__choice"><CheckboxRow text="오늘 3개에도 넣기" checked={willPick} disabled={busy || !canPick} onChange={() => { if (session.snapshot().status !== 'saving') setPickFocus(value => !value); }} />
        <span>{taskToday?.focus?.picked >= MAX_FOCUS_PER_DAY ? '세 자리가 찼습니다 · 할 일 목록에 추가' : canPick ? `${MAX_FOCUS_PER_DAY - taskToday.focus.picked}자리 남음` : '오늘 3개 확인 후 선택할 수 있습니다'}</span></div>} />
    {feedback && <div className="today-task-capture__feedback" role="status">{feedback}
      {pendingTask && <div><Button size="xs" variant="secondary" disabled={busy || !canPick} onClick={() => choose(pendingTask, pendingTask.requestedDate)}>이 할 일을 오늘 3개로</Button>
        <Button size="xs" variant="ghost" disabled={busy} onClick={() => { setPendingTask(null); setFeedback('할 일 목록에 보관했습니다.'); }}>목록에만 두기</Button></div>}
    </div>}
  </div>;
}
