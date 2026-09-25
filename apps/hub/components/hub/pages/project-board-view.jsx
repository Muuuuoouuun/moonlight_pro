"use client";

import React from "react";
import { Badge, Dot, IconButton } from "../hub-primitives";
import { TaskChecklistGauge } from "./project-task-checklist";

// 제품에 붙은 일의 종류 칩(제품 운영실 §0) — 색 없이 글자로만.
const WORK_CHIP = { feature: "신기능", maintenance: "보수", contact: "연락" };

// projects.jsx의 `{view === 'board' && canWriteTasks && (…)}` 블록 이동. 훅·상태 없음 —
// drag 상태와 j/k 커서는 부모가 계속 소유한다(뷰 전환 시 리셋 타이밍을 바꾸지 않기 위해).
// 카드 hover는 .hub-kanban-card 클래스가 소유하고(DESIGN.md §8.1), 키보드 커서는
// outline 1px var(--moon-300)로 표시한다(§11). 색은 전부 토큰이다(§5.2).
export function ProjectBoardView({
  visibleColumns,
  todos,
  drag,
  pendingTaskIds,
  selectedId,
  prioTone,
  onDragChange,
  onMoveCard,
  onCreateCard,
  onOpenTask,
  onOpenProject,
}) {
  return (
    <div className="hub-scroll-x" style={{ display: 'flex', gap: 'var(--gap)', overflowX: 'auto', flex: 1, padding: 'var(--section-gap)' }}>
      {visibleColumns.map(col => (
        <div key={col.key}
          onDragOver={e => e.preventDefault()}
          onDrop={() => drag && onMoveCard(drag, col.key)}
          style={{
            width: 280, flexShrink: 0,
            background: 'var(--surface)', border: '1px solid var(--line-soft)',
            borderRadius: 'var(--r-lg)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
          <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--line-soft)' }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{col.label}</span>
            <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)', padding: '1px 6px', background: 'var(--surface-3)', borderRadius: 4 }}>{col.cards.length}</span>
            <div style={{ flex: 1 }} />
            <IconButton icon="plus" size={22} iconSize={12} tooltip="Add card" onClick={() => onCreateCard(col.key)} />
          </div>
          <div className="scroll-y" style={{ flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {col.cards.length === 0 && (
              <div style={{ padding: '18px 8px', fontSize: 11.5, color: 'var(--fg-faint)', textAlign: 'center' }}>카드 없음</div>
            )}
            {col.cards.map(c => (
              <div key={c.id} className="hub-kanban-card" draggable={!pendingTaskIds.has(c.id)} onDragStart={() => onDragChange(c.id)} onDragEnd={() => onDragChange(null)}
                // 보드 카드도 열 수 있어야 한다(§8.1 edit 계약) — 이전에는 이동만 가능하고
                // 마우스로도 키보드로도 편집을 열 방법이 없었다. 클릭/Enter → 태스크 드로어,
                // project-* 카드는 프로젝트 상세로.
                role="button"
                tabIndex={0}
                aria-label={`${c.title} 열기`}
                data-kb-row={c.id}
                onClick={() => {
                  if (String(c.id).startsWith('project-')) { onOpenProject(String(c.id).slice('project-'.length)); return; }
                  const t = todos.find(x => x.id === c.id);
                  if (t) onOpenTask(t.id);
                }}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  if (String(c.id).startsWith('project-')) { onOpenProject(String(c.id).slice('project-'.length)); return; }
                  const t = todos.find(x => x.id === c.id);
                  if (t) onOpenTask(t.id);
                }}
                style={{
                  background: 'var(--surface-2)', border: '1px solid var(--line-soft)',
                  borderRadius: 'var(--r-sm)', padding: 'var(--pad-y) var(--pad-x)', cursor: 'grab',
                  opacity: drag === c.id ? 0.4 : 1,
                  // j/k 키보드 커서 — Deals 칸반과 동일 문법(23차).
                  ...(selectedId === c.id ? { outline: '1px solid var(--moon-300)', outlineOffset: -1 } : {}),
                }}>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 6 }}>
                  <span title={`우선순위 ${c.priority || 'medium'}`} style={{ display: 'inline-flex' }}>
                    <Dot tone={prioTone[c.priority]} size={5} />
                  </span>
                  <span style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{c.project}</span>
                  <div style={{ flex: 1 }} />
                  {WORK_CHIP[c.workType] && <span title={`일 종류 · ${WORK_CHIP[c.workType]}`} style={{ fontSize: 10.5, color: 'var(--fg-muted)', border: '1px solid var(--line)', borderRadius: 'var(--r-xs)', padding: '0 5px', whiteSpace: 'nowrap' }}>{WORK_CHIP[c.workType]}</span>}
                  {c.tag === 'personal' && <Badge tone="personal" size="xs">P</Badge>}
                  {c.tag === 'company' && <Badge tone="company" size="xs">C</Badge>}
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.4 }}>{c.title}</div>
                {(c.nextAction || c.description) && (
                  <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 6, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere' }}>
                    {c.nextAction ? `다음 행동 · ${c.nextAction}` : c.description}
                  </div>
                )}
                {c.projectId && (
                  <a
                    href={`/dashboard/work/projects?project=${encodeURIComponent(c.projectId)}`}
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    style={{ display: 'flex', alignItems: 'center', minHeight: 44, fontSize: 11.5, color: 'var(--fg-muted)', textDecoration: 'underline' }}
                  >프로젝트 · 연결 메모 보기</a>
                )}
                <TaskChecklistGauge task={c} />
                {c.due && <div className="mono" style={{ fontSize: 10.5, color: 'var(--fg-muted)', marginTop: 6 }}>기한 · {c.due}</div>}
                <select
                  className="hub-project-board-status"
                  aria-label={`${c.title} 상태 변경`}
                  aria-busy={pendingTaskIds.has(c.id) ? 'true' : undefined}
                  disabled={pendingTaskIds.size > 0}
                  value={col.key}
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                  onChange={(event) => onMoveCard(c.id, event.target.value)}
                >
                  {visibleColumns.map(option => (
                    <option key={option.key} value={option.key}>{option.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
