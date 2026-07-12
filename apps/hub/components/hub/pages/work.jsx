"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Iconed } from "../hub-icons";
import { Badge, Card, IconButton, Button, Progress, EmptyState } from "../hub-primitives";
import { DECISIONS as FALLBACK_DECISIONS, RITUALS as FALLBACK_RITUALS } from "../hub-data";

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

function buildRoadmapMonths(now) {
  return Array.from({ length: 4 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return EN_MONTH.format(d);
  });
}

function formatHour(value) {
  const hour = Math.floor(value);
  const minutes = Math.round((value - hour) * 60);
  return `${hour}:${String(minutes).padStart(2, '0')}`;
}

function useWorkLedger() {
  const [state, setState] = React.useState({
    source: 'mock',
    decisions: FALLBACK_DECISIONS,
    rituals: FALLBACK_RITUALS,
    summary: null,
    syncState: 'mock',
  });

  React.useEffect(() => {
    let active = true;

    async function load() {
      setState((prev) => ({ ...prev, syncState: 'loading' }));
      try {
        const response = await fetch('/api/hub/work', { cache: 'no-store' });
        const data = await response.json().catch(() => null);

        if (!active || !response.ok || !data || data.status === 'error') {
          if (active) setState((prev) => ({ ...prev, syncState: 'mock' }));
          return;
        }

        if (data.source === 'supabase') {
          setState({
            source: data.source,
            decisions: Array.isArray(data.decisions) ? data.decisions : [],
            rituals: Array.isArray(data.rituals) ? data.rituals : [],
            summary: data.summary || null,
            syncState: 'live',
          });
        } else {
          setState((prev) => ({ ...prev, syncState: 'mock' }));
        }
      } catch {
        if (active) setState((prev) => ({ ...prev, syncState: 'mock' }));
      }
    }

    load();
    return () => { active = false; };
  }, []);

  return state;
}

const FALLBACK_CALENDAR_EVENTS = [
  { day: 0, start: 10, end: 11, title: 'Weekly kickoff', tone: 'moon' },
  { day: 0, start: 14, end: 16, title: 'Moonlight Web v2 — deep work', tone: 'moon' },
  { day: 1, start: 9, end: 10, title: '뉴스레터 outline', tone: 'moon' },
  { day: 1, start: 15, end: 16.5, title: '클래스인 2차 미팅', tone: 'company' },
  { day: 2, start: 11, end: 12, title: 'Council sync', tone: 'info' },
  { day: 2, start: 16, end: 17, title: '자문 — 정하윤', tone: 'personal' },
  { day: 3, start: 10, end: 11.5, title: 'Pricing workshop', tone: 'moon' },
  { day: 4, start: 10, end: 11, title: '클래스인 Discovery', tone: 'company' },
  { day: 4, start: 16, end: 17, title: '코칭 — Jihoon', tone: 'personal' },
  { day: 4, start: 11.5, end: 13, title: '뉴스레터 마감', tone: 'warning' },
];

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
  const [state, setState] = React.useState({ status: 'loading', events: [] });
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
        setState({ status: d?.status || 'preview', events: Array.isArray(d?.events) ? d.events : [] });
      })
      .catch(() => active && setState({ status: 'error', events: [] }));

    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekKey, refreshToken]);

  const refetch = React.useCallback(() => setRefreshToken((v) => v + 1), []);
  return { ...state, refetch };
}

