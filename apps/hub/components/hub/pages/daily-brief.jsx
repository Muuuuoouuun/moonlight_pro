"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import { Badge, Dot, Card, SectionTitle, Button, Progress, Sparkline, SyncBadge, EmptyState } from "../hub-primitives";
import { useUndoableAction } from "../use-undoable-action";
import { createClientId } from "@/lib/pms-ui";
import { buildQuickCapture, isDurableQuickCaptureResult } from "@/lib/quick-task-capture";
import { isDurableTaskUpdateResult } from "@/lib/task-today";
import { QUICK_LOG_ACTIONS as WO_EXECUTE_ACTIONS } from "@/lib/sales-os/outcome-attribution";
import {
  beginRhythmCheck,
  buildRhythmCheckPayload,
  createRhythmCheckState,
  finishRhythmCheck,
  getRhythmProgressProps,
  resolveRhythmCheckResult,
} from "@/lib/rhythm-ui";

function formatBriefDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date).replace(',', ' ·').replace(',', ' ·');
}

function greetingFor(date) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// Matches the daily-brief API's money formatter so the KPI cards and the pipeline card
// read in the same ₩M/₩K units — no drift between server-formatted and client-formatted money.
function formatMoney(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n === 0) return '₩0';
  if (n >= 1000000) return `₩${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `₩${Math.round(n / 1000)}K`;
  return `₩${n}`;
}

const SIGNAL_TARGETS = {
  draft: 'dashboard/content/studio?new=draft',
  escalate: 'dashboard/revenue/deals',
  followup: 'dashboard/revenue/deals?draft=followup',
  deals: 'dashboard/revenue/deals',
  leads: 'dashboard/revenue/leads',
  revenue: 'dashboard/revenue/overview',
  wait: 'dashboard/work/rhythm',
  write: 'dashboard/content/studio',
  queue: 'dashboard/content/queue',
  delay: 'dashboard/content/queue',
  review: 'dashboard/automations/runs',
  flows: 'dashboard/automations/flows',
  dismiss: 'dashboard/daily-brief',
  accept: 'dashboard/work/roadmap',
  chat: 'dashboard/agents/chat',
  hold: 'dashboard/work/decisions',
  start: 'dashboard/work/rhythm?check=weekly-review',
  projects: 'dashboard/work/projects',
  decision: 'dashboard/work/decisions?new=decision',
  rhythm: 'dashboard/work/rhythm',
  focus: 'dashboard/work/calendar?focus=15',
  // 승인 큐의 정본 표면(agents/orders) — 자기 경로(daily-brief)를 가리키면 내비가
  // 스킵돼 "처리함"만 찍히는 no-op 버튼이 된다(2026-08-05 re-audit #6).
  queueApprovals: 'dashboard/agents/orders',
};

const CONTEXT_TARGETS = {
  Revenue: 'dashboard/revenue/deals',
  Content: 'dashboard/content/queue',
  Automation: 'dashboard/automations/runs',
  Agent: 'dashboard/agents/council',
  Rhythm: 'dashboard/work/rhythm',
  Work: 'dashboard/work/projects',
};

// 결정 상태는 KST 날짜 스코프로 이 기기에 영속한다 — 이전에는 컴포넌트 로컬 state뿐이라
// "✓ 처리" 영수증이 새로고침에 증발하는 가짜였다. 신호는 매일 원장에서 재파생되므로 날짜
// 키가 자연 만료다. (원장 영속 dismiss는 attention 컷오버 백로그 — 그때 이 키를 대체한다.)
const BRIEF_DECISION_PREFIX = 'hub:brief-decisions:';
function briefDecisionStorageKey() {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return `${BRIEF_DECISION_PREFIX}${day}`;
}
function signalDecisionKey(s) {
  return `${s.kind}|${s.source?.ref || s.title}`;
}
function useBriefDecision(signalKey) {
  const [decided, setDecidedState] = React.useState(null);
  React.useEffect(() => {
    try {
      const map = JSON.parse(localStorage.getItem(briefDecisionStorageKey()) || '{}');
      setDecidedState(map[signalKey] || null);
    } catch { /* storage 불가 환경에서는 세션 한정 동작으로 남긴다 */ }
  }, [signalKey]);
  const setDecided = React.useCallback((label) => {
    setDecidedState(label);
    try {
      const key = briefDecisionStorageKey();
      const map = JSON.parse(localStorage.getItem(key) || '{}');
      if (label == null) delete map[signalKey]; else map[signalKey] = label;
      localStorage.setItem(key, JSON.stringify(map));
      // 지난 날짜 키 정리 — 하루 지난 결정 기록은 재사용되지 않는다.
      for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const k = localStorage.key(i);
        if (k && k.startsWith(BRIEF_DECISION_PREFIX) && k !== key) localStorage.removeItem(k);
      }
    } catch { /* ditto */ }
  }, [signalKey]);
  return [decided, setDecided];
}

// KPI cards click through to their surface (falls back to the API-provided m.target).
const METRIC_TARGETS = {
  MRR: 'dashboard/revenue/overview',
  Pipeline: 'dashboard/revenue/deals',
  'Leads (30d)': 'dashboard/revenue/leads',
  Published: 'dashboard/content/queue',
};

const BRIEF_DESTINATIONS = [
  { key: 'tasks', label: '내 작업', icon: 'inbox', target: 'dashboard/work/my' },
  { key: 'calendar', label: '캘린더', icon: 'calendar', target: 'dashboard/work/calendar' },
  { key: 'projects', label: '프로젝트', icon: 'projects', target: 'dashboard/work/projects' },
  { key: 'followups', label: '고객 연락', icon: 'bell', target: 'dashboard/revenue/followups' },
  { key: 'content', label: '콘텐츠', icon: 'content', target: 'dashboard/content/queue' },
];

// Deep-link a signal decision to the specific record drawer when the target is the
// deals/leads board and the signal carries a real id — revenue.jsx reads ?deal=/?lead=.
// Sentinel refs (TODAY/NEW/PROPOSED…) are aggregate signals with no single record.
const SENTINEL_REFS = new Set(['TODAY', 'NEW', 'PROPOSED', 'QUEUE', '—', '']);
function withEntityRef(target, source) {
  if (!target || !source || !source.ref) return target;
  const ref = String(source.ref).trim();
  if (SENTINEL_REFS.has(ref.toUpperCase())) return target;
  const from = String(source.from || '').toLowerCase();
  const join = target.includes('?') ? '&' : '?';
  if (target.startsWith('dashboard/revenue/deals') && from.startsWith('deal')) {
    return `${target}${join}deal=${encodeURIComponent(ref)}`;
  }
  if (target.startsWith('dashboard/revenue/leads') && from.startsWith('lead')) {
    return `${target}${join}lead=${encodeURIComponent(ref)}`;
  }
  return target;
}

// Command Brief priority: the single most urgent signal becomes the full-width command;
// the rest fall into a triaged queue. danger → warning → info → success → neutral, then
// original API order (already urgency-sorted server-side) as the tiebreak.
const TONE_RANK = { danger: 0, warning: 1, info: 2, success: 3, neutral: 4 };
function rankSignals(signals) {
  return signals
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (TONE_RANK[a.s.tone] ?? 5) - (TONE_RANK[b.s.tone] ?? 5) || a.i - b.i)
    .map((x) => x.s);
}

function syncTone(state) {
  if (state === 'live') return 'success';
  if (state === 'partial') return 'warning';
  if (state === 'error') return 'danger';
  if (state === 'mixed' || state === 'syncing') return 'info';
  if (state === 'preview') return 'moon';
  return 'neutral';
}

function sourceLabel(state) {
  if (state === 'live') return 'live';
  if (state === 'partial') return 'partial';
  if (state === 'error') return 'error';
  if (state === 'syncing') return 'syncing';
  if (state === 'mixed') return 'mixed';
  return 'preview';
}

function QuickTaskCapture({ onNavigate, onSaved }) {
  const [raw, setRaw] = React.useState('');
  const [hint, setHint] = React.useState('task');
  const [state, setState] = React.useState({ status: 'idle', message: 'Enter로 할 일 저장' });
  const requestIdRef = React.useRef(null);

  if (!requestIdRef.current) requestIdRef.current = createClientId();

  async function submit(event) {
    event.preventDefault();
    const capture = buildQuickCapture({ id: requestIdRef.current, raw, hint });

    if (!capture.ok) {
      setState({ status: 'error', message: '할 일을 한 줄로 입력하세요.' });
      return;
    }

    setState({ status: 'saving', message: '저장 중…' });
    try {
      const response = await fetch('/api/hub/inbox', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(capture.payload),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok && isDurableQuickCaptureResult(data)) {
        setRaw('');
        requestIdRef.current = createClientId();
        const message = data.status === 'duplicate'
          ? '이미 저장된 입력입니다.'
          : data.destinationType === 'work_order'
            ? '정리 전에 보관했습니다.'
            : '할 일로 저장했습니다.';
        setState({ status: 'saved', message, destinationType: data.destinationType });
        onSaved?.();
        return;
      }

      setState({
        status: 'error',
        message: data.error || data.status || `저장 실패 (${response.status})`,
      });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : '저장에 실패했습니다. 같은 입력으로 다시 시도하세요.',
      });
    }
  }

  const saving = state.status === 'saving';
  const stateColor = state.status === 'error'
    ? 'var(--danger)'
    : state.status === 'saved'
      ? 'var(--success)'
      : 'var(--fg-faint)';

  function changeHint(nextHint) {
    if (saving || nextHint === hint) return;
    if (state.status === 'error') requestIdRef.current = createClientId();
    setHint(nextHint);
    setState({ status: 'idle', message: nextHint === 'task' ? 'Enter로 할 일 저장' : 'Enter로 정리 전에 보관' });
  }

  return (
    <Card className="daily-brief__capture daily-brief__panel" style={{ padding: '14px 16px' }}>
      <form aria-label="빠른 입력" onSubmit={submit} className="hub-stackable-row" style={{ display: 'flex', alignItems: 'end', gap: 10 }}>
        <div style={{ display: 'flex', flex: '1 1 360px', minWidth: 0, flexDirection: 'column', gap: 7 }}>
          <div className="hub-stackable-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label htmlFor="daily-brief-quick-task" className="mono" style={{ flex: 1, fontSize: 10.5, color: 'var(--fg-faint)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Quick Capture</label>
            <div role="group" aria-label="저장 위치" style={{ display: 'flex', gap: 4 }}>
              <Button type="button" variant={hint === 'task' ? 'secondary' : 'ghost'} size="xs" aria-pressed={hint === 'task'} disabled={saving} onClick={() => changeHint('task')}>할 일</Button>
              <Button type="button" variant={hint === 'inbox' ? 'secondary' : 'ghost'} size="xs" aria-pressed={hint === 'inbox'} disabled={saving} onClick={() => changeHint('inbox')}>정리 전</Button>
            </div>
          </div>
          <input
            id="daily-brief-quick-task"
            value={raw}
            onChange={(event) => {
              setRaw(event.target.value);
              if (state.status === 'error') requestIdRef.current = createClientId();
              if (state.status !== 'idle') setState({ status: 'idle', message: hint === 'task' ? 'Enter로 할 일 저장' : 'Enter로 정리 전에 보관' });
            }}
            placeholder={hint === 'task' ? '지금 놓치면 안 되는 할 일을 한 줄로 입력' : '아직 분류하지 않을 메모·아이디어를 한 줄로 입력'}
            autoComplete="off"
            maxLength={4000}
            disabled={saving}
            style={{
              width: '100%', padding: '8px 11px', fontSize: 16, lineHeight: 1.4,
              color: 'var(--fg)', background: 'var(--surface-2)',
              border: `1px solid ${state.status === 'error' ? 'var(--danger-line)' : 'var(--line-soft)'}`,
              borderRadius: 'var(--r-sm)',
            }}
          />
        </div>
        <Button type="submit" variant="primary" size="md" icon="plus" disabled={saving || !raw.trim()}>
          {saving ? '저장 중' : hint === 'task' ? '할 일 저장' : '정리 전 저장'}
        </Button>
      </form>
      <div style={{ marginTop: 4, minHeight: 17, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span role={state.status === 'error' ? 'alert' : 'status'} aria-live="polite" style={{ flex: 1, fontSize: 11.5, color: stateColor }}>
          {state.message}
        </span>
        {state.status === 'saved' && state.destinationType === 'task' && (
          <Button variant="ghost" size="xs" iconRight="arrowRight" onClick={() => onNavigate?.('dashboard/work/my')}>할 일 보기</Button>
        )}
      </div>
    </Card>
  );
}

function TaskToday({ taskToday, onNavigate, onChanged }) {
  const allItems = Array.isArray(taskToday?.items) ? taskToday.items : [];
  const counts = taskToday?.counts || {};
  const [feedback, setFeedback] = React.useState({ status: 'idle', message: '', action: null });
  // my-work와 동일한 되돌리기 계약(공유 훅): 완료 탭 → 행 낙관 제거 → 3.5초 되돌리기 창이
  // 닫힌 뒤에만 PATCH. 창 안의 되돌리기는 네트워크 없이 완전 복구, 언마운트는 flush.
  const [hiddenIds, setHiddenIds] = React.useState(() => new Set());
  const { schedule, cancel } = useUndoableAction();
  const items = allItems.filter((t) => !hiddenIds.has(t.id));

  async function persistComplete(task) {
    try {
      const response = await fetch('/api/hub/tasks', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: task.id, status: 'done' }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !isDurableTaskUpdateResult(data)) {
        throw new Error(data.error || data.status || `완료 저장 실패 (${response.status})`);
      }

      setFeedback({ status: 'saved', message: `${task.title} 완료됨.`, action: null });
      onChanged?.();
    } catch (error) {
      // 실패 시 행 복귀 — 완료된 것처럼 남기지 않는다.
      setHiddenIds((s) => { const n = new Set(s); n.delete(task.id); return n; });
      setFeedback({
        status: 'error',
        message: error instanceof Error ? error.message : '완료 상태를 저장하지 못했습니다.',
        action: null,
      });
    }
  }

  function complete(task) {
    setHiddenIds((s) => new Set(s).add(task.id));
    setFeedback({
      status: 'pending',
      message: `${task.title} 완료됨`,
      action: { label: '되돌리기', onClick: () => undoComplete(task) },
    });
    schedule(task.id, () => persistComplete(task));
  }

  function undoComplete(task) {
    if (!cancel(task.id)) return; // 창이 이미 닫혔으면 되돌릴 수 없음
    setHiddenIds((s) => { const n = new Set(s); n.delete(task.id); return n; });
    setFeedback({ status: 'idle', message: '완료 취소됨', action: null });
  }

  // §5.2: missed is the only immediate-loss lane; today/inbox are ordinary stages → neutral.
  const laneTone = {
    missed: 'danger',
    today: 'neutral',
    waiting: 'neutral',
    inbox: 'neutral',
  };

  return (
    <div aria-label="오늘 할 일">
      <SectionTitle right={(
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Badge tone={(counts.missed || 0) > 0 ? 'danger' : 'neutral'} size="xs">놓침 {counts.missed || 0}</Badge>
          <Badge tone="neutral" size="xs">오늘 {counts.today || 0}</Badge>
          <Button variant="ghost" size="xs" iconRight="arrowRight" onClick={() => onNavigate?.('dashboard/work/my')}>모두 보기</Button>
        </div>
      )}>오늘 할 일</SectionTitle>
      <Card pad={false} className="daily-brief__panel">
        {items.length ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {items.map((task, index) => (
              <div
                key={task.id}
                className="hub-stackable-row"
                style={{
                  minHeight: 'calc(var(--row-h) + 20px)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: 'var(--pad-y) var(--pad-x)',
                  borderBottom: index < items.length - 1 ? '1px solid var(--line-soft)' : 'none',
                }}
              >
                <Badge tone={laneTone[task.lane] || 'neutral'} size="xs">{task.laneLabel}</Badge>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</div>
                  <div className="mono" style={{ marginTop: 3, fontSize: 10.5, color: 'var(--fg-faint)' }}>
                    {task.due && task.due !== '미정' ? `due ${task.due} · ` : ''}{task.priority || 'med'}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon="check"
                  aria-label={`완료: ${task.title}`}
                  onClick={() => complete(task)}
                  style={{ minHeight: 44 }}
                >
                  완료
                </Button>
              </div>
            ))}
            {taskToday?.hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => onNavigate?.('dashboard/work/my')}
                style={{ border: 0, borderTop: '1px solid var(--line-soft)', background: 'var(--surface-2)', color: 'var(--fg-muted)', fontSize: 11.5 }}
              >
                할 일 {taskToday.hiddenCount}건 더 보기
              </button>
            )}
          </div>
        ) : (
          <EmptyState
            icon="check"
            title={taskToday?.state === 'live' ? '오늘 할 일이 비었습니다' : '할 일 기록 확인 대기'}
            description={taskToday?.state === 'live' ? '위의 빠른 캡처(Enter)로 바로 추가하거나 내 작업에서 계획하세요.' : 'tasks 기록이 live가 되면 실제 항목만 표시합니다.'}
            action={taskToday?.state === 'live' ? <Button variant="outline" size="sm" iconRight="arrowRight" onClick={() => onNavigate?.('dashboard/work/my')}>내 작업 열기</Button> : undefined}
            style={{ minHeight: 150 }}
          />
        )}
      </Card>
      {/* 완료 피드백은 중립(§5.3 done ≠ green); 되돌리기 창이 열려 있는 동안 액션 노출. */}
      <div
        role={feedback.status === 'error' ? 'alert' : 'status'}
        aria-live="polite"
        style={{ minHeight: 22, marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: feedback.status === 'error' ? 'var(--danger)' : 'var(--fg-muted)' }}
      >
        <span>{feedback.message}</span>
        {feedback.action && (
          <Button variant="ghost" size="xs" onClick={feedback.action.onClick}>{feedback.action.label}</Button>
        )}
      </div>
    </div>
  );
}

function useDailyBriefLedger(refreshKey) {
  const [state, setState] = React.useState({
    syncState: 'syncing',
    generatedAt: null,
    sources: [],
    summary: null,
    metrics: [],
    operatorHome: null,
    taskToday: { state: 'preview', items: [], counts: {}, hiddenCount: 0 },
    contentBrands: null,
    signals: [],
    dailyFocus: null,
    morningBrief: null,
  });

  React.useEffect(() => {
    let active = true;

    async function load() {
      setState((prev) => ({ ...prev, syncState: 'syncing' }));
      try {
        const response = await fetch('/api/hub/daily-brief', { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (!active || !response.ok || !data) {
          // transport 실패는 error — preview로 뭉개면 첫 화면이 "Supabase 연결 후 live
          // 전환"이라는 거짓 안내와 함께 신호 0건으로 렌더된다(re-audit S5).
          if (active) setState((prev) => ({ ...prev, syncState: 'error' }));
          return;
        }

        const liveCount = Number(data.summary?.liveCount || 0);
        const sourceCount = Array.isArray(data.sources) ? data.sources.length : 0;
        const nextSyncState = data.status === 'partial'
          ? 'partial'
          : data.status === 'live'
            ? 'live'
            : liveCount > 0 && liveCount < sourceCount
              ? 'mixed'
              : 'preview';

        setState({
          syncState: nextSyncState,
          generatedAt: data.generatedAt || null,
          sources: Array.isArray(data.sources) ? data.sources : [],
          summary: data.summary || null,
          metrics: Array.isArray(data.metrics) ? data.metrics : [],
          operatorHome: data.operatorHome || null,
          taskToday: data.taskToday || { state: 'preview', items: [], counts: {}, hiddenCount: 0 },
          contentBrands: data.contentBrands || null,
          signals: Array.isArray(data.signals) ? data.signals : [],
          dailyFocus: data.dailyFocus || null,
          morningBrief: data.morningBrief || null,
        });
      } catch {
        if (active) setState((prev) => ({ ...prev, syncState: 'error' }));
      }
    }

    load();
    return () => { active = false; };
  }, [refreshKey]);

  return state;
}

function SignalCard({ s, index = 0, defaultExpanded, onNavigate }) {
  // Surface the highest-priority signal first-open (§3.1: <5s).
  const [expanded, setExpanded] = React.useState(defaultExpanded != null ? defaultExpanded : (index === 0 || s.tone === 'danger'));
  const [decided, setDecided] = useBriefDecision(signalDecisionKey(s));
  // §5.2 collision precedence: urgency lives on the left rail + dot (danger only);
  // ordinary lanes (today/queue/info) stay neutral instead of painting semantic hues.
  const openContext = () => onNavigate?.(CONTEXT_TARGETS[s.kind] || 'dashboard/daily-brief');

  return (
    <div className={`daily-brief__panel${s.tone === 'danger' ? ' daily-brief__panel--danger' : ''}`} style={{
      background: 'var(--surface)',
      border: '1px solid var(--line-soft)',
      borderRadius: 'var(--r-lg)',
      overflow: 'hidden',
    }}>
      <div
        className="hub-stackable-row"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded(e => !e)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(v => !v); } }}
        style={{ padding: 'var(--card-pad)', cursor: 'pointer', display: 'flex', gap: 14 }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, paddingTop: 2 }}>
          <Dot tone={s.tone === 'danger' ? 'danger' : 'neutral'} size={8} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <Badge tone="neutral" size="xs">{s.kind}</Badge>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{s.meta}</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>from {s.source.from} · <span className="mono">{s.source.ref}</span></span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, color: decided ? 'var(--fg-muted)' : 'var(--fg)', marginBottom: 4, letterSpacing: '-0.01em' }}>
            {s.title}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.55, maxWidth: '70ch' }}>{s.summary}</div>
          {decided && (
            // done은 중립 체크 + 낮은 강조 텍스트 — 녹색 완료 금지(§5.3 lifecycle).
            <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--fg-muted)' }}>
              <Iconed name="check" size={12} />
              <span>오늘 처리함 · {decided}</span>
              <Button variant="ghost" size="xs" onClick={(e) => { e.stopPropagation(); setDecided(null); }}>되돌리기</Button>
            </div>
          )}
        </div>
        <Iconed name="chevronD" size={14} style={{ color: 'var(--fg-faint)', transform: expanded ? '' : 'rotate(-90deg)', transition: 'transform .15s' }} />
      </div>
      {expanded && !decided && (
        <div style={{ padding: '0 var(--card-pad) var(--card-pad)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {s.decisions.map((d, i) => (
            <Button key={i} variant={d.primary ? 'primary' : 'secondary'} size="sm" icon={d.primary ? 'bolt' : null}
              onClick={() => {
                setDecided(d.label);
                const target = SIGNAL_TARGETS[d.action];
                if (target && target !== 'dashboard/daily-brief') onNavigate?.(withEntityRef(target, s.source));
              }}>
              {d.label}
            </Button>
          ))}
          <div style={{ flex: 1 }} />
          <Button variant="ghost" size="sm" icon="moreV" onClick={openContext}>More context</Button>
        </div>
      )}
    </div>
  );
}

function MetricCard({ m, onNavigate, compact }) {
  const target = m.target || METRIC_TARGETS[m.label];
  const clickable = Boolean(target && onNavigate);
  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onNavigate(target) : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(target); } } : undefined}
      className="hub-metric-card"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line-soft)',
        borderRadius: 'var(--r-lg)',
        padding: compact ? '10px 13px' : 'var(--card-pad)',
        boxShadow: compact ? 'none' : 'var(--shadow-soft)',
        cursor: clickable ? 'pointer' : 'default',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ fontSize: compact ? 10.5 : 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 500 }}>{m.label}</div>
        {clickable && <Iconed name="chevronR" size={compact ? 11 : 12} style={{ color: 'var(--fg-faint)', marginLeft: 'auto' }} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: compact ? 4 : 10 }}>
        {/* ≥18px → .stat (sans tabular), never mono — DESIGN.md §6 hybrid number rule. */}
        <div className="stat" style={{ fontSize: compact ? 18 : 30, fontWeight: 600 }}>{m.value}</div>
        <div style={{ flex: 1 }} />
        {/* 실측 시계열이 있을 때만 — 합성 스파크는 지어낸 추세를 실데이터처럼 보이게 한다. */}
        {Array.isArray(m.spark) && m.spark.length > 1 && (
          <Sparkline values={m.spark} tone={m.tone === 'warning' ? 'warning' : m.tone === 'success' ? 'success' : 'moon'} width={compact ? 48 : 70} height={compact ? 16 : 22} />
        )}
      </div>
      <div style={{ marginTop: compact ? 3 : 6, fontSize: compact ? 10.5 : 11.5, color: m.tone === 'success' ? 'var(--success)' : m.tone === 'warning' ? 'var(--warning)' : 'var(--fg-faint)' }}>{m.delta}</div>
    </div>
  );
}

function DistributionRows({ series = [], label }) {
  const max = Math.max(1, ...series.map((item) => Number(item.value) || 0));
  return (
    <div role="img" aria-label={label} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {series.map((item) => {
        const value = Number(item.value) || 0;
        return (
          <div key={item.key} style={{ display: 'grid', gridTemplateColumns: '48px minmax(0, 1fr) 24px', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 10.5, color: 'var(--fg-muted)' }}>{item.label}</span>
            <span style={{ height: 5, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: `${Math.max(value ? 8 : 0, Math.round((value / max) * 100))}%`, borderRadius: 999, background: item.key === 'blocked' ? 'var(--warning)' : 'var(--moon-500)' }} />
            </span>
            <span className="mono" style={{ fontSize: 10.5, color: value ? 'var(--fg)' : 'var(--fg-faint)', textAlign: 'right' }}>{value}</span>
          </div>
        );
      })}
    </div>
  );
}

function OperatorPulse({ operatorHome, contentBrands, onNavigate }) {
  const pms = operatorHome?.pms || null;
  const content = operatorHome?.content || null;
  const lanes = Array.isArray(contentBrands?.lanes) ? contentBrands.lanes : [];

  return (
    <div>
      <SectionTitle right={<span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>현재 기록의 상태 분포 · 추세 아님</span>}>운영 pulse</SectionTitle>
      <div className="hub-grid--two" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--gap)' }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>PMS</div>
            <SyncBadge state={operatorHome?.sources?.projects || 'preview'} />
            <div style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" iconRight="arrowRight" onClick={() => onNavigate('dashboard/work/my')}>My Tasks</Button>
          </div>
          {pms ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginTop: 14, marginBottom: 16 }}>
                {[
                  ['열린 일', pms.openTasks ?? '—'],
                  ['기한 도래', pms.dueOrOverdueTasks ?? '—'],
                  ['막힌 P', pms.blockedProjects],
                  ['완료율', pms.taskCompletionRate == null ? '—' : `${pms.taskCompletionRate}` + '%'],
                ].map(([label, value]) => (
                  <div key={label} style={{ padding: '8px 9px', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', minWidth: 0 }}>
                    <div className="stat" style={{ fontSize: 18, fontWeight: 600 }}>{value}</div>
                    <div style={{ marginTop: 2, fontSize: 10, color: 'var(--fg-faint)', whiteSpace: 'nowrap' }}>{label}</div>
                  </div>
                ))}
              </div>
              <DistributionRows series={pms.projectStatusSeries} label="프로젝트 상태 분포" />
            </>
          ) : (
            <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--fg-muted)' }}>프로젝트 기록이 live가 되면 상태 요약을 표시합니다.</div>
          )}
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>ClassIn content</div>
            <SyncBadge state={operatorHome?.sources?.content || 'preview'} />
            <div style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" iconRight="arrowRight" onClick={() => onNavigate('dashboard/classin/content')}>Queue</Button>
          </div>
          {content ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginTop: 14, marginBottom: 14 }}>
                {[
                  ['아이디어', content.ideas],
                  ['제작 중', content.inProduction],
                  ['발행 대기', content.scheduled],
                  ['발행', content.published],
                ].map(([label, value]) => (
                  <div key={label} style={{ padding: '8px 9px', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', minWidth: 0 }}>
                    <div className="stat" style={{ fontSize: 18, fontWeight: 600 }}>{value}</div>
                    <div style={{ marginTop: 2, fontSize: 10, color: 'var(--fg-faint)', whiteSpace: 'nowrap' }}>{label}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {lanes.map((lane) => (
                  <button
                    key={lane.key}
                    type="button"
                    onClick={() => onNavigate(`dashboard/classin/content?brand=${encodeURIComponent(lane.key)}`)}
                    style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', gap: 10, padding: '7px 9px', textAlign: 'left', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', color: 'var(--fg)' }}
                  >
                    <span style={{ fontSize: 11.5 }}>{lane.label}</span>
                    <span style={{ fontSize: 10.5, color: 'var(--fg-muted)' }}>{lane.connection === 'live' ? 'live' : lane.connection}</span>
                    <span className="mono" style={{ fontSize: 11 }}>{lane.counts?.total ?? '—'}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--fg-muted)' }}>콘텐츠 기록이 live가 되면 세 브랜드 lane을 표시합니다.</div>
          )}
        </Card>
      </div>
    </div>
  );
}

const WO_KIND_TONE = {
  outcome: 'moon', lead: 'moon', dm: 'moon',
  idea: 'info', engagement: 'info',
  review: 'warning', note: 'neutral',
  'followup-draft': 'moon', 'content-draft': 'info',
};

// Chief of Staff 브리핑 — the /api/cron/chief-of-staff composed agenda, read back from
// project_updates (ai.morning_brief) via /api/hub/daily-brief. Renders only when a fresh
// (<24h) brief exists; lanes map to identity tones (sales=company, brand=personal).
const BRIEF_LANE_META = {
  approve: { label: '승인', tone: 'moon' },
  sales: { label: '영업', tone: 'company' },
  brand: { label: '브랜드', tone: 'personal' },
};

function MorningBriefCard({ brief, onNavigate }) {
  if (!brief) return null;
  const items = Array.isArray(brief.items) ? brief.items : [];
  const when = brief.generatedAt
    ? new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(new Date(brief.generatedAt))
    : null;

  // approve-lane rows resolve right below in the approval queue — no navigation needed.
  const targetFor = (item) => {
    if (item.lane === 'sales') {
      return item.ref ? `dashboard/revenue/deals?deal=${encodeURIComponent(item.ref)}` : 'dashboard/revenue/deals';
    }
    if (item.lane === 'brand') return 'dashboard/content/queue';
    return null;
  };

  return (
    <div>
      <SectionTitle right={<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {when && <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{when}</span>}
        <Badge tone="moon" size="xs">Chief of Staff</Badge>
      </div>}>
        오늘 이 3개만
      </SectionTitle>
      <Card pad={false}>
        {items.length === 0 ? (
          <div style={{ padding: 14, fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
            {brief.summary || '오늘 급한 항목 없음 — 큐가 비었습니다.'}
          </div>
        ) : (
          items.map((item, i) => {
            const lane = BRIEF_LANE_META[item.lane] || { label: item.lane || '기타', tone: 'neutral' };
            const target = targetFor(item);
            return (
              <div
                key={`${item.lane}-${i}`}
                role={target ? 'button' : undefined}
                tabIndex={target ? 0 : undefined}
                onClick={target ? () => onNavigate?.(target) : undefined}
                onKeyDown={target ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate?.(target); } } : undefined}
                className={target ? 'hub-row' : undefined}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 14px',
                  cursor: target ? 'pointer' : 'default',
                  borderBottom: i < items.length - 1 ? '1px solid var(--line-soft)' : 'none',
                }}
              >
                <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--moon-300)', width: 14, flexShrink: 0, paddingTop: 1 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.45 }}>{item.title}</div>
                  {item.detail && <div style={{ marginTop: 3, fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.5 }}>{item.detail}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, paddingTop: 1 }}>
                  <Badge tone={lane.tone} size="xs">{lane.label}</Badge>
                  {target && <Iconed name="chevronR" size={11} style={{ color: 'var(--fg-faint)' }} />}
                </div>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}

// The brief keeps the queue SHORT — the top 5 waiting decisions, not the full backlog. The
// full queue lives on Agents Orders; the brief is the "what do I act on first" cockpit.
const QUEUE_MAX_VISIBLE = 5;

// The 1-click approval cockpit — proposed work orders (persona/inbox/guru) decided in place.
// registry.json no_auto_send=true: nothing executes without this click.
function ApprovalQueueCard({ onNavigate }) {
  const [orders, setOrders] = React.useState([]);
  const [state, setState] = React.useState('loading');
  const [busyId, setBusyId] = React.useState(null);
  const [approved, setApproved] = React.useState({}); // id → true once approved (reveals execute row)
  const [copiedId, setCopiedId] = React.useState(null);

  // 딜 채널이 카톡/전화 중심이라 "복사"가 실제 발송 경로 — 초안을 클립보드로 옮겨 보내는 흐름.
  const copyDraft = async (o) => {
    const subject = o.body?.subject || o.body?.title || '';
    const text = [subject, o.body?.body || ''].filter(Boolean).join('\n\n');
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(o.id);
      window.setTimeout(() => setCopiedId((v) => (v === o.id ? null : v)), 1600);
    } catch { /* clipboard unavailable — silent */ }
  };

  React.useEffect(() => {
    let active = true;
    fetch('/api/hub/work-orders?status=proposed', { cache: 'no-store' })
      .then((r) => {
        // 승인 큐 read 실패를 empty로 뭉개면 "승인 대기 없음"으로 오독된다(re-audit S10).
        if (!r.ok) throw new Error(`work-orders ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!active) return;
        if (d && Array.isArray(d.orders)) {
          setOrders(d.orders);
          setState(d.source === 'supabase' ? 'live' : 'empty');
        } else {
          setState('empty');
        }
      })
      .catch(() => active && setState('error'));
    return () => { active = false; };
  }, []);

  async function post(id, body) {
    if (busyId) return false;
    setBusyId(id);
    try {
      const res = await fetch('/api/hub/work-orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, ...body }),
      });
      return res.ok;
    } finally {
      setBusyId(null);
    }
  }

  // proposed → approved reveals the execute row; execute logs the realized outcome and
  // closes the outcome-attribution loop. dismiss drops it.
  const approve = async (id) => { if (await post(id, { status: 'approved' })) setApproved((m) => ({ ...m, [id]: true })); };
  const dismiss = async (id) => { if (await post(id, { status: 'dismissed' })) setOrders((prev) => prev.filter((o) => o.id !== id)); };
  const execute = async (id, action) => { if (await post(id, { status: 'executed', outcome: { action } })) setOrders((prev) => prev.filter((o) => o.id !== id)); };
  // dm/lead capture → executed with no outcome payload, closes the lead-capture loop instead
  // (work_orders.lead_id back-fill — see work-orders.js promoteCaptureToLead).
  const promote = async (id) => { if (await post(id, { status: 'executed' })) setOrders((prev) => prev.filter((o) => o.id !== id)); };

  const pending = orders.filter((o) => !approved[o.id]).length;
  const visible = orders.slice(0, QUEUE_MAX_VISIBLE);
  const overflow = Math.max(0, orders.length - QUEUE_MAX_VISIBLE);
  // 페르소나별 대기 요약 — 큐를 5개로 줄여도 "누가 얼마나 기다리는지" 전체 모양은 유지한다.
  const personaCounts = Object.entries(
    orders.reduce((acc, o) => { const k = o.persona || '기타'; acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
  ).sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <div>
      {/* 대기 0은 상태 정보 — 녹색 완료 아님(§5.3), 중립 유지. */}
      <SectionTitle right={<Badge tone={pending ? 'moon' : 'neutral'} size="xs">{pending} 대기</Badge>}>
        승인 큐
      </SectionTitle>
      <Card pad={false}>
        {orders.length === 0 ? (
          <div role={state === 'error' ? 'alert' : undefined} style={{ padding: 14, fontSize: 12.5, color: state === 'error' ? 'var(--danger)' : 'var(--fg-muted)', lineHeight: 1.5 }}>
            {state === 'loading'
              ? '큐 확인 중…'
              : state === 'error'
              ? '승인 큐를 읽지 못했습니다 — 대기 제안이 있을 수 있습니다. 새로고침해 주세요.'
              : '승인 대기 중인 제안이 없습니다. /inbox·/team이 제안을 올리면 여기서 1클릭으로 처리합니다.'}
          </div>
        ) : (
          <>
          {personaCounts.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: '9px 14px', borderBottom: '1px solid var(--line-soft)', background: 'var(--surface-2)' }}>
              <span style={{ fontSize: 10, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>대기</span>
              {personaCounts.map(([p, c]) => (
                <Badge key={p} tone="neutral" variant="outline" size="xs">{p} {c}</Badge>
              ))}
            </div>
          )}
          {visible.map((o, i) => (
            <div key={o.id} style={{
              padding: '11px 14px', opacity: busyId === o.id ? 0.5 : 1,
              borderBottom: (i < visible.length - 1 || overflow > 0) ? '1px solid var(--line-soft)' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Badge tone={WO_KIND_TONE[o.kind] || 'neutral'} size="xs">{o.kind}</Badge>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--fg-faint)' }}>{o.persona}{o.channel ? ` · ${o.channel}` : ''}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.title}
                  </div>
                  {/* AI-drafted message (followup/content) — the operator reads this BEFORE approving. No auto-send. */}
                  {(o.kind === 'followup-draft' || o.kind === 'content-draft') && o.body?.body && (
                    <div style={{ marginTop: 5, fontSize: 11.5, color: 'var(--fg-muted)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                      {o.body.body}
                    </div>
                  )}
                </div>
                {!approved[o.id] && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {(o.kind === 'followup-draft' || o.kind === 'content-draft') && o.body?.body && (
                      <Button variant="ghost" size="xs" onClick={() => copyDraft(o)}>{copiedId === o.id ? '복사됨' : '복사'}</Button>
                    )}
                    <Button variant="primary" size="xs" onClick={() => approve(o.id)}>승인</Button>
                    <Button variant="ghost" size="xs" onClick={() => dismiss(o.id)}>보류</Button>
                  </div>
                )}
              </div>
              {approved[o.id] && (o.kind === 'dm' || o.kind === 'lead' ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                  {/* 완료 확인은 check + 중립 텍스트 (§5.2 — green 축하 금지). */}
                  <span style={{ fontSize: 11, color: 'var(--fg-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Iconed name="check" size={11} /> 승인됨 · 신규 리드
                  </span>
                  <Button variant="outline" size="xs" onClick={() => promote(o.id)}>리드로 등록</Button>
                </div>
              ) : o.kind === 'content-draft' ? (
                // 승인 = Studio 파이프라인으로 구체화(서버가 idea→draft 승격 + variant 생성).
                // 콘텐츠 초안은 영업 퍼널 outcome을 절대 남기지 않는다 — 완료는 무-outcome executed.
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: 'var(--fg-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Iconed name="check" size={11} /> 승인됨 · Studio 초안 생성
                  </span>
                  <Button variant="outline" size="xs" onClick={() => onNavigate?.('dashboard/content/studio')}>Studio 열기</Button>
                  <Button variant="ghost" size="xs" onClick={() => promote(o.id)}>완료</Button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: 'var(--fg-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Iconed name="check" size={11} /> 승인됨 · 실행 결과
                  </span>
                  {o.kind === 'followup-draft' && o.body?.body && (
                    <Button variant="ghost" size="xs" onClick={() => copyDraft(o)}>{copiedId === o.id ? '복사됨' : '복사'}</Button>
                  )}
                  {WO_EXECUTE_ACTIONS.map((a) => (
                    <Button key={a.action} variant="outline" size="xs" onClick={() => execute(o.id, a.action)}>{a.label}</Button>
                  ))}
                </div>
              ))}
            </div>
          ))}
          {overflow > 0 && (
            <button
              onClick={() => onNavigate?.('dashboard/agents/orders')}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 14px', display: 'flex', alignItems: 'center',
                gap: 6, fontSize: 12, color: 'var(--fg-muted)', background: 'transparent', cursor: 'pointer',
              }}
            >
              <span>+{overflow}건 더 · 전체 승인 큐 보기</span>
              <Iconed name="arrowRight" size={12} style={{ marginLeft: 'auto', color: 'var(--fg-faint)' }} />
            </button>
          )}
          </>
        )}
      </Card>
    </div>
  );
}

