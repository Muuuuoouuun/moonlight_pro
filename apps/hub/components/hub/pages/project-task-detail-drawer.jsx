"use client";

import React from 'react';
import { GoalLinks } from '../goal-links';
import { DateQuickPresets, EditDrawer, TextAreaField } from '../hub-primitives';
import { Iconed } from '../hub-icons';
import { TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS } from '@/lib/pms-ui';
import { checklistForSave } from '@/lib/task-checklist-input';
import { validateTaskChecklist, PROJECT_ITEM_OPTIONS, projectItemType } from '@/lib/task-checklist';
import { TaskChecklistEditor, TaskChecklistGauge } from './project-task-checklist';
import styles from './project-task-detail-drawer.module.css';

export function ProjectTaskDetailDrawer({ draft, editing, projects, onChange, onSave, onContinue, onDelete, onClose, checklistConflict, onUseCurrentChecklist, onKeepDraftChecklist }) {
  const [saving, setSaving] = React.useState(false);
  const [goalsVisitedId, setGoalsVisitedId] = React.useState(null);
  const itemType = projectItemType(draft || {});
  const itemLabel = itemType === 'task' ? '할 일' : PROJECT_ITEM_OPTIONS.find(option => option.value === itemType).label;
  const error = draft ? validateTaskChecklist(checklistForSave(draft.checklist || [])) : '';
  return (
    <EditDrawer title={`${itemLabel} ${editing ? '편집' : '만들기'}`} subtitle="상세 내용 · 세부 일정 · 체크리스트"
      presentation={editing ? 'side' : 'compact'} width="min(560px, 94vw)" record={draft} infoLabel="상세 내용" optionalLabel="다음 행동"
      fields={[
        { key: 'title', row: 'task-identity', flex: 2, label: '이름', placeholder: '할 일, 작업 묶음 또는 마일스톤 이름' },
        { key: 'itemType', row: 'task-identity', label: '항목 유형', type: 'select', options: PROJECT_ITEM_OPTIONS },
        { key: 'projectId', label: '프로젝트', type: 'select', options: [{ value: '', label: '미지정' }, ...projects.map(item => ({ value: item.id, label: [item.brandName || item.brandLabel, item.name].filter(Boolean).join(' / ') }))] },
        { key: 'status', row: 'task-state', label: '상태', type: 'select', options: TASK_STATUS_OPTIONS },
        { key: 'priority', row: 'task-state', label: '우선순위', type: 'select', options: TASK_PRIORITY_OPTIONS },
        { key: 'dueAt', row: 'task-state', label: '기한', inputType: 'date' },
        { key: 'nextAction', optional: true, label: '다음 행동', placeholder: '막힘을 풀거나 완료하기 위해 할 한 가지' },
      ]}
      onChange={onChange} onClose={onClose} onDelete={onDelete} onContinue={editing ? undefined : onContinue}
      onSave={async () => { setSaving(true); try { return await onSave(); } finally { setSaving(false); } }}
      saveLabel={editing ? '변경사항 저장' : `${itemLabel} 만들기`}
      panels={[{ key: 'checklist', label: '세부 일정·체크리스트', count: draft?.checklist?.length || 0, content:
        <TaskChecklistEditor key={draft?.id || 'new'} task={draft} disabled={saving} onChange={items => onChange('checklist', items)}
          conflict={checklistConflict} onUseCurrent={onUseCurrentChecklist} onKeepDraft={onKeepDraftChecklist} />,
      }]}
    >
      <div className="hub-task-date-presets"><span>기한</span><DateQuickPresets disabled={saving} onPick={value => onChange('dueAt', value)} /></div>
      {draft && draft.checklist?.length > 0 && <TaskChecklistGauge task={{ ...draft, checklist: checklistForSave(draft.checklist) }} />}
      <TextAreaField label="메모" rows={5} spacious className="hub-edit-textarea" disabled={saving}
        value={draft?.description || ''} onChange={event => onChange('description', event.target.value)}
        placeholder="진행 내용, 참고 링크, 기억할 내용을 자유롭게 적어두세요." hint="변경사항을 저장하면 이 할 일에 함께 남습니다." />
      {editing && <details className={styles.goalDisclosure} key={draft?.id} onToggle={event => { if (event.currentTarget.open) setGoalsVisitedId(draft?.id); }}>
        <summary><Iconed name="flag" size={14} />목표 연결 <span>선택</span><Iconed name="chevronD" size={12} /></summary>
        {goalsVisitedId === draft?.id && <GoalLinks entityType="tasks" entityId={draft?.id} scope={draft?.orgScope} showAssistance={false} />}
      </details>}
      {error && <p className="hub-task-checklist-error" role="status">체크리스트 탭 · {error}</p>}
      {checklistConflict && <p className="hub-task-checklist-error" role="alert">체크리스트 탭에서 변경 내용을 확인하고 사용할 항목을 선택하세요.</p>}
    </EditDrawer>
  );
}
