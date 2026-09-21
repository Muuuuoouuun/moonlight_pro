"use client";

import React from "react";
import { Button, Card, Checkbox, Dot, EmptyState } from "../hub-primitives";
import { TaskChecklistGauge } from "./project-task-checklist";
import { EMPTY_ALL_BRAND, TODO_TIME_SECTIONS, seoulDayKey, todoTimeSection } from "./project-view-constants";

const DAY_MS = 24 * 60 * 60 * 1000;

// 구간 헤더의 빠른 생성 — 그 구간의 기한을 드로어에 미리 채워 달력을 다시 여는 단계를
// 없앤다(2026-09-20 입력 동선). `days`가 null이면 기한 없이 만든다. '기한 지남'과 '이후'는
// 시드할 정확한 날짜가 없어(지난 날짜를 새로 만드는 동선은 없다) 버튼을 두지 않는다.
const TODO_SECTION_SEED = {
  '오늘': { days: 0, label: '오늘 기한으로 추가' },
  '내일': { days: 1, label: '내일 기한으로 추가' },
  '이번 주': { days: 7, label: '이번 주 기한으로 추가' },
  '기한 없음': { days: null, label: '기한 없이 추가' },
};

function seedDueForSection(section) {
  const seed = TODO_SECTION_SEED[section];
  if (!seed) return null;
  return { ...seed, dueAt: seed.days === null ? '' : seoulDayKey(new Date(Date.now() + seed.days * DAY_MS)) };
}

// projects.jsx의 `{view === 'todos' && canWriteTasks && (…)}` 블록 이동. 훅·상태 없음.
// 시간 구간(기한 지남/오늘/내일/이번 주/이후/기한 없음)은 project-view-constants의
// todoTimeSection이 정본이고, 완료된 항목은 지난 기한이어도 danger로 올리지 않는다
// (DESIGN.md §5.2 no-warning-by-default).
export function ProjectTodosView({
  items,
  projectById,
  brands,
  brandByKey,
  pendingTaskIds,
  prioTone,
  onToggleTodo,
  onEditTodo,
  onCreateTodo,
  onResetFilters,
}) {
  return (
    <div className="scroll-y" style={{ flex: 1, padding: 'var(--section-gap)' }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        {items.length === 0 && (
          <Card>
            <EmptyState
              icon="orders"
              title="이 조건의 할 일이 없습니다"
              description="필터를 초기화하거나 새 작업을 추가하세요."
              // §8.1 — 빈 상태는 생성 CTA를 포함한다. 백로그 뷰(ProjectExecutionBacklog)와
              // 같은 쌍(필터 초기화 + 작업 추가)으로 맞춘다. 문구만 있고 버튼이 없어
              // "추가하세요"가 막다른 길이던 것을 닫는다.
              action={<>
                <Button variant="outline" size="sm" onClick={onResetFilters}>필터 초기화</Button>
                <Button variant="primary" size="sm" icon="plus" onClick={() => onCreateTodo('')}>작업 추가</Button>
              </>}
            />
          </Card>
        )}
        {(() => {
          // 시간 구간 재편 (2026-08-19, monday My Work 문법) — 기한 지남/오늘/내일/
          // 이번 주/이후/기한 없음. 옛 4버킷은 지남을 '오늘'에, 무기한을 '다음주'에
          // 뭉갰고 목업 리터럴 날짜('4/20'…)가 남아 있었다. 무기한 분리는 Q120 확정.
          const todayKey = seoulDayKey(new Date());
          const source = items;
          if (source.length === 0) return null;
          const bySection = new Map(TODO_TIME_SECTIONS.map(s => [s, []]));
          for (const t of source) bySection.get(todoTimeSection(t, todayKey)).push(t);
          return TODO_TIME_SECTIONS.map(bucket => {
          const items = bySection.get(bucket);
          if (!items.length) return null;
          // 구간 안에서도 공통 실행 모델의 선택 정렬을 유지한다.
          const overdueBucket = bucket === '기한 지남';
          const seed = seedDueForSection(bucket);
          return (
            <div key={bucket} style={{ marginBottom: 'var(--section-gap)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)' }}>
                  {/* 지남 카운트만 danger — §5.2 즉시 손실 상태의 집계 표기. */}
                  {bucket} · <span className="num" style={overdueBucket ? { color: 'var(--danger)' } : undefined}>{items.length}</span>
                </div>
                <div style={{ flex: 1 }} />
                {seed && (
                  <Button variant="ghost" size="xs" icon="plus" onClick={() => onCreateTodo(seed.dueAt)}>{seed.label}</Button>
                )}
              </div>
              <Card pad={false}>
                {items.map((t, i) => {
                  const proj = projectById.get(t.project);
                  const pBrand = brandByKey.get(t.brand) || brands[0] || EMPTY_ALL_BRAND;
                  return (
                    <div key={t.id} className="hub-project-todo-row" data-done={t.done ? 'true' : 'false'} data-last={i === items.length - 1 ? 'true' : 'false'}>
                      <div className="hub-project-todo-check">
                        <Checkbox
                          checked={t.done}
                          onChange={(_next, e) => onToggleTodo(t.id, e)}
                          disabled={pendingTaskIds.has(t.id)}
                          size={16}
                          label={`${t.done ? '다시 열기' : '완료'}: ${t.title}`}
                        />
                      </div>
                      <div
                        className="hub-project-todo-main hub-row"
                        role="button"
                        tabIndex={0}
                        aria-label={`${t.title} 편집`}
                        onClick={() => onEditTodo(t)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEditTodo(t); } }}
                        style={{ minWidth: 0, borderRadius: 'var(--r-sm)', padding: '2px 6px', margin: '-2px -6px' }}
                      >
                        <div style={{ fontSize: 13, textDecoration: t.done ? 'line-through' : 'none' }}>{t.title}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginTop: 3 }}>
                          {pBrand.name} · {proj?.name}
                        </div>
                        <TaskChecklistGauge task={t} />
                      </div>
                      <span className="hub-project-todo-assignee">{t.assignee}</span>
                      <span className="hub-project-todo-priority">
                        <Dot tone={prioTone[t.priority]} />{t.priority}
                      </span>
                      <span className="mono hub-project-todo-due">{t.due}</span>
                    </div>
                  );
                })}
              </Card>
            </div>
          );
          });
        })()}
      </div>
    </div>
  );
}
