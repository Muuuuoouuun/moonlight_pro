"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import { Button, Skeleton, TruthBadge, EmptyState, Kbd, useToast } from "../hub-primitives";
import { CalendarOutcome } from "../calendar-outcome";
import { PublishDue } from "./publish-due";
import { SIGNAL_TARGETS, withEntityRef } from '@/lib/signal-targets';
import { ContactRecordDrawer } from '../deferred-contact-record-drawer';
import { FinishedTodayList, FocusCard, RemainingList, outcomeIsPanel, useCheckItemDeck } from '../check-items/focus-card';
import { cancelScheduled, postReceipt, undoReceipt } from '../check-items/check-item-actions';
import { ScheduledList } from '../check-items/schedule-band';
import { formatSlot, nextWorkdayKey } from '@/lib/check-items/slots';
import { DailyReviewCue } from '../daily-review-cue';
import { GuruRecommendation, GuruRecommendationList } from '../guru-recommendation';
import { useGuruRecommendations, recommendationForSubject } from '../guru-recommendations-client';
import { readEnvelope, useDailyBriefSignals } from '../daily-brief-signals';
import { HomeMorningBrief } from './home-morning-brief.jsx';
import { formatHomeClock } from './home-morning-brief.js';
import { GuidanceInlineTip } from '../guidance-inline-tip';

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

function homeOutcomeTarget(item, outcome) {
  const target = SIGNAL_TARGETS[outcome.action];
  if (!target) return null;
  if (outcome.action === 'projects' && item.subject?.type === 'project' && item.subject.id) {
    return `${target}${target.includes('?') ? '&' : '?'}project=${encodeURIComponent(item.subject.id)}`;
  }
  return withEntityRef(target, item.source);
}

// Home presents persisted states and actionable records, not a synthetic decision queue.
// Cross-pillar risk cards join names heuristically; keep those in the existing analysis
// surfaces instead of promoting them to work that the operator must "finish" here.
function homeSourceItems(signals) {
  const reasons = {
    project: '프로젝트에 막힘 상태가 저장되어 있습니다.',
    automation: '최근 자동화 실행에 미해결 실패 기록이 있습니다.',
    content: '작성·검토 또는 발행 기록에서 이어갈 항목입니다.',
    'lead-group': '신규로 저장된 리드가 있어 분류할 수 있습니다.',
    deal: '연락 이력 기준의 재확인 항목입니다. 거래에서 최근 활동과 다음 연락일을 확인하세요.',
  };
  return (Array.isArray(signals) ? signals : []).filter(item => {
    const type = item?.subject?.type;
    return reasons[type] && item.signalKey && Array.isArray(item.outcomes) && item.outcomes.length;
  }).map(item => ({
    ...item,
    homeReason: reasons[item.subject.type],
    tone: 'neutral',
    // A stale date is a reminder to inspect the source, not proof of urgency or failure.
    ...(item.subject.type === 'deal' ? {
      tone: 'neutral', title: item.subject.name || '거래 활동 확인',
      summary: '최근 연락 기록과 다음 연락일은 거래 화면에서 확인할 수 있습니다.',
      meta: '연락 이력 확인',
    } : {}),
  }));
}

// 허브 read 봉투 해석과 daily-brief 신호 읽기는 데스크톱 위젯과 공유한다(daily-brief-signals.js).

function LoginRequired() {
  return <EmptyState title="로그인이 필요합니다" description="세션이 만료되어 기록을 확인하지 못했습니다." action={<Button onClick={() => window.location.assign('/login?next=%2Fdashboard%2Fhome')}>다시 로그인</Button>} />;
}

