"use client";

import React from "react";
import { CalendarOutcome } from "../calendar-outcome";
import { OfficeWorkflowPanel } from '../office-workflow-panel';
import { InquirySummary } from '../inquiry-notifications';
import { Iconed } from "../hub-icons";
import { Badge, Dot, Card, SectionTitle, Button, IconButton, Progress, ProgressRing, Sparkline, SyncBadge, TruthBadge, EmptyState, Kbd, Skeleton } from "../hub-primitives";
import { FloatingMentorWidget } from "../floating-mentor-widget";
import { requestPersonaChat } from "../persona-client";
import {
  buildDailyDispatchContext,
  createAdviceTaskWriter,
  buildWeeklySummaryText,
  extractWeeklyExperiment,
} from "@/lib/ai-workflow-client";
import { SIGNAL_TARGETS } from '@/lib/signal-targets';
import { BurningStreakBadge, StreakFlame } from "../burning-streak";
import { useUndoableAction } from "../use-undoable-action";
import { createClientId } from "@/lib/pms-ui";
import { QuickCaptureForm } from "../quick-capture";
import { buildTaskToday, isDurableTaskUpdateResult } from "@/lib/task-today";
import { QUICK_LOG_ACTIONS as WO_EXECUTE_ACTIONS } from "@/lib/sales-os/outcome-attribution";
import {
  beginRhythmCheck,
  buildRhythmCheckPayload,
  createRhythmCheckState,
  finishRhythmCheck,
  getRhythmProgressProps,
  resolveRhythmCheckResult,
  sortRitualsByTimeOfDay,
} from "@/lib/rhythm-ui";

function formatBriefDate(date) {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(date);
  return `${parts} · KST`;
}

function greetingFor(date) {
  const hour = date.getHours();
  if (hour < 12) return '좋은 아침입니다';
  if (hour < 18) return '좋은 오후입니다';
  return '좋은 저녁입니다';
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
  // §5.3 source truth: error alone is danger — live/partial/preview stay neutral
  // (proof-by-color is banned; the visible label carries the state).
  return state === 'error' ? 'danger' : 'neutral';
}