// (PipelineShapeCard·SalesFunnelCard·ContentCadenceCard 및 그 상수들은 2026-08-05 제거 —
// 2026-07-15 §2.2 QA 결정 B로 렌더 트리에서 빠진 뒤에도 ~290줄이 첫 화면 청크에 실려 있었다.)

// Slim replacement for the old full-card DataTrustStrip — one quiet status line, with the
// per-ledger source badges tucked behind a toggle so telemetry stops competing with signal.
function StatusLine({ state }) {
  const [open, setOpen] = React.useState(false);
  const liveCount = Number(state.summary?.liveCount || 0);
  const sourceCount = state.sources.length;
  const label = state.syncState === 'mixed' ? `${liveCount}/${sourceCount || 6} live` : sourceLabel(state.syncState);
  const detail = state.syncState === 'error'
    ? '브리핑을 읽지 못했습니다 — 지금 화면은 비어 보여도 실제 일이 있을 수 있습니다'
    : state.syncState === 'preview'
    ? 'Supabase 연결 후 live 전환'
    : state.syncState === 'partial'
    ? '일부 운영 기록을 읽지 못했습니다'
    : state.syncState === 'mixed'
    ? '일부 기록은 live, 일부는 preview'
    : state.syncState === 'syncing'
    ? '기록 상태 확인 중'
    : '모든 운영 기록 live';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--fg-faint)', padding: '0 2px' }}>
      <Dot tone={syncTone(state.syncState)} size={6} />
      <span className="mono" style={{ color: 'var(--fg-dim)', letterSpacing: 0 }}>{label}</span>
      <span style={{ color: 'var(--fg-faint)' }}>· {detail}</span>
      {sourceCount > 0 && (
        <button
          type="button"
          aria-label={open ? '기록 상태 숨기기' : '기록 상태 펼치기'}
          aria-expanded={open}
          aria-controls="daily-brief-ledger-statuses"
          onClick={() => setOpen((o) => !o)}
          style={{ color: 'var(--fg-faint)', fontSize: 11, background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
        >
          {open ? '기록 숨기기' : `기록 ${sourceCount}`}
        </button>
      )}
      {open && (
        <div id="daily-brief-ledger-statuses" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', width: '100%', marginTop: 6 }}>
          {state.sources.map((source) => (
            <Badge key={source.key} tone={syncTone(source.state)} variant="outline" size="xs">
              {source.label} · {sourceLabel(source.state)}
            </Badge>
          ))}
          {/* §2의 5개 판단축 중 메시지 축은 데이터 소스(카톡·전화 원장)가 아직 없다 —
              침묵 대신 부재를 고지한다(가짜 UI 금지, 2026-08-05 re-audit #8). */}
          <Badge tone="neutral" variant="outline" size="xs">메시지 · 소스 없음(미연동)</Badge>
        </div>
      )}
    </div>
  );
}

