"use client";

import React from 'react';
import { Button, Checkbox, EmptyState, IconButton, TextAreaField, TextField } from '../hub-primitives';
import { checklistEnterAction, checklistForSave } from '@/lib/task-checklist-input';
import { createClientId } from '@/lib/pms-ui';
import { buildTaskChecklistProgress, TASK_CHECKLIST_LIMIT, validateTaskChecklist } from '@/lib/task-checklist';
import { ProjectProgressGauge } from './project-pms-components';

export function TaskChecklistGauge({ task, emptyLabel = '체크리스트 없음' }) {
  const progress = buildTaskChecklistProgress(task);
  return progress.total > 0
    ? <ProjectProgressGauge progress={progress} compact ariaLabel={`${task.title || '작업'} 체크리스트 진행률`} />
    : <span className="hub-task-checklist-empty">{emptyLabel}</span>;
}

export function TaskChecklistEditor({ task, onChange, conflict, onUseCurrent, onKeepDraft, disabled = false }) {
  const items = task?.checklist || [];
  const [notesOpen, setNotesOpen] = React.useState(() => new Map());
  const [lastRemoved, setLastRemoved] = React.useState(null);
  const [focusId, setFocusId] = React.useState(null);
  const refs = React.useRef(new Map());
  React.useEffect(() => { if (focusId) refs.current.get(focusId)?.focus(); }, [focusId]);
  React.useEffect(() => { setLastRemoved(null); }, [conflict]);
  const error = validateTaskChecklist(checklistForSave(items));
  const setItems = next => { if (!disabled) onChange(next); };
  const update = (id, change) => setItems(items.map(item => item.id === id ? { ...item, ...change } : item));
  const add = (insertAt = items.length) => {
    if (disabled || items.length >= TASK_CHECKLIST_LIMIT) return;
    const id = createClientId();
    const next = [...items];
    next.splice(insertAt, 0, { id, title: '', done: false, note: '' });
    setItems(next);
    setFocusId(id);
  };
  const move = (index, offset) => {
    const next = [...items];
    const target = index + offset;
    if (target < 0 || target >= items.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
  };
  return (
    <section className="hub-task-checklist-editor" aria-label="세부 체크리스트">
      <div className="hub-task-checklist-summary">
        <TaskChecklistGauge task={task || {}} />
        <p>Enter로 다음 항목 · 변경사항은 함께 저장됩니다.</p>
        {task?.status === 'done' && items.some(item => !item.done) && <p>완료 상태인 작업에 아직 체크하지 않은 항목이 있습니다.</p>}
      </div>
      {conflict && (
        <div className="hub-task-checklist-conflict" role="alert">
          <strong>다른 창에서도 체크리스트가 변경됐습니다.</strong>
          <p>입력한 목록은 아래에 유지했습니다. 사용할 목록을 선택한 뒤 저장하세요.</p>
          <details><summary>최신 저장 내용 · {conflict.length}개 항목</summary>
            <ol>{conflict.map(item => <li key={item.id}>{item.done ? '완료' : '미완료'} · {item.title}{item.dueAt && <span> · {item.dueAt}</span>}{item.note && <p>{item.note}</p>}</li>)}</ol>
          </details>
          <div className="hub-task-checklist-actions">
            <Button variant="outline" size="sm" disabled={disabled} onClick={onUseCurrent}>최신 항목 사용</Button>
            <Button variant="outline" size="sm" disabled={disabled} onClick={onKeepDraft}>입력한 항목 유지</Button>
          </div>
        </div>
      )}
      {items.length === 0 && <EmptyState icon="tasks" title="세부 항목을 추가하세요" description="작업을 마치기 위한 단계를 나누면 진행률을 확인할 수 있습니다." />}
      <div className="hub-task-checklist-items">
        {items.map((item, index) => (
          <div className="hub-task-checklist-item" key={item.id} data-done={item.done}>
            <div className="hub-task-checklist-item-main">
              <Checkbox checked={item.done} onChange={done => update(item.id, { done })} disabled={disabled} label={`${item.title || `${index + 1}번째 항목`} 체크`} />
              <TextField ref={element => { if (element) refs.current.set(item.id, element); else refs.current.delete(item.id); }}
                aria-label={`항목 ${index + 1}`} value={item.title} maxLength={200} placeholder="완료할 세부 단계" disabled={disabled}
                onChange={event => update(item.id, { title: event.target.value })}
                onKeyDown={event => {
                  const action = checklistEnterAction(items, item.id, event.nativeEvent, disabled);
                  if (!action) return;
                  event.preventDefault(); event.stopPropagation();
                  if (action.focusId) refs.current.get(action.focusId)?.focus();
                  else add(action.insertAt);
                }} />
              <IconButton icon="more" tooltip={`${index + 1}번째 항목 일정·메모·순서·삭제`} size={28} disabled={disabled}
                aria-expanded={notesOpen.get(item.id) ?? Boolean(item.note || item.dueAt)}
                onClick={() => setNotesOpen(previous => new Map(previous).set(item.id, !(previous.get(item.id) ?? Boolean(item.note || item.dueAt))))} />
            </div>
            {(notesOpen.get(item.id) ?? Boolean(item.note || item.dueAt)) && <div className="hub-task-checklist-item-actions">
              <span>세부 메모</span>
              <IconButton icon="arrowUp" tooltip={`${index + 1}번째 항목 위로`} size={28} disabled={disabled || index === 0} onClick={() => move(index, -1)} />
              <IconButton icon="arrowDown" tooltip={`${index + 1}번째 항목 아래로`} size={28} disabled={disabled || index === items.length - 1} onClick={() => move(index, 1)} />
              <IconButton icon="x" tooltip={`${index + 1}번째 항목 삭제`} size={28} disabled={disabled} onClick={() => { setLastRemoved({ item, index }); setItems(items.filter(row => row.id !== item.id)); refs.current.get(items[index + 1]?.id || items[index - 1]?.id)?.focus(); }} />
            </div>}
            {(notesOpen.get(item.id) ?? Boolean(item.note || item.dueAt)) && <TextField label={`항목 ${index + 1} 일정`} type="date" value={item.dueAt || ''} disabled={disabled}
              onChange={event => update(item.id, { dueAt: event.target.value || undefined })} />}
            {(notesOpen.get(item.id) ?? Boolean(item.note || item.dueAt)) && <TextAreaField label={`항목 ${index + 1} 세부 메모`} value={item.note} maxLength={500} rows={2} disabled={disabled}
              placeholder="완료 기준, 참고 링크, 확인할 내용을 적으세요." onChange={event => update(item.id, { note: event.target.value })} />}
          </div>
        ))}
      </div>
      {error && <p className="hub-task-checklist-error" role="status">{error}</p>}
      <div className="hub-task-checklist-actions">
        <Button icon="plus" variant="outline" size="sm" disabled={disabled || items.length >= TASK_CHECKLIST_LIMIT} onClick={() => { const empty = items.find(item => !item.title.trim() && !item.note && !item.done && !item.dueAt); if (empty) refs.current.get(empty.id)?.focus(); else add(); }}>체크리스트 항목 추가</Button>
        {lastRemoved && !items.some(item => item.id === lastRemoved.item.id) && <Button variant="ghost" size="sm" disabled={disabled || items.length >= TASK_CHECKLIST_LIMIT} onClick={() => {
          const next = [...items]; next.splice(Math.min(lastRemoved.index, next.length), 0, lastRemoved.item); setItems(next); setFocusId(lastRemoved.item.id); setLastRemoved(null);
        }}>삭제 되돌리기</Button>}
        <span className="mono">{items.length}/{TASK_CHECKLIST_LIMIT}</span>
      </div>
    </section>
  );
}
