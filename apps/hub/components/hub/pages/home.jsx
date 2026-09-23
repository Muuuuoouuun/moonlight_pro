"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import { Button, Skeleton, TruthBadge, EmptyState, Kbd } from "../hub-primitives";
import { CalendarOutcome } from "../calendar-outcome";
import { SIGNAL_TARGETS } from '@/lib/signal-targets';
import { DailyReviewCue } from '../daily-review-cue';

// Home — Futura 텍스처의 첫 화면 (DESIGN.md §15, 2026-09-18).
//
// 데이터는 새로 만들지 않는다. /api/hub/daily-brief의 `signals`(kind·title·summary·meta·
// source·decisions·tone)를 그대로 소비하고, 시간표는 Calendar가 쓰는 /api/calendar/google/event를
// 공유한다. 첫 화면이 별도 기록을 갖는 순간 Daily Brief와 숫자가 갈라지기 때문이다.
// 일정 완료·특이사항도 같은 이유로 Daily Brief·Calendar와 같은 CalendarOutcome(outcomeKey)을 쓴다.
//
// 기존 daily-brief.jsx는 건드리지 않는다 — Home은 같은 기록 위의 다른 렌즈다.

function formatEyebrowDate(date) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short',
  }).format(date);
}

function formatClock(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
}

// 허브 read 봉투(CLAUDE.md): read 실패는 5xx가 아니라 HTTP 200 + status:"error"로 온다.
// `!r.ok`만 보면 read 실패가 빈 상태("대기 없음")로 위장된다.
function readEnvelope(res, data) {
  if (!res.ok || !data) return 'error';
  if (data.status === 'error' || data.source === 'error') return 'error';
  return data.status || 'preview';
}

function useDailyBriefSignals(reloadKey) {
  const [state, setState] = React.useState({ status: 'loading', signals: [] });

  React.useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState({ status: 'loading', signals: [] });
    (async () => {
      try {
        const res = await fetch('/api/hub/daily-brief', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) });
        const data = await res.json().catch(() => null);
        if (!active) return;
        const status = readEnvelope(res, data);
        setState({
          status,
          signals: status === 'error' ? [] : (Array.isArray(data?.signals) ? data.signals : []),
        });
      } catch {
        if (active) setState({ status: 'error', signals: [] });
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [reloadKey]);

  return state;
}

function useTodaySchedule(reloadKey) {
  const [state, setState] = React.useState({ status: 'loading', events: [] });

  React.useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState({ status: 'loading', events: [] });
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const start = new Date(`${day}T00:00:00+09:00`);
    const end = new Date(start.getTime() + 86400000);
    const params = new URLSearchParams({ timeMin: start.toISOString(), timeMax: end.toISOString() });

    (async () => {
      try {
        const res = await fetch(`/api/calendar/google/event?${params}`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) });
        const data = await res.json().catch(() => null);
        if (!active) return;
        const status = readEnvelope(res, data);
        setState({
          status,
          events: status === 'error' ? [] : (Array.isArray(data?.events) ? data.events : [])
            .filter((e) => !e.allDay)
            .sort((a, b) => new Date(a.start) - new Date(b.start)),
        });
      } catch {
        if (active) setState({ status: 'error', events: [] });
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [reloadKey]);

  return state;
}

