"use client";

import React from 'react';
import { Button, Checkbox, EmptyState, SegmentedControl, SelectField, TextField, TruthBadge } from '../hub-primitives';
import { TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS } from '@/lib/pms-ui';
import { TASK_EXECUTION_LENSES, taskDay, taskProjectId } from '@/lib/pms-work-items';
import { TaskChecklistGauge } from './project-task-checklist';

const executionStatusOptions = TASK_STATUS_OPTIONS.map(option => option.value === 'blocked' ? { ...option, label: '막힘' } : option);
const groupDescriptions = {
  inbox: '수집한 일을 확인하고 실행할 항목을 계획으로 옮기세요.',
  todo: '기한과 다음 행동을 정한 뒤 시작하세요.',
  doing: '지금 진행하는 일입니다. 다음 행동으로 이어가세요.',
  blocked: '대기 사유는 설명에, 풀기 위한 행동은 다음 행동에 기록하세요.',
  done: '마친 작업입니다. 필요하면 다시 계획으로 옮길 수 있습니다.',
};

export function ProjectTaskFilters({ projects, filters, counts, partial = false, onChange, onReset, disabled = false }) {
  const missingProject = filters.projectId && filters.projectId !== 'none' && !projects.some(project => project.id === filters.projectId);
  return (
    <div className="hub-pms-task-filters" aria-label="작업 필터">
      <div className="hub-pms-task-filter-fields">
        <SelectField label="프로젝트 범위" value={filters.projectId} disabled={disabled}
          onChange={event => onChange({ ...filters, projectId: event.target.value })}
          options={[
            { value: '', label: '전체 프로젝트' }, { value: 'none', label: '프로젝트 미지정' },
            ...(missingProject ? [{ value: filters.projectId, label: '선택한 프로젝트 · 확인 필요' }] : []),
            ...projects.map(project => ({ value: project.id, label: project.name })),
          ]}
        />
        <SelectField label="우선순위" value={filters.priority} disabled={disabled}
          onChange={event => onChange({ ...filters, priority: event.target.value })}
          options={[{ value: '', label: '모든 우선순위' }, ...TASK_PRIORITY_OPTIONS]}
        />
        <SelectField label="작업 정렬" value={filters.sort} disabled={disabled}
          onChange={event => onChange({ ...filters, sort: event.target.value })}
          options={[{ value: 'due', label: '기한 임박순' }, { value: 'priority', label: '우선순위순' }, { value: 'updated', label: '최근 변경순' }]}
        />
        <Button variant="ghost" size="sm" disabled={disabled} onClick={onReset}>필터 초기화</Button>
      </div>
      <div className="hub-pms-task-lenses hub-scroll-x" style={disabled ? { pointerEvents: 'none' } : undefined}>
        <SegmentedControl label="작업 보기" value={filters.lens}
          options={TASK_EXECUTION_LENSES.map(option => ({ ...option, label: `${option.label} ${counts[option.key]}${partial ? '+' : ''}` }))}
          onChange={lens => { if (!disabled) onChange({ ...filters, lens }); }}
        />
      </div>
    </div>
  );
}