function BriefNavigation({ taskToday, onNavigate }) {
  const taskCount = Number(taskToday?.counts?.missed || 0) + Number(taskToday?.counts?.today || 0);
  const taskDetail = taskToday?.state === 'live' ? `${taskCount}건 확인` : '기록 확인';
  const detailByKey = {
    tasks: taskDetail,
    calendar: '일정 배치',
    projects: '진행 확인',
    followups: '후속 조치',
    content: '큐 확인',
  };

  return (
    <nav aria-label="Daily Brief 빠른 이동" className="daily-brief__nav">
      <div className="daily-brief__nav-label">
        <span>빠른 이동</span>
        <span>핵심 탭 바로가기</span>
      </div>
      <div className="daily-brief__nav-grid">
        {BRIEF_DESTINATIONS.map((item) => (
          <button
            key={item.key}
            type="button"
            className="daily-brief__jump"
            aria-label={`${item.label}: ${detailByKey[item.key]}`}
            onClick={() => onNavigate?.(item.target)}
          >
            <span className="daily-brief__jump-icon"><Iconed name={item.icon} size={15} /></span>
            <span className="daily-brief__jump-copy">
              <strong>{item.label}</strong>
              <small>{detailByKey[item.key]}</small>
            </span>
            <Iconed name="chevronR" size={13} style={{ color: 'var(--fg-faint)' }} />
          </button>
        ))}
      </div>
    </nav>
  );
}

