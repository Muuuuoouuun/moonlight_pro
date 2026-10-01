"use client";

// 확인할 것 — 한 장씩 카드(docs/superpowers/specs/2026-09-30-check-items-finish-and-unblock-design.md §4·§7.1).
//
// 카드마다 끝내기 1~4가 세로 전폭 줄로 붙는다. 저장하는 끝내기(write)는 서버가 saved/duplicate로 답해야
// 끝낸 것이고, 화면만 여는 줄(navigate)은 끝낸 것으로 세지 않는다. 입력이 필요한 끝내기(할 일·날짜·보류)는
// 그 줄 바로 아래에 펼친다. 연락 기록은 공용 기록창(ContactRecordDrawer)을 부모가 연다.
// 끝내기 아래에는 시간 잡기 띠(schedule-band.jsx, §4.7)가 붙는다 — 끝냄이 아니라 언제 할지 정하는 것.

import React from 'react';
import { Iconed } from '../hub-icons';
import { Kbd, TextField } from '../hub-primitives';
import { SIGNAL_TARGETS, withEntityRef } from '@/lib/signal-targets';
import {
  createTaskForItem,
  dayAfter,
  formatDayLabel,
  postReceipt,
  receiptLine,
  rescheduleItem,
  snoozePresets,
  snoozeSubject,
  todayKey,
} from './check-item-actions';
import { MAX_SNOOZE_DAYS } from '@/lib/check-items/outcome-input';
import { ScheduleBand, ScheduledNowBand } from './schedule-band';
import './check-items.css';

const PANEL_KEYS = new Set(['task', 'reschedule', 'snooze']);

export function outcomeIsPanel(outcome) {
  return outcome?.kind === 'write' && PANEL_KEYS.has(outcome.key);
}

// ── 진행 줄 ─────────────────────────────────────────────────────
export function CheckItemProgress({ finished = [], remaining = 0, scheduled = 0, date }) {
  const done = finished.filter((r) => r.outcome !== 'snoozed').length;
  const held = finished.filter((r) => r.outcome === 'snoozed').length;
  const segments = [
    ...Array(done).fill('done'),
    ...Array(held).fill('held'),
    ...Array(scheduled).fill('sched'),
    ...(remaining > 0 ? ['now', ...Array(remaining - 1).fill('todo')] : []),
  ];
  return (
    <div className="ci-progress">
      <div className="ci-progress__head">
        <span className="fx-eyebrow">확인할 것 · 한 장씩{date ? ` · ${date}` : ''}</span>
        <span className="ci-progress__counts">
          <span>끝냄 <span className="mono">{done}</span></span>
          {held ? <span>보류 <span className="mono">{held}</span></span> : null}
          {scheduled ? <span>잡음 <span className="mono">{scheduled}</span></span> : null}
          <span>남음 <span className="mono">{remaining}</span></span>
        </span>
      </div>
      {segments.length ? (
        <div className="ci-progress__track" aria-hidden="true">
          {segments.map((state, i) => <span key={i} className="ci-progress__seg" data-state={state} />)}
        </div>
      ) : null}
    </div>
  );
}