export function ProjectExecutionBacklog({ model, projects, sourceState, partial = false, taskReadFailed = false, pendingIds, canWrite, onEdit, onCreate, onChangeTasks, onRetry, onReset, selectionKey }) {
  const [selected, setSelected] = React.useState(() => new Set());
  const [busy, setBusy] = React.useState(false);
  const busyRef = React.useRef(false);
  const [receipt, setReceipt] = React.useState(null);
  const [dueAt, setDueAt] = React.useState('');
  const [bulkStatus, setBulkStatus] = React.useState('todo');
  const projectById = React.useMemo(() => new Map(projects.map(project => [project.id, project])), [projects]);
  const today = taskDay(new Date());
  const selectedRows = model.items.filter(task => selected.has(task.id));
  const allSelected = model.items.length > 0 && selectedRows.length === model.items.length;
  React.useEffect(() => { setSelected(new Set()); setReceipt(null); }, [selectionKey]);

  const apply = async (rows, patch) => {
    if (!rows.length || !canWrite || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setReceipt(null);
    try {
      const result = await onChangeTasks(rows, patch);
      setReceipt(result);
      setSelected(previous => {
        const next = new Set(previous);
        for (const saved of result.saved) next.delete(saved.id);
        return next;
      });
    } finally { busyRef.current = false; setBusy(false); }
  };

  if (sourceState === 'loading' || sourceState === 'preview' || sourceState === 'error' || taskReadFailed) {
    const state = taskReadFailed ? 'error' : sourceState;
    return (
      <div className="hub-pms-backlog scroll-y">
        <TruthBadge state={state} />
        <EmptyState icon="tasks" title={state === 'loading' ? '작업을 불러오는 중입니다' : state === 'preview' ? '작업 기록을 연결해 주세요' : '작업을 확인하지 못했습니다'}
          description={state === 'preview' ? '연결된 작업이 있어야 백로그와 실행 상태를 관리할 수 있습니다.' : '확인되지 않은 작업을 빈 목록으로 표시하지 않습니다.'}
          action={state !== 'loading' ? <Button variant="outline" size="sm" onClick={onRetry}>다시 불러오기</Button> : null}
        />
      </div>
    );
  }

  return (
    <div className="hub-pms-backlog scroll-y" aria-label="실행 백로그" aria-busy={busy}>
      <div className="hub-pms-backlog-intro">
        <div><h3>실행 백로그</h3><p>수집 → 계획 → 진행 → 완료. 일을 고르고, 기한과 다음 행동을 정리하세요.</p></div>
        <span className="mono">{model.items.length}{partial ? '+' : ''}개 작업</span>
      </div>
      {partial && <div className="hub-pms-backlog-notice" role="status"><TruthBadge state="partial" /> 확인된 작업만 표시합니다. <Button variant="ghost" size="sm" onClick={onRetry}>다시 불러오기</Button></div>}
      {model.items.length > 0 && (
        <div className="hub-pms-bulk-bar">
          <div className="hub-pms-bulk-selection">
            <Checkbox size={17} label={`표시된 작업 ${model.items.length}개 전체 선택`} checked={allSelected} disabled={busy || !canWrite}
              onChange={() => setSelected(allSelected ? new Set() : new Set(model.items.map(task => task.id)))} />
            <span><strong className="num">{selectedRows.length}</strong>개 선택</span>
          </div>
          {selectedRows.length > 0 ? (
            <>
              <SelectField label="선택 작업 상태" value={bulkStatus} disabled={busy} options={executionStatusOptions} onChange={event => setBulkStatus(event.target.value)} />
              <Button variant="outline" size="sm" disabled={busy || !canWrite} onClick={() => apply(selectedRows, { status: bulkStatus })}>상태 적용</Button>
              <TextField label="선택 작업 기한" type="date" value={dueAt} disabled={busy} onChange={event => setDueAt(event.target.value)} />
              <Button variant="outline" size="sm" disabled={busy || !canWrite || !dueAt} onClick={() => apply(selectedRows, { dueAt })}>기한 적용</Button>
              <Button variant="ghost" size="sm" disabled={busy || !canWrite} onClick={() => apply(selectedRows, { dueAt: '' })}>기한 해제</Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setSelected(new Set())}>선택 해제</Button>
            </>
          ) : <span className="hub-pms-muted">작업을 선택해 상태와 기한을 한 번에 변경하세요.</span>}
          {busy && <span role="status">저장 중…</span>}
        </div>
      )}
      {receipt && (
        <div className="hub-pms-backlog-notice" data-error={receipt.failed.length > 0} role={receipt.failed.length ? 'alert' : 'status'}>
          <span>{receipt.saved.length}개 저장{receipt.failed.length > 0 ? ` · ${receipt.failed.length}개 미저장` : ' 완료'}</span>
          {receipt.failed.map(failure => (
            <div key={failure.id} className="hub-pms-write-failure">
              <span>{model.items.find(task => task.id === failure.id)?.title || failure.current?.title || failure.id} · {failure.message}</span>
              {failure.current && <Button variant="ghost" size="sm" onClick={() => onEdit(failure.current)}>최신 내용 확인</Button>}
            </div>
          ))}
        </div>
      )}
      {model.items.length === 0 ? (
        <EmptyState icon="tasks" title="이 조건의 작업이 없습니다" description="필터를 초기화하거나 새 작업을 추가하세요."
          action={<><Button variant="outline" size="sm" onClick={onReset}>필터 초기화</Button><Button variant="primary" size="sm" icon="plus" onClick={() => onCreate('inbox')}>작업 추가</Button></>}
        />
      ) : model.groups.map(group => (
        <section key={group.key} className="hub-pms-backlog-group" aria-label={group.label}>
          <div className="hub-pms-backlog-group-head">
            <div><h4>{group.label} <span className="mono">{group.items.length}</span></h4><p>{groupDescriptions[group.key]}</p></div>
            <Button variant="ghost" size="sm" icon="plus" disabled={busy || !canWrite} onClick={() => onCreate(group.key)}>추가</Button>
          </div>
          <div role="list">
            {group.items.map(task => {
              const date = taskDay(task.dueAt);
              const overdue = task.status !== 'done' && date && date < today;
              const disabled = busy || !canWrite || pendingIds.has(task.id);
              return (
                <div key={task.id} role="listitem" className="hub-pms-backlog-row hub-row" data-selected={selected.has(task.id)} data-done={task.status === 'done'}>
                  <Checkbox size={17} checked={selected.has(task.id)} disabled={disabled} label={`${task.title} 선택`}
                    onChange={checked => setSelected(previous => { const next = new Set(previous); if (checked) next.add(task.id); else next.delete(task.id); return next; })} />
                  <div className="hub-pms-task-cell">
                  <button className="hub-pms-task-main" onClick={() => onEdit(task)} disabled={busy}>
                    <span className="hub-pms-task-context"><span className="mono">{String(task.id).slice(0, 8)}</span> · {projectById.get(taskProjectId(task))?.name || '프로젝트 미지정'}</span>
                    <span className="hub-pms-task-title">{task.title}</span>
                    <span className="hub-pms-task-next" data-blocked={task.status === 'blocked'}>{task.status === 'blocked' ? '막힘 · ' : ''}{task.nextAction || (task.status === 'done' ? '완료한 작업' : '다음 행동을 기록하세요')}</span>
                  </button>
                  <TaskChecklistGauge task={task} />
                  </div>
                  <select className="hub-pms-inline-select" aria-label={`${task.title} 상태 변경`} value={task.status} disabled={disabled} onChange={event => apply([task], { status: event.target.value })}>
                    {executionStatusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <select className="hub-pms-inline-select" aria-label={`${task.title} 우선순위 변경`} value={task.priorityRaw || 'medium'} disabled={disabled} onChange={event => apply([task], { priority: event.target.value })}>
                    {TASK_PRIORITY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <span className="hub-pms-task-due mono" data-overdue={Boolean(overdue)}>{date ? `${overdue ? '지남 · ' : ''}${date.slice(5).replace('-', '.')}` : '기한 없음'}</span>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
