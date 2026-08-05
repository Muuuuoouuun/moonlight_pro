"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Iconed } from "../hub-icons";
import { Badge, Card, IconButton, Button, Progress, EmptyState, EditDrawer, Kbd, SegmentedControl, CertaintyBadge } from "../hub-primitives";
import { resolveCalendarCapabilities } from "@/lib/calendar-capabilities";
import { mapTasksToCalendar } from "@/lib/calendar-task-view";
import {
  buildRoadmapItemAriaLabel,
  buildRoadmapProjection,
  createClientId,
} from "@/lib/pms-ui";
import {
  beginRhythmCheck,
  buildRhythmCheckPayload,
  buildRhythmDefinePayload,
  buildRhythmDeletePayload,
  buildRhythmEditPayload,
  createRhythmCheckState,
  filterRhythmRows,
  finishRhythmCheck,
  getRhythmProgressProps,
  resolveRhythmCheckResult,
  summarizeRhythmRows,
} from "@/lib/rhythm-ui";

const DAY_MS = 24 * 60 * 60 * 1000;
const EN_MONTH = new Intl.DateTimeFormat('en-US', { month: 'long' });

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + mondayOffset);
  return d;
}

function sameDate(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function formatWeekRange(days) {
  const first = days[0];
  const last = days[days.length - 1];
  const firstMonth = EN_MONTH.format(first);
  const lastMonth = EN_MONTH.format(last);
  if (firstMonth === lastMonth) return `${firstMonth} ${first.getDate()} – ${last.getDate()}`;
  return `${firstMonth} ${first.getDate()} – ${lastMonth} ${last.getDate()}`;
}

function buildCalendarWeek(now) {
  const weekStart = startOfWeek(now);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return {
    days,
    labels: days.map(d => `${['일','월','화','수','목','금','토'][d.getDay()]} ${d.getDate()}`),
    weekLabel: formatWeekRange(days),
    todayIndex: days.findIndex(d => sameDate(d, now)),
  };
}

function formatHour(value) {
  const hour = Math.floor(value);
  const minutes = Math.round((value - hour) * 60);
  return `${hour}:${String(minutes).padStart(2, '0')}`;
}

function useWorkLedger(projectId = null) {
  const [state, setState] = React.useState({
    source: 'preview',
    decisions: [],
    decisionsState: { state: 'preview', partial: false, error: null },
    rituals: [],
    projects: [],
    summary: null,
    syncState: 'preview',
    rhythmState: 'preview',
    rhythmPartial: false,
    rhythmTruncatedSources: [],
    rhythmError: null,
    roadmap: {
      source: 'preview',
      state: 'loading',
      partial: false,
      error: null,
      failedSources: [],
      truncatedSources: [],
      projects: [],
      milestones: [],
    },
  });
  const requestRef = React.useRef(0);
  const baseSnapshotRef = React.useRef(null);
  const projectQuery = typeof projectId === 'string' ? projectId.trim() : '';

  const load = React.useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setState((prev) => ({
      ...prev,
      syncState: 'loading',
      decisionsState: { ...prev.decisionsState, state: 'loading' },
      rhythmState: 'loading',
      rhythmPartial: false,
      rhythmTruncatedSources: [],
      roadmap: { ...prev.roadmap, state: 'loading' },
    }));
    try {
      const endpoint = projectQuery
        ? `/api/hub/work?project=${encodeURIComponent(projectQuery)}`
        : '/api/hub/work';
      const response = await fetch(endpoint, { cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (requestId !== requestRef.current) return false;

      if (!response.ok || !data || data.status === 'error') {
        const message = data?.error || data?.message || `업무 원장 응답 실패 (${response.status})`;
        setState((prev) => ({
          ...prev,
          syncState: 'error',
          decisionsState: {
            state: 'error',
            partial: false,
            error: { message, retryable: true },
          },
          rhythmState: 'error',
          rhythmPartial: false,
          rhythmTruncatedSources: [],
          rhythmError: message,
          rituals: [],
          summary: null,
          roadmap: {
            ...prev.roadmap,
            source: 'supabase',
            state: 'error',
            partial: false,
            error: { message, retryable: true },
            failedSources: ['projects', 'milestones'],
            truncatedSources: [],
            projects: [],
            milestones: [],
          },
        }));
        return false;
      }

      const roadmap = data.roadmap && typeof data.roadmap === 'object'
        ? data.roadmap
        : {
            source: data.source === 'supabase' ? 'supabase' : 'preview',
            state: data.source === 'supabase' ? 'error' : 'preview',
            partial: false,
            error: data.source === 'supabase'
              ? { message: '로드맵 응답이 없습니다.', retryable: true }
              : null,
            failedSources: data.source === 'supabase' ? ['projects', 'milestones'] : [],
            truncatedSources: [],
            projects: [],
            milestones: [],
          };
      const rhythm = data.rhythm && typeof data.rhythm === 'object'
        ? data.rhythm
        : {
            state: data.source === 'supabase'
              ? (Array.isArray(data.rituals) && data.rituals.length > 0 ? 'live' : 'live-empty')
              : 'preview',
            partial: false,
            truncatedSources: [],
            error: null,
          };
      const decisionsState = data.decisionsState && typeof data.decisionsState === 'object'
        ? data.decisionsState
        : {
            state: data.source === 'supabase'
              ? (Array.isArray(data.decisions) && data.decisions.length > 0 ? 'live' : 'live-empty')
              : 'preview',
            partial: false,
            error: null,
          };

      const nextState = {
        source: data.source === 'supabase' ? 'supabase' : 'preview',
        decisions: Array.isArray(data.decisions) ? data.decisions : [],
        decisionsState,
        rituals: Array.isArray(data.rituals) ? data.rituals : [],
        projects: Array.isArray(data.projects) ? data.projects : [],
        summary: data.summary || null,
        syncState: data.source === 'supabase' ? 'live' : 'preview',
        rhythmState: rhythm.state || 'error',
        rhythmPartial: Boolean(rhythm.partial),
        rhythmTruncatedSources: Array.isArray(rhythm.truncatedSources)
          ? rhythm.truncatedSources
          : [],
        rhythmError: rhythm.error?.message || null,
        roadmap,
      };
      setState(nextState);
      // 프로젝트 미선택 상태의 성공 응답을 스냅샷 — 로드맵 선택 해제 시 재조회 없이 복원한다.
      if (!projectQuery) baseSnapshotRef.current = nextState;
      return rhythm.state === 'live' || rhythm.state === 'live-empty' || rhythm.state === 'partial';
    } catch (error) {
      if (requestId !== requestRef.current) return false;
      const message = error instanceof Error ? error.message : String(error);
      setState((prev) => ({
        ...prev,
        syncState: 'error',
        decisionsState: {
          state: 'error',
          partial: false,
          error: { message, retryable: true },
        },
        rhythmState: 'error',
        rhythmPartial: false,
        rhythmTruncatedSources: [],
        rhythmError: message,
        rituals: [],
        summary: null,
        roadmap: {
          ...prev.roadmap,
          source: 'supabase',
          state: 'error',
          partial: false,
          error: { message, retryable: true },
          failedSources: ['projects', 'milestones'],
          truncatedSources: [],
          projects: [],
          milestones: [],
        },
      }));
      return false;
    }
  }, [projectQuery]);

  React.useEffect(() => {
    // 로드맵 선택 해제(project param 제거)는 이미 받아둔 base 응답을 복원한다 — 선택/해제
    // 왕복마다 업무 원장 전체를 다시 읽던 패턴 제거. 로드맵 뷰는 읽기 전용이라 선택 중
    // base가 뒤에서 변하는 경로는 없고, 명시적 retry()는 여전히 네트워크로 간다.
    if (!projectQuery && baseSnapshotRef.current) {
      requestRef.current += 1; // 진행 중인 선택-스코프 응답 무효화
      setState(baseSnapshotRef.current);
      return () => { requestRef.current += 1; };
    }
    load();
    return () => { requestRef.current += 1; };
  }, [load, projectQuery]);

  return { ...state, retry: load };
}

// Google's event.start is an ISO datetime (or an all-day date) — plot it onto the
// currently viewed week's grid. Events outside `days` are dropped (paginated by week).
function mapGoogleEventsToGrid(events, days) {
  return events.map((e) => {
    const start = new Date(e.start);
    const end = new Date(e.end || e.start);
    if (Number.isNaN(start.getTime())) return null;
    const day = days.findIndex((d) => sameDate(d, start));
    if (day === -1) return null;
    const startHour = e.allDay ? 8 : start.getHours() + start.getMinutes() / 60;
    const rawEndHour = e.allDay ? 9 : end.getHours() + end.getMinutes() / 60;
    return {
      id: e.id,
      day,
      start: startHour,
      end: Math.max(startHour + 0.25, rawEndHour),
      title: e.title,
      tone: 'moon',
    };
  }).filter(Boolean);
}

// Real read/write path against Google Calendar (apps/hub/lib/google-calendar.js +
// /api/calendar/google/event). Was previously 100% local React state with zero
// persistence — every "새 일정" vanished on reload regardless of connection status.
function useCalendarEvents(days) {
  const [state, setState] = React.useState({
    status: 'loading',
    source: null,
    readOnly: false,
    message: '',
    events: [],
  });
  const weekKey = days[0]?.toISOString().slice(0, 10) || '';
  const [refreshToken, setRefreshToken] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, status: 'loading' }));
    const timeMin = new Date(days[0]);
    const timeMax = new Date(days[6].getTime() + DAY_MS);
    const params = new URLSearchParams({ timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString() });

    fetch(`/api/calendar/google/event?${params.toString()}`, { cache: 'no-store' })
      .then((r) => r.json().catch(() => null))
      .then((d) => {
        if (!active) return;
        setState({
          status: d?.status || 'preview',
          source: d?.source || null,
          readOnly: Boolean(d?.readOnly),
          message: d?.message || '',
          events: Array.isArray(d?.events) ? d.events : [],
        });
      })
      .catch(() => active && setState({
        status: 'error',
        source: null,
        readOnly: false,
        message: 'Calendar 일정을 불러오지 못했습니다.',
        events: [],
      }));

    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekKey, refreshToken]);

  const refetch = React.useCallback(() => setRefreshToken((v) => v + 1), []);
  return { ...state, refetch };
}