// The command — the single highest-priority signal, rendered full-width with its decisions
// already exposed. This is the "<5s, what's my next move?" surface (DESIGN.md §3.1).
function CommandCard({ s, remaining, onNavigate }) {
  const [decided, setDecided] = useBriefDecision(signalDecisionKey(s));
  // §5.2 red-budget: only true urgency colors the command ring. Everything else reads
  // as the top item by position and size alone — warning/info/success rims were reading
  // as a banned warm-gold halo around the hero card.
  const accent = s.tone === 'danger' ? 'var(--danger)' : 'var(--moon-300)';
  const hasRecord = s.source?.ref && !SENTINEL_REFS.has(String(s.source.ref).trim().toUpperCase());
  const openRecord = () => onNavigate?.(withEntityRef(CONTEXT_TARGETS[s.kind] || 'dashboard/daily-brief', s.source));
  return (
    <div className={`daily-brief__panel${s.tone === 'danger' ? ' daily-brief__panel--danger' : ''}`} style={{
      position: 'relative', overflow: 'hidden',
      background: 'var(--surface)',
      border: '1px solid var(--line-soft)',
      borderRadius: 'var(--r-lg)',
      padding: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9, flexWrap: 'wrap' }}>
        {/* §9: urgent 인디케이터는 루프 금지 — red+glow가 이미 충분한 강조 */}
        <span style={{ width: 7, height: 7, borderRadius: 999, background: accent, flexShrink: 0 }} />
        <span className="mono" style={{ fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-dim)' }}>지금 가장 급한 결정</span>
        <Badge tone="neutral" size="xs">{s.kind}</Badge>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{s.meta}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>from {s.source?.from} · <span className="mono">{s.source?.ref}</span></span>
      </div>
      <div style={{ fontSize: 21, fontWeight: 650, letterSpacing: '-0.025em', color: 'var(--fg)', marginBottom: 6, lineHeight: 1.22 }}>{s.title}</div>
      <div style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.5, maxWidth: '76ch' }}>{s.summary}</div>
      {decided ? (
        // done은 중립 체크 + 낮은 강조 텍스트 — 녹색 완료 금지(§5.3 lifecycle).
        <div style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--fg-muted)' }}>
          <Iconed name="check" size={14} />
          <span>오늘 처리함 · {decided}</span>
          <Button variant="ghost" size="sm" onClick={() => setDecided(null)}>되돌리기</Button>
        </div>
      ) : (
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {s.decisions.map((d, i) => (
            <Button key={i} variant={d.primary ? 'primary' : 'secondary'} size="md" icon={d.primary ? 'bolt' : null}
              onClick={() => {
                setDecided(d.label);
                const target = SIGNAL_TARGETS[d.action];
                if (target && target !== 'dashboard/daily-brief') onNavigate?.(withEntityRef(target, s.source));
              }}>
              {d.label}
            </Button>
          ))}
          {hasRecord && <Button variant="outline" size="md" iconRight="arrowRight" onClick={openRecord}>레코드 열기</Button>}
          <div style={{ flex: 1 }} />
          {remaining > 0 && <span style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>대기 결정 {remaining}건 ↓</span>}
        </div>
      )}
    </div>
  );
}

