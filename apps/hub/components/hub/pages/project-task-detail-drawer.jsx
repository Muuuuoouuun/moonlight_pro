"use client";

import React from 'react';
import { EditDrawer } from '../hub-primitives';
import { TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS } from '@/lib/pms-ui';
import { validateTaskChecklist } from '@/lib/task-checklist';
import { TaskChecklistEditor, TaskChecklistGauge } from './project-task-checklist';

export function ProjectTaskDetailDrawer({ draft, editing, projects, onChange, onSave, onDelete, onClose, checklistConflict, onUseCurrentChecklist, onKeepDraftChecklist }) {
  const [saving, setSaving] = React.useState(false);
  const error = draft ? validateTaskChecklist(draft.checklist || []) : '';
  return (
    <EditDrawer title={editing ? '할 일 편집' : '할 일 만들기'} subtitle="프로젝트 실행 항목 · 상세 내용과 세부 체크리스트"
      width="min(520px, 94vw)" record={draft} infoLabel="상세 내용"
      fields={[
        { key: 'title', label: '할 일', placeholder: '실행할 작업' },
        { key: 'projectId', label: '프로젝트', type: 'select', options: [{ value: '', label: '미지정' }, ...projects.map(item => ({ value: item.id, label: item.name }))] },
        { key: 'status', row: 'task-state', label: '상태', type: 'select', options: TASK_STATUS_OPTIONS },
        { key: 'priority', row: 'task-state', label: '우선순위', type: 'select', options: TASK_PRIORITY_OPTIONS },
        { key: 'dueAt', label: '기한', inputType: 'date' },
        { key: 'nextAction', label: '다음 행동', placeholder: '막힘을 풀거나 완료하기 위해 할 한 가지' },
        { key: 'description', label: '설명 · 참고 자료', type: 'textarea', placeholder: '상세 내용, 참고 링크, 메모를 적어두세요.' },
      ]}
      onChange={onChange} onClose={onClose} onDelete={onDelete}
      onSave={async () => { setSaving(true); try { return await onSave(); } finally { setSaving(false); } }}
      saveLabel={editing ? '변경사항 저장' : '할 일 만들기'}
      panels={[{ key: 'checklist', label: '체크리스트', count: draft?.checklist?.length || 0, content:
        <TaskChecklistEditor key={draft?.id || 'new'} task={draft} disabled={saving} onChange={items => onChange('checklist', items)}
          conflict={checklistConflict} onUseCurrent={onUseCurrentChecklist} onKeepDraft={onKeepDraftChecklist} />,
      }]}
    >
      {draft && <TaskChecklistGauge task={draft} />}
      {error && <p className="hub-task-checklist-error" role="status">체크리스트 탭 · {error}</p>}
      {checklistConflict && <p className="hub-task-checklist-error" role="alert">체크리스트 탭에서 변경 내용을 확인하고 사용할 항목을 선택하세요.</p>}
    </EditDrawer>
  );
}
