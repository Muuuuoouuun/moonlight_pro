"use client";

// 결정 일지의 행 조각(docs/superpowers/specs/2026-09-30-check-items-finish-and-unblock-design.md §6).
// 출처 칩 · 연결 프로젝트 · 막힘 풀림, 그리고 카드 밖의 "그래서 할 일" 줄(없으면 한 줄로 바로 만들기).
// 할 일 줄은 클릭 가능한 카드(role=button) 밖에 둔다 — 입력을 버튼 안에 넣지 않는다(§11).

import React from 'react';
import { Badge, Checkbox, LifecycleBadge, TextField } from '../hub-primitives';
import { Iconed } from '../hub-icons';
import { sendJson } from '../decision-actions';
import { DECISION_SOURCES, decisionSourceLabel } from '@/lib/decision-sources';
import './decision-journal.css';

const TASK_LIFECYCLE = { done: 'done', doing: 'active', blocked: 'blocked', inbox: 'queued', todo: 'queued' };

const shortDay = (value) => {
  const ms = Date.parse(value || '');
  return Number.isFinite(ms) ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' }).format(new Date(ms)) : '';
};

/** 출처 필터 — 전체 + 지금 일지에 있는 출처만(빈 갈래를 늘어놓지 않는다). */
export function decisionSourceOptions(decisions = []) {
  const counts = new Map();
  for (const decision of decisions) counts.set(decision.source || 'manual', (counts.get(decision.source || 'manual') || 0) + 1);
  return [
    { key: 'all', label: '전체', count: decisions.length },
    ...DECISION_SOURCES.filter((source) => counts.has(source.key)).map((source) => ({ key: source.key, label: source.label, count: counts.get(source.key) })),
  ];
}

/** 찾기 — 제목·근거·연결 프로젝트·그래서 할 일 제목에서(공백으로 나눈 낱말이 모두 들어가야 한다). */
export function decisionMatches(decision, query) {
  const words = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = [decision.title, decision.reason, decision.rationale, decision.projectName,
    ...(Array.isArray(decision.followups) ? decision.followups.map((task) => task.title) : [])]
    .filter(Boolean).join(' ').toLowerCase();
  return words.every((word) => haystack.includes(word));
}

const MONTH = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long' });
const monthKey = (value) => {
  const ms = Date.parse(value || '');
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date(ms));
};

/** 타임라인을 달로 나눈다 — 결정일이 없는 미정은 `미정` 묶음. 순서는 들어온 순서 그대로(이어진 것끼리). */
export function decisionMonthGroups(decisions = []) {
  const groups = [];
  for (const decision of decisions) {
    const key = decision.decidedAt ? monthKey(String(decision.decidedAt).length === 10 ? `${decision.decidedAt}T12:00:00+09:00` : decision.decidedAt) || 'undated' : 'draft';
    const last = groups[groups.length - 1];
    if (last && last.key === key) { last.items.push(decision); continue; }
    const label = key === 'draft' ? '미정' : key === 'undated' ? '날짜 모름'
      : MONTH.format(new Date(`${key}-15T12:00:00+09:00`));
    groups.push({ key: groups.some((group) => group.key === key) ? `${key}-${groups.length}` : key, label, items: [decision] });
  }
  return groups;
}

export function DecisionMeta({ decision }) {
  const parts = [];
  if (decision.projectName) parts.push(<span key="project">{decision.projectName}</span>);
  if (decision.unblockedProjectId) {
    parts.push(
      <Badge key="unblock" variant="outline">
        막힘 풀림{Number.isFinite(decision.unblockedDays) ? <> · <span className="mono">{decision.unblockedDays}</span>일</> : null}
      </Badge>,
    );
  }
  return (
    <div className="dj-meta">
      <Badge variant="outline">{decisionSourceLabel(decision.source)}</Badge>
      {parts}
    </div>
  );
}