// TruthBadge의 TRUTH_STATES와 같은 어휘를 쓴다 — 첫 화면 상태 줄은 제품에서 가장 많이 읽히는
// 한 줄인데 `live`/`preview`/`error` 개발 토큰이라 "믿어도 되는 화면인지"를 말해주지 못했다
// (DESIGN §5.3/§10 — 2026-08-07 사용성 재감사 C).
function sourceLabel(state) {
  if (state === 'live') return '실시간';
  if (state === 'partial') return '일부 데이터';
  if (state === 'error') return '읽기 실패';
  if (state === 'syncing') return '동기화 중';
  if (state === 'mixed') return '혼합';
  return '연결 필요';
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

  // 연속 버닝 스트릭 계산 및 로컬스토리지 0ms 즉각 캐시
  const [cachedStreak] = React.useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem('hub:task-streak');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  React.useEffect(() => {
    if (taskToday?.streak) {
      try {
        localStorage.setItem('hub:task-streak', JSON.stringify(taskToday.streak));
      } catch { /* storage 불가 환경 */ }
    }
  }, [taskToday?.streak]);

  const streakInfo = taskToday?.streak || cachedStreak || { streak: 0, todayDoneCount: 0, isBurning: false, recentDays: [0, 0, 0, 0, 0, 0, 0] };
  const [optimisticDoneDelta, setOptimisticDoneDelta] = React.useState(0);
  const [isPopping, setIsPopping] = React.useState(false);

  const currentTodayDone = Math.max(0, (streakInfo.todayDoneCount || 0) + optimisticDoneDelta);
  const currentStreak = Math.max(0, (streakInfo.streak || 0) + (streakInfo.todayDoneCount === 0 && optimisticDoneDelta > 0 ? 1 : 0));
  const isBurning = streakInfo.isBurning || currentStreak >= 3 || (currentStreak > 0 && currentTodayDone > 0);
  const recentDays = Array.isArray(streakInfo.recentDays) && streakInfo.recentDays.length === 7
    ? streakInfo.recentDays.map((v, i) => (i === 6 && currentTodayDone > 0 ? 1 : v))
    : [0, 0, 0, 0, 0, 0, currentTodayDone > 0 ? 1 : 0];

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
      setOptimisticDoneDelta((d) => Math.max(0, d - 1));
      setFeedback({
        status: 'error',
        message: error instanceof Error ? error.message : '완료 상태를 저장하지 못했습니다.',
        action: null,
      });
    }
  }

  function complete(task) {
    setHiddenIds((s) => new Set(s).add(task.id));
    setOptimisticDoneDelta((d) => d + 1);
    setIsPopping(true);
    setTimeout(() => setIsPopping(false), 450);

    setFeedback({
      status: 'pending',
      message: `${task.title} 완료됨`,
      action: { label: '되돌리기', onClick: () => undoComplete(task) },
    });
    schedule(task.id, () => {
      // 창이 닫히면 되돌리기 버튼을 걷는다 — 죽은 버튼 방지(4차 재감사 S).
      setFeedback((cur) => (cur?.status === 'pending' ? { ...cur, action: null } : cur));
      persistComplete(task);
    });
  }

  function undoComplete(task) {
    if (!cancel(task.id)) return; // 창이 이미 닫혔으면 되돌릴 수 없음
    setHiddenIds((s) => { const n = new Set(s); n.delete(task.id); return n; });
    setOptimisticDoneDelta((d) => Math.max(0, d - 1));
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
          <BurningStreakBadge
            compact
            streak={currentStreak}
            todayCompleted={currentTodayDone}
            isBurning={isBurning}
            isPopping={isPopping}
          />
          <Badge tone={(counts.missed || 0) > 0 ? 'danger' : 'neutral'} size="xs">놓침 {counts.missed || 0}</Badge>
          <Badge tone="neutral" size="xs">오늘 {counts.today || 0}</Badge>
          <Button variant="ghost" size="xs" iconRight="arrowRight" onClick={() => onNavigate?.('dashboard/work/my')}>모두 보기</Button>
        </div>
      )}>오늘 할 일</SectionTitle>
      <Card pad={false} className="daily-brief__panel">
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line-soft)', background: 'var(--surface-2)' }}>
          <BurningStreakBadge
            streak={currentStreak}
            todayCompleted={currentTodayDone}
            isBurning={isBurning}
            recentDays={recentDays}
            isPopping={isPopping}
            title="오늘 할 일 연속 완주"
          />
        </div>
        {items.length ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {items.map((task, index) => (
              <div
                key={task.id}
                className="hub-row hub-stackable-row"
                style={{
                  minHeight: 'calc(var(--row-h) + 20px)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '11px 16px',
                  borderBottom: index < items.length - 1 ? '1px solid var(--line-soft)' : 'none',
                }}
              >
                <Badge tone={laneTone[task.lane] || 'neutral'} size="xs">{task.laneLabel}</Badge>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</div>
                  <div className="mono" style={{ marginTop: 2, fontSize: 11, color: 'var(--fg-faint)' }}>
                    {task.due && task.due !== '미정' ? (
                      <span style={{ color: task.lane === 'missed' ? 'var(--danger)' : 'inherit', fontWeight: task.lane === 'missed' ? 600 : 400 }}>
                        {`due ${task.due}`} ·{' '}
                      </span>
                    ) : ''}{task.priority || 'med'}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon="check"
                  aria-label={`완료: ${task.title}`}
                  onClick={() => complete(task)}
                  style={{ minHeight: 44, padding: '0 14px', flexShrink: 0 }}
                >
                  완료
                </Button>
              </div>
            ))}
            {taskToday?.hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => onNavigate?.('dashboard/work/my')}
                style={{ width: '100%', border: 0, borderTop: '1px solid var(--line-soft)', background: 'var(--surface-2)', color: 'var(--fg-muted)', fontSize: 11.5, padding: '9px 14px', cursor: 'pointer', textAlign: 'center' }}
              >
                할 일 {taskToday.hiddenCount}건 더 보기
              </button>
            )}
          </div>
        ) : taskToday?.state === 'error' ? (
          // read 실패 ≠ 미연결 — preview 카피("live가 되면…")로 뭉개면 실패가 "연결 대기"로
          // 오독되고 실제 할 일이 무음 소실된 것처럼 보인다(7차 안정성 S).
          <div role="alert">
            <EmptyState
              icon="alert"
              title="할 일을 읽지 못했습니다"
              description="비어 보여도 실제 할 일이 있을 수 있습니다 — 다시 읽어 주세요."
              action={<Button variant="secondary" size="sm" onClick={() => onChanged?.()}>다시 읽기</Button>}
              style={{ minHeight: 150 }}
            />
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

const EMPTY_DAILY_BRIEF_STATE = {
  inquiries: { status: 'loading', rows: [], unreadCount: null },
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
  // 접힌 보조 섹션의 헤더가 "안에 뭐가 있는지"를 말하려면 카드를 마운트하지 않고도 셀 수
  // 있어야 한다 — 브리핑 원장이 이미 싣고 오는 승인 큐 요약을 그대로 쓴다(사용성 재감사 E).
  queue: null,
  morningBrief: null,
};

// 모듈 스코프 stale-while-revalidate — 탭 복귀마다 ~30콜 팬아웃을 다시 기다리며
// 슬롯이 비던 것을 제거(4차 재감사 속도 M). 캐시는 즉시 서빙, 항상 배경 재검증.
const DAILY_BRIEF_CACHE_SERVABLE_MS = 5 * 60 * 1000;
let dailyBriefCache = null; // { at, state }

function useDailyBriefLedger(refreshKey) {
  const servable = dailyBriefCache && Date.now() - dailyBriefCache.at < DAILY_BRIEF_CACHE_SERVABLE_MS;
  const [state, setState] = React.useState(servable ? dailyBriefCache.state : EMPTY_DAILY_BRIEF_STATE);

  React.useEffect(() => {
    let active = true;
    const hasServableCache = Boolean(
      dailyBriefCache && Date.now() - dailyBriefCache.at < DAILY_BRIEF_CACHE_SERVABLE_MS
    );

    async function load() {
      if (!hasServableCache) setState((prev) => ({ ...prev, syncState: 'syncing' })); // 캐시 서빙 중엔 조용히 재검증
      try {
        const response = await fetch('/api/hub/daily-brief', { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (!active || !response.ok || !data) {
          // transport 실패는 error — preview로 뭉개면 첫 화면이 "Supabase 연결 후 live
          // 전환"이라는 거짓 안내와 함께 신호 0건으로 렌더된다(re-audit S5).
          if (active) setState((prev) => ({ ...prev, syncState: hasServableCache ? 'partial' : 'error' }));
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

        const nextState = {
          inquiries: data.inquiries || { status: 'error', rows: [], unreadCount: null },
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
          queue: data.queue || null,
          morningBrief: data.morningBrief || null,
        };
        dailyBriefCache = { at: Date.now(), state: nextState };
        setState(nextState);
      } catch {
        // 캐시를 보여주는 중이면 live 위장 대신 partial(오래된 데이터) — 없으면 error.
        if (active) setState((prev) => ({ ...prev, syncState: hasServableCache ? 'partial' : 'error' }));
      }
    }

    load();
    return () => { active = false; };
  }, [refreshKey]);

  // 캡처/완료 후 좁은 재검증 — 전체 집계(~30콜)가 아니라 tasks lean read(4콜)만 다시
  // 받아 taskToday 슬라이스를 교체한다(re-audit 속도 #1 후반부). 실패는 조용히 무시 —
  // 다음 전체 refresh가 정합을 회복하고, 로컬 낙관 상태는 이미 화면에 반영돼 있다.
  const taskRefreshRef = React.useRef(0);
  const refreshTasks = React.useCallback(async () => {
    // 연속 완료 시 늦은 이전 응답이 최신 목록을 덮지 않게 최신 요청만 반영.
    const requestId = taskRefreshRef.current + 1;
    taskRefreshRef.current = requestId;
    try {
      const res = await fetch('/api/hub/tasks', { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (taskRefreshRef.current !== requestId) return false;
      if (!res.ok || !data || data.status === 'error') return false;
      const todos = Array.isArray(data.tasks) ? data.tasks : [];
      setState((prev) => {
        const next = {
          ...prev,
          taskToday: {
            ...buildTaskToday(todos),
            state: data.partial === true ? 'partial' : 'live',
          },
        };
        // 캐시도 함께 갱신 — 5분 내 탭 복귀가 캡처/완료 이전 스냅샷을 재서빙해
        // 완료한 일이 되살아나던 회귀 차단(5차 재감사 S, iter-15 회귀).
        if (dailyBriefCache) dailyBriefCache = { at: dailyBriefCache.at, state: next };
        return next;
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  return { ...state, refreshTasks };
}

function SignalCard({ s, index = 0, defaultExpanded, onNavigate, onAdvisorOpen }) {
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
        style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, paddingTop: 3 }}>
          <Dot tone={s.tone === 'danger' ? 'danger' : 'neutral'} size={8} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <Badge tone="neutral" size="xs">{s.kind}</Badge>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{s.meta}</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>from {s.source.from} · <span className="mono">{s.source.ref}</span></span>
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: decided ? 'var(--fg-muted)' : 'var(--fg)', marginBottom: 4, letterSpacing: '-0.01em' }}>
            {s.title}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.5, maxWidth: '70ch' }}>{s.summary}</div>
          {decided && (
            // done은 중립 체크 + 낮은 강조 텍스트 — 녹색 완료 금지(§5.3 lifecycle).
            <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--fg-muted)' }}>
              <Iconed name="check" size={12} />
              <span>오늘 처리함 · {decided}</span>
              <Button variant="ghost" size="xs" onClick={(e) => { e.stopPropagation(); setDecided(null); }}>되돌리기</Button>
            </div>
          )}
        </div>
        <Iconed name="chevronD" size={14} style={{ color: 'var(--fg-faint)', transform: expanded ? '' : 'rotate(-90deg)', transition: 'transform .15s', flexShrink: 0, marginTop: 3 }} />
      </div>
      {expanded && !decided && (
        <div style={{ padding: '0 16px 14px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
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
          {onAdvisorOpen && (
            <Button
              variant="outline"
              size="sm"
              icon="sparkle"
              onClick={() => onAdvisorOpen(s)}
            >
              조언 구하기
            </Button>
          )}
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
      className="hub-metric-card daily-brief__metric-card"
      style={{
        padding: compact ? '12px 14px' : 'var(--card-pad)',
        boxShadow: compact ? 'none' : 'var(--shadow-soft)',
        cursor: clickable ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: compact ? 92 : 110,
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ fontSize: compact ? 10.5 : 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{m.label}</div>
        {clickable && <Iconed name="chevronR" size={compact ? 11 : 12} style={{ color: 'var(--fg-faint)', marginLeft: 'auto' }} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: compact ? 6 : 10 }}>
        {/* ≥18px → .stat (sans tabular), never mono — DESIGN.md §6 hybrid number rule. */}
        <div className="stat" style={{ fontSize: compact ? 22 : 30, fontWeight: 600, letterSpacing: '-0.02em', color: m.value === '—' ? 'var(--fg-faint)' : 'var(--fg)' }}>{m.value}</div>
        <div style={{ flex: 1 }} />
        {/* 실측 시계열이 있을 때만 — 합성 스파크는 지어낸 추세를 실데이터처럼 보이게 한다. */}
        {Array.isArray(m.spark) && m.spark.length > 1 && (
          <Sparkline values={m.spark} tone="moon" width={compact ? 48 : 70} height={compact ? 16 : 22} />
        )}
      </div>
      <div style={{ marginTop: compact ? 4 : 6, fontSize: compact ? 11 : 11.5, color: m.tone ? 'var(--fg-muted)' : 'var(--fg-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.delta}</div>
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
              <span style={{ display: 'block', height: '100%', width: `${Math.max(value ? 8 : 0, Math.round((value / max) * 100))}%`, borderRadius: 999, background: item.key === 'blocked' ? 'var(--moon-300)' : 'var(--moon-500)' }} />
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
                    <div style={{ marginTop: 2, fontSize: 10.5, color: 'var(--fg-faint)', whiteSpace: 'nowrap' }}>{label}</div>
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
                    <div style={{ marginTop: 2, fontSize: 10.5, color: 'var(--fg-faint)', whiteSpace: 'nowrap' }}>{label}</div>
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

// 작업 주문 kind는 카테고리 — §5.2 동결: 카테고리에 semantic/accent 톤 금지.
const WO_KIND_TONE = {};

// Chief of Staff 브리핑 — the /api/cron/chief-of-staff composed agenda, read back from
// project_updates (ai.morning_brief) via /api/hub/daily-brief. Renders only when a fresh
// (<24h) brief exists; lanes map to identity tones (sales=company, brand=personal).
const BRIEF_LANE_META = {
  approve: { label: '승인', tone: 'neutral' },
  sales: { label: '영업', tone: 'neutral' },
  brand: { label: '브랜드', tone: 'neutral' },
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
        <Badge tone="neutral" size="xs">Chief of Staff</Badge>
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
  const [dismissNotice, setDismissNotice] = React.useState(null);
  const { schedule: scheduleUndoable, cancel: cancelUndoable } = useUndoableAction();
  const [actionError, setActionError] = React.useState(null);
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
      .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => null) }))
      .then(({ ok, d }) => {
        if (!active) return;
        // 승인 큐 read 실패를 empty로 뭉개면 "승인 대기 없음"으로 오독된다(re-audit S10).
        // 라우트는 실패를 HTTP 200 + status:"error" 봉투로 알린다(2026-09-01 봉투 통일)
        // — !ok만 보면 read 실패가 "대기 없음"으로 위장된다. agents.jsx와 같은 가드를 쓴다.
        if (!ok || !d || d.status === 'error' || d.source === 'error') {
          setOrders([]);
          setState('error');
          return;
        }
        if (Array.isArray(d.orders)) {
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
    setActionError(null);
    try {
      const res = await fetch('/api/hub/work-orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, ...body }),
      });
      // 실패(400 스테일 전이/RLS·네트워크)를 무언 no-op으로 두지 않는다 — agents 큐와
      // 동일 계약(5차 재감사 S: 첫 화면 쌍둥이만 미적용이었다).
      if (!res.ok) setActionError(`처리 실패 (${res.status}) — 새로고침 후 다시 시도하세요.`);
      return res.ok;
    } catch {
      setActionError('처리 실패 — 네트워크를 확인하고 다시 시도하세요.');
      return false;
    } finally {
      setBusyId(null);
    }
  }

  // proposed → approved reveals the execute row; execute logs the realized outcome and
  // closes the outcome-attribution loop. dismiss drops it.
  const approve = async (id) => { if (await post(id, { status: 'approved' })) setApproved((m) => ({ ...m, [id]: true })); };
  // 보류는 3.5초 지연 실행 + 되돌리기 — 1클릭 영구 제거였던 유일한 무안전망 액션(6차 재감사).
  const dismiss = (id) => {
    const removed = orders.find((o) => o.id === id) || null;
    setOrders((prev) => prev.filter((o) => o.id !== id));
    const key = `dismiss-${id}`;
    scheduleUndoable(key, () => {
      setActionError((cur) => cur); // no-op — 상태 유지
      setDismissNotice((cur) => (cur?.key === key ? null : cur));
      post(id, { status: 'dismissed' }).then((ok) => {
        if (!ok && removed) setOrders((prev) => (prev.some((o) => o.id === id) ? prev : [removed, ...prev]));
      });
    });
    setDismissNotice({
      key,
      label: '제안 보류됨',
      undo: () => {
        if (cancelUndoable(key) && removed) setOrders((prev) => (prev.some((o) => o.id === id) ? prev : [removed, ...prev]));
        setDismissNotice(null);
      },
    });
  };
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
      <SectionTitle right={<Badge tone="neutral" size="xs">{pending} 대기</Badge>}>
        승인 큐
      </SectionTitle>
      {actionError && (
        <div role="alert" style={{ marginBottom: 8, fontSize: 12, color: 'var(--danger)' }}>{actionError}</div>
      )}
      {dismissNotice && (
        <div role="status" aria-live="polite" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--fg-muted)' }}>
          <span>{dismissNotice.label}</span>
          <Button variant="ghost" size="xs" onClick={dismissNotice.undo}>되돌리기</Button>
        </div>
      )}
      <Card pad={false}>
        {orders.length === 0 ? (
          <div role={state === 'error' ? 'alert' : undefined} style={{ padding: 14, fontSize: 12.5, color: state === 'error' ? 'var(--danger)' : 'var(--fg-muted)', lineHeight: 1.5 }}>
            {state === 'loading'
              ? <Skeleton lines={2} label="승인 큐 확인 중" />
              : state === 'error'
              ? '승인 큐를 읽지 못했습니다 — 대기 제안이 있을 수 있습니다. 새로고침해 주세요.'
              : '승인 대기 중인 제안이 없습니다. /inbox·/team이 제안을 올리면 여기서 1클릭으로 처리합니다.'}
          </div>
        ) : (
          <>
          {personaCounts.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: '9px 14px', borderBottom: '1px solid var(--line-soft)', background: 'var(--surface-2)' }}>
              <span style={{ fontSize: 10.5, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>대기</span>
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
                    <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{o.persona}{o.channel ? ` · ${o.channel}` : ''}</span>
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
function StatusLine({ state, onRetry }) {
  const [open, setOpen] = React.useState(false);
  const liveCount = Number(state.summary?.liveCount || 0);
  const sourceCount = state.sources.length;
  const label = state.syncState === 'mixed' ? `${liveCount}/${sourceCount || 6} 실시간` : sourceLabel(state.syncState);
  const detail = state.syncState === 'error'
    ? '브리핑을 읽지 못했습니다 — 지금 화면은 비어 보여도 실제 일이 있을 수 있습니다'
    : state.syncState === 'preview'
    ? 'Supabase 연결 후 실시간 기록으로 전환됩니다'
    : state.syncState === 'partial'
    ? '일부 운영 기록을 읽지 못했습니다'
    : state.syncState === 'mixed'
    ? '일부 기록은 실시간, 일부는 연결 필요'
    : state.syncState === 'syncing'
    ? '기록 상태 확인 중'
    : '모든 운영 기록 실시간';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--fg-faint)', padding: '0 2px' }}>
      <Dot tone={syncTone(state.syncState)} size={6} />
      <span className="mono" style={{ color: 'var(--fg-dim)', letterSpacing: 0 }}>{label}</span>
      <span style={{ color: 'var(--fg-faint)' }}>· {detail}</span>
      {onRetry && ['error', 'partial'].includes(state.syncState) && (
        <Button variant="ghost" size="xs" onClick={onRetry}>다시 읽기</Button>
      )}
      {sourceCount > 0 && (
        <button
          type="button"
          aria-label={open ? '기록 상태 숨기기' : '기록 상태 펼치기'}
          aria-expanded={open}
          aria-controls="daily-brief-ledger-statuses"
          onClick={() => setOpen((o) => !o)}
          className="daily-brief__status-toggle"
        >
          <span>{open ? '기록 숨기기' : `기록 ${sourceCount}`}</span>
          <Iconed name="chevronD" size={10} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </button>
      )}
      {open && (
        <div id="daily-brief-ledger-statuses" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', width: '100%', marginTop: 8, padding: '8px 12px', background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)' }}>
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
function CommandCard({ s, remaining, onNavigate, onAdvisorOpen }) {
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
      padding: '18px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {/* §9: urgent 인디케이터는 루프 금지 — red+glow가 이미 충분한 강조 */}
        <span style={{ width: 7, height: 7, borderRadius: 999, background: accent, flexShrink: 0 }} />
        <span className="mono" style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-dim)', fontWeight: 600 }}>지금 가장 급한 결정</span>
        <Badge tone="neutral" size="xs">{s.kind}</Badge>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{s.meta}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>from {s.source?.from} · <span className="mono">{s.source?.ref}</span></span>
      </div>
      <div style={{ fontSize: 'clamp(18px, 2.2vw, 22px)', fontWeight: 650, letterSpacing: '-0.025em', color: 'var(--fg)', marginBottom: 8, lineHeight: 1.25 }}>{s.title}</div>
      <div style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.55, maxWidth: '76ch' }}>{s.summary}</div>
      {decided ? (
        // done은 중립 체크 + 낮은 강조 텍스트 — 녹색 완료 금지(§5.3 lifecycle).
        <div style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--fg-muted)' }}>
          <Iconed name="check" size={14} />
          <span>오늘 처리함 · {decided}</span>
          <Button variant="ghost" size="sm" onClick={() => setDecided(null)}>되돌리기</Button>
        </div>
      ) : (
        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
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
          {onAdvisorOpen && (
            <Button
              variant="outline"
              size="md"
              icon="sparkle"
              onClick={() => onAdvisorOpen(s)}
            >
              조언 구하기
            </Button>
          )}
          {hasRecord && <Button variant="outline" size="md" iconRight="arrowRight" onClick={openRecord}>레코드 열기</Button>}
          <div style={{ flex: 1 }} />
          {remaining > 0 && <span className="mono" style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>대기 결정 {remaining}건 ↓</span>}
        </div>
      )}
    </div>
  );
}

// Calm state when nothing is urgent — the brief still answers "what matters" with "nothing on fire".
function CommandClear({ signalCount }) {
  return (
    <div className="daily-brief__panel" style={{
      background: 'var(--surface)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-lg)',
      padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14,
    }}>
      {/* all-clear도 중립 체크 — 녹색 완료 상태 금지(§5.3 done = neutral, not green). */}
      <span style={{ width: 36, height: 36, borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', border: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-muted)', flexShrink: 0 }}>
        <Iconed name="check" size={18} />
      </span>
      <div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>지금 급한 결정은 없습니다</div>
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
// `summary`는 접힌 상태에서 안에 무엇이 기다리는지 말한다 — 접혀 있다는 이유로 "섹션당
// 다음 행동 1개" 계약 밖에 있던 보조 섹션(승인 큐 포함)을 계약 안으로 들인다(사용성 재감사 E).
function MoreDetail({ title, summary, children }) {
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
        {!open && summary && (
          <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{summary}</span>
        )}
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
  const [weeklyReviewOpen, setWeeklyReviewOpen] = React.useState(false);
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
  const sortedRituals = React.useMemo(() => sortRitualsByTimeOfDay(rituals), [rituals]);
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span className="stat" style={{ fontSize: 22, fontWeight: 600 }}>{completed}/{total}</span>
                <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>이번 주 완료</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {percent >= 100 && (
                  <span className="hub-celebration-badge hub-celebration-badge--sparkle">
                    ✦ 완벽 달성
                  </span>
                )}
                <ProgressRing value={percent} size={28} strokeWidth={3} showLabel />
              </div>
            </div>
            <div {...rhythmProgressProps} style={{ marginTop: 10 }}><Progress value={percent} /></div>
            {summary.longestStreak > 0 && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: 11, color: 'var(--fg-muted)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <StreakFlame size={15} burning={summary.longestStreak >= 3} />
                  <span>
                    최장 <span className="mono" style={{ color: 'var(--fg)', fontWeight: 600 }}>{summary.longestStreak}일</span>
                    {summary.longestStreakRitual ? ` · ${summary.longestStreakRitual}` : ''}
                  </span>
                </div>
                <span
                  className={summary.longestStreak >= 3 ? "hub-streak-badge--burning" : ""}
                  style={{
                    fontSize: 10.5,
                    padding: '2px 6px',
                    borderRadius: 'var(--r-xs)',
                    background: summary.longestStreak >= 3 ? 'rgba(255,120,50,0.1)' : 'var(--surface-3)',
                    color: summary.longestStreak >= 3 ? '#ff9a52' : 'var(--fg-dim)',
                    border: `1px solid ${summary.longestStreak >= 3 ? 'rgba(255,140,70,0.3)' : 'var(--line-soft)'}`,
                  }}
                >
                  {summary.longestStreak >= 3 ? `버닝 ${summary.longestStreak}일째 🔥` : `${summary.longestStreak}일 연속`}
                </span>
              </div>
            )}
            <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', border: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10.5 }}>
              <span style={{ color: 'var(--fg-muted)' }}>이번 주 업로드 <strong>5/7</strong> · 일평균 몰입 <strong>3.2h</strong></span>
              <span style={{ color: 'var(--moon-300)', cursor: 'pointer' }} onClick={() => onNavigate?.('dashboard/work/rhythm')}>분석 ↗</span>
            </div>
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sortedRituals.map((r, i) => {
                const pending = Boolean(mutationState.pendingByRitual?.[r.id]);
                const feedback = mutationState.feedbackByRitual?.[r.id];
                const weeks = Array.isArray(r.weeks) ? r.weeks : [];
                return (
                  <div key={r.id} style={{ paddingBottom: 10, borderBottom: i < sortedRituals.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                      {r.isTimeRecommended && (
                        <Badge tone="moon" size="xs">지금 시간대</Badge>
                      )}
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
                      <div aria-live="polite" style={{ marginTop: 4, fontSize: 10.5, color: feedback.kind === 'error' ? 'var(--danger)' : 'var(--fg-muted)' }}>
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
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          <Button
            variant="outline"
            size="xs"
            icon="sparkle"
            onClick={() => setWeeklyReviewOpen(true)}
            style={{ flex: 1.2, justifyContent: 'center' }}
          >
            한 주 정리 & Council 평가
          </Button>
          <Button
            variant="ghost"
            size="xs"
            iconRight="arrowRight"
            onClick={() => onNavigate?.('dashboard/work/rhythm')}
            style={{ flex: 0.8, justifyContent: 'center' }}
          >
            Rhythm 전체
          </Button>
        </div>
      </Card>

      {weeklyReviewOpen && (
        <FloatingMentorWidget
          isOpen={weeklyReviewOpen}
          onClose={() => setWeeklyReviewOpen(false)}
          agent="council"
          contextType="weekly"
          contextTitle="이번 주 운영 원장 회고"
          contextData={{
            summary: `이번 주 루틴 달성: ${completed}/${total} (${percent}%) · 연속 달성: ${summary.longestStreak}일`,
          }}
        />
      )}
    </div>
  );
}

function DailyDispatchCard({ dailyFocus, taskToday, signals = [], sourceState, onNavigate, onAdvisorOpen }) {
  const [dispatch, setDispatch] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [errorNote, setErrorNote] = React.useState(null);
  const [copied, setCopied] = React.useState(false);
  const inFlight = React.useRef(false);

  const context = buildDailyDispatchContext({ dailyFocus, taskToday, signals, sourceState });
  const isEvening = context.isEvening;
  const briefingState = sourceState === "live" && [context.urgentKa, context.focusCustomers, context.todayAgenda, context.tasks].some(slice => slice.state !== "live")
    ? "partial" : sourceState || "preview";

  const handleGenerate = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setErrorNote(null);

    try {
      const res = await requestPersonaChat({
        personaId: "order",
        mode: "daily-dispatch",
        message: isEvening
          ? "확인된 완료 건수와 남은 작업을 정리하고 내일 먼저 확인할 행동을 제안하세요. 미조회 완료 내역이나 내일 일정은 만들어내지 마세요."
          : "확인된 고객 다음 행동·기한·오늘 일정을 기준으로 실행 순서를 제안하세요. 자료가 부족하면 확인할 항목부터 알려주세요.",
        context,
      });

      if (res.state === "done") {
        setDispatch(res.text);
      } else {
        setErrorNote(res.note || "브리핑을 생성하지 못했습니다.");
      }
    } catch (e) {
      setErrorNote(e.message || "오류가 발생했습니다.");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!dispatch) return;
    try {
      await navigator.clipboard.writeText(dispatch);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErrorNote("복사하지 못했습니다. 브리핑 본문을 선택해 복사하세요.");
    }
  };

  return (
    <Card
      className="daily-brief__panel"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line-strong)",
        borderRadius: "var(--r)",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Iconed name={isEvening ? "clock" : "sparkle"} size={16} style={{ color: "var(--moon-300)" }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>
            {isEvening ? "🌙 퇴근 전 정돈 & 내일 첫 발자국" : "⚡ 30초 AI 실행 오더"}
          </span>
          <Badge tone="neutral" size="xs">
            {isEvening ? "Evening Wind-Down" : "Morning Dispatch"}
          </Badge>
          <TruthBadge state={briefingState} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {dispatch && (
            <Button variant="ghost" size="xs" icon={copied ? "check" : "copy"} onClick={handleCopy}>
              {copied ? "복사됨 ✓" : "복사"}
            </Button>
          )}
          <Button
            variant={dispatch ? "outline" : "primary"}
            size="xs"
            icon="sparkle"
            disabled={loading || ["loading", "syncing"].includes(sourceState)}
            onClick={handleGenerate}
          >
            {loading ? "작성 중…" : dispatch ? "다시 받기" : isEvening ? "퇴근 전 정돈 받기" : "30초 브리핑 받기"}
          </Button>
        </div>
      </div>

      {errorNote && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{errorNote}</div>}
      {briefingState !== "live" && <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>일부 원장을 확인하지 못했습니다. 브리핑은 확인된 자료 범위로 제한됩니다.</div>}
      {dispatch ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              fontSize: 12.5,
              lineHeight: 1.65,
              color: "var(--fg)",
              background: "var(--surface-2)",
              padding: "12px 14px",
              borderRadius: "var(--r-sm)",
              border: "1px solid var(--line-soft)",
              whiteSpace: "pre-wrap",
            }}
          >
            {dispatch}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingTop: 2 }}>
            {onAdvisorOpen && (
              <Button
                variant="outline"
                size="xs"
                icon="sparkle"
                onClick={() => onAdvisorOpen({
                  title: isEvening ? "퇴근 전 정돈 & 내일 설계 심층 토의" : "30초 실행 오더 심층 토의",
                  contextType: "general",
                  agent: "council",
                  summary: dispatch,
                  contextData: {
                    summary: dispatch,
                    isEvening,
                  },
                })}
              >
                Council 심층 토의 (⌘J)
              </Button>
            )}
            {onNavigate && (
              <>
                <Button variant="ghost" size="xs" icon="bell" onClick={() => onNavigate("dashboard/revenue/followups")}>
                  고객 연락 바로가기
                </Button>
                <Button variant="ghost" size="xs" icon="inbox" onClick={() => onNavigate("dashboard/work/my")}>
                  내 작업 바로가기
                </Button>
                <Button variant="ghost" size="xs" icon="calendar" onClick={() => onNavigate("dashboard/work/calendar")}>
                  캘린더 바로가기
                </Button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "var(--fg-muted)", lineHeight: 1.5 }}>
          {isEvening
              ? "확인된 완료 건수와 남은 작업을 정리하고, 내일 먼저 확인할 행동을 제안합니다."
              : "오늘 원장 데이터(긴급 고객, 태스크, 신호)를 기반으로 지금 당장 처리할 우선순위와 시간 배분을 제안합니다."
          }
        </div>
      )}
    </Card>
  );
}

// §2 확정 슬롯 — 긴급 KA(최대 1) · 집중 고객(3~5) · 오늘 일정. tone 정렬 신호 큐에 섞여
// 소실되던 풀을 명명된 자리로 분리한 첫 화면의 핵심 계약(2026-08-05 컷오버). 각 슬롯은
// 자기 소스의 truth 상태를 따로 표시한다 — 캘린더 미연결이 매출 슬롯을 오염시키지 않는다.
function FocusSlots({ dailyFocus, onNavigate }) {
  if (!dailyFocus) return null;
  const [guruFocusItem, setGuruFocusItem] = React.useState(null);
  const [showAllCustomers, setShowAllCustomers] = React.useState(false);
  const ka = dailyFocus.urgentKa || {};
  const focus = dailyFocus.focusCustomers || {};
  const agenda = dailyFocus.todayAgenda || {};
  const focusItems = Array.isArray(focus.items) ? focus.items : [];
  const visibleFocusItems = showAllCustomers ? focusItems : focusItems.slice(0, 3);
  const agendaItems = Array.isArray(agenda.items) ? agenda.items : [];
  const revenueError = focus.state === 'error';
  const revenuePreview = focus.state === 'preview';

  const eyebrow = (label, right = null) => (
    <div className="daily-brief__card-head" style={{ borderBottom: '1px solid var(--line-soft)' }}>
      <span style={{ flex: 1 }}>{label}</span>
      {right}
    </div>
  );

  return (
    <div className="hub-grid--two daily-brief__focus" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.05fr) minmax(300px, .95fr)', gap: 16, alignItems: 'stretch' }}>
      <Card pad={false} className="daily-brief__panel" aria-label="긴급 KA와 집중 고객" style={{ display: 'flex', flexDirection: 'column' }}>
        {/* 긴급 KA — §5.2 허용 red: urgent KA (최대 1건). live인데 후보가 없으면 침묵하지
            않고 부재와 지정 경로(Sales Ledger 시트의 companies.meta.ka)를 고지한다 —
            존재하지 않는 기능이 존재하는 척하지 않기(2026-08-05 re-audit #1). */}
        {ka.state === 'live' && !ka.item && (
          <div style={{ padding: '9px 16px', borderBottom: '1px solid var(--line-soft)', fontSize: 11.5, color: 'var(--fg-faint)', display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)' }}>
            <Iconed name="check" size={12} style={{ color: 'var(--fg-muted)' }} />
            <span>긴급 KA 없음</span>
            <span style={{ color: 'var(--fg-dim)' }}>· KA 지정은 Sales Ledger 시트에서 관리</span>
          </div>
        )}
        {ka.state === 'error' && (
          <div role="alert" style={{ padding: '10px 16px', borderBottom: '1px solid var(--line-soft)', fontSize: 11.5, color: 'var(--danger)' }}>
            매출 원장을 읽지 못해 긴급 KA를 판정할 수 없습니다 — 지금 화면은 비어 보여도 실제 긴급 건이 있을 수 있습니다.
          </div>
        )}
        {ka.item && (
          <div style={{ boxShadow: 'inset 1px 0 0 var(--danger-line)', borderBottom: '1px solid var(--line-soft)', background: 'rgba(224, 86, 74, 0.03)' }}>
            {eyebrow('긴급 KA', <Badge tone="danger" size="xs">즉시 대응</Badge>)}
            <div
              className="hub-row daily-brief__customer-row"
              role="button"
              tabIndex={0}
              onClick={() => onNavigate?.(ka.item.href)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate?.(ka.item.href); } }}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px 14px', cursor: 'pointer' }}
            >
              <Iconed name="bell" size={15} style={{ color: 'var(--danger)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {ka.item.name}
                  {ka.item.company && ka.item.company !== ka.item.name && <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}> · {ka.item.company}</span>}
                </div>
                <div style={{ marginTop: 3, fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.4 }}>
                  <span style={{ color: 'var(--moon-300)', fontWeight: 500 }}>{ka.item.nextAction ? `→ ${ka.item.nextAction}` : ''}</span>
                  {ka.item.reason && <span style={{ color: 'var(--fg-faint)' }}> · {ka.item.reason}</span>}
                </div>
              </div>
              <IconButton
                icon="sparkle"
                label="Guru 세일즈 코칭"
                size="sm"
                tone="moon"
                onClick={(e) => {
                  e.stopPropagation();
                  setGuruFocusItem({
                    id: ka.item.id || 'urgent-ka',
                    name: ka.item.name,
                    company: ka.item.company,
                    stage: '긴급 KA',
                    nextAction: ka.item.nextAction,
                    reason: ka.item.reason,
                    notes: `긴급 KA: ${ka.item.name} (${ka.item.company || ''}) - ${ka.item.reason || ''}. 다음 행동: ${ka.item.nextAction || ''}`
                  });
                }}
                style={{ color: 'var(--moon-300)', flexShrink: 0 }}
              />
              <Iconed name="chevronR" size={13} className="daily-brief__row-arrow" />
            </div>
          </div>
        )}

        {eyebrow(
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>집중 고객</span>
            {focusItems.length > 0 && <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-muted)' }}>{focusItems.length}</span>}
          </div>,
          revenueError ? <SyncBadge state="error" /> : revenuePreview ? <SyncBadge state="preview" /> : null
        )}
        {revenueError ? (
          <div role="alert" style={{ padding: '12px 16px 14px', fontSize: 12, color: 'var(--danger)' }}>매출 원장을 읽지 못했습니다 — 상단 상태줄의 다시 읽기로 재시도하세요.</div>
        ) : revenuePreview ? (
          <div style={{ padding: '12px 16px 14px', fontSize: 12, color: 'var(--fg-muted)' }}>매출 원장이 연결되면 집중 고객 3~5건이 여기에 표시됩니다.</div>
        ) : focusItems.length === 0 ? (
          <div style={{ padding: '12px 16px 14px', fontSize: 12, color: 'var(--fg-muted)' }}>집중 고객 없음 — CS 레인에 다음 행동이 있는 리드가 없습니다.</div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {visibleFocusItems.map((item, i) => (
              <div
                key={item.id}
                className="hub-row daily-brief__customer-row"
                role="button"
                tabIndex={0}
                onClick={() => onNavigate?.(item.href)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate?.(item.href); } }}
                style={{ borderBottom: i < visibleFocusItems.length - 1 ? '1px solid var(--line-soft)' : 'none' }}
              >
                <span className="mono" style={{ width: 20, height: 20, borderRadius: 'var(--r-xs)', background: 'var(--surface-2)', border: '1px solid var(--line-soft)', color: 'var(--moon-300)', fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.name}
                    </span>
                    {item.company && item.company !== item.name && (
                      <span style={{ fontSize: 11.5, color: 'var(--fg-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.company}
                      </span>
                    )}
                  </div>
                  {item.nextAction && (
                    <div style={{ marginTop: 2, fontSize: 11.5, color: 'var(--moon-200)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      → {item.nextAction}
                    </div>
                  )}
                  {/* deep-design §7 행동 행 최소 정보: 이유 · 기한(기약 없음 포함) · 최근 활동 */}
                  <div style={{ marginTop: 2, fontSize: 11, color: 'var(--fg-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.reason}
                    {item.dueLabel && (
                      <span style={{ color: item.dueOverdue ? 'var(--danger)' : 'var(--fg-faint)', fontWeight: item.dueOverdue ? 600 : 400 }}> · {item.dueLabel}</span>
                    )}
                    {item.lastTouch && <span> · 최근 {item.lastTouch}</span>}
                  </div>
                </div>
                <IconButton
                  icon="sparkle"
                  label="Guru 세일즈 코칭"
                  size="sm"
                  tone="moon"
                  onClick={(e) => {
                    e.stopPropagation();
                    setGuruFocusItem({
                      id: item.id,
                      name: item.name,
                      company: item.company,
                      stage: '집중 고객',
                      nextAction: item.nextAction,
                      reason: item.reason,
                      dueLabel: item.dueLabel,
                      lastTouch: item.lastTouch,
                      notes: `집중 고객 #${i + 1}: ${item.name} (${item.company || ''}). 이유: ${item.reason || ''}. 다음 행동: ${item.nextAction || ''}. 기한: ${item.dueLabel || ''}`
                    });
                  }}
                  style={{ color: 'var(--moon-300)', flexShrink: 0 }}
                />
                <Iconed name="chevronR" size={12} className="daily-brief__row-arrow" />
              </div>
            ))}
            {focusItems.length > 3 && (
              <div style={{ padding: '6px 16px 10px', borderTop: '1px solid var(--line-soft)', display: 'flex', justifyContent: 'center' }}>
                <Button variant="ghost" size="xs" onClick={() => setShowAllCustomers(v => !v)}>
                  {showAllCustomers ? '접기' : `집중 고객 ${focusItems.length - 3}건 더 보기 ›`}
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card pad={false} className="daily-brief__panel" aria-label="오늘 일정" style={{ display: 'flex', flexDirection: 'column' }}>
        {eyebrow('오늘 일정', agenda.state !== 'live' ? <SyncBadge state={agenda.state} /> : null)}
        {/* 카드당 CTA 1개(§3) — 상태별 인라인 버튼과 푸터 버튼이 같은 목적지로 2개 렌더되던
            것을 푸터 하나로 통합하고, 라벨만 상태를 따라간다(사용성 재감사 F). */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {agenda.state === 'error' ? (
            <div role="alert" style={{ padding: '16px', fontSize: 12, color: 'var(--danger)' }}>
              캘린더를 읽지 못했습니다 — 일정이 있어도 표시되지 않습니다.
            </div>
          ) : agenda.state !== 'live' ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 6 }}>
              <Iconed name="calendar" size={20} style={{ color: 'var(--fg-faint)' }} />
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-muted)' }}>Google Calendar 미연결</div>
              <div style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>오늘 일정을 표시하려면 연결하세요.</div>
            </div>
          ) : agendaItems.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 6 }}>
              <Iconed name="calendar" size={20} style={{ color: 'var(--fg-faint)' }} />
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-muted)' }}>오늘 일정 없음</div>
              <div style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>오늘 하루 예정된 캘린더 일정이 없습니다.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {agendaItems.map((event, i) => (
                <div key={event.outcomeKey || event.id} style={{ padding: '10px 16px', borderBottom: i < agendaItems.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
                  <CalendarOutcome eventKey={event.outcomeKey} title={event.title} whenLabel={event.whenLabel} />
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--line-soft)', background: 'var(--surface-2)', borderBottomLeftRadius: 'var(--r-lg)', borderBottomRightRadius: 'var(--r-lg)', marginTop: 'auto' }}>
          <Button variant="ghost" size="xs" iconRight="arrowRight" onClick={() => onNavigate?.('dashboard/work/calendar')} style={{ width: '100%', justifyContent: 'center' }}>
            {agenda.state === 'live' || agenda.state === 'error' ? '캘린더 열기' : 'Google Calendar 연결'}
          </Button>
        </div>
      </Card>

      <FloatingMentorWidget
        isOpen={Boolean(guruFocusItem)}
        onClose={() => setGuruFocusItem(null)}
        agent="guru"
        contextType="customer"
        contextTitle={guruFocusItem?.name || guruFocusItem?.company || "고객 코칭"}
        contextData={{
          name: guruFocusItem?.name,
          company: guruFocusItem?.company,
          stage: guruFocusItem?.stage,
          nextAction: guruFocusItem?.nextAction,
          reason: guruFocusItem?.reason,
          lastTouch: guruFocusItem?.lastTouch,
          notes: guruFocusItem?.notes,
        }}
      />
    </div>
  );
}

// The queue is a decision list, not an inbox. Two items keep the first scan
// calm; the rest stay one click away.
const QUEUE_LIMIT = 2;

// 60초 시계를 페이지 루트에서 분리 — 분마다 전체 브리핑 트리가 아니라 이 리프만 다시 그린다.
function BriefClock({ signalCount, urgentCount, todayCount }) {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <>
      <div className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--moon-300)', display: 'inline-block' }} />
        <span>{formatBriefDate(now)}</span>
      </div>
      <h2 style={{ margin: 0, fontSize: 'clamp(26px, 3.2vw, 32px)', fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.1 }}>오늘의 실행</h2>
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13, color: 'var(--fg-muted)' }}>
        <span>{greetingFor(now)}, 준혁</span>
        <span style={{ color: 'var(--line-strong)', opacity: 0.6 }}>·</span>
        <div className="daily-brief__intro-stats">
          <span className="daily-brief__stat-chip">
            <span>신호</span>
            <strong>{signalCount}</strong>
          </span>
          <span className={`daily-brief__stat-chip${urgentCount > 0 ? ' daily-brief__stat-chip--danger' : ''}`}>
            <span>즉시</span>
            <strong>{urgentCount}</strong>
          </span>
          <span className="daily-brief__stat-chip">
            <span>오늘</span>
            <strong>{todayCount}</strong>
          </span>
        </div>
      </div>
    </>
  );
}

// 주간 정리 리포트 카드 — Q118·Q119 확정(2026-08-18): 월요일 아침 = 개인, 목요일 아침 =
// 회사(ClassIn). 해당 요일에만 렌더하고 다른 날은 null(§7 fold 순서를 어지럽히지 않는다).
const WEEKLY_SCOPE_BY_DAY = { Mon: 'personal', Thu: 'company' };

export function weeklyScopeToday(override) {
  if (override === 'personal' || override === 'company') return override;
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', weekday: 'short' }).format(new Date());
  return WEEKLY_SCOPE_BY_DAY[day] || null;
}

export { buildWeeklySummaryText, extractWeeklyExperiment };

export function WeeklyAiDebrief({ report, scope, onAdvisorOpen, onTaskCreated, onNavigate }) {
  return <>
    <OfficeWorkflowPanel
      intent="weekly_report"
      scope={scope === 'company' ? 'classin' : 'personal'}
      originRef={{ periodStart: report.periodStart, periodEnd: report.periodEnd, timezone: report.timezone || 'Asia/Seoul' }}
      title="이번 주 정리"
      onTaskCreated={onTaskCreated}
      onNavigate={onNavigate}
    />
    {onAdvisorOpen && <details style={{ marginTop: 12 }}>
      <summary style={{ minHeight: 44, cursor: 'pointer', fontSize: 12, color: 'var(--fg-muted)' }}>기존 회고 자문</summary>
      <Button size="xs" variant="ghost" onClick={() => onAdvisorOpen({
        title: `${scope === 'company' ? '회사' : '개인'} 주간 회고 토의`,
        contextType: 'weekly', agent: 'council', summary: buildWeeklySummaryText(report, scope),
        contextData: { summary: buildWeeklySummaryText(report, scope), report, scope },
      })}>기존 Council과 토론하기</Button>
    </details>}
  </>;
}

export function WeeklyReportCard({ onNavigate, onAdvisorOpen, overrideScope, onTaskCreated }) {
  const scope = weeklyScopeToday(overrideScope);
  const [state, setState] = React.useState({ syncState: 'loading', report: null });
  React.useEffect(() => {
    if (!scope) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/hub/weekly-report?scope=${scope}`, { cache: 'no-store' });
        const data = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok || !data || data.status === 'error') { setState({ syncState: 'error', report: null }); return; }
        setState({ syncState: data.status === 'partial' ? 'partial' : data.status === 'preview' ? 'preview' : 'live', report: data });
      } catch { if (active) setState({ syncState: 'error', report: null }); }
    })();
    return () => { active = false; };
  }, [scope]);
  if (!scope) return null;
  const title = scope === 'company' ? '회사 주간 리포트 · ClassIn' : '나의 주간 리포트';
  const { report, syncState } = state;
  const stats = report?.stats;
  const goals = report?.goals;
  const objectives = goals?.objectives?.filter(goal => goal.status === 'active') || [];
  const rows = !stats ? [] : scope === 'company'
    ? [
        { label: '연락', value: stats.contacts },
        { label: '신규 딜', value: stats.newDeals },
        { label: '수정된 진행 딜', value: stats.modifiedOpenDeals },
        { label: '성사일 확인된 딜', value: stats.wonDeals },
      ]
    : [
        { label: '완료 할 일', value: stats.doneTasks },
        { label: '발행', value: stats.publishes },
        { label: '연락', value: stats.contacts },
        { label: '개인 딜', value: stats.personalDeals },
      ];
  return (
    <Card className="fade-up">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SectionTitle style={{ margin: 0 }}>{title}</SectionTitle>
          <TruthBadge state={syncState} />
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{report?.periodStart && report?.periodEnd ? `${report.periodStart} — ${report.periodEnd}` : '지난 7일'}</span>
        </div>

      </div>
      {syncState === 'error' ? (
        <div style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>주간 기록을 읽지 못했습니다 — 아래 수치 없이 넘어가지 말고 새로고침으로 다시 확인하세요.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {syncState !== 'loading' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: 180, fontSize: 12, color: 'var(--fg-muted)' }}>
                {goals?.status === 'error' ? '목표·성과 원장을 읽지 못했습니다.' : syncState === 'preview' ? '측정 원장이 연결되면 기간별 실적을 확인할 수 있습니다.' : objectives.length ? `진행 목표 ${objectives.length}개 · 기간과 측정 근거를 확인하세요.` : '측정할 목표와 결과 지표를 연결해 보세요.'}
              </span>
              <Button variant="ghost" size="xs" iconRight="arrowRight" onClick={() => onNavigate?.(`dashboard/overview?view=goals&scope=${scope}`)}>목표·성과</Button>
            </div>
          )}
          {syncState === 'partial' && <p role="status" style={{ margin: 0, fontSize: 12, color: 'var(--fg-muted)' }}>일부 근거를 확인하지 못했습니다. ‘—’는 0이 아닌 미측정입니다.</p>}
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {rows.map((r) => (
              <div key={r.label} style={{ minWidth: 72 }}>
                <div className="stat" style={{ fontSize: 22 }}>{syncState === 'loading' ? <Skeleton lines={1} height={22} width="56%" label="지표 확인 중" /> : (r.value ?? '—')}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>{r.label}</div>
              </div>
            ))}
            {report?.highlights?.length > 0 && (
              <div style={{ flex: 1, minWidth: 180, fontSize: 12, color: 'var(--fg-muted)' }}>
                {report.highlights.map((h, i) => (
                  <div key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {h.kind === 'won' ? 'Won · ' : '완료 · '}{h.label}
                  </div>
                ))}
              </div>
            )}
          </div>
          {syncState !== 'loading' && report && (
            <WeeklyAiDebrief
              report={report}
              scope={scope}
              onAdvisorOpen={onAdvisorOpen}
              onTaskCreated={onTaskCreated}
              onNavigate={onNavigate}
            />
          )}
        </div>
      )}
    </Card>
  );
}

export function DailyBrief({ onNavigate, inquiryNotifications }) {
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [advisorSignal, setAdvisorSignal] = React.useState(null);
  const ledger = useDailyBriefLedger(refreshKey);
  const [queueExpanded, setQueueExpanded] = React.useState(false);
  const refreshLedger = React.useCallback(() => setRefreshKey((key) => key + 1), []);
  React.useEffect(() => {
    window.addEventListener('moonlight:inquiries-changed', refreshLedger);
    window.addEventListener('moonlight:tasks-saved', ledger.refreshTasks);
    return () => {
      window.removeEventListener('moonlight:inquiries-changed', refreshLedger);
      window.removeEventListener('moonlight:tasks-saved', ledger.refreshTasks);
    };
  }, [refreshLedger, ledger.refreshTasks]);

  const urgentCount = ledger.summary?.urgentCount ?? ledger.signals.filter(s => s.tone === 'danger').length;
  const todayCount = ledger.summary?.todayCount ?? ledger.signals.filter(s => s.tone === 'warning').length;
  const signalCount = ledger.signals.length;
  // 헤더는 화면 전체의 요약이고 「결정 큐」 배지는 큐만의 요약이다 — 확정 슬롯의 긴급 KA는
  // danger 레일을 달고 화면 맨 위에 있으므로 헤더 "즉시"에는 반드시 포함된다(사용성 재감사 A).
  const focusUrgentCount = ledger.summary?.focusUrgentCount ?? (ledger.dailyFocus?.urgentKa?.item ? 1 : 0);
  const screenUrgentCount = urgentCount + focusUrgentCount;
  // 접힌 헤더의 요약 — 0건을 굳이 말하지 않고(소음), read 실패는 0으로 뭉개지 않는다.
  // 승인 대기가 이미 신호(queue-approvals)로 올라와 있으면 반복하지 않는다: A-2와 같은 규칙으로,
  // 위에서 자리를 받은 것을 아래에서 또 세면 첫 화면 숫자가 다시 검증 불가가 된다.
  const approvalPromoted = ledger.signals.some((s) => s.id === 'queue-approvals');
  const approvalSummary = ledger.queue?.source === 'error'
    ? '승인 큐 확인 불가'
    : !approvalPromoted && Number(ledger.queue?.pending) > 0
      ? `승인 대기 ${ledger.queue.pending}건`
      : null;
  const ranked = React.useMemo(() => rankSignals(ledger.signals), [ledger.signals]);
  const command = ranked[0] || null;
  const waiting = ranked.slice(1);
  const queue = queueExpanded ? waiting : waiting.slice(0, QUEUE_LIMIT);
  const queueOverflow = waiting.length - queue.length;
  return (
    <div className="hub-page daily-brief" style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 'var(--section-gap)', maxWidth: 1160, margin: '0 auto', width: '100%' }}>
      <div className="hub-page-header daily-brief__intro fade-up" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
        <div>
          <BriefClock signalCount={signalCount} urgentCount={screenUrgentCount} todayCount={todayCount} />
        </div>
        <div className="hub-page-actions hub-page-actions--row" style={{ display: 'flex', gap: 8 }}>
          {/* 보류 스코프(Council)가 히어로 CTA를 점유하던 것을 코어 루프(고객 연락)로 교체
              — README §4 보류 표면은 첫 화면 프라임 자리에서 뺀다(2026-08-05 system-eval B-10). */}
          <Button variant="ghost" size="md" icon="bell" onClick={() => onNavigate('dashboard/revenue/followups')}>고객 연락</Button>
          <Button variant="primary" size="md" icon="clock" onClick={() => onNavigate('dashboard/work/calendar?focus=15')}>15분 집중</Button>
        </div>
      </div>

      <StatusLine state={ledger} onRetry={refreshLedger} />

      {/* 슬롯 순서: Quick Capture → 오늘 할 일 → 긴급 KA·집중 고객·일정 → 신호.
          입력과 결과를 붙인다 — 할 일을 여기서 적는데 목록은 9번째 슬롯(신호 아래)에 있어서
          방금 적은 것이 보이지 않았다. docs/README.md 의 운영자 확정 "첫 화면은 **할 일**,
          매출, 메시지, 기획, 콘텐츠 순서의 판단을 돕는다"도 할 일을 1순위로 적고 있다
          (2026-09-20 운영자 재확정). 긴급 KA·집중 고객 ≤5 제한은 그대로다. */}
      <QuickCaptureForm layout="inline" inputId="daily-brief-quick-task" inputClassName="daily-brief__quick-input" onNavigate={onNavigate} onSaved={ledger.refreshTasks} />

      <TaskToday taskToday={ledger.taskToday} onNavigate={onNavigate} onChanged={ledger.refreshTasks} />

      {/* Q118·Q119: 월(개인)·목(회사) 아침에만 뜨는 주간 정리 — 다른 요일은 null. */}
      <WeeklyReportCard
        onNavigate={onNavigate}
        onAdvisorOpen={setAdvisorSignal}
        onTaskCreated={ledger.refreshTasks}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
        <FocusSlots dailyFocus={ledger.dailyFocus} onNavigate={onNavigate} />
        <DailyDispatchCard
          dailyFocus={ledger.dailyFocus}
          taskToday={ledger.taskToday}
          signals={ledger.signals}
          sourceState={ledger.syncState}
          onNavigate={onNavigate}
          onAdvisorOpen={setAdvisorSignal}
        />

        <BriefNavigation taskToday={ledger.taskToday} onNavigate={onNavigate} />

        <InquirySummary state={inquiryNotifications && inquiryNotifications.status !== 'loading' ? inquiryNotifications : ledger.inquiries} onNavigate={onNavigate} />

        <div className="daily-brief__command-reveal">
          {command ? (
            <CommandCard s={command} remaining={waiting.length} onNavigate={onNavigate} onAdvisorOpen={setAdvisorSignal} />
          ) : (
            <CommandClear signalCount={signalCount} />
          )}
        </div>

        {/* 오늘 할 일이 캡처 바로 아래로 올라가면서 왼쪽 칸이 비었다 — 신호 섹션이 전폭을 쓴다. */}
        <div>
          <div>
            <SectionTitle right={<div style={{ display: 'flex', gap: 6 }}>
              <Badge tone={urgentCount > 0 ? 'danger' : 'neutral'} size="xs">{urgentCount} urgent</Badge>
              <Badge tone="neutral" size="xs">{todayCount} today</Badge>
            </div>}>
              결정 큐
            </SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {queue.length ? (
                queue.map((s) => (
                  <SignalCard
                    key={s.id}
                    s={s}
                    defaultExpanded={s.tone === 'danger'}
                    onNavigate={onNavigate}
                    onAdvisorOpen={setAdvisorSignal}
                  />
                ))
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
          <div className="hub-grid--metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--gap)' }}>
            {ledger.metrics.map((m) => <MetricCard key={m.label} m={m} onNavigate={onNavigate} compact />)}
          </div>
        </div>

        <MoreDetail title="보조 정보 · 리듬, 모닝 브리프, 승인" summary={approvalSummary}>
          <OperatorPulse operatorHome={ledger.operatorHome} contentBrands={ledger.contentBrands} onNavigate={onNavigate} />
          <RhythmPanel onNavigate={onNavigate} />
          <MorningBriefCard brief={ledger.morningBrief} onNavigate={onNavigate} />
          <ApprovalQueueCard onNavigate={onNavigate} />
        </MoreDetail>
      </div>

      {advisorSignal && (
        <FloatingMentorWidget
          isOpen={Boolean(advisorSignal)}
          onClose={() => setAdvisorSignal(null)}
          agent={advisorSignal.agent || (advisorSignal.kind === 'deals' || advisorSignal.kind === 'leads' ? 'guru' : 'council')}
          contextType={advisorSignal.contextType || (advisorSignal.kind === 'deals' ? 'deal' : advisorSignal.kind === 'content' ? 'content' : 'general')}
          contextTitle={advisorSignal.title}
          contextData={{
            summary: advisorSignal.summary,
            ref: advisorSignal.source?.ref,
            from: advisorSignal.source?.from,
            kind: advisorSignal.kind,
            meta: advisorSignal.meta,
            ...advisorSignal.contextData,
          }}
          onCreateTask={() => {
            ledger.refreshTasks();
          }}
        />
      )}
    </div>
  );
}
