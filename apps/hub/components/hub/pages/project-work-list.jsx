"use client";

import React from 'react';
import { Button, Checkbox, IconButton, Input, LifecycleBadge } from '../hub-primitives';
import { Iconed } from '../hub-icons';
import { projectItemType, readTaskChecklist, TASK_CHECKLIST_LIMIT } from '@/lib/task-checklist';
import styles from './project-direct-work.module.css';

const TYPE_LABEL = { task: '할 일', subproject: '작업 묶음', milestone: '마일스톤' };
const EMPTY_DRAFT = { title: '', itemType: 'task', request: null, status: 'idle', message: '' };
const dateLabel = value => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Seoul' }).format(date) : '';
};

// Drafts belong to project/task IDs, so changing projects or collapsing a row
// does not discard an input or change the identity of an unresolved save.
export const ProjectWorkList = React.forwardRef(function ProjectWorkList({
  projectId, tasks, canWrite, pendingIds, onCreate, onAddChecklist, onToggleTask, onToggleChecklist, onEdit, draftStore,
}, ref) {
  const { drafts, setDrafts, draftsRef } = draftStore;
  const [expanded, setExpanded] = React.useState({});
  const [showDone, setShowDone] = React.useState({});
  const [feedback, setFeedback] = React.useState({});
  const busy = React.useRef(new Set());
  const inputs = React.useRef(new Map());
  const root = React.useRef(null);
  const currentProject = React.useRef(projectId);
  currentProject.current = projectId;
  const projectKey = `project:${projectId}`;
  const openTasks = tasks.filter(task => !task.done);
  const doneTasks = tasks.filter(task => task.done);
  const updateDraft = (key, patch) => {
    const next = { ...draftsRef.current, [key]: { ...(draftsRef.current[key] || EMPTY_DRAFT), ...patch } };
    draftsRef.current = next;
    setDrafts(next);
  };
  const focusInput = key => requestAnimationFrame(() => inputs.current.get(key)?.focus());

  React.useImperativeHandle(ref, () => ({
    focusNewTask(title = '') {
      const draft = draftsRef.current[projectKey] || EMPTY_DRAFT;
      if (!draft.request && !draft.title) updateDraft(projectKey, { title, itemType: 'task' });
      focusInput(projectKey);
    },
    focusTask(taskId, checkId) {
      setExpanded(previous => ({ ...previous, [taskId]: true }));
      if (tasks.find(task => task.id === taskId)?.done) setShowDone(previous => ({ ...previous, [projectId]: true }));
      requestAnimationFrame(() => {
        const row = [...(root.current?.querySelectorAll('[data-task-id]') || [])].find(element => element.dataset.taskId === taskId);
        const check = checkId ? [...(row?.querySelectorAll('[data-check-id]') || [])].find(element => element.dataset.checkId === checkId) : null;
        const target = check || row;
        target?.scrollIntoView({ behavior: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
        (check ? check.querySelector('[role="checkbox"]') : row?.querySelector('[data-task-expand]'))?.focus({ preventScroll: true });
      });
    },
  }));

  async function saveDraft(key, taskId = null) {
    if (!canWrite || busy.current.has(key)) return;
    const draft = draftsRef.current[key] || EMPTY_DRAFT;
    if (!draft.title.trim() || draft.status === 'saving') return;
    const limit = taskId ? 200 : 300;
    if (draft.title.trim().length > limit) {
      updateDraft(key, { status: 'invalid', message: `제목을 ${limit}자 이내로 줄여주세요. 다음 행동 원문은 프로젝트 기록에 남아 있습니다.` });
      return;
    }
    const request = draft.request || { id: crypto.randomUUID(), title: draft.title.trim(), ...(taskId ? {} : { projectId, itemType: draft.itemType }) };
    const originProject = projectId;
    busy.current.add(key);
    updateDraft(key, { request, status: 'saving', message: '저장 중…' });
    try {
      const result = taskId ? await onAddChecklist(taskId, request) : await onCreate(request);
      if (result?.ok) {
        updateDraft(key, { ...EMPTY_DRAFT, itemType: draft.itemType, status: 'saved', message: result.message || '저장했습니다.' });
        if (currentProject.current === originProject) focusInput(key);
      } else updateDraft(key, { status: 'error', resultStatus: result?.status, message: result?.message || '저장 결과를 확인하지 못했습니다. 같은 내용으로 재시도하세요.' });
    } catch {
      updateDraft(key, { status: 'error', message: '연결을 확인한 뒤 다시 시도하세요. 입력은 유지했습니다.' });
    } finally { busy.current.delete(key); }
  }

  async function toggle(task, checkId, event) {
    const key = `toggle:${task.id}`;
    if (!canWrite || busy.current.has(key)) return;
    busy.current.add(key);
    setFeedback(previous => ({ ...previous, [task.id]: { status: 'saving', message: '저장 중…' } }));
    try {
      const result = checkId ? await onToggleChecklist(task.id, checkId) : await onToggleTask(task.id, event);
      setFeedback(previous => ({ ...previous, [task.id]: result?.ok !== true
        ? { status: 'error', message: result?.message || '저장하지 못했습니다. 다시 시도하세요.' }
        : { status: 'saved', message: '저장됨' } }));
      if (!checkId && !task.done && result?.ok === true) setShowDone(previous => ({ ...previous, [projectId]: true }));
    } catch {
      setFeedback(previous => ({ ...previous, [task.id]: { status: 'error', message: '저장 결과를 확인하지 못했습니다.' } }));
    } finally { busy.current.delete(key); }
  }

  function composer(key, task = null) {
    const draft = drafts[key] || EMPTY_DRAFT;
    const atLimit = task && !draft.request && readTaskChecklist(task).length >= TASK_CHECKLIST_LIMIT;
    const locked = !canWrite || atLimit || draft.status === 'saving' || Boolean(task && pendingIds.has(task.id));
    const label = task ? `${task.title} 세부 체크 추가` : `${TYPE_LABEL[draft.itemType]} 제목`;
    return <div className={styles.composer}>
      <form onSubmit={event => { event.preventDefault(); saveDraft(key, task?.id); }}>
        <Iconed name="plus" size={15} />
        <Input ref={element => { if (element) inputs.current.set(key, element); else inputs.current.delete(key); }}
          ariaLabel={label} placeholder={atLimit ? `세부 체크는 ${TASK_CHECKLIST_LIMIT}개까지 추가할 수 있습니다` : task ? '세부 체크 입력 후 Enter' : `${TYPE_LABEL[draft.itemType]} 입력 후 Enter`}
          value={draft.title} maxLength={task ? 200 : 300} disabled={locked} readOnly={Boolean(draft.request)}
          onChange={title => updateDraft(key, { title, status: 'idle', message: '' })}
          onKeyDown={event => {
            if (event.key === 'Enter' && (event.nativeEvent?.isComposing || event.keyCode === 229)) event.preventDefault();
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); event.currentTarget.blur(); }
          }} />
        <Button type="submit" variant={draft.status === 'error' ? 'outline' : 'ghost'} disabled={locked || !draft.title.trim()} size="sm">
          {draft.status === 'saving' ? '저장 중' : draft.status === 'error' ? '재시도' : '추가'}
        </Button>
      </form>
      {draft.message && <p className={styles.feedback} role={['error', 'invalid'].includes(draft.status) ? 'alert' : 'status'}>{draft.message}</p>}
      {draft.status === 'error' && ['conflict', 'invalid-input'].includes(draft.resultStatus) && <Button variant="ghost" size="sm" onClick={() => { updateDraft(key, { request: null, status: 'idle', message: '', resultStatus: null }); focusInput(key); }}>입력 다시 작성</Button>}
    </div>;
  }

  function row(task) {
    const checks = readTaskChecklist(task);
    const type = projectItemType(task);
    const isOpen = Boolean(expanded[task.id]);
    const pending = pendingIds.has(task.id) || feedback[task.id]?.status === 'saving';
    return <div key={task.id} className={styles.task} data-task-id={task.id} data-done={task.done ? 'true' : 'false'}>
      <div className={`${styles.row} hub-row`}>
        <span className={styles.checkTarget}><Checkbox className={styles.checkbox} size={18} checked={task.done} disabled={!canWrite || pending}
          label={`${task.done ? '다시 열기' : '완료'}: ${task.title}`} onChange={(_next, event) => toggle(task, null, event)} /></span>
        <button type="button" data-task-expand className={styles.taskTitle} aria-expanded={isOpen} aria-controls={`project-work-${task.id}`}
          onClick={() => setExpanded(previous => ({ ...previous, [task.id]: !previous[task.id] }))}>
          {type !== 'task' && <span className={styles.itemType}><Iconed name={type === 'milestone' ? 'flag' : 'folder'} size={13} />{TYPE_LABEL[type]}</span>}
          <span>{task.title}</span><Iconed name={isOpen ? 'chevronD' : 'chevronR'} size={12} />
        </button>
        {checks.length > 0 && <span className={`${styles.checkCount} num`} aria-label={`세부 체크 ${checks.filter(item => item.done).length}/${checks.length} 완료`}>{checks.filter(item => item.done).length}/{checks.length}</span>}
        {task.status === 'blocked' && <LifecycleBadge label="막힘" state="blocked" />}
        {task.status === 'doing' && <LifecycleBadge label="진행" state="active" />}
        {task.dueAt && <span className={`${styles.due} mono`}>{dateLabel(task.dueAt)}</span>}
        <IconButton icon="edit" size={30} className={styles.editButton} tooltip={`${task.title} 상세 편집`} onClick={() => onEdit(task)} disabled={pending} />
      </div>
      <div id={`project-work-${task.id}`} className={styles.details} hidden={!isOpen}>
        {task.description && <p className={styles.description}>{task.description}</p>}
        {task.nextAction && <p className={styles.description}>다음 행동 · {task.nextAction}</p>}
        {checks.map(item => <div key={item.id} className={styles.checkRow} data-check-id={item.id} data-done={item.done ? 'true' : 'false'}>
          <span className={styles.checkTarget}><Checkbox className={styles.checkbox} size={16} checked={item.done} disabled={!canWrite || pending}
            label={`${item.title} ${item.done ? '다시 열기' : '완료'}`} onChange={() => toggle(task, item.id)} /></span>
          <span><strong>{item.title}</strong>{item.note && <p>{item.note}</p>}</span>
          {item.dueAt && <span className={`${styles.due} mono`}>{dateLabel(item.dueAt)}</span>}
        </div>)}
        {composer(`check:${task.id}`, task)}
      </div>
      {feedback[task.id]?.message && <p className={styles.feedback} role={feedback[task.id].status === 'error' ? 'alert' : 'status'}>{feedback[task.id].message}</p>}
    </div>;
  }

  return <section ref={root} className={styles.workList} aria-label="프로젝트 할 일">
    <header className={styles.listHeader}><h2>할 일 <span className="num">{openTasks.length}</span></h2><span>{doneTasks.length}/{tasks.length} 완료</span></header>
    {!tasks.length && <p className={styles.empty}>첫 할 일을 적어보세요. 제목만 입력하면 바로 시작할 수 있습니다.</p>}
    {openTasks.map(row)}
    {composer(projectKey)}
    <div className={styles.listFooter}>
      <details className={styles.addOptions}>
        <summary>다른 항목 추가 <Iconed name="chevronD" size={12} /></summary>
        <div>{Object.entries(TYPE_LABEL).map(([value, label]) => <button key={value} type="button" disabled={!canWrite || Boolean(drafts[projectKey]?.request)} onClick={event => {
          updateDraft(projectKey, { itemType: value }); event.currentTarget.closest('details').open = false; focusInput(projectKey);
        }}>{label}</button>)}</div>
      </details>
      {doneTasks.length > 0 && <button type="button" aria-expanded={Boolean(showDone[projectId])} onClick={() => setShowDone(previous => ({ ...previous, [projectId]: !previous[projectId] }))}>
        <Iconed name={showDone[projectId] ? 'chevronD' : 'chevronR'} size={12} />완료 {doneTasks.length}
      </button>}
    </div>
    {showDone[projectId] && doneTasks.map(row)}
    {!canWrite && <p className={styles.feedback}>기록을 다시 읽은 뒤 할 일을 추가하거나 변경할 수 있습니다.</p>}
  </section>;
});