export function DecisionFollowups({ decision, onCreated, fetchImpl = globalThis.fetch }) {
  const [title, setTitle] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [statusOverride, setStatusOverride] = React.useState({}); // { [taskId]: status } — 체크한 뒤 다시 읽기 전까지
  const [pendingIds, setPendingIds] = React.useState(() => new Set());
  const taskIdRef = React.useRef(null);

  if (decision.isNew) return null;
  if (decision.followups === null) {
    return <p className="dj-followups dj-followups--note">그래서 할 일을 읽지 못했습니다 — 없다고 보지 않습니다.</p>;
  }
  const tasks = (Array.isArray(decision.followups) ? decision.followups : [])
    .map((task) => (statusOverride[task.id] ? { ...task, status: statusOverride[task.id] } : task));
  const showInput = !tasks.length || adding;

  async function create(event) {
    event.preventDefault();
    const text = title.trim();
    if (!text || busy) return;
    setBusy(true);
    setError('');
    taskIdRef.current ||= globalThis.crypto.randomUUID();
    const saved = await sendJson(fetchImpl, '/api/hub/tasks', 'POST', {
      id: taskIdRef.current,
      title: text.slice(0, 300),
      decisionId: decision.id,
      ...(decision.projectId ? { projectId: decision.projectId } : {}),
      source: 'decision-journal',
    });
    setBusy(false);
    if (!saved.ok) {
      setError(saved.status === 'preview' ? '저장소 연결이 필요합니다 — 저장되지 않았습니다.' : '할 일을 만들지 못했습니다. 입력은 남겨 두었습니다.');
      return;
    }
    const task = { id: taskIdRef.current, title: text, status: 'todo', dueAt: null };
    taskIdRef.current = null;
    setTitle('');
    setAdding(false);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('moonlight:tasks-saved'));
    onCreated?.(decision.id, task);
  }

  // 그래서 할 일을 여기서 바로 끝낸다(§13) — 할 일 화면까지 가지 않게. 실패하면 원래대로 돌리고 말한다.
  async function toggle(task) {
    if (pendingIds.has(task.id)) return;
    const next = task.status === 'done' ? 'todo' : 'done';
    setError('');
    setPendingIds((prev) => new Set(prev).add(task.id));
    setStatusOverride((prev) => ({ ...prev, [task.id]: next }));
    const saved = await sendJson(fetchImpl, '/api/hub/tasks', 'PATCH', { id: task.id, status: next });
    setPendingIds((prev) => { const copy = new Set(prev); copy.delete(task.id); return copy; });
    if (!saved.ok) {
      setStatusOverride((prev) => { const copy = { ...prev }; delete copy[task.id]; return copy; });
      setError(saved.status === 'preview' ? '저장소 연결이 필요합니다 — 바뀌지 않았습니다.' : '할 일 상태를 바꾸지 못했습니다.');
      return;
    }
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('moonlight:tasks-saved'));
  }

  return (
    <div className="dj-followups">
      {tasks.length ? <span className="dj-followups__label">그래서 할 일</span> : null}
      {tasks.length ? (
        <ul>
          {tasks.map((task) => (
            <li key={task.id}>
              <Checkbox checked={task.status === 'done'} disabled={pendingIds.has(task.id)} label={`${task.status === 'done' ? '다시 열기' : '완료'}: ${task.title}`} onChange={() => toggle(task)} size={16} />
              <span className={task.status === 'done' ? 'dj-task dj-task--done' : 'dj-task'}>{task.title}</span>
              {task.status !== 'done' && task.status !== 'todo' ? <LifecycleBadge state={TASK_LIFECYCLE[task.status] || 'queued'} /> : null}
              {task.dueAt ? <span className="mono dj-due">{shortDay(task.dueAt)}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {showInput ? (
        <form className="dj-quick" onSubmit={create} aria-label={`${decision.title} 그래서 할 일 만들기`}>
          <TextField
            label={tasks.length ? '할 일 하나 더' : '그래서 할 일'}
            value={title}
            maxLength={300}
            disabled={busy}
            placeholder="한 줄로 바로 만들기 — Enter"
            onChange={(e) => setTitle(e.target.value)}
            fieldStyle={{ flex: '1 1 240px' }}
            autoFocus={adding}
          />
        </form>
      ) : (
        <div><button type="button" className="fx-pill-btn fx-pill-btn--ghost" onClick={() => setAdding(true)}><Iconed name="plus" size={12} /> 할 일 추가</button></div>
      )}
      {error ? <span className="dj-error" role="alert">{error}</span> : null}
    </div>
  );
}