function TriageDetail({ signal, onDecide }) {
  if (!signal) {
    return (
      <div className="fx-card">
        <EmptyState
          title="확인된 신호가 없습니다"
          description="새 신호는 기록이 갱신되면 여기에 쌓입니다."
        />
      </div>
    );
  }

  const urgent = signal.tone === 'danger';
  const decisions = Array.isArray(signal.decisions) ? signal.decisions : [];

  return (
    <div className="fx-card fx-card--lift">
      <div className="fx-card-meta">
        <span>
          <span data-urgent={urgent ? 'true' : undefined}>{signal.kind}</span>
          {signal.meta ? ` · ${signal.meta}` : ''}
        </span>
        {signal.source?.ref ? <span>{String(signal.source.ref).slice(0, 18)}</span> : null}
      </div>

      <h3 className="fx-card-title">{signal.title}</h3>
      {signal.summary ? <p className="fx-card-body">{signal.summary}</p> : null}

      {decisions.length ? (
        <>
          <div className="fx-eyebrow" style={{ marginTop: 24 }}>결정</div>
          <div className="fx-actions">
            {decisions.map((d, i) => (
              <button
                key={`${d.action}-${i}`}
                type="button"
                className={`fx-pill-btn${d.primary ? ' fx-pill-btn--primary' : ''}`}
                onClick={() => onDecide(signal, d)}
              >
                {d.label}
                <kbd>{i + 1}</kbd>
              </button>
            ))}
            <button type="button" className="fx-pill-btn fx-pill-btn--ghost" onClick={() => onDecide(signal, null)}>
              보류
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function TodaySchedule({ onNavigate, reloadKey, onReload }) {
  const { status, events } = useTodaySchedule(reloadKey);
  const now = Date.now();

  return (
    <section>
      <div className="fx-section-head">
        <span className="fx-eyebrow">오늘의 시간표</span>
        <button
          type="button"
          className="fx-pill-btn fx-pill-btn--ghost"
          onClick={() => onNavigate('dashboard/work/calendar')}
        >
          캘린더 <Iconed name="arrowRight" size={12} aria-hidden="true" />
        </button>
      </div>

      {status === 'partial' && <div><TruthBadge state="partial" reason="일부 캘린더만 확인했습니다" /><Button onClick={onReload}>다시 불러오기</Button></div>}
      {status === 'loading' ? (
        <Skeleton lines={4} />
      ) : status === 'error' || status === 'preview' ? (
        <div><TruthBadge state={status} reason={status === 'error' ? '일정을 불러오지 못했습니다' : '캘린더 연결 필요'} /><Button onClick={onReload}>다시 불러오기</Button></div>
      ) : !events.length ? (
        <EmptyState title="오늘 잡힌 일정이 없습니다" />
      ) : (
        <div className="fx-timeline">
          {events.map((e, i) => {
            const startMs = new Date(e.start).getTime();
            const endMs = new Date(e.end || e.start).getTime();
            const past = endMs < now;
            const live = startMs <= now && now <= endMs;
            // 키는 Daily Brief·Calendar와 같은 outcomeKey — provider id만으로는 개인·회사 피드에
            // 같은 id가 겹칠 수 있고, 완료·특이사항 기록도 이 키로 저장된다.
            return (
              <CalendarOutcome
                key={e.outcomeKey || e.id || i}
                compact
                eventKey={e.outcomeKey}
                title={e.title}
                whenLabel={formatClock(e.start)}
                past={past}
                aside={live ? <span className="fx-now">NOW</span> : null}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

export function Home({ onNavigate }) {
  const [reloadKey, reload] = React.useReducer(value => value + 1, 0);
  const { status, signals } = useDailyBriefSignals(reloadKey);
  const [resolved, setResolved] = React.useState(() => new Set());
  const [cursor, setCursor] = React.useState(0);

  const queue = React.useMemo(() => signals.filter((s) => !resolved.has(s.id)), [signals, resolved]);
  const active = queue[Math.min(cursor, Math.max(queue.length - 1, 0))] || null;
  const total = signals.length;
  const done = total - queue.length;

  const decide = React.useCallback((signal, decision) => {
    const target = decision ? SIGNAL_TARGETS[decision.action] : null;
    if (decision && !target) return;
    setResolved((prev) => new Set(prev).add(signal.id));
    setCursor(0);
    if (target) onNavigate(target);
  }, [onNavigate]);

  // §8.1 페이지 레벨 단축키 — 입력 요소 밖 + 드로어 닫힘일 때만.
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (document.querySelector('[data-drawer-open="true"], [role="dialog"], [data-shortcut-overlay="true"]')) return; // §8.1 다이얼로그 위 발화 금지
      if (!active) return;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, queue.length - 1));
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      } else if (/^[1-9]$/.test(e.key)) {
        const d = (active.decisions || [])[Number(e.key) - 1];
        if (d) { e.preventDefault(); decide(active, d); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, queue.length, decide]);

  return (
    <div className="hub-futura fade-up">
      <header className="fx-head">
        <div>
          <div className="fx-eyebrow">
            Daily Brief · {formatEyebrowDate(new Date())}
          </div>
          <h2 className="fx-hero">
            {status === 'loading' ? '불러오는 중' : status === 'error' ? '신호를 확인하지 못했습니다' : status === 'preview' ? '저장소 연결이 필요합니다' : queue.length ? `${queue.length}건 남았습니다` : status === 'partial' ? '일부 신호 확인 필요' : '확인할 신호 없음'}
          </h2>
        </div>

        {total ? (
          <div className="fx-progress-wrap">
            <div className={`fx-progress${done >= total ? ' fx-progress--completed' : ''}`}>
              <i style={{ width: `${Math.round((done / total) * 100)}%` }} />
            </div>
            <span className="mono" style={{ fontSize: 11, color: done >= total ? 'var(--moon-200)' : 'var(--fg-dim)' }}>
              {done}/{total}{done >= total ? ' ✦' : ''}
            </span>
          </div>
        ) : null}
      </header>

      {/* 저녁·다음 날 아침의 하루 리뷰 한 줄 — 트리아지 큐 밖(2026-09-23 지속 루프 설계 §4.3). */}
      <DailyReviewCue className="daily-review-cue--home" />

      {status === 'partial' && <div><TruthBadge state="partial" reason="일부 기록만 확인했습니다" /><Button onClick={reload}>다시 불러오기</Button></div>}
      {status === 'loading' ? (
        <div className="fx-split">
          <Skeleton lines={5} />
          <Skeleton lines={6} />
        </div>
      ) : status === 'error' ? (
        <div><TruthBadge state="error" reason="첫 화면 신호를 불러오지 못했습니다" /><Button onClick={reload}>다시 불러오기</Button></div>
      ) : status === 'preview' ? (
        <TruthBadge state="preview" reason="Supabase 연결 필요" />
      ) : (
        <div className="fx-split">
          <ul className="fx-triage">
            {queue.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="fx-triage-item"
                  aria-current={s.id === active?.id ? 'true' : undefined}
                  data-urgent={s.tone === 'danger' ? 'true' : undefined}
                  onClick={() => setCursor(i)}
                >
                  <span className="fx-triage-kind">{s.kind}</span>
                  <span className="fx-triage-title">{s.title}</span>
                </button>
              </li>
            ))}
          </ul>

          <TriageDetail signal={active} onDecide={decide} />
        </div>
      )}

      <TodaySchedule onNavigate={onNavigate} reloadKey={reloadKey} onReload={reload} />

      <footer className="fx-eyebrow" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Kbd>J</Kbd><Kbd>K</Kbd> 이동 · <Kbd>1</Kbd>–<Kbd>9</Kbd> 결정
      </footer>
    </div>
  );
}
