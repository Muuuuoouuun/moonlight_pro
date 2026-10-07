"use client";

// 결정 일지의 행 조각(docs/superpowers/specs/2026-09-30-check-items-finish-and-unblock-design.md §6).
// 출처 칩 · 연결 프로젝트 · 막힘 풀림, 그리고 카드 밖의 "그래서 할 일" 줄(없으면 한 줄로 바로 만들기).
// 할 일 줄은 클릭 가능한 카드(role=button) 밖에 둔다 — 입력을 버튼 안에 넣지 않는다(§11).

import React from 'react';
import { Badge, LifecycleBadge, TextField } from '../hub-primitives';
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
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const taskIdRef = React.useRef(null);

  if (decision.isNew) return null;
  if (decision.followups === null) {
    return <p className="dj-followups dj-followups--note">그래서 할 일을 읽지 못했습니다 — 없다고 보지 않습니다.</p>;
  }
  const tasks = Array.isArray(decision.followups) ? decision.followups : [];

  async function create(event) {
    event.preventDefault();
    const text = title.trim();
    if (!text || busy) return;
    setBusy(true);
    setError('');
    taskIdRef.current ||= globalThis.crypto.randomUUID();
    try {
      const response = await fetchImpl('/api/hub/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: taskIdRef.current,
          title: text.slice(0, 300),
          decisionId: decision.id,
          ...(decision.projectId ? { projectId: decision.projectId } : {}),
          source: 'decision-journal',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !['saved', 'duplicate'].includes(data.status)) {
        setError(data.status === 'preview' ? '저장소 연결이 필요합니다 — 저장되지 않았습니다.' : '할 일을 만들지 못했습니다. 입력은 남겨 두었습니다.');
        return;
      }
      const task = { id: taskIdRef.current, title: text, status: 'todo', dueAt: null };
      taskIdRef.current = null;
      setTitle('');
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('moonlight:tasks-saved'));
      onCreated?.(decision.id, task);
    } catch {
      setError('연결을 확인한 뒤 다시 시도해 주세요. 입력은 남겨 두었습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dj-followups">
      {tasks.length ? <span className="dj-followups__label">그래서 할 일</span> : null}
      {tasks.length ? (
        <ul>
          {tasks.map((task) => (
            <li key={task.id}>
              <LifecycleBadge state={TASK_LIFECYCLE[task.status] || 'queued'} />
              <span className={task.status === 'done' ? 'dj-task dj-task--done' : 'dj-task'}>{task.title}</span>
              {task.dueAt ? <span className="mono dj-due">{shortDay(task.dueAt)}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <form className="dj-quick" onSubmit={create} aria-label={`${decision.title} 그래서 할 일 만들기`}>
          <TextField
            label="그래서 할 일"
            value={title}
            maxLength={300}
            disabled={busy}
            placeholder="한 줄로 바로 만들기 — Enter"
            onChange={(e) => setTitle(e.target.value)}
            fieldStyle={{ flex: '1 1 240px' }}
          />
          {error ? <span className="dj-error" role="alert">{error}</span> : null}
        </form>
      )}
    </div>
  );
}