// ── 오늘 끝낸 것 ────────────────────────────────────────────────
export function FinishedTodayList({ receipts = [], state, onUndo }) {
  if (state === 'error') {
    return <p className="ci-note" role="status">오늘 끝낸 것을 읽지 못했습니다 — 끝낸 카드가 다시 보일 수 있습니다.</p>;
  }
  if (!receipts.length) return null;
  return (
    <section aria-label="오늘 끝낸 것" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span className="fx-eyebrow">오늘 끝낸 것 · {receipts.length}</span>
      <ul className="ci-receipts">
        {receipts.map((receipt) => (
          <li key={receipt.id} className="ci-receipt">
            <Iconed name={receipt.outcome === 'snoozed' ? 'pause' : 'check'} size={14} style={{ color: 'var(--fg-muted)', marginTop: 2 }} />
            <span>
              <span className="ci-receipt__title">{receipt.title || '확인할 것'}</span>
              <span className="ci-receipt__line">
                {receiptLine(receipt)}
                {receipt.createdAt ? <> · <span className="mono">{new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(receipt.createdAt))}</span></> : null}
              </span>
            </span>
            {receipt.outcome === 'snoozed' && onUndo ? (
              <button type="button" className="fx-pill-btn fx-pill-btn--ghost" onClick={() => onUndo(receipt)}>되돌리기</button>
            ) : <span />}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── 펼치는 입력 ─────────────────────────────────────────────────
function PanelError({ message }) {
  if (!message) return null;
  return (
    <div className="ci-error" role="alert">
      <Iconed name="x" size={14} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 2 }} />
      <span>{message}</span>
    </div>
  );
}

function TaskPanel({ item, onFinished, fetchImpl }) {
  const [title, setTitle] = React.useState(item.taskTitle || '');
  const [dueAt, setDueAt] = React.useState(todayKey());
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  // 할 일은 만들었는데 영수증을 못 남긴 경우 — 다시 누르면 영수증만 다시 시도한다(같은 할 일 id).
  const [createdTaskId, setCreatedTaskId] = React.useState(null);
  const taskIdRef = React.useRef(globalThis.crypto.randomUUID());

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    let taskId = createdTaskId;
    if (!taskId) {
      const task = await createTaskForItem(fetchImpl, item, { title, dueAt, taskId: taskIdRef.current });
      if (!task.ok) { setBusy(false); setError(task.message); return; }
      taskId = task.taskId;
      setCreatedTaskId(taskId);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('moonlight:tasks-saved'));
    }
    const receipt = await postReceipt(fetchImpl, item, { outcome: 'task_created', recordRef: { table: 'tasks', id: taskId } });
    setBusy(false);
    if (!receipt.ok) {
      setError(`할 일은 만들었지만 이 카드를 숨기지 못했습니다 — ${receipt.message} 다시 누르면 영수증만 다시 남깁니다.`);
      return;
    }
    onFinished?.({ outcome: 'task_created', message: `할 일을 만들었습니다 · ${title}` });
  }

  return (
    <form className="ci-panel" onSubmit={submit} aria-label="할 일로 만들기">
      <div className="ci-panel__row">
        <TextField label="할 일" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} fieldStyle={{ flex: '1 1 240px' }} disabled={Boolean(createdTaskId)} autoFocus />
        <TextField label="언제까지" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} fieldStyle={{ flex: '0 0 160px' }} disabled={Boolean(createdTaskId)} />
      </div>
      <PanelError message={error} />
      <div className="ci-panel__actions">
        <button type="submit" className="fx-pill-btn fx-pill-btn--primary" disabled={busy || !title.trim()}>
          {busy ? '저장 중…' : createdTaskId ? '영수증 다시 남기기' : '할 일 만들기'}
        </button>
      </div>
    </form>
  );
}

function ReschedulePanel({ item, onFinished, fetchImpl }) {
  const [at, setAt] = React.useState(dayAfter(todayKey(), 1));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const saved = await rescheduleItem(fetchImpl, item, { at });
    if (!saved.ok) { setBusy(false); setError(saved.message); return; }
    // 날짜는 이미 대상에 저장됐다 — 영수증 실패는 카드를 남기지 않는다(대상이 바뀌어 규칙이 잡지 않음).
    const receipt = await postReceipt(fetchImpl, item, { outcome: 'rescheduled', recordRef: { table: `${item.subject.type}s`.replace('accounts', 'customer_accounts'), id: item.subject.id } });
    setBusy(false);
    onFinished?.({ outcome: 'rescheduled', message: `다음 연락일 · ${formatDayLabel(at)}`, receiptMissing: !receipt.ok });
  }

  return (
    <form className="ci-panel" onSubmit={submit} aria-label="날짜 다시 정하기">
      <div className="ci-panel__row">
        <TextField label="다음 연락일" type="date" value={at} min={todayKey()} onChange={(e) => setAt(e.target.value)} fieldStyle={{ flex: '0 0 200px' }} autoFocus />
      </div>
      <PanelError message={error} />
      <div className="ci-panel__actions">
        <button type="submit" className="fx-pill-btn fx-pill-btn--primary" disabled={busy || !at}>{busy ? '저장 중…' : `${at ? formatDayLabel(at) : ''}로 정하기`}</button>
      </div>
    </form>
  );
}