// 오늘 시간표 + 시간 잡기의 빈 시간 계산을 한 번에 읽는다(확인할 것 스펙 §4.7 — 요청 수를 늘리지 않는다).
// `events`는 오늘 것만(시간표·아침 요약이 쓰던 그대로), `all`은 다음 근무일 끝까지(권장 시간 계산용).
function useTodaySchedule(reloadKey) {
  const [state, setState] = React.useState({ status: 'loading', events: [], all: [], readOnly: true });

  React.useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState({ status: 'loading', events: [], all: [], readOnly: true });
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const start = new Date(`${day}T00:00:00+09:00`);
    const todayEnd = new Date(start.getTime() + 86400000);
    const end = new Date(new Date(`${nextWorkdayKey(day)}T00:00:00+09:00`).getTime() + 86400000);
    const params = new URLSearchParams({ timeMin: start.toISOString(), timeMax: end.toISOString() });

    (async () => {
      try {
        const res = await fetch(`/api/calendar/google/event?${params}`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) });
        const data = await res.json().catch(() => null);
        if (!active) return;
        const status = readEnvelope(res, data);
        const all = status === 'error' || status === 'unauthorized' ? [] : (Array.isArray(data?.events) ? data.events : [])
          .filter((e) => !e.allDay)
          .sort((a, b) => new Date(a.start) - new Date(b.start));
        setState({
          status,
          events: all.filter((e) => new Date(e.start) < todayEnd && new Date(e.end || e.start) > start),
          all,
          readOnly: data?.readOnly !== false,
        });
      } catch {
        if (active) setState({ status: 'error', events: [], all: [], readOnly: true });
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [reloadKey]);

  return state;
}

function TodaySchedule({ onNavigate, schedule, onReload }) {
  const { status, events } = schedule;
  const now = Date.now();
  const next = events.find(event => Number.isFinite(Date.parse(event.end || event.start)) && Date.parse(event.end || event.start) > now);
  const context = status === 'loading' ? '일정 확인 중'
    : status === 'unauthorized' ? '일정 로그인 확인 필요'
      : status === 'error' ? '일정을 읽지 못했습니다'
        : status === 'preview' ? '캘린더 연결 필요'
          : next ? `${formatHomeClock(next.start)} ${next.title}${status === 'partial' ? ' · 일부 일정만 확인' : ''}`
            : status === 'partial' ? '확인된 남은 일정 없음 · 일부 미확인' : '남은 일정 없음';

  return (
    <section className="home-schedule" aria-label="시간 잡기 참고">
      <details className="home-support-disclosure">
        <summary><span>시간 잡기 전 일정</span><span className="home-support-disclosure__context">{context}</span><Iconed name="chevronD" size={14} /></summary>
        <div className="home-support-disclosure__body">
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

      {status === 'partial' && <div className="fx-read-state"><TruthBadge state="partial" reason="일부 캘린더만 확인했습니다" /><Button onClick={onReload}>다시 불러오기</Button></div>}
      {status === 'loading' ? (
        <Skeleton lines={4} />
      ) : status === 'unauthorized' ? (
        <LoginRequired />
      ) : status === 'error' || status === 'preview' ? (
        <div className="fx-read-state"><TruthBadge state={status} label={status === 'preview' ? 'Preview · 캘린더 연결 필요' : undefined} reason={status === 'error' ? '일정을 불러오지 못했습니다' : undefined} /><Button onClick={onReload}>다시 불러오기</Button></div>
      ) : !events.length ? (
        <EmptyState title={status === 'partial' ? "읽힌 일정이 없습니다. 오늘 일정이 없다고 확정할 수 없습니다." : "오늘 잡힌 일정이 없습니다"} />
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
                whenLabel={formatHomeClock(e.start)}
                past={past}
                aside={live ? <span className="fx-now"><Iconed name="clock" size={11} />진행 중</span> : null}
              />
            );
          })}
        </div>
      )}
        </div>
      </details>
    </section>
  );
}

