'use client';
import React from 'react';
import { Skeleton, TruthBadge, LifecycleBadge } from './hub-primitives';

// "AI는 끝냈고 내가 볼 것" — completed 스킬 receipt가 있고 연결된 할 일이 아직
// done이 아닌 것만 모은 목록. 자동 완료·자동 생성 없음 — 행을 누르면 기존 할 일
// 딥링크(`?task=`)로 이동해 운영자가 직접 완료한다. 오늘 화면·Office 하단 둘 다
// 이 컴포넌트 하나를 마운트한다(2026-09-26 운영자 승인, open-ai-tools-borrowed-concepts-plan §4 11-2).
const ACTOR_LABELS = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  'claude-desktop': 'Claude Desktop',
};

function actorLabel(actorId) {
  if (!actorId) return '알 수 없음';
  return ACTOR_LABELS[actorId] || actorId;
}

function evidenceLine(evidence) {
  if (!evidence || typeof evidence.value !== 'string') return '';
  return evidence.value;
}

function formatCompletedAt(iso) {
  if (typeof iso !== 'string' || !iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function useReviewWaiting() {
  const [state, setState] = React.useState({ status: 'loading', items: [] });
  const load = React.useCallback(() => {
    let active = true;
    setState((prev) => ({ ...prev, status: 'loading' }));
    fetch('/api/hub/review-waiting', { cache: 'no-store' })
      .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => null) }))
      .then(({ ok, d }) => {
        if (!active) return;
        if (!ok || !d || d.status === 'error') { setState({ status: 'error', items: [] }); return; }
        setState({ status: d.status, items: Array.isArray(d.items) ? d.items : [] });
      })
      .catch(() => { if (active) setState({ status: 'error', items: [] }); });
    return () => { active = false; };
  }, []);
  React.useEffect(() => load(), [load]);
  return state;
}

// 할 일 딥링크는 기존 규칙을 그대로 쓴다(내 작업의 `?task=` — work.jsx·command-palette-records.js와 동일).
export function reviewWaitingTaskHref(taskId) {
  return `dashboard/work/my?task=${encodeURIComponent(taskId)}`;
}

export function ReviewWaitingList({ onNavigate }) {
  const { status, items } = useReviewWaiting();
  if (status === 'loading') {
    return <Skeleton lines={1} label="확인 대기 확인 중" />;
  }
  if (status === 'preview') {
    return (
      <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <TruthBadge state="preview" /> 확인 대기는 저장 연결 후 표시됩니다.
      </p>
    );
  }
  if (status === 'error') {
    return (
      <p role="alert" style={{ margin: 0, fontSize: 12, color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <TruthBadge state="error" /> 확인 대기를 읽지 못했습니다.
      </p>
    );
  }
  // 표면 예산 — 0건이면 빈 상태 카드 없이 아무것도 그리지 않는다.
  if (!items.length) return null;
  return (
    <div data-review-waiting="true" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {items.map((item) => {
        const href = reviewWaitingTaskHref(item.taskId);
        const line = evidenceLine(item.evidence);
        return (
          <div
            key={item.requestId}
            role="button"
            tabIndex={0}
            className="hub-row"
            onClick={() => onNavigate?.(href)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onNavigate?.(href); }
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '8px 10px', borderRadius: 'var(--r-sm)', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <strong style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--fg)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.taskTitle || '(제목 없음)'}
              </strong>
              <LifecycleBadge state="waiting" reason="확인 대기" />
            </div>
            {item.summary ? <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{item.summary}</div> : null}
            {line ? <div className="mono" style={{ fontSize: 10.5, color: 'var(--fg-dim)', letterSpacing: 0 }}>{line}</div> : null}
            <div style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>
              {actorLabel(item.actorId)}
              {item.completedAt ? ` · ${formatCompletedAt(item.completedAt)}` : ''}
            </div>
          </div>
        );
      })}
    </div>
  );
}