function SnoozePanel({ item, onFinished, fetchImpl }) {
  const presets = React.useMemo(() => snoozePresets(), []);
  const today = todayKey();
  const [until, setUntil] = React.useState(presets[0]?.until || dayAfter(today, 1));
  const [picking, setPicking] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const subject = await snoozeSubject(fetchImpl, item, { until });
    if (!subject.ok) { setBusy(false); setError(subject.message); return; }
    const receipt = await postReceipt(fetchImpl, item, { outcome: 'snoozed', snoozedUntil: until, note });
    setBusy(false);
    // 고객·거래·리드는 대상 쪽 보류가 정본이라 영수증 실패에도 숨겨진다. 그 밖은 영수증이 곧 보류다.
    if (!receipt.ok && subject.status === 'skipped') { setError(receipt.message); return; }
    onFinished?.({ outcome: 'snoozed', message: `${formatDayLabel(until)}에 다시 보여 드립니다`, receiptMissing: !receipt.ok });
  }

  return (
    <form className="ci-panel" onSubmit={submit} aria-label="보류 · 다시 볼 날">
      <div className="fx-eyebrow">언제 다시 볼까요</div>
      <div className="ci-presets" role="group" aria-label="다시 볼 날">
        {presets.map((preset) => (
          <button key={preset.key} type="button" className="ci-preset" aria-pressed={!picking && until === preset.until} onClick={() => { setPicking(false); setUntil(preset.until); }}>
            {preset.label}<small>{preset.sub}</small>
          </button>
        ))}
        <button type="button" className="ci-preset" aria-pressed={picking} onClick={() => setPicking(true)}>
          날짜 고르기<small>최대 {MAX_SNOOZE_DAYS}일</small>
        </button>
      </div>
      <div className="ci-panel__row">
        {picking ? (
          <TextField label="다시 볼 날" type="date" value={until} min={dayAfter(today, 1)} max={dayAfter(today, MAX_SNOOZE_DAYS)} onChange={(e) => setUntil(e.target.value)} fieldStyle={{ flex: '0 0 200px' }} />
        ) : null}
        <TextField label="이유 (선택)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} fieldStyle={{ flex: '1 1 240px' }} />
      </div>
      <PanelError message={error} />
      <div className="ci-panel__actions">
        <button type="submit" className="fx-pill-btn fx-pill-btn--primary" disabled={busy || !until}>{busy ? '저장 중…' : `${formatDayLabel(until)}에 다시 보기`}</button>
      </div>
    </form>
  );
}

// ── 카드 ─────────────────────────────────────────────────────────
export function FocusCard({
  item,
  nextItem = null,
  panel,
  onPanel,
  onActivate,
  onFinished,
  onSkip,
  onNavigate,
  onScheduled,
  calendar = null,
  blocks = [],
  recommendation = null,
  fetchImpl = globalThis.fetch,
}) {
  if (!item) return null;
  const urgent = item.tone === 'danger';
  const outcomes = Array.isArray(item.outcomes) ? item.outcomes : [];
  const links = Array.isArray(item.links) ? item.links : [];
  const panelOpen = PANEL_KEYS.has(panel);
  const scheduleOpen = panel === 'schedule';
  const returned = item.returnedFromSnooze;
  // 잡아 둔 시간이 지났으면 `다시 잡기`가 1순위다(Q-CF11 — 자동으로 옮기지 않는다). 고르기 칸이 열려도
  // 그 칸의 확정 버튼이 화면의 유일한 primary다(§5.2).
  const schedulePassed = item.scheduled?.state === 'passed';
  const outcomeLeads = !panelOpen && !scheduleOpen && !schedulePassed;

  const renderPanel = (key) => {
    const props = { item, onFinished, fetchImpl };
    if (key === 'task') return <TaskPanel key={`task-${item.signalKey}`} {...props} />;
    if (key === 'reschedule') return <ReschedulePanel key={`reschedule-${item.signalKey}`} {...props} />;
    if (key === 'snooze') return <SnoozePanel key={`snooze-${item.signalKey}`} {...props} />;
    return null;
  };

  return (
    <section aria-label="지금 볼 항목" className="fx-card ci-card">
      <div className="fx-card-meta">
        <span>
          <span data-urgent={urgent ? 'true' : undefined}>{item.kindLabel || item.kind}</span>
          {item.meta ? ` · ${item.meta}` : ''}
        </span>
      </div>
      <ScheduledNowBand scheduled={item.scheduled} />
      {returned ? (
        <span className="ci-flag"><Iconed name="pause" size={12} />보류했던 것 · {formatDayLabel(returned.until)}에 다시</span>
      ) : null}
      {item.stillFlagged ? (
        <p className="ci-note">오늘 기록은 남았지만 규칙이 여전히 이 항목을 잡아 다시 보여 드립니다.</p>
      ) : null}
      <h3 className="fx-card-title">{item.title}</h3>
      {item.summary ? <p className="fx-card-body">{item.summary}</p> : null}
      {recommendation}

      {outcomes.length ? (
        <>
          <div className="fx-eyebrow" style={{ marginTop: 24 }}>어떻게 끝낼까요</div>
          <div className="ci-outcomes">
            {outcomes.map((outcome, index) => {
              const isPanel = outcomeIsPanel(outcome);
              const primary = outcome.primary && outcomeLeads;
              return (
                <React.Fragment key={outcome.key}>
                  <button
                    type="button"
                    className={`ci-outcome${primary ? ' ci-outcome--primary' : ''}`}
                    aria-expanded={isPanel ? panel === outcome.key : undefined}
                    onClick={() => onActivate?.(index)}
                  >
                    <Kbd>{index + 1}</Kbd>
                    <span className="ci-outcome__label">
                      {outcome.label}
                      {outcome.kind === 'navigate' ? <Iconed name="arrowRight" size={12} /> : null}
                    </span>
                    <span className="ci-outcome__record">
                      {outcome.kind === 'write' ? `남는 기록 · ${outcome.record}` : '화면을 엽니다 · 대상이 바뀌면 빠집니다'}
                    </span>
                  </button>
                  {isPanel && panel === outcome.key ? renderPanel(outcome.key) : null}
                </React.Fragment>
              );
            })}
          </div>
        </>
      ) : null}

      {item.signalKey && item.schedule ? (
        <ScheduleBand
          key={`band-${item.signalKey}`}
          item={item}
          calendar={calendar}
          blocks={blocks}
          open={scheduleOpen}
          onToggle={() => onPanel?.(scheduleOpen ? null : 'schedule')}
          onScheduled={onScheduled}
          emphasize={schedulePassed}
          fetchImpl={fetchImpl}
        />
      ) : null}

      {links.length ? (
        <div className="ci-links">
          <span style={{ marginRight: 6 }}>그 밖에</span>
          {links.map((link) => (
            <button key={link.label} type="button" className="fx-pill-btn fx-pill-btn--ghost" onClick={() => onNavigate?.(withEntityRef(SIGNAL_TARGETS[link.action], item.source))}>
              {link.label} <Iconed name="arrowRight" size={11} />
            </button>
          ))}
        </div>
      ) : null}

      <div className="ci-card-foot">
        <button type="button" className="fx-pill-btn fx-pill-btn--ghost" onClick={onSkip}>
          <Kbd>J</Kbd> 건너뛰기 — 끝내지 않고 다음으로
        </button>
        {nextItem ? <span>다음 · {nextItem.title}</span> : null}
      </div>
    </section>
  );
}