function useCalendarTasks(days) {
  const [state, setState] = React.useState({ status: 'loading', tasks: [], message: '' });
  const weekKey = days[0]?.toISOString().slice(0, 10) || '';

  React.useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, status: 'loading' }));
    fetch('/api/hub/tasks', { cache: 'no-store' })
      .then((response) => response.json().catch(() => null).then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!active) return;
        if (!response.ok || !data || data.status === 'error') {
          setState({ status: 'error', tasks: [], message: data?.error || 'Task 기한을 불러오지 못했습니다.' });
          return;
        }
        setState({
          status: data.status || 'preview',
          tasks: Array.isArray(data.tasks) ? data.tasks : [],
          message: data.status === 'preview' ? 'Task 원장 연결 후 기한을 표시합니다.' : '',
        });
      })
      .catch(() => active && setState({ status: 'error', tasks: [], message: 'Task 기한을 불러오지 못했습니다.' }));

    return () => { active = false; };
  }, [weekKey]);

  return state;
}

export function Calendar({ onNavigate }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [now, setNow] = React.useState(() => new Date());
  const [selectedDate, setSelectedDate] = React.useState(() => new Date());
  const [viewMode, setViewMode] = React.useState('week');
  const [gcalStatus, setGcalStatus] = React.useState('idle');
  const [gcalMessage, setGcalMessage] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState('');
  const focusAppliedRef = React.useRef(false);
  const { days: fetchDays } = buildCalendarWeek(selectedDate);
  const calendarData = useCalendarEvents(fetchDays);
  const taskData = useCalendarTasks(fetchDays);
  const calendarCapabilities = resolveCalendarCapabilities(calendarData);
  const isLive = calendarCapabilities.isLive;
  const isReadOnly = isLive && calendarData.readOnly;

  // Creates a real Google Calendar event when connected; otherwise falls back to a
  // clear read-only/disconnected message without fabricating a local event.
  const createEvent = React.useCallback(async ({ date, startHour, endHour, title }) => {
    const targetDay = date || fetchDays[0];
    if (!calendarCapabilities.canCreate) {
      setGcalMessage(
        isReadOnly
          ? 'iCal 연결은 읽기 전용입니다. 일정 생성·수정에는 Google OAuth 연결이 필요합니다.'
          : 'Google Calendar 연결 후 일정을 만들 수 있습니다.',
      );
      return;
    }
    const startAt = new Date(targetDay); startAt.setHours(Math.floor(startHour), (startHour % 1) * 60, 0, 0);
    const endAt = new Date(targetDay); endAt.setHours(Math.floor(endHour), (endHour % 1) * 60, 0, 0);
    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch('/api/calendar/google/event', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, startAt: startAt.toISOString(), endAt: endAt.toISOString() }),
      });
      const data = await res.json().catch(() => null);
      if (data?.status === 'saved' || data?.status === 'updated') {
        calendarData.refetch();
      } else {
        // 무음 실패 금지 — 만료 토큰(401)·미연결이면 블록이 그냥 안 생겨서 드래그 실수처럼
        // 보였다. ?focus= 딥링크의 자동 생성도 이 경로를 타므로 원인을 반드시 표시한다.
        setCreateError(
          data?.message || data?.error
            ? `일정 생성 실패 — ${data.message || data.error}`
            : `일정 생성 실패 (${res.status}) — Google Calendar 연결 상태를 확인하세요.`,
        );
      }
    } catch {
      setCreateError('일정 생성 실패 — 네트워크 오류. 다시 시도하세요.');
    } finally {
      setCreating(false);
    }
  }, [fetchDays, calendarCapabilities.canCreate, isReadOnly, calendarData]);

  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    const minutes = Number(searchParams.get('focus'));
    if (!minutes || focusAppliedRef.current) return;
    setSelectedDate(now);
    setViewMode('day');
    focusAppliedRef.current = true;
    createEvent({
      date: now,
      startHour: 13,
      endHour: 13 + Math.max(15, minutes) / 60,
      title: `${minutes}m focus block`,
    });
    router.replace(pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, searchParams]);

  async function connectGoogleCalendar() {
    setGcalStatus('connecting');
    setGcalMessage('');
    try {
      const response = await fetch('/api/calendar/google/connect', { redirect: 'manual' });
      let data = null;
      try { data = await response.clone().json(); } catch { data = null; }

      if (data && data.url) {
        window.open(data.url, '_blank');
        setGcalStatus('connecting');
        setGcalMessage('Google OAuth 창을 열었습니다.');
        return;
      }

      if (data && data.preview === true) {
        setGcalStatus('preview');
        setGcalMessage(data.message || 'Google Calendar env 미설정 — preview 모드.');
        return;
      }

      // Fallback: route may redirect (3xx opaque) — treat as OAuth launch
      if (response.type === 'opaqueredirect' || response.redirected || response.status === 0) {
        window.open('/api/calendar/google/connect', '_blank');
        setGcalStatus('connecting');
        setGcalMessage('Google OAuth 창을 열었습니다.');
        return;
      }

      setGcalStatus('error');
      setGcalMessage(`응답 해석 실패 (status ${response.status}).`);
    } catch (error) {
      setGcalStatus('error');
      setGcalMessage(error instanceof Error ? error.message : String(error));
    }
  }

  const gcalLabel = calendarData.source === 'ical' && isLive
    ? '● iCal live · read only'
    : isLive
    ? '● Google Calendar live'
    : gcalStatus === 'connected'
    ? '● Google Calendar synced 2m ago'
    : gcalStatus === 'connecting'
    ? '● Connecting…'
    : gcalStatus === 'preview'
    ? '● Preview only (env missing)'
    : gcalStatus === 'error'
    ? '● Connect failed'
    : '● Not connected';
  const gcalColor = isLive || gcalStatus === 'connected'
    ? 'var(--success)'
    : gcalStatus === 'preview'
    ? 'var(--warning)'
    : gcalStatus === 'error'
    ? 'var(--danger)'
    : 'var(--fg-faint)';

  const hours = Array.from({ length: 12 }, (_, i) => 8 + i);
  const selectedWeek = buildCalendarWeek(selectedDate);
  const visibleDays = viewMode === 'day' ? [selectedDate] : selectedWeek.days;
  const dayLabels = visibleDays.map((date) => `${['일','월','화','수','목','금','토'][date.getDay()]} ${date.getDate()}`);
  const periodLabel = viewMode === 'day'
    ? new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(selectedDate)
    : selectedWeek.weekLabel;
  const todayIndex = visibleDays.findIndex((date) => sameDate(date, now));
  const selectedIndex = visibleDays.findIndex((date) => sameDate(date, selectedDate));
  const gridEvents = calendarCapabilities.shouldShowEvents
    ? mapGoogleEventsToGrid(calendarData.events, visibleDays)
    : [];
  const gridTasks = mapTasksToCalendar(taskData.tasks, visibleDays);
  const columnTemplate = `56px repeat(${visibleDays.length}, minmax(${viewMode === 'day' ? '320px' : '120px'}, 1fr))`;
  const calBadge = calendarData.status === 'live'
    ? { label: calendarCapabilities.badge, color: 'var(--success)' }
    : calendarData.status === 'loading'
    ? { label: 'syncing', color: 'var(--warning)' }
    : { label: calendarCapabilities.badge, color: 'var(--fg-faint)' };
  const addEvent = () => {
    createEvent({
      date: selectedDate,
      startHour: 13,
      endHour: 14,
      title: '새 일정',
    });
  };
  const movePeriod = (direction) => {
    setSelectedDate((date) => addDays(date, direction * (viewMode === 'day' ? 1 : 7)));
  };
  const selectDay = (date) => {
    setSelectedDate(new Date(date));
    setViewMode('day');
  };
  const taskStateLabel = taskData.status === 'loading'
    ? 'Task syncing'
    : taskData.status === 'live'
    ? 'Task live'
    : taskData.status === 'partial'
    ? 'Task partial'
    : taskData.status === 'error'
    ? 'Task error'
    : 'Task preview';
  // 이벤트 카테고리에 semantic 색(info/warning) 금지(§5.2) — 실 이벤트는 전부 moon이고
  // 남아 있던 info/warning 매핑은 mock 시절의 死항목이라 제거했다. company/personal은
  // legacy identity 토큰의 기존 call site로 유지.
  const toneBg = { moon: 'var(--moon-bg)', company: 'var(--company-bg)', personal: 'var(--personal-bg)' };
  const toneFg = { moon: 'var(--moon-100)', company: 'var(--company)', personal: 'var(--personal)' };
  const toneBd = { moon: 'var(--moon-line)', company: 'var(--company-line)', personal: 'var(--personal-line)' };

  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)', height: '100%' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          {/* 페이지 타이틀 계약(§11): 정확히 하나의 h2, 20px/500 — 앱 전체 타이틀과 동일 스케일. */}
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Calendar</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span>{periodLabel}</span>
            <span style={{ color: 'var(--fg-faint)' }}>·</span>
            <span className="mono" style={{ color: calBadge.color }}>{calBadge.label}</span>
            <span style={{ color: 'var(--fg-faint)' }}>·</span>
            <span className="mono" style={{ color: taskData.status === 'error' ? 'var(--danger)' : 'var(--fg-dim)' }}>{taskStateLabel}</span>
            <span style={{ color: 'var(--fg-faint)' }}>·</span>
            <span style={{ color: gcalColor }}>{gcalLabel}</span>
            <Button variant="ghost" size="xs" onClick={connectGoogleCalendar}>
              {gcalStatus === 'connecting'
                ? 'Connecting…'
                : isReadOnly
                ? 'Enable editing'
                : isLive
                ? 'Reconnect'
                : 'Connect Google Calendar'}
            </Button>
          </div>
          {(createError || gcalMessage || calendarData.message || taskData.message) && (
            <div
              className="mono"
              role={createError ? 'alert' : undefined}
              style={{ fontSize: 11, color: createError ? 'var(--danger)' : 'var(--fg-faint)', marginTop: 4 }}
            >
              {createError || gcalMessage || calendarData.message || taskData.message}
            </div>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <div className="hub-toolbar" style={{ display: 'flex', gap: 6 }}>
          <IconButton icon="chevronL" tooltip={viewMode === 'day' ? 'Previous day' : 'Previous week'} onClick={() => movePeriod(-1)} />
          <Button variant="secondary" size="sm" onClick={() => setSelectedDate(new Date(now))}>Today</Button>
          <IconButton icon="chevronR" tooltip={viewMode === 'day' ? 'Next day' : 'Next week'} onClick={() => movePeriod(1)} />
        </div>
        <SegmentedControl
          className="hub-toolbar"
          label="캘린더 보기"
          options={[{ key: 'day', label: 'Day' }, { key: 'week', label: 'Week' }]}
          value={viewMode}
          onChange={setViewMode}
        />
        <Button variant="primary" size="sm" icon="plus" onClick={addEvent} disabled={creating || !calendarCapabilities.canCreate}>Event</Button>
      </div>

      <Card pad={false} className="hub-table-card" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="hub-calendar-grid" style={{ display: 'grid', gridTemplateColumns: columnTemplate, borderBottom: '1px solid var(--line-soft)' }}>
          <div />
          {dayLabels.map((d, i) => (
            <button
              key={`${d}-${i}`}
              type="button"
              aria-label={`${d} 일간 보기`}
              aria-pressed={i === selectedIndex}
              onClick={() => selectDay(visibleDays[i])}
              style={{
                minHeight: 48, padding: '8px 12px', borderLeft: '1px solid var(--line-soft)',
                fontSize: 11.5, fontWeight: i === selectedIndex ? 650 : 450,
                color: i === todayIndex || i === selectedIndex ? 'var(--fg)' : 'var(--fg-muted)',
                background: i === selectedIndex ? 'var(--surface-2)' : 'transparent', textAlign: 'left',
              }}
            >
              {d}
              {i === todayIndex && <span style={{ marginLeft: 6, color: 'var(--moon-300)' }}>· Today</span>}
            </button>
          ))}
        </div>
        <div className="hub-calendar-grid" style={{ display: 'grid', gridTemplateColumns: columnTemplate, borderBottom: '1px solid var(--line-soft)', background: 'var(--surface-2)' }}>
          <div className="mono" style={{ padding: '12px 10px', fontSize: 10, color: 'var(--fg-faint)', textAlign: 'right' }}>TASK</div>
          {visibleDays.map((date, dayIndex) => {
            const tasks = gridTasks.filter((task) => task.day === dayIndex);
            const shown = tasks.slice(0, viewMode === 'day' ? 8 : 2);
            return (
              <div key={date.toISOString()} style={{ minHeight: 54, padding: 5, borderLeft: '1px solid var(--line-soft)', display: 'flex', flexDirection: viewMode === 'day' ? 'row' : 'column', gap: 4, flexWrap: viewMode === 'day' ? 'wrap' : 'nowrap' }}>
                {shown.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    className="hub-row"
                    aria-label={`할 일 열기: ${task.title}`}
                    onClick={() => onNavigate?.(`dashboard/work/my?task=${encodeURIComponent(task.id)}`)}
                    style={{
                      minHeight: 44, minWidth: 0, padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 7,
                      color: 'var(--fg)', background: 'var(--surface)', border: '1px solid var(--line-soft)',
                      borderRadius: 'var(--r-sm)', fontSize: 11.5, textAlign: 'left',
                      flex: viewMode === 'day' ? '0 1 280px' : '0 0 auto',
                    }}
                  >
                    <span aria-hidden="true" style={{ width: 8, height: 8, border: '1px solid var(--fg-dim)', borderRadius: 2, flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
                  </button>
                ))}
                {tasks.length > shown.length && (
                  <button type="button" onClick={() => onNavigate?.('dashboard/work/my?lens=week')} style={{ minHeight: 36, padding: '0 8px', color: 'var(--fg-dim)', fontSize: 10.5, textAlign: 'left' }}>
                    +{tasks.length - shown.length} tasks
                  </button>
                )}
                {tasks.length === 0 && <span style={{ padding: '8px', color: 'var(--fg-faint)', fontSize: 10.5 }}>—</span>}
              </div>
            );
          })}
        </div>
        <div className="scroll-y" style={{ flex: 1 }}>
          <div className="hub-calendar-grid" style={{ display: 'grid', gridTemplateColumns: columnTemplate, position: 'relative' }}>
            <div>
              {hours.map(h => (
                <div key={h} className="mono" style={{ height: 52, padding: '4px 10px', fontSize: 10, color: 'var(--fg-faint)', textAlign: 'right' }}>{h}:00</div>
              ))}
            </div>
            {visibleDays.map((date, di) => (
              <div key={date.toISOString()} style={{ borderLeft: '1px solid var(--line-soft)', position: 'relative' }}>
                {hours.map(h => <div key={h} style={{ height: 52, borderBottom: '1px solid var(--line-soft)' }} />)}
                {gridEvents.filter(e => e.day === di).map((e, ei) => {
                  const top = (e.start - 8) * 52;
                  const height = (e.end - e.start) * 52 - 2;
                  return (
                    <div key={ei} style={{
                      position: 'absolute', top, left: 4, right: 4, height,
                      background: toneBg[e.tone], color: toneFg[e.tone],
                      border: `1px solid ${toneBd[e.tone]}`,
                      borderLeft: `1px solid ${toneBd[e.tone]}`,
                      borderRadius: 6, padding: '6px 8px',
                      fontSize: 11, fontWeight: 500, overflow: 'hidden',
                    }}>
                      {e.title}
                      <div className="mono" style={{ fontSize: 10.5, opacity: 0.7, marginTop: 3 }}>{formatHour(e.start)} – {formatHour(e.end)}</div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

function buildDecisionDraft() {
  return {
    kind: 'decision',
    isNew: true,
    id: createClientId(),
    title: '새 결정 기록',
    date: '',
    status: 'Draft',
    by: 'Me',
    links: 0,
    reason: '',
    projectId: '',
    rationale: '',
    decidedAt: '',
  };
}

// ritualKey는 저장 시점(persistRitual)에 이름으로부터 생성한다 — 드로어에서 이름을
// 정하기 전까지는 비워 둔다 (buildRhythmDefinePayload가 slugifyRitualName + id로 채운다).
function buildRhythmDraft(defaultProjectId) {
  return {
    kind: 'ritual',
    isNew: true,
    id: createClientId(),
    ritualKey: '',
    name: '새 루틴',
    checkType: 'morning',
    projectId: defaultProjectId || '',
  };
}

export function Decisions() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const {
    decisions: liveDecisions,
    decisionsState,
    projects: linkableProjects,
    retry,
  } = useWorkLedger();
  const [localDecisions, setLocalDecisions] = React.useState([]);
  const [decisionEdits, setDecisionEdits] = React.useState({}); // { [id]: patch } overlay onto local or live rows
  const [editDecisionId, setEditDecisionId] = React.useState(null);
  const createdFromQueryRef = React.useRef(false);

  const mergedDecisions = [...localDecisions, ...(Array.isArray(liveDecisions) ? liveDecisions : [])]
    .map(d => (decisionEdits[d.id] ? { ...d, ...decisionEdits[d.id] } : d));
  const editingDecision = editDecisionId ? mergedDecisions.find(d => d.id === editDecisionId) : null;

  const createDecision = React.useCallback(() => {
    const draft = buildDecisionDraft();
    setLocalDecisions(prev => [draft, ...prev]);
    setEditDecisionId(draft.id);
  }, []);

  React.useEffect(() => {
    if (searchParams.get('new') !== 'decision' || createdFromQueryRef.current) return;
    createDecision();
    createdFromQueryRef.current = true;
    router.replace(pathname);
  }, [createDecision, searchParams, router, pathname]);
  const decisionSyncState = decisionsState?.state || 'error';
  const decisionComplete = decisionSyncState === 'live' || decisionSyncState === 'live-empty';
  const decisionLabel = decisionSyncState === 'live' || decisionSyncState === 'live-empty'
    ? 'live'
    : decisionSyncState === 'loading'
      ? 'syncing'
      : decisionSyncState;
  const decisionColor = decisionComplete
    ? 'var(--success)'
    : decisionSyncState === 'loading' || decisionSyncState === 'partial'
      ? 'var(--warning)'
      : decisionSyncState === 'error'
        ? 'var(--danger)'
        : 'var(--fg-faint)';

  // Page-level `n` — quick-record a decision when no drawer is open and focus isn't in a field.
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.key !== 'n' && e.key !== 'N') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (editDecisionId) return;
      const t = e.target;
      const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
      e.preventDefault();
      createDecision();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editDecisionId, createDecision]);

  // Keeps the timeline card's Draft/Committed badge and reason preview in sync with the
  // drawer while it's open (and after save) — those are precomputed display fields on the
  // base record, not derived from decidedAt/rationale at render time, so they'd otherwise
  // stay stale until the next full ledger reload.
  const updateDraft = (key, value) => {
    setDecisionEdits(prev => {
      const patch = { ...prev[editDecisionId], [key]: value };
      if (key === 'decidedAt') {
        patch.status = value ? 'Committed' : 'Draft';
        patch.date = value ? new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' }).format(new Date(value)) : '';
      }
      if (key === 'rationale') patch.reason = value;
      return { ...prev, [editDecisionId]: patch };
    });
  };

  // Persist the drawer edit. New local rows (client-generated id) POST; existing rows PATCH.
  // `decided_at` left blank keeps the decision as Draft (work-ledger.js resolveDecisionStatus) —
  // there is no separate manual status field.
  const persistDecision = React.useCallback(async () => {
    if (!editingDecision?.title?.trim()) return { ok: false, status: 'invalid-input' };
    try {
      const response = await fetch('/api/hub/decisions', {
        method: editingDecision.isNew ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: editingDecision.id,
          title: editingDecision.title,
          projectId: editingDecision.projectId || '',
          rationale: editingDecision.rationale || '',
          decidedAt: editingDecision.decidedAt || '',
          source: 'hub-work',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !['saved', 'duplicate'].includes(data.status)) {
        return { ok: false, status: data.status || 'error' };
      }
      if (editingDecision.isNew) {
        const realId = data.decision?.id || editingDecision.id;
        setLocalDecisions(prev => prev.map(d => (d.id === editDecisionId ? { ...d, id: realId, isNew: false } : d)));
        // Guard the re-key: id is client-generated up front, so realId === editDecisionId in
        // the common case, and setting+deleting the same overlay key would silently drop the
        // just-saved edits (title/rationale/decidedAt/status/reason) back to their stale
        // pre-edit values. Only remap when the server actually assigned a different id.
        if (realId !== editDecisionId) {
          setDecisionEdits(prev => {
            if (!prev[editDecisionId]) return prev;
            const next = { ...prev, [realId]: prev[editDecisionId] };
            delete next[editDecisionId];
            return next;
          });
          setEditDecisionId(realId);
        }
      }
      return { ok: true, status: data.status };
    } catch (error) {
      return { ok: false, status: 'error', error: error instanceof Error ? error.message : String(error) };
    }
  }, [editingDecision, editDecisionId]);

  const list = mergedDecisions;
  const projectOptions = [{ value: '', label: '연결 안 함' }, ...(Array.isArray(linkableProjects) ? linkableProjects : []).map(p => ({ value: p.id, label: p.name }))];

  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', maxWidth: 1000, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Decisions</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2, maxWidth: '60ch', lineHeight: 1.5 }}>
            실행의 근거가 되는 결정들의 타임라인. 각 결정에는 맥락·선택·근거를 남깁니다.
            <span className="mono" style={{ marginLeft: 8, color: decisionColor }}>
              {decisionLabel}
            </span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="primary" size="sm" icon="plus" onClick={createDecision}>Record decision <Kbd>N</Kbd></Button>
      </div>
      {!decisionComplete && decisionSyncState !== 'loading' && (
        <Card>
          <EmptyState
            icon="decisions"
            title={decisionSyncState === 'error'
              ? '결정 원장 읽기 실패'
              : decisionSyncState === 'partial'
                ? '결정 원장 부분 데이터'
                : '결정 원장 미연결'}
            description={decisionSyncState === 'error'
              ? decisionsState?.error?.message || '결정 기록을 다시 읽은 뒤 빈 상태를 확인합니다.'
              : decisionSyncState === 'partial'
                ? '읽힌 결정만 표시하며, 기록이 없다고 확정하지 않습니다.'
                : 'Supabase decisions 원장을 연결하면 결정 타임라인이 표시됩니다.'}
            action={(decisionSyncState === 'error' || decisionSyncState === 'partial')
              ? <Button variant="secondary" size="sm" onClick={retry}>다시 읽기</Button>
              : undefined}
          />
        </Card>
      )}
      <div style={{ position: 'relative', paddingLeft: 28 }}>
        <div style={{ position: 'absolute', left: 11, top: 6, bottom: 6, width: 1, background: 'var(--line-soft)' }} />
        {list.length === 0 && decisionComplete && (
          <Card>
            <EmptyState
              icon="decisions"
              title="결정 기록이 없습니다"
              description="Supabase decisions 기록에 아직 기록된 결정이 없습니다."
              action={<Button variant="primary" size="sm" icon="plus" onClick={createDecision}>Record decision</Button>}
            />
          </Card>
        )}
        {list.map(d => (
          <div key={d.id} style={{ position: 'relative', marginBottom: 18 }}>
            {/* §5.2 1px 보더 — 자매 마커(로드맵 노드)와 같은 1px + inset 링 관례. */}
            <div style={{ position: 'absolute', left: -21, top: 14, width: 10, height: 10, borderRadius: 999, background: 'var(--bg)', border: '1px solid var(--moon-400)', boxShadow: 'inset 0 0 0 1px var(--moon-400)' }} />
            <Card
              interactive
              role="button"
              tabIndex={0}
              onClick={() => setEditDecisionId(d.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditDecisionId(d.id); } }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{d.date}</span>
                <CertaintyBadge
                  state={d.status === 'Committed' ? 'confirmed' : 'unknown'}
                  label={d.status === 'Committed' ? '확정' : '미정 · Draft'}
                />
                <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>by {d.by}</span>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 10.5, color: 'var(--fg-faint)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Iconed name="link" size={11} /> {d.links}
                </span>
              </div>
              <div style={{ fontSize: 14.5, fontWeight: 500, marginBottom: 6, letterSpacing: '-0.01em' }}>{d.title}</div>
              <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.55 }}>{d.reason || '근거가 아직 없습니다.'}</div>
            </Card>
          </div>
        ))}
      </div>

      {editingDecision && (
        <EditDrawer
          title={editingDecision.isNew ? '결정 기록하기' : '결정 편집'}
          subtitle={editingDecision.decidedAt ? 'Committed' : 'Draft · 결정일을 정하면 Committed로 바뀝니다'}
          record={editingDecision}
          fields={[
            { key: 'title', label: '제목', placeholder: '어떤 결정인가요?' },
            { key: 'decidedAt', label: '결정일', inputType: 'date', row: 'meta' },
            { key: 'projectId', label: '연결된 프로젝트', type: 'select', row: 'meta', options: projectOptions },
          ]}
          onChange={updateDraft}
          onClose={() => setEditDecisionId(null)}
          onSave={persistDecision}
          // onDelete 없음은 의도: 결정 원장은 append-only 저널이다 — 번복은 지우는 게 아니라
          // 새 결정으로 기록한다 (Rhythm의 deleteRitual과 달리 이력 자체가 가치라서).
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-dim)' }}>근거</span>
            <textarea
              value={editingDecision.rationale || ''}
              onChange={(e) => updateDraft('rationale', e.target.value)}
              placeholder="맥락, 선택지, 근거를 적어주세요."
              rows={5}
              style={{
                width: '100%', resize: 'vertical',
                background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)',
                padding: 10, color: 'var(--fg)', fontSize: 12.5, fontFamily: 'inherit', lineHeight: 1.55,
              }}
            />
          </label>
        </EditDrawer>
      )}
    </div>
  );
}

export function Roadmap() {
  const searchParams = useSearchParams();
  const selectedProjectId = searchParams.get('project');
  const { roadmap, retry } = useWorkLedger(selectedProjectId);
  const roadmapProjection = React.useMemo(
    () => buildRoadmapProjection(roadmap, { selectedProjectId }),
    [roadmap, selectedProjectId],
  );
  const months = React.useMemo(
    () => roadmapProjection.months.map(month => ({ ...month, label: EN_MONTH.format(month.start) })),
    [roadmapProjection.months],
  );
  const items = roadmapProjection.items;
  const statusLabel = roadmap.state === 'loading'
    ? 'syncing'
    : roadmap.state === 'preview'
      ? 'preview'
      : roadmap.state === 'partial'
        ? 'partial'
        : roadmap.state === 'error'
          ? 'error'
          : 'live';
  const statusColor = roadmap.state === 'error'
    ? 'var(--danger)'
    : roadmap.state === 'partial'
      ? 'var(--warning)'
      : roadmap.state === 'live' || roadmap.state === 'live-empty'
      ? 'var(--success)'
        : 'var(--fg-faint)';

  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Roadmap</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
            프로젝트와 마일스톤의 4개월 계획 축
            <span className="mono" style={{ marginLeft: 8, color: statusColor }}>{statusLabel}</span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {selectedProjectId && (
          <a
            href={`/dashboard/work/projects?project=${encodeURIComponent(selectedProjectId)}`}
            style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', color: 'var(--moon-300)', fontSize: 12.5, textUnderlineOffset: 3 }}
          >
            프로젝트로 돌아가기
          </a>
        )}
      </div>

      {roadmap.partial && (
        <div role="status" style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', background: 'var(--surface)' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: 'var(--warning)' }}>
            {roadmap.failedSources.length > 0 && (
              <span>일부 원장을 읽지 못했습니다 · {roadmap.failedSources.join(', ')}</span>
            )}
            {roadmap.truncatedSources.length > 0 && (
              <span>표시 한도를 넘어 일부만 표시합니다 · {roadmap.truncatedSources.join(', ')}</span>
            )}
          </div>
          <Button variant="secondary" size="sm" onClick={retry}>다시 읽기</Button>
        </div>
      )}

      <Card pad={false} className="hub-table-card">
        {roadmap.state === 'loading' && (
          <EmptyState icon="roadmap" title="로드맵을 읽는 중입니다" description="프로젝트와 마일스톤 원장을 확인하고 있습니다." style={{ minHeight: 220 }} />
        )}
        {roadmap.state === 'preview' && (
          <EmptyState icon="roadmap" title="로드맵 원장이 연결되지 않았습니다" description="Supabase 연결 후 실제 프로젝트 일정만 표시됩니다." style={{ minHeight: 220 }} />
        )}
        {roadmap.state === 'error' && (
          <EmptyState
            icon="roadmap"
            title="로드맵을 읽지 못했습니다"
            description={roadmap.error?.message || '프로젝트와 마일스톤 원장을 다시 확인해 주세요.'}
            action={<Button variant="secondary" size="sm" onClick={retry}>다시 읽기</Button>}
            style={{ minHeight: 220 }}
          />
        )}
        {roadmap.state === 'live-empty' && (
          <EmptyState icon="roadmap" title="로드맵 일정이 없습니다" description="기한이 있는 프로젝트나 목표일이 있는 마일스톤을 만들면 4개월 축에 표시됩니다." style={{ minHeight: 220 }} />
        )}
        {(roadmap.state === 'live' || roadmap.state === 'partial') && items.length === 0 && (
          <EmptyState
            icon="roadmap"
            title={selectedProjectId ? '선택한 프로젝트의 4개월 일정이 없습니다' : '4개월 안에 표시할 일정이 없습니다'}
            description="프로젝트 시작일·마감일 또는 마일스톤 목표일을 확인해 주세요."
            style={{ minHeight: 220 }}
          />
        )}
        {(roadmap.state === 'live' || roadmap.state === 'partial') && items.length > 0 && (
          <div className="hub-scroll-x" style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 760 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', borderBottom: '1px solid var(--line-soft)' }}>
                <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>프로젝트 · 마일스톤</div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${months.length}, 1fr)` }}>
                  {months.map(month => (
                    <div key={month.key} style={{ padding: '10px 14px', fontSize: 11, color: 'var(--fg-faint)', borderLeft: '1px solid var(--line-soft)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{month.label}</div>
                  ))}
                </div>
              </div>
              {items.map((item, index) => (
                <div
                  key={item.id}
                  data-kind={item.kind}
                  data-selected={selectedProjectId === item.projectId ? 'true' : 'false'}
                  style={{
                    display: 'grid', gridTemplateColumns: '240px 1fr', alignItems: 'center',
                    borderBottom: index < items.length - 1 ? '1px solid var(--line-soft)' : 'none',
                    background: selectedProjectId === item.projectId ? 'var(--surface-2)' : 'transparent',
                  }}
                >
                  <a
                    href={`/dashboard/work/projects?project=${encodeURIComponent(item.projectId)}`}
                    aria-current={selectedProjectId === item.projectId ? 'page' : undefined}
                    aria-label={buildRoadmapItemAriaLabel(item)}
                    style={{ minHeight: 52, padding: '8px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'center', color: 'inherit', textDecoration: 'none' }}
                  >
                    <span style={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                    <span style={{ marginTop: 3, fontSize: 10.5, color: 'var(--fg-faint)' }}>{item.meta}</span>
                  </a>
                  <div style={{ position: 'relative', minHeight: 52, display: 'grid', gridTemplateColumns: `repeat(${months.length}, 1fr)` }}>
                    {months.map(month => <div key={month.key} style={{ borderLeft: '1px solid var(--line-soft)' }} />)}
                    {item.kind === 'range' ? (
                      <span aria-hidden="true" style={{ position: 'absolute', top: 17, left: `${item.startPct}%`, width: `${item.widthPct}%`, height: 18, borderRadius: 999, background: 'var(--surface-3)', border: '1px solid var(--line)', boxShadow: 'inset 1px 0 0 var(--moon-300)' }} />
                    ) : (
                      <span aria-hidden="true" style={{ position: 'absolute', top: 17, left: `${item.markerPct}%`, width: 16, height: 16, borderRadius: item.kind === 'milestone' ? 3 : 999, background: 'var(--surface-3)', border: '1px solid var(--moon-300)', boxShadow: 'inset 0 0 0 3px var(--surface-3), inset 0 0 0 8px var(--moon-300)', transform: item.kind === 'milestone' ? 'translateX(-50%) rotate(45deg)' : 'translateX(-50%)' }} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

export function Rhythm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const selectedProjectId = searchParams.get('project')?.trim() || null;
  const {
    rituals: liveRituals,
    rhythmState,
    rhythmPartial,
    rhythmTruncatedSources,
    rhythmError,
    projects: linkableProjects,
    retry,
  } = useWorkLedger(selectedProjectId);
  const [mutationState, setMutationState] = React.useState(() => createRhythmCheckState());
  const attemptSequenceRef = React.useRef(0);
  const latestAttemptRef = React.useRef(new Map());
  const rituals = React.useMemo(
    () => filterRhythmRows(liveRituals, selectedProjectId),
    [liveRituals, selectedProjectId],
  );

  // 루틴 생성·수정. 스키마에 별도 rituals 테이블이 없어(work-ledger.js WHY 주석), 생성은
  // status:'pending' 씨앗 행을 심는 것이고, 수정은 같은 (project_id, ritual_key) 그룹의
  // 모든 행을 배치로 patch하는 것이다 — 둘 다 /api/routine이 처리한다(체크인 이벤트는
  // 계속 /api/routine/check).
  const [localRituals, setLocalRituals] = React.useState([]);
  const [ritualEdits, setRitualEdits] = React.useState({});
  const [editRitualId, setEditRitualId] = React.useState(null);
  const createdRitualFromQueryRef = React.useRef(false);
  // 삭제된 (projectId, ritualKey) tombstone — revenue.jsx의 deleteLead와 동일한 낙관적
  // 삭제 패턴: 클릭 즉시 목록에서 숨기고, 실패하면 tombstone을 지워 되돌린다.
  const [deletedRitualIdentities, setDeletedRitualIdentities] = React.useState(() => new Set());

  // 라이브 목록에 같은 (projectId, ritualKey)가 이미 나타나면 로컬 초안을 숨긴다 —
  // retry() 이후 자동으로 실제 행으로 대체되어, 수동으로 정리할 필요가 없다. dedup은
  // overlay(ritualEdits)가 적용된 값으로 비교해야 한다 — 원본 localRituals는 저장 시점에
  // ritualKey만 채워지고 projectId/checkType 등은 계속 overlay에만 있으므로, overlay 없이
  // 비교하면 정체성이 어긋나 라이브 행과 중복 표시된다.
  const liveRitualIdentities = React.useMemo(
    () => new Set(rituals.map((r) => `${r.projectId || ''}::${r.ritualKey}`)),
    [rituals],
  );
  const overlaidLocalRituals = localRituals.map((r) => (ritualEdits[r.id] ? { ...r, ...ritualEdits[r.id] } : r));
  const visibleLocalRituals = overlaidLocalRituals.filter(
    (r) => !r.ritualKey || !liveRitualIdentities.has(`${r.projectId || ''}::${r.ritualKey}`),
  );
  // baseRituals는 원본(overlay 미적용) — persistRitual/deleteRitual이 "원래 값"을 찾을 때만 쓴다.
  const baseRituals = [...localRituals, ...rituals];
  const mergedRituals = [...visibleLocalRituals, ...rituals.map((r) => (ritualEdits[r.id] ? { ...r, ...ritualEdits[r.id] } : r))]
    .filter((r) => !deletedRitualIdentities.has(`${r.projectId || ''}::${r.ritualKey}`));
  const editingRitual = editRitualId ? mergedRituals.find((r) => r.id === editRitualId) : null;
  const projectOptions = [
    { value: '', label: '연결 안 함' },
    ...(Array.isArray(linkableProjects) ? linkableProjects : []).map((p) => ({ value: p.id, label: p.name })),
  ];
  const checkTypeOptions = [
    { value: 'morning', label: '아침' },
    { value: 'midday', label: '낮' },
    { value: 'evening', label: '저녁' },
    { value: 'weekly', label: '주간' },
  ];

  const createRitual = React.useCallback(() => {
    const draft = buildRhythmDraft(selectedProjectId);
    setLocalRituals((prev) => [draft, ...prev]);
    setEditRitualId(draft.id);
  }, [selectedProjectId]);

  React.useEffect(() => {
    if (searchParams.get('new') !== 'rhythm' || createdRitualFromQueryRef.current) return;
    createRitual();
    createdRitualFromQueryRef.current = true;
    router.replace(pathname);
  }, [createRitual, searchParams, router, pathname]);

  // 페이지 레벨 `n` — 드로어가 닫혀 있고 포커스가 입력 필드 밖일 때만 새 루틴을 만든다
  // (DESIGN.md §8.1).
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.key !== 'n' && e.key !== 'N') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (editRitualId) return;
      const t = e.target;
      const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
      e.preventDefault();
      createRitual();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editRitualId, createRitual]);

  const updateRitualDraft = (key, value) => {
    setRitualEdits((prev) => ({ ...prev, [editRitualId]: { ...prev[editRitualId], [key]: value } }));
  };

  // 새 루틴: /api/routine에 status:'pending' 씨앗 행 생성 → retry()로 원장을 다시 읽어
  // mapRituals가 이 행을 리추얼로 집계하게 한다.
  // 기존 루틴 수정: 원래(overlay 적용 전) 값과 비교해 바뀐 필드만 /api/routine PATCH로
  // 보낸다 — 서버가 같은 ritualKey·matchProjectId를 가진 모든 행을 배치로 patch한다.
  const persistRitual = React.useCallback(async () => {
    if (!editingRitual?.name?.trim()) return { ok: false, status: 'invalid-input' };
    try {
      if (editingRitual.isNew) {
        const payload = buildRhythmDefinePayload(editingRitual);
        setLocalRituals((prev) => prev.map((r) => (r.id === editingRitual.id ? { ...r, ritualKey: payload.ritualKey } : r)));
        const response = await fetch('/api/routine', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...payload, source: 'hub-work' }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.status !== 'saved') {
          return { ok: false, status: data.status || 'error' };
        }
        await retry();
        // 라이브 원장이 이 루틴을 반영했으니 로컬 초안은 완전히 제거한다. render-time
        // dedup(identity 비교)만으로는 불충분하다 — 이후 이 루틴을 다시 편집해 연결
        // 프로젝트(=grouping key)가 바뀌면, identity가 더 이상 일치하지 않아 낡은 초안이
        // "안 보이는 상태"에서 벗어나 유령처럼 재등장한다.
        setLocalRituals((prev) => prev.filter((r) => r.id !== editingRitual.id));
        setRitualEdits((prev) => {
          if (!prev[editingRitual.id]) return prev;
          const next = { ...prev };
          delete next[editingRitual.id];
          return next;
        });
        return { ok: true, status: data.status };
      }

      const original = baseRituals.find((r) => r.id === editRitualId);
      const payload = buildRhythmEditPayload(original, editingRitual);
      const response = await fetch('/api/routine', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, source: 'hub-work' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.status !== 'saved') {
        return { ok: false, status: data.status || 'error' };
      }
      await retry();
      return { ok: true, status: data.status };
    } catch (error) {
      return { ok: false, status: 'error', error: error instanceof Error ? error.message : String(error) };
    }
  }, [editingRitual, editRitualId, baseRituals, retry]);

  // 삭제 = 그 루틴의 정의(씨앗) 행 + 모든 체크인 이력을 함께 지운다. EditDrawer가 삭제
  // 전에 window.confirm으로 확인을 받으므로 여기서 다시 묻지 않는다. 로컬(아직 저장 안 된)
  // 초안은 API 호출 없이 그냥 상태에서 제거한다.
  const deleteRitual = React.useCallback(async () => {
    if (!editingRitual) return;
    if (editingRitual.isNew) {
      setLocalRituals((prev) => prev.filter((r) => r.id !== editingRitual.id));
      setRitualEdits((prev) => {
        if (!prev[editingRitual.id]) return prev;
        const next = { ...prev };
        delete next[editingRitual.id];
        return next;
      });
      return;
    }

    const original = baseRituals.find((r) => r.id === editRitualId) || editingRitual;
    const identity = `${original.projectId || ''}::${original.ritualKey}`;
    setDeletedRitualIdentities((prev) => new Set(prev).add(identity));

    try {
      const payload = buildRhythmDeletePayload(original);
      const response = await fetch('/api/routine', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, source: 'hub-work' }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.status === 'saved') {
        await retry();
        return;
      }
      // 삭제 실패 — tombstone을 지워 되돌린다(행이 다시 보인다).
      setDeletedRitualIdentities((prev) => {
        const next = new Set(prev);
        next.delete(identity);
        return next;
      });
    } catch {
      setDeletedRitualIdentities((prev) => {
        const next = new Set(prev);
        next.delete(identity);
        return next;
      });
    }
  }, [editingRitual, editRitualId, baseRituals, retry]);

  const summary = React.useMemo(() => summarizeRhythmRows(rituals), [rituals]);

  React.useEffect(() => {
    latestAttemptRef.current.clear();
    setMutationState(createRhythmCheckState());
  }, [selectedProjectId]);

  const completed = summary.ritualsCompletedThisWeek;
  const total = summary.ritualsTotalThisWeek;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const rhythmProgressProps = getRhythmProgressProps({
    partial: rhythmPartial,
    completed,
    total,
  });
  const longestStreak = summary.longestStreak;
  const longestStreakRitual = summary.longestStreakRitual;
  const selectedProjectName = rituals.find((ritual) => ritual.projectName)?.projectName || '';
  const syncLabel = rhythmState === 'live' || rhythmState === 'live-empty'
    ? 'live'
    : rhythmState === 'partial'
      ? 'partial · observed'
    : rhythmState === 'loading'
      ? 'syncing'
      : rhythmState === 'error'
        ? 'error'
        : 'preview · unsaved';
  const syncColor = rhythmState === 'live' || rhythmState === 'live-empty'
    ? 'var(--moon-300)'
    : rhythmState === 'partial'
      ? 'var(--warning)'
    : rhythmState === 'loading'
      ? 'var(--warning)'
      : rhythmState === 'error'
        ? 'var(--danger)'
        : 'var(--fg-faint)';

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
      let result = resolveRhythmCheckResult({
        responseOk: response.ok,
        httpStatus: response.status,
        data,
      });

      if (latestAttemptRef.current.get(ritualId) !== attemptId) return;
      if (result.shouldRefetch) {
        const refreshed = await retry();
        if (latestAttemptRef.current.get(ritualId) !== attemptId) return;
        if (!refreshed) {
          result = {
            ...result,
            message: `${result.message} 저장은 확인됐지만 주간 현황을 다시 읽지 못했습니다. 다시 읽어 주세요.`,
          };
        }
      }

      setMutationState((state) => finishRhythmCheck(
        state,
        ritualId,
        attemptId,
        result,
      ));
    } catch (error) {
      if (latestAttemptRef.current.get(ritualId) !== attemptId) return;
      const result = resolveRhythmCheckResult({ error });
      setMutationState((state) => finishRhythmCheck(
        state,
        ritualId,
        attemptId,
        result,
      ));
    }
  }, [retry]);

  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Rhythm</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
            루틴은 실행의 인프라
            <span className="mono" style={{ marginLeft: 8, color: syncColor }}>
              {syncLabel}
            </span>
          </div>
          {selectedProjectId && (
            <a
              href={`/dashboard/work/projects?project=${encodeURIComponent(selectedProjectId)}`}
              style={{ minHeight: 44, marginTop: 6, display: 'inline-flex', alignItems: 'center', color: 'var(--moon-300)', fontSize: 12.5, textUnderlineOffset: 3 }}
            >
              프로젝트로 돌아가기{selectedProjectName ? ` · ${selectedProjectName}` : ''}
            </a>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="primary" size="sm" icon="plus" onClick={createRitual}>새 루틴 <Kbd>N</Kbd></Button>
      </div>

      {rhythmState === 'error' && (
        <div role="alert" style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', background: 'var(--surface)' }}>
          <span style={{ flex: 1, fontSize: 12, color: 'var(--danger)' }}>{rhythmError || '리듬 원장을 읽지 못했습니다. 체크인 상태를 확인하려면 다시 읽어 주세요.'}</span>
          <Button variant="secondary" size="sm" onClick={retry}>다시 읽기</Button>
        </div>
      )}

      {rhythmState === 'partial' && (
        <div role="alert" style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', background: 'var(--surface)' }}>
          <span style={{ flex: 1, fontSize: 12, color: 'var(--warning)' }}>
            일부 기록만 표시합니다. {rhythmTruncatedSources.includes('routine_checks') ? 'routine_checks가 조회 한도를 초과해 최근 240건을 관측했습니다.' : '리듬 원장의 일부만 관측했습니다.'}
          </span>
          <Button variant="secondary" size="sm" onClick={retry}>다시 읽기</Button>
        </div>
      )}

      <div className="hub-grid--two" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--gap)' }}>
        <Card>
          <div style={{ fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>This week</div>
          <div style={{ fontSize: 30, fontWeight: 500, marginTop: 10 }} className="stat">{completed} / {total}</div>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>{rhythmPartial ? '관측된 완료 · 일부 기록' : 'rituals completed'}</div>
          {rhythmPartial ? (
            <div {...rhythmProgressProps} style={{ marginTop: 14, fontSize: 11, color: 'var(--fg-faint)' }}>
              관측 {completed} / {total} · 일부 기록
            </div>
          ) : (
            <div {...rhythmProgressProps} style={{ marginTop: 14 }}><Progress value={percent} /></div>
          )}
        </Card>
        <Card>
          <div style={{ fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Longest streak</div>
          <div style={{ fontSize: 30, fontWeight: 500, marginTop: 10 }} className="stat">{longestStreak} <span style={{ fontSize: 14, color: 'var(--fg-faint)' }}>days</span></div>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>{longestStreakRitual || '루틴 체크인 기록 없음'}{rhythmPartial ? ' · 관측값' : ''}</div>
        </Card>
      </div>

      <Card pad={false} className="hub-table-card">
        {mergedRituals.length === 0 && (
          <EmptyState
            icon="rhythm"
            title={selectedProjectId ? '선택한 프로젝트의 리듬이 없습니다' : '루틴 체크 기록이 없습니다'}
            description={rhythmState === 'live-empty' ? 'Supabase routine_checks 기록이 비어 있습니다.' : rhythmState === 'error' ? '원장을 다시 읽은 뒤 체크인 상태를 확인해 주세요.' : rhythmState === 'partial' ? '일부 기록만 관측되어 전체 리듬 상태를 확정할 수 없습니다.' : '루틴을 만들면 매일 체크인할 항목이 여기에 표시됩니다.'}
            action={rhythmState === 'error' || rhythmState === 'partial'
              ? <Button variant="secondary" size="sm" onClick={retry}>다시 읽기</Button>
              : <Button variant="primary" size="sm" icon="plus" onClick={createRitual}>새 루틴</Button>}
            style={{ minHeight: 220 }}
          />
        )}
        {mergedRituals.length > 0 && (
          <div className="hub-rhythm-scroll" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <div style={{ minWidth: 720 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)', fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) 180px 90px 128px' }}>
                <span>Ritual</span><span>Last 7 days</span><span>Streak</span><span style={{ textAlign: 'right' }}>Action</span>
              </div>
              {mergedRituals.map((r, i) => {
                const weeks = Array.isArray(r.weeks) ? r.weeks : [0,0,0,0,0,0,0];
                const pending = Boolean(mutationState.pendingByRitual[r.id]);
                const feedback = mutationState.feedbackByRitual[r.id];
                const bitmapText = weeks.map((value, index) => `${index === 6 ? '오늘' : `${6 - index}일 전`} ${value ? '완료' : '미완료'}`).join(', ');
                return (
                  <div
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setEditRitualId(r.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditRitualId(r.id); } }}
                    className="hub-row"
                    style={{ padding: '12px 16px', minHeight: 68, borderBottom: i < mergedRituals.length - 1 ? '1px solid var(--line-soft)' : 'none', display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) 180px 90px 128px', alignItems: 'center', cursor: 'pointer' }}
                  >
                    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontSize: 13 }}>{r.name}</span>
                      <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{r.checkType} · {r.ritualKey}</span>
                      {r.projectHref && (
                        <a href={r.projectHref} onClick={(e) => e.stopPropagation()} style={{ width: 'fit-content', color: 'var(--moon-300)', fontSize: 11.5, textUnderlineOffset: 3 }}>{r.projectName || '연결 프로젝트'}</a>
                      )}
                      {feedback && (
                        <span aria-live="polite" style={{ fontSize: 11, color: feedback.kind === 'error' ? 'var(--danger)' : feedback.kind === 'preview' ? 'var(--warning)' : 'var(--fg-muted)' }}>
                          {feedback.message}
                        </span>
                      )}
                    </div>
                    <div role="img" aria-label={`최근 7일 체크 기록: ${bitmapText}`} style={{ display: 'flex', gap: 4 }}>
                      {weeks.map((value, index) => (
                        <span key={index} aria-hidden="true" style={{
                          width: 18, height: 18, borderRadius: 4,
                          background: value ? 'var(--moon-500)' : 'var(--surface-3)',
                          border: '1px solid var(--line-soft)',
                        }} />
                      ))}
                    </div>
                    <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{r.streak || 0}d</span>
                    <div style={{ textAlign: 'right' }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={pending}
                        aria-label={`${r.projectName ? `${r.projectName} · ` : ''}${r.name} 체크인 저장`}
                        style={{ minHeight: 44 }}
                        onClick={(e) => { e.stopPropagation(); checkIn(r); }}
                      >
                        {pending ? '저장 중…' : '체크인 저장'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {editingRitual && (
        <EditDrawer
          title={editingRitual.isNew ? '새 루틴 만들기' : '루틴 편집'}
          subtitle={editingRitual.isNew ? undefined : `${editingRitual.streak || 0}일 연속 · 이번 주 ${(editingRitual.weeks || []).filter(Boolean).length}/7`}
          record={editingRitual}
          fields={[
            { key: 'name', label: '이름', placeholder: '예: 아침 스트레칭' },
            { key: 'checkType', label: '체크 타입', type: 'select', row: 'meta', options: checkTypeOptions },
            { key: 'projectId', label: '연결 프로젝트', type: 'select', row: 'meta', options: projectOptions },
          ]}
          onChange={updateRitualDraft}
          onClose={() => setEditRitualId(null)}
          onSave={persistRitual}
          onDelete={deleteRitual}
        />
      )}
    </div>
  );
}