export function Home({ onNavigate, onGuidanceAsk }) {
  const [reloadKey, reload] = React.useReducer(value => value + 1, 0);
  // keepPrevious: 끝낼 때마다 다시 읽는데, 그동안 카드가 로딩으로 깜빡이지 않게 지난 읽기를 둔다.
  const brief = useDailyBriefSignals(reloadKey, { keepPrevious: true, homeRoute: true });
  const schedule = useTodaySchedule(reloadKey);
  const { status, signals } = brief;
  const checkItems = brief.checkItems;
  const guruRecommendations = useGuruRecommendations();
  const toast = useToast();
  const finishedToday = React.useMemo(() => (Array.isArray(checkItems?.finishedToday) ? checkItems.finishedToday : []), [checkItems]);
  const finishedKeys = React.useMemo(
    () => new Set(finishedToday.filter((receipt) => receipt.outcome !== 'snoozed').map((receipt) => receipt.signalKey)),
    [finishedToday],
  );
  // 확인할 것 — 한 장씩(2026-09-30 스펙 §7.1). 건너뛰기는 이번 차례 끝으로, 이전은 마지막 건너뛴 카드를 앞으로.
  const homeItems = React.useMemo(() => homeSourceItems(signals), [signals]);
  const { deck, current: active, next, skip, previous, focus, markPending, clearPending } = useCheckItemDeck(homeItems, { finishedKeys });
  const [panel, setPanel] = React.useState(null);
  const [recordTarget, setRecordTarget] = React.useState(null);
  const recordItemRef = React.useRef(null);
  const activeKey = active?.signalKey || active?.id || null;
  // Reuse Home's existing check deep link for browser Back. Returning restores
  // the viewed card without replaying an outcome or creating another record.
  const navigateFromHome = React.useCallback((target) => {
    if (activeKey && typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        params.set('check', activeKey); params.delete('do');
        window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params}${window.location.hash}`);
      } catch { /* A blocked history API must not block the requested navigation. */ }
    }
    onNavigate?.(target);
  }, [activeKey, onNavigate]);

  const scheduledBlocks = React.useMemo(() => (Array.isArray(checkItems?.scheduledBlocks) ? checkItems.scheduledBlocks : []), [checkItems]);
  const waitingCount = scheduledBlocks.filter((block) => block.state === 'waiting' && !block.done).length;
  // 시간 잡기의 캘린더 — 읽은 일정(다음 근무일까지)과 쓸 수 있는지. 쓰기는 OAuth 캘린더만(iCal은 읽기 전용).
  const calendar = React.useMemo(() => ({
    status: schedule.status,
    events: schedule.all,
    writable: (schedule.status === 'live' || schedule.status === 'partial') && schedule.readOnly === false,
  }), [schedule]);

  React.useEffect(() => { setPanel(null); }, [activeKey]);
  // 딥링크로 고른 카드가 맨 앞에 오면 그 끝내기를 연다(한 번).
  React.useEffect(() => {
    const link = deepLinkRef.current;
    if (!link || !active || (active.signalKey || active.id) !== link.key) return;
    deepLinkRef.current = false;
    if (Number.isInteger(link.index) && active.outcomes?.[link.index]) activateRef.current?.(link.index);
  }, [active]);
  // 다시 읽은 결과가 오면 저장 중으로 감춰 둔 카드를 푼다 — 규칙이 여전히 잡으면 `stillFlagged`로 다시 보인다.
  React.useEffect(() => { clearPending(); }, [signals, clearPending]);

  const finish = React.useCallback((item, { message, receiptMissing, action } = {}) => {
    if (!item) return;
    markPending(item.signalKey || item.id);
    setPanel(null);
    toast.success(message || '끝냈습니다', action ? { action } : undefined);
    if (receiptMissing) toast.info('기록은 남았지만 오늘 끝낸 것에는 아직 보이지 않습니다.');
    reload();
  }, [markPending, toast]);

  const activate = React.useCallback((index) => {
    const outcome = active?.outcomes?.[index];
    if (!outcome) return;
    if (outcome.kind === 'navigate') {
      const target = homeOutcomeTarget(active, outcome);
      if (target) navigateFromHome(target);
      return;
    }
    if (outcome.key === 'contact') {
      recordItemRef.current = { item: active, receipted: false, receiptId: crypto.randomUUID() };
      setRecordTarget({ kind: active.subject?.type, id: active.subject?.id, name: active.subject?.name || active.title });
      return;
    }
    if (outcomeIsPanel(outcome)) setPanel((open) => (open === outcome.key ? null : outcome.key));
  }, [active, navigateFromHome]);
  const activateRef = React.useRef(activate);
  activateRef.current = activate;

  // 시간 잡기는 끝냄이 아니다 — 카드는 그 시간까지 빠지고, 토스트에서 바로 되돌릴 수 있다(§4.7 저장 3).
  const scheduled = React.useCallback((item, { slot, receipt, eventId }) => {
    finish(item, {
      message: `${formatSlot(slot)}에 다시 보여 드립니다`,
      receiptMissing: false,
      action: receipt?.id ? {
        label: '되돌리기',
        onClick: async () => {
          const result = await cancelScheduled(globalThis.fetch, { id: receipt.id, calendarEventId: eventId || null });
          if (!result.ok) toast.error(result.message);
          else { if (result.message) toast.info(result.message); reload(); }
        },
      } : undefined,
    });
  }, [finish, toast]);

  const scheduleChanged = React.useCallback((message, { warn } = {}) => {
    if (warn) toast.info(message); else toast.success(message);
    reload();
  }, [toast]);

  const undo = React.useCallback(async (receipt) => {
    const result = await undoReceipt(globalThis.fetch, receipt);
    if (result.ok) { toast.success('보류를 되돌렸습니다'); reload(); } else toast.error(result.message);
  }, [toast]);

  // 끝낸 직후 토스트 — 보류는 그 자리에서 되돌릴 수 있다(오늘 끝낸 것 목록까지 내려가지 않게, §13).
  const finished = React.useCallback((item, result = {}) => {
    const receipt = result.outcome === 'snoozed' && result.receipt?.id ? result.receipt : null;
    finish(item, { ...result, action: receipt ? { label: '되돌리기', onClick: () => undo(receipt) } : undefined });
  }, [finish, undo]);

  // 딥링크 ?check=<signalKey>&do=<1~4> — 오늘 화면의 끝내기 버튼이 이 카드를 맨 앞에 두고 그 끝내기를 연다.
  // 기록을 읽은 뒤 한 번만, 그리고 주소에서 지운다(DESIGN.md §8.1 딥링크). 그 카드가 없으면 조용히 무시하지
  // 않고 알린다 — 이미 끝났거나 보류된 카드일 수 있다.
  const deepLinkRef = React.useRef(null);
  React.useEffect(() => {
    if (deepLinkRef.current !== null || typeof window === 'undefined') return;
    if (status !== 'live' && status !== 'partial') return;
    const params = new URLSearchParams(window.location.search);
    const key = params.get('check');
    deepLinkRef.current = key ? { key, index: Number(params.get('do')) - 1 } : false;
    if (!key) return;
    params.delete('check');
    params.delete('do');
    const query = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    if (deck.some((item) => (item.signalKey || item.id) === key)) focus(key);
    else { deepLinkRef.current = false; toast.info('그 카드는 이미 끝났거나 보류 중입니다.'); }
  }, [status, deck, focus, toast]);

  // §8.1 페이지 레벨 단축키 — 입력 요소 밖 + 드로어·다이얼로그 닫힘일 때만. 1–4 끝내기, T 시간 잡기,
  // D 결정으로 남기기, J/→ 건너뛰기, K/← 이전.
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (document.querySelector('[data-drawer-open="true"], [role="dialog"], [data-shortcut-overlay="true"]')) return; // §8.1 다이얼로그 위 발화 금지
      if (!active) return;

      if (e.key === 'j' || e.key === 'ArrowRight') {
        e.preventDefault();
        skip();
      } else if (e.key === 'k' || e.key === 'ArrowLeft') {
        e.preventDefault();
        previous();
      } else if ((e.key === 't' || e.key === 'T') && active.signalKey && active.schedule) {
        e.preventDefault();
        setPanel((open) => (open === 'schedule' ? null : 'schedule'));
      } else if ((e.key === 'd' || e.key === 'D') && active.signalKey && active.links?.some((link) => link.action === 'decision')) {
        e.preventDefault();
        setPanel((open) => (open === 'decide' ? null : 'decide'));
      } else if (/^[1-4]$/.test(e.key) && active.outcomes?.[Number(e.key) - 1]) {
        e.preventDefault();
        activate(Number(e.key) - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, skip, previous, activate]);

  const live = status === 'live' || status === 'partial';
  const recommendation = active?.subject?.id ? recommendationForSubject(guruRecommendations, active.subject.id) : null;

  return (
    <div className="hub-futura home-start-page fade-up">
      <header className="fx-head">
        <div>
          <div className="fx-eyebrow">
            홈 · {formatEyebrowDate(new Date())}
          </div>
          <h2 className="fx-hero">
            {status === 'loading' ? '불러오는 중' : status === 'unauthorized' ? '로그인이 필요합니다' : status === 'error' ? '확인할 것을 읽지 못했습니다' : status === 'preview' ? '저장소 연결이 필요합니다' : '작업 이어가기'}
          </h2>
          <p className="home-purpose">할 일은 오늘에서, 프로젝트는 해당 화면에서 이어가세요.</p>
        </div>
        {status !== 'unauthorized' && schedule.status !== 'unauthorized' ? <HomeMorningBrief brief={brief} onNavigate={navigateFromHome} /> : null}
      </header>

      {/* 저녁·다음 날 아침의 하루 리뷰 한 줄 — 확인할 것 밖(2026-09-23 지속 루프 설계 §4.3). */}
      <DailyReviewCue className="daily-review-cue--home" />

      {status === 'partial' && <div className="fx-read-state"><TruthBadge state="partial" reason="일부 기록만 확인했습니다" /><Button onClick={reload}>다시 불러오기</Button></div>}
      {live && checkItems?.state === 'error' ? (
        <TruthBadge state="partial" reason="끝낸 기록을 읽지 못해 이미 끝낸 카드가 다시 보일 수 있습니다" />
      ) : null}

      <section className="home-records" aria-label="기록에서 확인할 항목">
      {live && deck.length ? <div className="home-records-heading">
        <h3>기록에서 확인할 항목 <span className="num">{deck.length}</span></h3>
        <p>저장된 상태와 실행 이력에서 표시합니다.</p>
      </div> : null}
      <div className="home-triage" data-split={live && deck.length >= 2 ? 'true' : undefined}>
        {live ? <RemainingList deck={deck} currentKey={activeKey} onFocus={focus} layout="side" mobileCollapsed /> : null}
        <div className="ci-column">
          {status === 'loading' ? (
            <Skeleton lines={7} />
          ) : status === 'unauthorized' ? (<LoginRequired />) : status === 'error' ? (
            <div className="fx-read-state"><TruthBadge state="error" reason="첫 화면 신호를 불러오지 못했습니다" /><Button onClick={reload}>다시 불러오기</Button></div>
          ) : status === 'preview' ? (
            <TruthBadge state="preview" label="Preview · Supabase 연결 필요" style={{ alignSelf: 'flex-start' }} />
          ) : (
            <>
              {active ? (
                <FocusCard
                  item={active}
                  actionHeading="이 항목에서 할 수 있는 일"
                  navigationNote="연결된 화면을 엽니다 · 이동만으로 완료 처리하지 않습니다"
                  nextItem={next}
                  panel={panel}
                  onPanel={setPanel}
                  onActivate={activate}
                  onScheduled={(result) => scheduled(active, result)}
                  calendar={calendar}
                  blocks={scheduledBlocks}
                  onFinished={(result) => finished(active, result)}
                  onSkip={skip}
                  onNavigate={navigateFromHome}
                  recommendation={recommendation ? (
                    <div style={{ marginTop: 16 }}>
                      <GuruRecommendation recommendation={recommendation} onAsk={onGuidanceAsk} onNavigate={navigateFromHome} compact />
                    </div>
                  ) : null}
                />
              ) : (
                <div className="fx-card">
                  <EmptyState
                    icon={status === 'partial' ? "signal" : "check"}
                    title={status === 'partial' ? "확인할 것을 모두 읽지 못했습니다" : "지금 확인할 항목이 없습니다"}
                    description={status === 'partial' ? '읽힌 항목이 없어도 실제로 확인할 일이 있을 수 있습니다. 위에서 다시 불러와 주세요.' : finishedToday.length || waitingCount
                      ? `끝낸 것 ${finishedToday.filter((r) => r.outcome !== 'snoozed').length}건 · 잡아 둔 것 ${waitingCount}건 · 보류 ${finishedToday.filter((r) => r.outcome === 'snoozed').length}건 — 잡아 둔 일은 그 시간에, 보류한 것은 그날 다시 맨 앞으로 옵니다.`
                      : '새로 확인할 것이 생기면 여기에 올라옵니다. 할 일은 오늘에서 이어가세요.'}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      </section>

      <TodaySchedule onNavigate={navigateFromHome} schedule={schedule} onReload={reload} />

      <div className="home-after" aria-label="잡아 둔 일과 끝낸 것">
        <ScheduledList blocks={scheduledBlocks} calendar={calendar} onChanged={scheduleChanged} onError={(message) => toast.error(message)} />
        <FinishedTodayList receipts={finishedToday} state={checkItems?.state} onUndo={undo} />
      </div>

      <PublishDue />

      <details className="home-support-disclosure">
        <summary>참고 관점과 보조 브리핑<Iconed name="chevronD" size={14} /></summary>
        <div className="home-support-disclosure__body">
          <GuidanceInlineTip variant="home" context={active?.subject?.type ? { type: active.subject.type, label: active.kindLabel } : null} onNavigate={navigateFromHome} />
          <GuruRecommendationList result={guruRecommendations} onAsk={onGuidanceAsk} onNavigate={navigateFromHome} onRetry={guruRecommendations.reload} />
          <Button variant="ghost" size="sm" onClick={() => navigateFromHome('dashboard/daily-brief?panel=briefing')}>30초 AI 브리핑 열기</Button>
        </div>
      </details>

      <footer className="fx-eyebrow" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}><Kbd>1</Kbd>–<Kbd>4</Kbd> 끝내기</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}><Kbd>T</Kbd> 시간 잡기</span>
        {active?.links?.some(link => link.action === 'decision') ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}><Kbd>D</Kbd> 결정 기록</span> : null}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}><Kbd>J</Kbd> 건너뛰기</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}><Kbd>K</Kbd> 이전</span>
      </footer>

      {recordTarget && (
        <ContactRecordDrawer
          target={recordTarget}
          subtitle="저장하면 이 카드를 끝낸 것으로 남깁니다"
          onPersisted={async (result) => {
            const session = recordItemRef.current;
            if (!session || session.receipted) return; // 원문 저장으로 한 번 더 불려도 영수증은 한 번만.
            session.receipted = true;
            const activityId = result && typeof result === 'object' && result.activityId ? String(result.activityId) : null;
            const receipt = await postReceipt(globalThis.fetch, session.item, {
              outcome: 'contact_logged',
              requestId: session.receiptId,
              recordRef: activityId ? { table: 'crm_activities', id: activityId } : { table: 'crm_activities' },
            });
            finish(session.item, { message: `기록됨 · ${session.item.subject?.name || '고객'}`, receiptMissing: !receipt.ok });
          }}
          onFailed={({ message }) => toast.error(`기록하지 못했습니다 — ${message}`)}
          onClose={() => setRecordTarget(null)}
        />
      )}
    </div>
  );
}