export function Calendar() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [now, setNow] = React.useState(() => new Date());
  const [weekOffset, setWeekOffset] = React.useState(0);
  const [viewMode, setViewMode] = React.useState('Week');
  const [gcalStatus, setGcalStatus] = React.useState('idle');
  const [gcalMessage, setGcalMessage] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const focusAppliedRef = React.useRef(false);
  const [localEvents, setLocalEvents] = React.useState(FALLBACK_CALENDAR_EVENTS);
  const viewedDateForFetch = addDays(now, weekOffset * 7);
  const { days: fetchDays } = buildCalendarWeek(viewedDateForFetch);
  const calendarData = useCalendarEvents(fetchDays);
  const isLive = calendarData.status === 'live';

  // Creates a real Google Calendar event when connected; otherwise falls back to a
  // local-only demo row so the grid still shows something without pretending it's saved.
  const createEvent = React.useCallback(async ({ day, startHour, endHour, title }) => {
    const targetDay = fetchDays[day] || fetchDays[0];
    if (!isLive) {
      setLocalEvents((prev) => [...prev, { day, start: startHour, end: endHour, title, tone: 'moon' }]);
      return;
    }
    const startAt = new Date(targetDay); startAt.setHours(Math.floor(startHour), (startHour % 1) * 60, 0, 0);
    const endAt = new Date(targetDay); endAt.setHours(Math.floor(endHour), (endHour % 1) * 60, 0, 0);
    setCreating(true);
    try {
      const res = await fetch('/api/calendar/google/event', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, startAt: startAt.toISOString(), endAt: endAt.toISOString() }),
      });
      const data = await res.json().catch(() => null);
      if (data?.status === 'saved' || data?.status === 'updated') {
        calendarData.refetch();
      }
    } finally {
      setCreating(false);
    }
  }, [fetchDays, isLive, calendarData]);

  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    const minutes = Number(searchParams.get('focus'));
    if (!minutes || focusAppliedRef.current) return;
    const week = buildCalendarWeek(now);
    setWeekOffset(0);
    focusAppliedRef.current = true;
    createEvent({
      day: week.todayIndex >= 0 ? week.todayIndex : 0,
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

  const gcalLabel = gcalStatus === 'connected'
    ? '● Google Calendar synced 2m ago'
    : gcalStatus === 'connecting'
    ? '● Connecting…'
    : gcalStatus === 'preview'
    ? '● Preview only (env missing)'
    : gcalStatus === 'error'
    ? '● Connect failed'
    : '● Not connected';
  const gcalColor = gcalStatus === 'connected'
    ? 'var(--success)'
    : gcalStatus === 'preview'
    ? 'var(--warning)'
    : gcalStatus === 'error'
    ? 'var(--danger)'
    : 'var(--fg-faint)';

  const hours = Array.from({ length: 12 }, (_, i) => 8 + i);
  const { labels: dayLabels, weekLabel, todayIndex } = buildCalendarWeek(viewedDateForFetch);
  const gridEvents = isLive ? mapGoogleEventsToGrid(calendarData.events, fetchDays) : localEvents;
  const calBadge = calendarData.status === 'live'
    ? { label: 'live', color: 'var(--success)' }
    : calendarData.status === 'loading'
    ? { label: 'syncing', color: 'var(--warning)' }
    : { label: 'mock', color: 'var(--fg-faint)' };
  const addEvent = () => {
    createEvent({
      day: todayIndex >= 0 ? todayIndex : 0,
      startHour: 13,
      endHour: 14,
      title: '새 일정',
    });
  };
  const toneBg = { moon: 'oklch(0.35 0.008 250 / 0.9)', company: 'var(--company-bg)', personal: 'var(--personal-bg)', info: 'var(--info-bg)', warning: 'var(--warning-bg)' };
  const toneFg = { moon: 'var(--moon-100)', company: 'var(--company)', personal: 'var(--personal)', info: 'var(--info)', warning: 'var(--warning)' };
  const toneBd = { moon: 'var(--moon-600)', company: 'oklch(0.5 0.04 290 / 0.5)', personal: 'oklch(0.5 0.04 200 / 0.5)', info: 'oklch(0.5 0.06 230 / 0.5)', warning: 'oklch(0.5 0.09 85 / 0.5)' };

  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)', height: '100%' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, letterSpacing: '-0.01em' }}>Calendar</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span>{weekLabel}</span>
            <span style={{ color: 'var(--fg-faint)' }}>·</span>
            <span className="mono" style={{ color: calBadge.color }}>{calBadge.label}</span>
            <span style={{ color: 'var(--fg-faint)' }}>·</span>
            <span style={{ color: gcalColor }}>{gcalLabel}</span>
            <Button variant="ghost" size="xs" onClick={connectGoogleCalendar}>
              {gcalStatus === 'connecting' ? 'Connecting…' : isLive ? 'Reconnect' : 'Connect Google Calendar'}
            </Button>
          </div>
          {gcalMessage && (
            <div className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 4 }}>{gcalMessage}</div>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <div className="hub-toolbar" style={{ display: 'flex', gap: 6 }}>
          <IconButton icon="chevronL" tooltip="Previous week" onClick={() => setWeekOffset(v => v - 1)} />
          <Button variant="secondary" size="sm" onClick={() => setWeekOffset(0)}>Today</Button>
          <IconButton icon="chevronR" tooltip="Next week" onClick={() => setWeekOffset(v => v + 1)} />
        </div>
        <div className="hub-toolbar" style={{ display: 'flex', gap: 2, background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', padding: 2 }}>
          {['Day','Week','Month'].map(v => (
            <button key={v} onClick={() => setViewMode(v)} style={{ padding: '4px 10px', fontSize: 11.5, borderRadius: 4, color: v === viewMode ? 'var(--fg)' : 'var(--fg-faint)', background: v === viewMode ? 'var(--surface-3)' : 'transparent' }}>{v}</button>
          ))}
        </div>
        <Button variant="primary" size="sm" icon="plus" onClick={addEvent} disabled={creating}>Event</Button>
      </div>

      <Card pad={false} className="hub-table-card" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '56px repeat(7, 1fr)', borderBottom: '1px solid var(--line-soft)' }}>
          <div />
          {dayLabels.map((d, i) => (
            <div key={d} style={{ padding: '10px 12px', borderLeft: '1px solid var(--line-soft)', fontSize: 11.5, color: i === todayIndex ? 'var(--fg)' : 'var(--fg-muted)' }}>
              {d}
              {i === todayIndex && <span style={{ marginLeft: 6, color: 'var(--moon-300)' }}>· Today</span>}
            </div>
          ))}
        </div>
        <div className="scroll-y" style={{ flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '56px repeat(7, 1fr)', position: 'relative' }}>
            <div>
              {hours.map(h => (
                <div key={h} className="mono" style={{ height: 52, padding: '4px 10px', fontSize: 10, color: 'var(--fg-faint)', textAlign: 'right' }}>{h}:00</div>
              ))}
            </div>
            {dayLabels.map((_, di) => (
              <div key={di} style={{ borderLeft: '1px solid var(--line-soft)', position: 'relative' }}>
                {hours.map(h => <div key={h} style={{ height: 52, borderBottom: '1px solid var(--line-soft)' }} />)}
                {gridEvents.filter(e => e.day === di).map((e, ei) => {
                  const top = (e.start - 8) * 52;
                  const height = (e.end - e.start) * 52 - 2;
                  return (
                    <div key={ei} style={{
                      position: 'absolute', top, left: 4, right: 4, height,
                      background: toneBg[e.tone], color: toneFg[e.tone],
                      border: `1px solid ${toneBd[e.tone]}`,
                      borderLeft: `2px solid ${toneFg[e.tone]}`,
                      borderRadius: 6, padding: '6px 8px',
                      fontSize: 11, fontWeight: 500, overflow: 'hidden',
                    }}>
                      {e.title}
                      <div className="mono" style={{ fontSize: 9.5, opacity: 0.7, marginTop: 3 }}>{formatHour(e.start)} – {formatHour(e.end)}</div>
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

export function Decisions() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { decisions, syncState } = useWorkLedger();
  const [localDecisions, setLocalDecisions] = React.useState([]);
  const createdFromQueryRef = React.useRef(false);
  const createDecision = React.useCallback(() => {
    const id = `local-decision-${Date.now()}`;
    const createdAt = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' }).format(new Date());
    setLocalDecisions(prev => [{
      id,
      title: '새 결정 기록',
      date: createdAt,
      status: 'Draft',
      by: 'Me',
      reason: '맥락, 선택지, 근거를 이어서 적어주세요.',
      links: 0,
    }, ...prev]);
  }, []);
  React.useEffect(() => {
    if (searchParams.get('new') !== 'decision' || createdFromQueryRef.current) return;
    createDecision();
    createdFromQueryRef.current = true;
    router.replace(pathname);
  }, [createDecision, searchParams, router, pathname]);
  const list = [...localDecisions, ...(Array.isArray(decisions) ? decisions : [])];

  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', maxWidth: 1000, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Decisions</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2, maxWidth: '60ch', lineHeight: 1.5 }}>
            실행의 근거가 되는 결정들의 타임라인. 각 결정에는 맥락·선택·근거를 남깁니다.
            <span className="mono" style={{ marginLeft: 8, color: syncState === 'live' ? 'var(--success)' : syncState === 'loading' ? 'var(--warning)' : 'var(--fg-faint)' }}>
              {syncState === 'live' ? 'live' : syncState === 'loading' ? 'syncing' : 'mock'}
            </span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="primary" size="sm" icon="plus" onClick={createDecision}>Record decision</Button>
      </div>
      <div style={{ position: 'relative', paddingLeft: 28 }}>
        <div style={{ position: 'absolute', left: 11, top: 6, bottom: 6, width: 1, background: 'var(--line-soft)' }} />
        {list.length === 0 && (
          <Card>
            <EmptyState
              icon="decisions"
              title="결정 기록이 없습니다"
              description={syncState === 'live' ? 'Supabase decisions 원장에 아직 기록된 결정이 없습니다.' : '중요한 판단을 남기면 타임라인에 쌓입니다.'}
              action={<Button variant="primary" size="sm" icon="plus" onClick={createDecision}>Record decision</Button>}
            />
          </Card>
        )}
        {list.map(d => (
          <div key={d.id} style={{ position: 'relative', marginBottom: 18 }}>
            <div style={{ position: 'absolute', left: -21, top: 14, width: 10, height: 10, borderRadius: 999, background: 'var(--bg)', border: '2px solid var(--moon-400)' }} />
            <Card>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{d.date}</span>
                <Badge tone={d.status === 'Committed' ? 'success' : 'warning'} size="xs">{d.status}</Badge>
                <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>by {d.by}</span>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 10.5, color: 'var(--fg-faint)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Iconed name="link" size={11} /> {d.links}
                </span>
              </div>
              <div style={{ fontSize: 14.5, fontWeight: 500, marginBottom: 6, letterSpacing: '-0.01em' }}>{d.title}</div>
              <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.55 }}>{d.reason}</div>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Roadmap() {
  const months = React.useMemo(() => buildRoadmapMonths(new Date()), []);
  const [items, setItems] = React.useState(() => [
    { name: 'Moonlight Web v2 launch', start: 0, len: 1, tone: 'moon', tag: null },
    { name: '클래스인 Spring Cohort', start: 0.5, len: 1.2, tone: 'company', tag: 'company' },
    { name: 'Pricing experiment Q2', start: 1, len: 2, tone: 'moon', tag: null },
    { name: 'Newsletter auto v2', start: 0, len: 0.5, tone: 'moon', tag: null },
    { name: '개인 브랜드 사이트', start: 1.2, len: 1.5, tone: 'personal', tag: 'personal' },
    { name: 'Partner referral program', start: 1.5, len: 1.5, tone: 'moon', tag: null },
    { name: 'Agents Orders v3', start: 2, len: 1, tone: 'moon', tag: null },
  ]);
  const draftQ3 = () => {
    setItems(prev => prev.some(it => it.name === 'Council Q3 draft')
      ? prev
      : [...prev, { name: 'Council Q3 draft', start: 3, len: 0.8, tone: 'moon', tag: null }]);
  };
  const toneMap = { moon: 'var(--moon-400)', company: 'var(--company)', personal: 'var(--personal)' };

  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Roadmap</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
            Q2 outlook · 7 initiatives
            <span className="mono" style={{ marginLeft: 8, color: 'var(--fg-faint)' }}>mock</span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" icon="sparkle" onClick={draftQ3}>Let Council draft Q3</Button>
      </div>

      <Card pad={false} className="hub-table-card">
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', borderBottom: '1px solid var(--line-soft)' }}>
          <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Initiative</div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${months.length}, 1fr)` }}>
            {months.map(m => (
              <div key={m} style={{ padding: '10px 14px', fontSize: 11, color: 'var(--fg-faint)', borderLeft: '1px solid var(--line-soft)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{m}</div>
            ))}
          </div>
        </div>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '220px 1fr', borderBottom: i < items.length - 1 ? '1px solid var(--line-soft)' : 'none', alignItems: 'center' }}>
            <div style={{ padding: '14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12.5 }}>{it.name}</span>
              {it.tag === 'personal' && <Badge tone="personal" size="xs">P</Badge>}
              {it.tag === 'company' && <Badge tone="company" size="xs">C</Badge>}
            </div>
            <div style={{ position: 'relative', height: 44, display: 'grid', gridTemplateColumns: `repeat(${months.length}, 1fr)` }}>
              {months.map((_, mi) => <div key={mi} style={{ borderLeft: '1px solid var(--line-soft)' }} />)}
              <div style={{
                position: 'absolute', top: 12, height: 20,
                left: `calc(${(it.start / months.length) * 100}% + 4px)`,
                width: `calc(${(it.len / months.length) * 100}% - 8px)`,
                background: toneMap[it.tone],
                opacity: 0.85,
                borderRadius: 6,
                boxShadow: '0 1px 0 oklch(1 0 0 / 0.1) inset',
              }} />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

export function Rhythm() {
  const { rituals: liveRituals, summary, syncState } = useWorkLedger();
  const [checkedRituals, setCheckedRituals] = React.useState(() => new Set());
  const rituals = Array.isArray(liveRituals) ? liveRituals : [];

  const completed = summary?.ritualsCompletedThisWeek ?? rituals.filter(r => r.weeks?.some(v => v === 1)).length;
  const total = summary?.ritualsTotalThisWeek ?? rituals.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  let longestStreak = summary?.longestStreak ?? 0;
  let longestStreakRitual = summary?.longestStreakRitual ?? '';
  if (!summary) {
    rituals.forEach(r => {
      if ((r.streak || 0) > longestStreak) {
        longestStreak = r.streak;
        longestStreakRitual = r.name;
      }
    });
  }

  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Rhythm</h2>
        <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
          루틴은 실행의 인프라
          <span className="mono" style={{ marginLeft: 8, color: syncState === 'live' ? 'var(--success)' : syncState === 'loading' ? 'var(--warning)' : 'var(--fg-faint)' }}>
            {syncState === 'live' ? 'live' : syncState === 'loading' ? 'syncing' : 'mock'}
          </span>
        </div>
      </div>

      <div className="hub-grid--two" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--gap)' }}>
        <Card>
          <div style={{ fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>This week</div>
          <div style={{ fontSize: 30, fontWeight: 500, marginTop: 10 }} className="stat">{completed} / {total}</div>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>rituals completed</div>
          <div style={{ marginTop: 14 }}><Progress value={percent} /></div>
        </Card>
        <Card>
          <div style={{ fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Longest streak</div>
          <div style={{ fontSize: 30, fontWeight: 500, marginTop: 10 }} className="stat">{longestStreak} <span style={{ fontSize: 14, color: 'var(--fg-faint)' }}>days</span></div>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>{longestStreakRitual || '루틴 체크인 기록 없음'}</div>
        </Card>
      </div>

      <Card pad={false} className="hub-table-card">
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)', fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'grid', gridTemplateColumns: '1fr 160px 90px 100px' }}>
          <span>Ritual</span><span>Last 7 days</span><span>Streak</span><span style={{ textAlign: 'right' }}>Action</span>
        </div>
        {rituals.length === 0 && (
          <EmptyState
            icon="rhythm"
            title="루틴 체크 기록이 없습니다"
            description={syncState === 'live' ? 'Supabase routine_checks 원장이 비어 있습니다.' : '체크인을 기록하면 주간 리듬과 streak가 계산됩니다.'}
            style={{ minHeight: 220 }}
          />
        )}
        {rituals.map((r, i) => {
          const isChecked = checkedRituals.has(r.id || r.name || i);
          const weeks = Array.isArray(r.weeks) ? [...r.weeks] : [0,0,0,0,0,0,0];
          if (isChecked) weeks[weeks.length - 1] = 1;
          return (
            <div key={r.id || r.name || i} style={{ padding: '14px 16px', borderBottom: i < rituals.length - 1 ? '1px solid var(--line-soft)' : 'none', display: 'grid', gridTemplateColumns: '1fr 160px 90px 100px', alignItems: 'center' }}>
              <span style={{ fontSize: 13 }}>{r.name}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {weeks.map((v, j) => (
                  <div key={j} style={{
                    width: 18, height: 18, borderRadius: 4,
                    background: v ? 'var(--moon-500)' : 'var(--surface-3)',
                    border: v ? 'none' : '1px solid var(--line-soft)',
                  }} />
                ))}
              </div>
              <span className="mono" style={{ fontSize: 12, color: (r.streak || 0) > 10 ? 'var(--success)' : 'var(--fg-muted)' }}>{r.streak || 0}d</span>
              <div style={{ textAlign: 'right' }}>
                <Button
                  variant={isChecked ? 'secondary' : 'ghost'}
                  size="xs"
                  onClick={() => {
                    const key = r.id || r.name || i;
                    setCheckedRituals(prev => {
                      const next = new Set(prev);
                      next.has(key) ? next.delete(key) : next.add(key);
                      return next;
                    });
                  }}
                >
                  {isChecked ? 'Checked' : 'Check in'}
                </Button>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