// Calm state when nothing is urgent — the brief still answers "what matters" with "nothing on fire".
function CommandClear({ signalCount }) {
  return (
    <div className="daily-brief__panel" style={{
      background: 'var(--surface)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-xl)',
      padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      {/* all-clear도 중립 체크 — 녹색 완료 상태 금지(§5.3 done = neutral, not green). */}
      <span style={{ width: 34, height: 34, borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', border: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-muted)', flexShrink: 0 }}>
        <Iconed name="check" size={17} />
      </span>
      <div>
        <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--fg)' }}>지금 급한 결정은 없습니다</div>
        <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', marginTop: 3 }}>
          {signalCount > 0 ? `${signalCount}개 신호는 아래 큐에서 여유 있게 처리하세요.` : '새 신호가 들어오면 여기 가장 먼저 올라옵니다.'}
        </div>
      </div>
    </div>
  );
}

// The brief shows three things: the one command, the decisions waiting, the four
// numbers. Everything else is real but not first-scan material, so it sits behind
// this disclosure rather than competing for the top of the page.
function MoreDetail({ title, children }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="hub-row daily-brief__panel"
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '11px 14px',
          background: 'var(--surface)',
          border: '1px solid var(--line-soft)',
          borderRadius: 'var(--r-lg)',
          color: 'var(--fg-muted)', fontSize: 12.5, textAlign: 'left',
        }}
      >
        <Iconed name="chevronD" size={13} style={{ color: 'var(--fg-faint)', transform: open ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform var(--dur-panel) var(--ease-hub)' }} />
        <span style={{ flex: 1 }}>{title}</span>
        <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{open ? '접기' : '펼치기'}</span>
      </button>
      {open && (
        <div className="fade-up" style={{ marginTop: 'var(--gap)', display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// Right-rail daily routine glance — same routine_checks data and check-in write path as
// dashboard/work/rhythm (reuses lib/rhythm-ui.js's payload/result/mutation-state helpers so
// behavior never drifts from the canonical Rhythm page). Own fetch to /api/hub/work.
function RhythmPanel({ onNavigate }) {
  const [ledger, setLedger] = React.useState({ rituals: [], summary: null });
  const [syncState, setSyncState] = React.useState('preview');
  const [mutationState, setMutationState] = React.useState(() => createRhythmCheckState());
  const attemptSequenceRef = React.useRef(0);
  const latestAttemptRef = React.useRef(new Map());

  const load = React.useCallback(async () => {
    setSyncState((prev) => (prev === 'preview' ? 'loading' : prev));
    try {
      const response = await fetch('/api/hub/work', { cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || data.status === 'error') {
        setSyncState('error');
        return false;
      }
      setLedger({
        rituals: Array.isArray(data.rituals) ? data.rituals : [],
        summary: data.summary || null,
      });
      setSyncState(data.source === 'supabase' ? 'live' : 'preview');
      return true;
    } catch {
      setSyncState('error');
      return false;
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const checkIn = React.useCallback(async (ritual) => {
    const ritualId = ritual.id;
    const attemptId = `${Date.now()}-${attemptSequenceRef.current + 1}`;
    attemptSequenceRef.current += 1;
    latestAttemptRef.current.set(ritualId, attemptId);
    setMutationState((state) => beginRhythmCheck(state, ritualId, attemptId));

    try {
      const response = await fetch('/api/routine/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildRhythmCheckPayload(ritual)),
      });
      const data = await response.json().catch(() => null);
      let result = resolveRhythmCheckResult({ responseOk: response.ok, httpStatus: response.status, data });

      if (latestAttemptRef.current.get(ritualId) !== attemptId) return;
      if (result.shouldRefetch) {
        const refreshed = await load();
        if (latestAttemptRef.current.get(ritualId) !== attemptId) return;
        if (!refreshed) result = { ...result, message: `${result.message} 다시 읽지 못했습니다.` };
      }
      setMutationState((state) => finishRhythmCheck(state, ritualId, attemptId, result));
    } catch (error) {
      if (latestAttemptRef.current.get(ritualId) !== attemptId) return;
      setMutationState((state) => finishRhythmCheck(state, ritualId, attemptId, resolveRhythmCheckResult({ error })));
    }
  }, [load]);

  const rituals = ledger.rituals;
  const summary = ledger.summary || { ritualsCompletedThisWeek: 0, ritualsTotalThisWeek: 0, longestStreak: 0, longestStreakRitual: '' };
  const completed = summary.ritualsCompletedThisWeek;
  const total = summary.ritualsTotalThisWeek;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const rhythmProgressProps = getRhythmProgressProps({ completed, total });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <SectionTitle right={<SyncBadge state={syncState} />}>리듬</SectionTitle>
      <Card>
        {total > 0 ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="stat" style={{ fontSize: 22, fontWeight: 600 }}>{completed}/{total}</span>
              <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>이번 주 완료</span>
            </div>
            <div {...rhythmProgressProps} style={{ marginTop: 10 }}><Progress value={percent} /></div>
            {summary.longestStreak > 0 && (
              <div style={{ marginTop: 10, fontSize: 11, color: 'var(--fg-muted)' }}>
                최장 <span className="mono" style={{ color: 'var(--success)' }}>{summary.longestStreak}일</span>
                {summary.longestStreakRitual ? ` · ${summary.longestStreakRitual}` : ''}
              </div>
            )}
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rituals.map((r, i) => {
                const pending = Boolean(mutationState.pendingByRitual?.[r.id]);
                const feedback = mutationState.feedbackByRitual?.[r.id];
                const weeks = Array.isArray(r.weeks) ? r.weeks : [];
                return (
                  <div key={r.id} style={{ paddingBottom: 10, borderBottom: i < rituals.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                      <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{r.streak || 0}d</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <div role="img" aria-label={`최근 7일 체크 기록: ${weeks.join(', ')}`} style={{ display: 'flex', gap: 3 }}>
                        {weeks.map((v, wi) => (
                          <span key={wi} aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: v ? 'var(--moon-500)' : 'var(--surface-3)', border: '1px solid var(--line-soft)' }} />
                        ))}
                      </div>
                      <div style={{ flex: 1 }} />
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={pending}
                        aria-label={`${r.name} 체크인 저장`}
                        onClick={() => checkIn(r)}
                      >
                        {pending ? '저장 중' : '체크인'}
                      </Button>
                    </div>
                    {feedback && (
                      <div aria-live="polite" style={{ marginTop: 4, fontSize: 10.5, color: feedback.kind === 'error' ? 'var(--danger)' : feedback.kind === 'preview' ? 'var(--warning)' : 'var(--fg-muted)' }}>
                        {feedback.message}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <EmptyState
            icon="rhythm"
            title={syncState === 'live' ? '등록된 루틴 없음' : '루틴 확인 대기'}
            description={syncState === 'live' ? 'Rhythm에서 루틴을 만들면 여기 표시됩니다.' : '기록이 연결되면 이번 주 리듬을 표시합니다.'}
            style={{ minHeight: 140 }}
          />
        )}
        <Button variant="ghost" size="sm" iconRight="arrowRight" onClick={() => onNavigate?.('dashboard/work/rhythm')} style={{ marginTop: 12, width: '100%' }}>
          Rhythm 전체 보기
        </Button>
      </Card>
    </div>
  );
}

// §2 확정 슬롯 — 긴급 KA(최대 1) · 집중 고객(3~5) · 오늘 일정. tone 정렬 신호 큐에 섞여
// 소실되던 풀을 명명된 자리로 분리한 첫 화면의 핵심 계약(2026-08-05 컷오버). 각 슬롯은
// 자기 소스의 truth 상태를 따로 표시한다 — 캘린더 미연결이 매출 슬롯을 오염시키지 않는다.
function FocusSlots({ dailyFocus, onNavigate }) {
  if (!dailyFocus) return null;
  const ka = dailyFocus.urgentKa || {};
  const focus = dailyFocus.focusCustomers || {};
  const agenda = dailyFocus.todayAgenda || {};
  const focusItems = Array.isArray(focus.items) ? focus.items : [];
  const agendaItems = Array.isArray(agenda.items) ? agenda.items : [];
  const revenuePreview = focus.state !== 'live';

  const eyebrow = (label, right = null) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px 6px', fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
      {label}
      <div style={{ flex: 1 }} />
      {right}
    </div>
  );

  return (
    <div className="hub-grid--two daily-brief__focus" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.05fr) minmax(300px, .95fr)', gap: 16, alignItems: 'start' }}>
      <Card pad={false} className="daily-brief__panel" aria-label="긴급 KA와 집중 고객">
        {/* 긴급 KA — §5.2 허용 red: urgent KA (최대 1건). live인데 후보가 없으면 침묵하지
            않고 부재와 지정 경로(Sales Ledger 시트의 companies.meta.ka)를 고지한다 —
            존재하지 않는 기능이 존재하는 척하지 않기(2026-08-05 re-audit #1). */}
        {ka.state === 'live' && !ka.item && (
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line-soft)', fontSize: 11.5, color: 'var(--fg-faint)' }}>
            긴급 KA 없음 — KA 지정은 Sales Ledger 시트(companies.meta.ka)에서 관리됩니다.
          </div>
        )}
        {ka.item && (
          <div style={{ boxShadow: 'inset 1px 0 0 var(--danger-line)', borderBottom: '1px solid var(--line-soft)' }}>
            {eyebrow('긴급 KA')}
            <div
              className="hub-row"
              role="button"
              tabIndex={0}
              onClick={() => onNavigate?.(ka.item.href)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate?.(ka.item.href); } }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 16px 12px', cursor: 'pointer' }}
            >
              <Iconed name="bell" size={14} style={{ color: 'var(--danger)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {ka.item.name}
                  {ka.item.company && ka.item.company !== ka.item.name && <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}> · {ka.item.company}</span>}
                </div>
                <div style={{ marginTop: 2, fontSize: 11.5, color: 'var(--fg-muted)' }}>
                  {ka.item.reason}{ka.item.nextAction ? ` → ${ka.item.nextAction}` : ''}
                </div>
              </div>
              <Iconed name="chevronR" size={12} style={{ color: 'var(--fg-faint)' }} />
            </div>
          </div>
        )}

        {eyebrow(`집중 고객 ${focusItems.length ? focusItems.length : ''}`.trim(), revenuePreview ? <SyncBadge state="preview" /> : null)}
        {revenuePreview ? (
          <div style={{ padding: '2px 16px 14px', fontSize: 12, color: 'var(--fg-muted)' }}>매출 원장이 연결되면 집중 고객 3~5건이 여기에 표시됩니다.</div>
        ) : focusItems.length === 0 ? (
          <div style={{ padding: '2px 16px 14px', fontSize: 12, color: 'var(--fg-muted)' }}>집중 고객 없음 — CS 레인에 다음 행동이 있는 리드가 없습니다.</div>
        ) : (
          focusItems.map((item, i) => (
            <div
              key={item.id}
              className="hub-row"
              role="button"
              tabIndex={0}
              onClick={() => onNavigate?.(item.href)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate?.(item.href); } }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', cursor: 'pointer', borderBottom: i < focusItems.length - 1 ? '1px solid var(--line-soft)' : 'none' }}
            >
              <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)', width: 14, flexShrink: 0 }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.name}
                  {item.company && item.company !== item.name && <span style={{ color: 'var(--fg-faint)' }}> · {item.company}</span>}
                </div>
                {item.nextAction && <div style={{ marginTop: 1, fontSize: 11, color: 'var(--fg-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>→ {item.nextAction}</div>}
              </div>
              {/* §7 확정: 숫자 점수를 첫 화면에 노출하지 않는다 — 순서(1~5)가 이미 우선순위를 전달. */}
            </div>
          ))
        )}
      </Card>

      <Card pad={false} className="daily-brief__panel" aria-label="오늘 일정">
        {eyebrow('오늘 일정', agenda.state !== 'live' ? <SyncBadge state="preview" /> : null)}
        {agenda.state !== 'live' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 16px 14px', fontSize: 12, color: 'var(--fg-muted)' }}>
            Google Calendar 미연결 — 오늘 일정을 표시하려면 연결하세요.
            <Button variant="ghost" size="xs" onClick={() => onNavigate?.('dashboard/work/calendar')}>연결</Button>
          </div>
        ) : agendaItems.length === 0 ? (
          <div style={{ padding: '2px 16px 14px', fontSize: 12, color: 'var(--fg-muted)' }}>오늘 일정 없음.</div>
        ) : (
          agendaItems.map((event, i) => (
            <div key={event.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderBottom: i < agendaItems.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
              <span className="mono" style={{ fontSize: 11.5, color: event.allDay ? 'var(--fg-faint)' : 'var(--fg-muted)', width: 42, flexShrink: 0 }}>{event.whenLabel}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.title}</span>
            </div>
          ))
        )}
        <Button variant="ghost" size="xs" iconRight="arrowRight" onClick={() => onNavigate?.('dashboard/work/calendar')} style={{ margin: '4px 10px 10px' }}>
          캘린더 열기
        </Button>
      </Card>
    </div>
  );
}

// The queue is a decision list, not an inbox. Two items keep the first scan
// calm; the rest stay one click away.
const QUEUE_LIMIT = 2;

export function DailyBrief({ onNavigate }) {
  const [now, setNow] = React.useState(() => new Date());
  const [refreshKey, setRefreshKey] = React.useState(0);
  const ledger = useDailyBriefLedger(refreshKey);
  const [queueExpanded, setQueueExpanded] = React.useState(false);
  const refreshLedger = React.useCallback(() => setRefreshKey((key) => key + 1), []);

  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(id);
  }, []);

  const urgentCount = ledger.summary?.urgentCount ?? ledger.signals.filter(s => s.tone === 'danger').length;
  const todayCount = ledger.summary?.todayCount ?? ledger.signals.filter(s => s.tone === 'warning').length;
  const signalCount = ledger.signals.length;
  const ranked = React.useMemo(() => rankSignals(ledger.signals), [ledger.signals]);
  const command = ranked[0] || null;
  const waiting = ranked.slice(1);
  const queue = queueExpanded ? waiting : waiting.slice(0, QUEUE_LIMIT);
  const queueOverflow = waiting.length - queue.length;
  return (
    <div className="hub-page daily-brief" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 'var(--section-gap)', maxWidth: 1040, margin: '0 auto', width: '100%' }}>
      <div className="hub-page-header daily-brief__intro fade-up" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
        <div>
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>{formatBriefDate(now)}</div>
          <h2 style={{ margin: 0, fontSize: 'clamp(27px, 3vw, 32px)', fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.08 }}>오늘의 실행</h2>
          <div style={{ marginTop: 6, fontSize: 13, color: 'var(--fg-muted)', maxWidth: '62ch', lineHeight: 1.45 }}>
            {greetingFor(now)}, Junhyuk · <span style={{ color: 'var(--fg)' }}>신호 {signalCount}</span> · <span style={{ color: urgentCount > 0 ? 'var(--danger)' : 'inherit' }}>즉시 {urgentCount}</span> · 오늘 {todayCount}
          </div>
        </div>
        <div className="hub-page-actions hub-page-actions--row" style={{ display: 'flex', gap: 8 }}>
          {/* 보류 스코프(Council)가 히어로 CTA를 점유하던 것을 코어 루프(고객 연락)로 교체
              — README §4 보류 표면은 첫 화면 프라임 자리에서 뺀다(2026-08-05 system-eval B-10). */}
          <Button variant="ghost" size="md" icon="bell" onClick={() => onNavigate('dashboard/revenue/followups')}>고객 연락</Button>
          <Button variant="primary" size="md" icon="clock" onClick={() => onNavigate('dashboard/work/calendar?focus=15')}>15분 집중</Button>
        </div>
      </div>

      <StatusLine state={ledger} />

      {/* §7 슬롯 순서: Quick Capture가 첫 fold 1순위 — 내비 칩보다 위. */}
      <QuickTaskCapture onNavigate={onNavigate} onSaved={refreshLedger} />

      <BriefNavigation taskToday={ledger.taskToday} onNavigate={onNavigate} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        {/* §7 확정 fold 순서: Capture → 긴급 KA·집중 고객·오늘 일정 → 신호. 명명된 슬롯이
            tone 정렬 신호(자동화 실패 등)보다 위 — 고객이 히어로 자리를 갖는다. */}
        <FocusSlots dailyFocus={ledger.dailyFocus} onNavigate={onNavigate} />

        <div className="daily-brief__command-reveal">
          {command ? (
            <CommandCard s={command} remaining={waiting.length} onNavigate={onNavigate} />
          ) : (
            <CommandClear signalCount={signalCount} />
          )}
        </div>

        <div className="hub-grid--two" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.05fr) minmax(300px, .95fr)', gap: 16, alignItems: 'start' }}>
          <TaskToday taskToday={ledger.taskToday} onNavigate={onNavigate} onChanged={refreshLedger} />

          <div>
            <SectionTitle right={<div style={{ display: 'flex', gap: 6 }}>
              <Badge tone={urgentCount > 0 ? 'danger' : 'neutral'} size="xs">{urgentCount} urgent</Badge>
              <Badge tone="neutral" size="xs">{todayCount} today</Badge>
            </div>}>
              결정 큐
            </SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {queue.length ? (
                queue.map((s) => <SignalCard key={s.id} s={s} defaultExpanded={s.tone === 'danger'} onNavigate={onNavigate} />)
              ) : (
                <Card className="daily-brief__panel">
                  <EmptyState icon="check" title={command ? '큐가 비었습니다' : '오늘 신호 없음'} description={command ? '가장 급한 하나만 위에 남았어요. 처리하면 브리핑이 정리됩니다.' : '새 신호가 들어오면 명령 카드로 가장 먼저 올라옵니다.'} />
                </Card>
              )}
              {queueOverflow > 0 && (
                <Button variant="ghost" size="sm" icon="chevronD" onClick={() => setQueueExpanded(true)}>
                  대기 결정 {queueOverflow}건 더 보기
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* 매출 pulse는 §2 첫 화면 판단축 — 접힌 MoreDetail 뒤가 아니라 "지금 값"으로
            상시 노출한다(2026-07-15 §2.2 QA 결정 B 유지 항목, system-eval B-11). */}
        <div>
          <SectionTitle right={<Button variant="ghost" size="xs" iconRight="arrowRight" onClick={() => onNavigate('dashboard/overview')}>현황에서 보기</Button>}>운영 지표</SectionTitle>
          <div className="hub-grid--metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--gap)' }}>
            {ledger.metrics.map((m) => <MetricCard key={m.label} m={m} onNavigate={onNavigate} compact />)}
          </div>
        </div>

        <MoreDetail title="보조 정보 · 리듬, 모닝 브리프, 승인">
          <OperatorPulse operatorHome={ledger.operatorHome} contentBrands={ledger.contentBrands} onNavigate={onNavigate} />
          <RhythmPanel onNavigate={onNavigate} />
          <MorningBriefCard brief={ledger.morningBrief} onNavigate={onNavigate} />
          <ApprovalQueueCard onNavigate={onNavigate} />
        </MoreDetail>
      </div>
    </div>
  );
}