// ── 차례 ─────────────────────────────────────────────────────────
// 건너뛴 카드는 이번 차례 끝으로 간다(§3 건너뛰기). `이전`은 마지막으로 건너뛴 카드를 맨 앞으로 되돌린다.
// 저장 중인 카드는 다시 읽기 전까지 잠시 감춘다. 오늘 이미 끝낸 기록이 있는데 규칙이 여전히 잡는 카드는
// `stillFlagged`로 표시해 새 카드들 뒤에 둔다 — 숨기지는 않는다(§4.4 규칙 5).
const keyOf = (item) => item?.signalKey || item?.id;

export function useCheckItemDeck(items, { finishedKeys = new Set() } = {}) {
  const [skipped, setSkipped] = React.useState([]);
  const [pinned, setPinned] = React.useState(null);
  const [pending, setPending] = React.useState(() => new Set());

  const deck = React.useMemo(() => {
    const list = (Array.isArray(items) ? items : [])
      .filter((item) => !pending.has(keyOf(item)))
      .map((item) => (item.signalKey && finishedKeys.has(item.signalKey) ? { ...item, stillFlagged: true } : item));
    const front = pinned ? list.filter((item) => keyOf(item) === pinned) : [];
    const rest = list.filter((item) => keyOf(item) !== pinned);
    const fresh = rest.filter((item) => !item.stillFlagged && !skipped.includes(keyOf(item)));
    const later = rest.filter((item) => item.stillFlagged && !skipped.includes(keyOf(item)));
    const skippedItems = skipped.map((k) => rest.find((item) => keyOf(item) === k)).filter(Boolean);
    return [...front, ...fresh, ...later, ...skippedItems];
  }, [items, skipped, pinned, pending, finishedKeys]);

  const current = deck[0] || null;
  const next = deck[1] || null;

  const skip = React.useCallback(() => {
    const key = keyOf(current);
    if (!key || deck.length < 2) return;
    if (pinned === key) setPinned(null);
    setSkipped((prev) => [...prev.filter((k) => k !== key), key]);
  }, [current, deck.length, pinned]);

  const previous = React.useCallback(() => {
    if (!skipped.length) return;
    setPinned(skipped[skipped.length - 1]);
    setSkipped(skipped.slice(0, -1));
  }, [skipped]);

  const markPending = React.useCallback((key) => setPending((prev) => new Set(prev).add(key)), []);
  const clearPending = React.useCallback(() => setPending(new Set()), []);

  return { deck, current, next, skip, previous, markPending, clearPending };
}
