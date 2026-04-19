"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import { Badge, Card, IconButton, Button, Progress } from "../hub-primitives";
import { DECISIONS } from "../hub-data";

export function Calendar() {
  const [gcalStatus, setGcalStatus] = React.useState('idle');
  const [gcalMessage, setGcalMessage] = React.useState('');

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
  const days = ['월 14','화 15','수 16','목 17','금 18','토 19','일 20'];
  const events = [
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
  const toneBg = { moon: 'oklch(0.35 0.008 250 / 0.9)', company: 'var(--company-bg)', personal: 'var(--personal-bg)', info: 'var(--info-bg)', warning: 'var(--warning-bg)' };
  const toneFg = { moon: 'var(--moon-100)', company: 'var(--company)', personal: 'var(--personal)', info: 'var(--info)', warning: 'var(--warning)' };
  const toneBd = { moon: 'var(--moon-600)', company: 'oklch(0.5 0.04 290 / 0.5)', personal: 'oklch(0.5 0.04 200 / 0.5)', info: 'oklch(0.5 0.06 230 / 0.5)', warning: 'oklch(0.5 0.09 85 / 0.5)' };

  return (
    <div style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, letterSpacing: '-0.01em' }}>Calendar</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span>April 14 – 20</span>
            <span style={{ color: 'var(--fg-faint)' }}>·</span>
            <span style={{ color: gcalColor }}>{gcalLabel}</span>
            <Button variant="ghost" size="xs" onClick={connectGoogleCalendar}>
              {gcalStatus === 'connecting' ? 'Connecting…' : gcalStatus === 'connected' ? 'Reconnect' : 'Connect Google Calendar'}
            </Button>
          </div>
          {gcalMessage && (
            <div className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 4 }}>{gcalMessage}</div>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          <IconButton icon="chevronL" />
          <Button variant="secondary" size="sm">Today</Button>
          <IconButton icon="chevronR" />
        </div>
        <div style={{ display: 'flex', gap: 2, background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', padding: 2 }}>
          {['Day','Week','Month'].map(v => (
            <button key={v} style={{ padding: '4px 10px', fontSize: 11.5, borderRadius: 4, color: v === 'Week' ? 'var(--fg)' : 'var(--fg-faint)', background: v === 'Week' ? 'var(--surface-3)' : 'transparent' }}>{v}</button>
          ))}
        </div>
        <Button variant="primary" size="sm" icon="plus">Event</Button>
      </div>

      <Card pad={false} style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '56px repeat(7, 1fr)', borderBottom: '1px solid var(--line-soft)' }}>
          <div />
          {days.map((d, i) => (
            <div key={d} style={{ padding: '10px 12px', borderLeft: '1px solid var(--line-soft)', fontSize: 11.5, color: i === 4 ? 'var(--fg)' : 'var(--fg-muted)' }}>
              {d}
              {i === 4 && <span style={{ marginLeft: 6, color: 'var(--moon-300)' }}>· Today</span>}
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
            {days.map((_, di) => (
              <div key={di} style={{ borderLeft: '1px solid var(--line-soft)', position: 'relative' }}>
                {hours.map(h => <div key={h} style={{ height: 52, borderBottom: '1px solid var(--line-soft)' }} />)}
                {events.filter(e => e.day === di).map((e, ei) => {
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
                      <div className="mono" style={{ fontSize: 9.5, opacity: 0.7, marginTop: 3 }}>{e.start}:00 – {Math.floor(e.end)}:{e.end % 1 ? '30' : '00'}</div>
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
  return (
    <div style={{ padding: 'var(--section-gap)', maxWidth: 1000, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Decisions</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2, maxWidth: '60ch', lineHeight: 1.5 }}>실행의 근거가 되는 결정들의 타임라인. 각 결정에는 맥락·선택·근거를 남깁니다.</div>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="primary" size="sm" icon="plus">Record decision</Button>
      </div>
      <div style={{ position: 'relative', paddingLeft: 28 }}>
        <div style={{ position: 'absolute', left: 11, top: 6, bottom: 6, width: 1, background: 'var(--line-soft)' }} />
        {DECISIONS.map(d => (
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
  const months = ['April','May','June','July'];
  const items = [
    { name: 'Moonlight Web v2 launch', start: 0, len: 1, tone: 'moon', tag: null },
    { name: '클래스인 Spring Cohort', start: 0.5, len: 1.2, tone: 'company', tag: 'company' },
    { name: 'Pricing experiment Q2', start: 1, len: 2, tone: 'moon', tag: null },
    { name: 'Newsletter auto v2', start: 0, len: 0.5, tone: 'moon', tag: null },
    { name: '개인 브랜드 사이트', start: 1.2, len: 1.5, tone: 'personal', tag: 'personal' },
    { name: 'Partner referral program', start: 1.5, len: 1.5, tone: 'moon', tag: null },
    { name: 'Agents Orders v3', start: 2, len: 1, tone: 'moon', tag: null },
  ];
  const toneMap = { moon: 'var(--moon-400)', company: 'var(--company)', personal: 'var(--personal)' };

  return (
    <div style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Roadmap</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>Q2 outlook · 7 initiatives</div>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" icon="sparkle">Let Council draft Q3</Button>
      </div>

      <Card pad={false}>
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
  const rituals = [
    { name: 'Daily Brief · 07:00', streak: 23, weeks: [1,1,1,1,1,1,1] },
    { name: 'Deep work block · 14:00', streak: 12, weeks: [1,1,1,0,1,1,1] },
    { name: 'Weekly Review · 금', streak: 3, weeks: [1,1,1,1,0,0,0] },
    { name: 'Monthly retrospective', streak: 4, weeks: [1,1,1,1,0,0,0] },
    { name: 'Evening shutdown · 22:00', streak: 8, weeks: [1,0,1,1,1,1,0] },
  ];

  return (
    <div style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Rhythm</h2>
        <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>루틴은 실행의 인프라</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--gap)' }}>
        <Card>
          <div style={{ fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>This week</div>
          <div style={{ fontSize: 30, fontWeight: 500, marginTop: 10 }} className="mono">4 / 5</div>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>rituals completed · Weekly Review 남음</div>
          <div style={{ marginTop: 14 }}><Progress value={80} /></div>
        </Card>
        <Card>
          <div style={{ fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Longest streak</div>
          <div style={{ fontSize: 30, fontWeight: 500, marginTop: 10 }} className="mono">23 <span style={{ fontSize: 14, color: 'var(--fg-faint)' }}>days</span></div>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>Daily Brief · 3월 27일부터</div>
        </Card>
      </div>

      <Card pad={false}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)', fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'grid', gridTemplateColumns: '1fr 160px 90px 100px' }}>
          <span>Ritual</span><span>Last 7 days</span><span>Streak</span><span style={{ textAlign: 'right' }}>Action</span>
        </div>
        {rituals.map((r, i) => (
          <div key={i} style={{ padding: '14px 16px', borderBottom: i < rituals.length - 1 ? '1px solid var(--line-soft)' : 'none', display: 'grid', gridTemplateColumns: '1fr 160px 90px 100px', alignItems: 'center' }}>
            <span style={{ fontSize: 13 }}>{r.name}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {r.weeks.map((v, j) => (
                <div key={j} style={{
                  width: 18, height: 18, borderRadius: 4,
                  background: v ? 'var(--moon-500)' : 'var(--surface-3)',
                  border: v ? 'none' : '1px solid var(--line-soft)',
                }} />
              ))}
            </div>
            <span className="mono" style={{ fontSize: 12, color: r.streak > 10 ? 'var(--success)' : 'var(--fg-muted)' }}>{r.streak}d</span>
            <div style={{ textAlign: 'right' }}>
              <Button variant="ghost" size="xs">Check in</Button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
