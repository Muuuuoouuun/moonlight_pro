"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Iconed } from "../hub-icons";
import { Badge, Card, IconButton, Button, Progress, EmptyState } from "../hub-primitives";

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

function useWorkLedger() {
  const [state, setState] = React.useState({
    source: null,
    decisions: [],
    rituals: [],
    summary: null,
    syncState: 'loading',
    error: null,
  });
  const [refreshToken, setRefreshToken] = React.useState(0);

  React.useEffect(() => {
    let active = true;

    async function load() {
      setState({ source: null, decisions: [], rituals: [], summary: null, syncState: 'loading', error: null });
      try {
        const response = await fetch('/api/hub/work', { cache: 'no-store' });
        const data = await response.json().catch(() => null);

        if (!active) return;
        if (!response.ok || !data || data.status === 'error') {
          setState({
            source: null,
            decisions: [],
            rituals: [],
            summary: null,
            syncState: 'error',
            error: data?.error || data?.message || `업무 원장 요청 실패 (${response.status})`,
          });
          return;
        }

        if (data.source === 'supabase') {
          setState({
            source: data.source,
            decisions: Array.isArray(data.decisions) ? data.decisions : [],
            rituals: Array.isArray(data.rituals) ? data.rituals : [],
            summary: data.summary || null,
            syncState: 'live',
            error: null,
          });
        } else {
          setState({
            source: data.source || null,
            decisions: [],
            rituals: [],
            summary: null,
            syncState: 'preview',
            error: null,
          });
        }
      } catch (error) {
        if (active) setState({
          source: null,
          decisions: [],
          rituals: [],
          summary: null,
          syncState: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    load();
    return () => { active = false; };
  }, [refreshToken]);

  const refetch = React.useCallback(() => setRefreshToken((value) => value + 1), []);
  return { ...state, refetch };
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
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.message || data?.error || `Calendar request failed (${response.status})`);
        return data;
      })
      .then((data) => {
        if (!active) return;
        setState({ status: data?.status || 'preview', events: Array.isArray(data?.events) ? data.events : [] });
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
  const oauthPopupRef = React.useRef(null);
  const oauthRefreshRequestedRef = React.useRef(false);
  const viewedDateForFetch = addDays(now, weekOffset * 7);
  const { days: fetchDays } = buildCalendarWeek(viewedDateForFetch);
  const calendarData = useCalendarEvents(fetchDays);
  const refetchCalendar = calendarData.refetch;
  const isLive = calendarData.status === 'live';

  // Create only against the connected Google ledger. A disconnected attempt stays
  // visible as setup guidance and never mutates the calendar grid.
  const createEvent = React.useCallback(async ({ day, startHour, endHour, title }) => {
    if (!isLive) {
      setGcalStatus('preview');
      setGcalMessage('Google Calendar 연결 후 일정을 추가할 수 있습니다.');
      return false;
    }
    const targetDay = fetchDays[day] || fetchDays[0];
    const startAt = new Date(targetDay); startAt.setHours(Math.floor(startHour), (startHour % 1) * 60, 0, 0);
    const endAt = new Date(targetDay); endAt.setHours(Math.floor(endHour), (endHour % 1) * 60, 0, 0);
    setCreating(true);
    setGcalStatus('saving');
    setGcalMessage('Google Calendar에 일정을 저장하고 있습니다.');
    try {
      const res = await fetch('/api/calendar/google/event', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, startAt: startAt.toISOString(), endAt: endAt.toISOString() }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && (data?.status === 'saved' || data?.status === 'updated')) {
        setGcalStatus('connected');
        setGcalMessage('Google Calendar에 저장했습니다.');
        refetchCalendar();
        return true;
      }
      setGcalStatus('error');
      setGcalMessage(data?.message || data?.error || data?.reason || `일정 저장 실패 (${res.status})`);
      return false;
    } catch (error) {
      setGcalStatus('error');
      setGcalMessage(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setCreating(false);
    }
  }, [fetchDays, isLive, refetchCalendar]);

  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    const minutes = Number(searchParams.get('focus'));
    if (!minutes || focusAppliedRef.current || calendarData.status !== 'live') return;
    const week = buildCalendarWeek(now);
    setWeekOffset(0);
    focusAppliedRef.current = true;
    void createEvent({
      day: week.todayIndex >= 0 ? week.todayIndex : 0,
      startHour: 13,
      endHour: 13 + Math.max(15, minutes) / 60,
      title: `${minutes}m focus block`,
    }).then((saved) => {
      if (saved) router.replace(pathname);
    });
  }, [calendarData.status, createEvent, now, pathname, router, searchParams]);

  const refreshAfterOAuth = React.useCallback(() => {
    if (!oauthPopupRef.current || oauthRefreshRequestedRef.current) return;
    oauthRefreshRequestedRef.current = true;
    oauthPopupRef.current = null;
    setGcalStatus('idle');
    setGcalMessage('Google Calendar 연결 상태를 다시 확인하고 있습니다.');
    refetchCalendar();
  }, [refetchCalendar]);

  React.useEffect(() => {
    if (gcalStatus !== 'connecting') return undefined;

    const onFocus = () => refreshAfterOAuth();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshAfterOAuth();
    };
    const popupCloseTimer = window.setInterval(() => {
      if (oauthPopupRef.current?.closed) refreshAfterOAuth();
    }, 750);

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(popupCloseTimer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [gcalStatus, refreshAfterOAuth]);

  const openOAuthPopup = React.useCallback((url) => {
    const popup = window.open(url, '_blank');
    if (!popup) {
      setGcalStatus('error');
      setGcalMessage('Google OAuth 팝업을 열지 못했습니다. 브라우저 팝업 허용 설정을 확인해 주세요.');
      return false;
    }
    oauthPopupRef.current = popup;
    oauthRefreshRequestedRef.current = false;
    setGcalStatus('connecting');
    setGcalMessage('Google OAuth 창을 열었습니다. 완료 후 이 창으로 돌아오세요.');
    return true;
  }, []);

  async function connectGoogleCalendar() {
    setGcalStatus('connecting');
    setGcalMessage('');
    try {
      const response = await fetch('/api/calendar/google/connect', { redirect: 'manual' });
      let data = null;
      try { data = await response.clone().json(); } catch { data = null; }

      if (data && data.url) {
        openOAuthPopup(data.url);
        return;
      }

      if (data && data.preview === true) {
        setGcalStatus('preview');
        setGcalMessage(data.message || 'Google Calendar env 미설정 — preview 모드.');
        return;
      }

      // Fallback: route may redirect (3xx opaque) — treat as OAuth launch
      if (response.type === 'opaqueredirect' || response.redirected || response.status === 0) {
        openOAuthPopup('/api/calendar/google/connect');
        return;
      }

      setGcalStatus('error');
      setGcalMessage(`응답 해석 실패 (status ${response.status}).`);
    } catch (error) {
      setGcalStatus('error');
      setGcalMessage(error instanceof Error ? error.message : String(error));
    }
  }

  const effectiveGcalStatus = ['connecting', 'saving', 'error', 'preview'].includes(gcalStatus)
    ? gcalStatus
    : isLive
    ? 'connected'
    : gcalStatus;
  const gcalLabel = effectiveGcalStatus === 'connected'
    ? '● Google Calendar connected'
    : effectiveGcalStatus === 'connecting'
    ? '● Connecting…'
    : effectiveGcalStatus === 'saving'
    ? '● Saving…'
    : effectiveGcalStatus === 'preview'
    ? '● Connection required'
    : effectiveGcalStatus === 'error'
    ? '● Connect failed'
    : '● Not connected';
  const gcalColor = effectiveGcalStatus === 'connected'
    ? 'var(--success)'
    : effectiveGcalStatus === 'preview' || effectiveGcalStatus === 'saving' || effectiveGcalStatus === 'connecting'
    ? 'var(--warning)'
    : effectiveGcalStatus === 'error'
    ? 'var(--danger)'
    : 'var(--fg-faint)';

  const hours = Array.from({ length: 12 }, (_, i) => 8 + i);
  const { labels: dayLabels, weekLabel, todayIndex } = buildCalendarWeek(viewedDateForFetch);
  const gridEvents = isLive ? mapGoogleEventsToGrid(calendarData.events, fetchDays) : [];
  const calBadge = calendarData.status === 'live'
    ? { label: 'live', color: 'var(--success)' }
    : calendarData.status === 'loading'
    ? { label: 'syncing', color: 'var(--warning)' }
    : calendarData.status === 'error'
    ? { label: 'error', color: 'var(--danger)' }
    : { label: 'setup', color: 'var(--warning)' };
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
            <Button variant="ghost" size="xs" onClick={connectGoogleCalendar} disabled={effectiveGcalStatus === 'connecting' || effectiveGcalStatus === 'saving'}>
              {effectiveGcalStatus === 'connecting' ? 'Connecting…' : effectiveGcalStatus === 'saving' ? 'Saving…' : isLive ? 'Reconnect' : 'Connect Google Calendar'}
            </Button>
          </div>
          {gcalMessage && effectiveGcalStatus === 'error' ? (
            <div role="alert" className="mono" style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>{gcalMessage}</div>
          ) : gcalMessage ? (
            <div role="status" className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 4 }}>{gcalMessage}</div>
          ) : null}
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
        <Button variant="primary" size="sm" icon="plus" onClick={addEvent} disabled={creating || !isLive} title={!isLive ? 'Google Calendar 연결 후 사용할 수 있습니다.' : undefined}>Event</Button>
      </div>

      <Card pad={false} className="hub-table-card" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {calendarData.status === 'loading' ? (
          <EmptyState icon="calendar" title="Google Calendar 확인 중" description="연결 상태와 이번 주 일정을 불러오고 있습니다." />
        ) : calendarData.status === 'error' ? (
          <EmptyState
            icon="signal"
            title="Google Calendar를 불러오지 못했습니다"
            description="실패한 읽기를 샘플 일정으로 대체하지 않았습니다. 연결 상태를 확인해 주세요."
            action={<Button variant="outline" size="sm" onClick={calendarData.refetch}>다시 시도</Button>}
          />
        ) : !isLive ? (
          <EmptyState
            icon="calendar"
            title="Google Calendar 연결 필요"
            description="연결 전에는 일정을 표시하거나 로컬 일정으로 대신 저장하지 않습니다."
            action={<Button variant="primary" size="sm" onClick={connectGoogleCalendar}>Connect Google Calendar</Button>}
          />
        ) : gridEvents.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="이번 주 일정이 없습니다"
            description="Google Calendar는 연결되어 있으며, 이 주간 범위에 표시할 일정이 없습니다."
            action={<Button variant="primary" size="sm" icon="plus" onClick={addEvent} disabled={creating}>Event</Button>}
          />
        ) : (
          <>
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
                    {gridEvents.filter(e => e.day === di).map((e, eventIndex) => {
                      const top = (e.start - 8) * 52;
                      const height = (e.end - e.start) * 52 - 2;
                      return (
                        <div key={e.id || `${di}-${eventIndex}-${e.start}`} style={{
                          position: 'absolute', top, left: 4, right: 4, height,
                          background: toneBg[e.tone], color: toneFg[e.tone],
                          border: `1px solid ${toneBd[e.tone]}`,
                          borderLeft: `2px solid ${toneFg[e.tone]}`,
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
          </>
        )}
      </Card>
    </div>
  );
}

export function Decisions() {
  const { decisions, syncState, error, refetch } = useWorkLedger();
  const list = syncState === 'live' && Array.isArray(decisions) ? decisions : [];
  const statusLabel = syncState === 'live' ? 'live' : syncState === 'loading' ? 'syncing' : syncState;
  const statusColor = syncState === 'live' ? 'var(--success)' : syncState === 'error' ? 'var(--danger)' : 'var(--warning)';

  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', maxWidth: 1000, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Decisions</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2, maxWidth: '60ch', lineHeight: 1.5 }}>
            실행의 근거가 되는 결정들의 타임라인. 각 결정에는 맥락·선택·근거를 남깁니다.
            <span className="mono" style={{ marginLeft: 8, color: statusColor }}>
              {statusLabel}
            </span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" icon="plus" disabled title="결정 쓰기 API가 연결되지 않았습니다.">쓰기 연결 대기</Button>
      </div>
      <div style={{ position: 'relative', paddingLeft: 28 }}>
        <div style={{ position: 'absolute', left: 11, top: 6, bottom: 6, width: 1, background: 'var(--line-soft)' }} />
        {list.length === 0 && (
          <Card>
            <EmptyState
              icon={syncState === 'error' ? 'signal' : 'decisions'}
              title={syncState === 'loading' ? '결정 원장 확인 중' : syncState === 'error' ? '결정 원장을 불러오지 못했습니다' : syncState === 'preview' ? '결정 원장 연결 필요' : '결정 기록이 없습니다'}
              description={syncState === 'loading' ? '실제 결정 기록을 확인하고 있습니다.' : syncState === 'error' ? error || '실패한 읽기를 샘플 결정으로 대체하지 않았습니다.' : syncState === 'preview' ? 'Supabase decisions 원장을 연결하면 실제 결정이 표시됩니다.' : '연결된 decisions 원장에 아직 기록된 결정이 없습니다.'}
              action={syncState === 'error' ? <Button variant="outline" size="sm" onClick={refetch}>다시 시도</Button> : undefined}
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
  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Roadmap</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
            프로젝트 마감과 이니셔티브를 시간축으로 보는 운영 화면
            <span className="mono" style={{ marginLeft: 8, color: 'var(--warning)' }}>setup</span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" icon="sparkle" disabled title="Roadmap 원장 연결 후 사용할 수 있습니다.">Council 제안 연결 대기</Button>
      </div>

      <Card className="hub-table-card">
        <EmptyState
          icon="roadmap"
          title="Roadmap 원장 연결 필요"
          description="고정된 샘플 이니셔티브를 제거했습니다. 프로젝트 마감일과 로드맵 원장의 정본 관계가 정해지면 실제 일정만 표시합니다."
        />
      </Card>
    </div>
  );
}

export function Rhythm() {
  const { rituals: liveRituals, summary, syncState, error, refetch } = useWorkLedger();
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
          <span className="mono" style={{ marginLeft: 8, color: syncState === 'live' ? 'var(--success)' : syncState === 'error' ? 'var(--danger)' : 'var(--warning)' }}>
            {syncState === 'live' ? 'live' : syncState === 'loading' ? 'syncing' : syncState}
          </span>
        </div>
      </div>

      {syncState !== 'live' ? (
        <Card>
          <EmptyState
            icon={syncState === 'error' ? 'signal' : 'rhythm'}
            title={syncState === 'loading' ? '리듬 원장 확인 중' : syncState === 'error' ? '리듬 원장을 불러오지 못했습니다' : '리듬 원장 연결 필요'}
            description={syncState === 'loading' ? '실제 루틴과 체크 기록을 확인하고 있습니다.' : syncState === 'error' ? error || '실패한 읽기를 샘플 루틴으로 대체하지 않았습니다.' : 'Supabase routine_checks 원장을 연결하면 실제 주간 리듬이 표시됩니다.'}
            action={syncState === 'error' ? <Button variant="outline" size="sm" onClick={refetch}>다시 시도</Button> : undefined}
          />
        </Card>
      ) : (
        <>
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
          <span>Ritual</span><span>Last 7 days</span><span>Streak</span><span style={{ textAlign: 'right' }}>Mode</span>
        </div>
        {rituals.length === 0 && (
          <EmptyState
            icon="rhythm"
            title="루틴 체크 기록이 없습니다"
            description="Supabase routine_checks 원장이 비어 있습니다."
            style={{ minHeight: 220 }}
          />
        )}
        {rituals.map((r, i) => {
          const weeks = Array.isArray(r.weeks) ? [...r.weeks] : [0,0,0,0,0,0,0];
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
                <Badge tone="neutral" size="xs">읽기 전용</Badge>
              </div>
            </div>
          );
        })}
      </Card>
        </>
      )}
    </div>
  );
}
