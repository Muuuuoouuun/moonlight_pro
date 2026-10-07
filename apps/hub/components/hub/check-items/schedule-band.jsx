"use client";

// 확인할 것 — 시간 잡기(docs/superpowers/specs/2026-09-30-check-items-finish-and-unblock-design.md §4.7·§7.1).
//
// 지금 못 끝내는 카드를 언제 할지 정한다. 끝냄이 아니다. 권장 시간은 캘린더를 읽었을 때만 계산하고
// (빈 시간을 지어내지 않는다), 운영자가 `잡기`를 누르기 전에는 아무것도 저장하지 않는다.

import React from 'react';
import { useCheckWrite } from '../use-check-write';
import { Iconed } from '../hub-icons';
import { CertaintyBadge, CheckboxRow, Kbd, TextField, TruthBadge } from '../hub-primitives';
import { DURATION_CHOICES, formatSlot, kstDayKeyOf, kstMs, suggestSlots } from '@/lib/check-items/slots';
import { scheduleMinutesFor } from '@/lib/check-items/catalog';
import {
  CHECK_CALENDAR_BLOCKED,
  cancelScheduled,
  dayAfter,
  moveScheduled,
  rememberMinutes,
  rememberedMinutes,
  scheduleItem,
  todayKey,
} from './check-item-actions';

const READABLE = new Set(['live', 'partial']);
const MINUTE = 60 * 1000;

const durationLabel = (minutes) => (minutes === 60 ? '1시간' : `${minutes}분`);

function calendarNotice(status) {
  if (status === 'loading') return { state: 'loading', reason: '일정을 읽는 중 — 권장 시간은 읽은 뒤에 보입니다' };
  if (status === 'preview') return { state: 'preview', reason: '캘린더 연결 필요 — 빈 시간을 모르니 직접 골라 주세요' };
  return { state: 'error', reason: '일정을 읽지 못했습니다 — 빈 시간을 모르니 직접 골라 주세요' };
}

/**
 * 권장 시간 — 캘린더를 읽었을 때만. 못 읽었으면 null(직접 고르기만). 렌더마다 지금 시각으로 다시 센다
 * (일정 수십 건이라 가볍다) — 화면을 오래 열어 두어도 지난 시간을 권하지 않게.
 */
export function slotSuggestions({ calendar, blocks = [], minutes, ignoreBlockId = null, now = Date.now() }) {
  if (!READABLE.has(calendar?.status)) return null;
  const busy = (Array.isArray(blocks) ? blocks : []).filter((block) => block.id !== ignoreBlockId && !block.done);
  return suggestSlots({ events: calendar.events, blocks: busy, minutes, now });
}

const slotPassed = (slot) => !slot || Date.parse(slot.start) <= Date.now();

function PanelError({ message, children }) {
  if (!message) return null;
  return (
    <div className="ci-error" role="alert">
      <Iconed name="x" size={14} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 2 }} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {message}
        {children}
      </span>
    </div>
  );
}

// ── 고르기 칸 ────────────────────────────────────────────────────
// mode: 'create'(새로 잡기 — 구글에도 넣기 선택) · 'move'(레일의 다른 시간 — 구글 일정이 있으면 같이 옮김)
export function SchedulePicker({
  subjectType,
  defaultMinutes,
  calendar,
  blocks = [],
  ignoreBlockId = null,
  mode = 'create',
  hasCalendarEvent = false,
  busy = false,
  error = '',
  errorActions = null,
  onConfirm,
  label = '시간 고르기',
}) {
  const [minutes, setMinutes] = React.useState(() => rememberedMinutes(subjectType, defaultMinutes || scheduleMinutesFor(subjectType)));
  const [choice, setChoice] = React.useState(0);
  const today = todayKey();
  const [manualDay, setManualDay] = React.useState(today);
  const [manualTime, setManualTime] = React.useState('');
  const writable = false; // Only this new check-items provider creation path is blocked.
  const [addToCalendar, setAddToCalendar] = React.useState(writable);
  React.useEffect(() => { setAddToCalendar(writable); }, [writable]);

  const suggestions = slotSuggestions({ calendar, blocks, minutes, ignoreBlockId });
  const options = suggestions?.options || [];
  const manual = choice === 'manual' || !options.length;

  const manualSlot = React.useMemo(() => {
    const match = /^(\d{2}):(\d{2})$/.exec(manualTime);
    if (!manualDay || !match) return null;
    const start = kstMs(manualDay, Number(match[1]) * 60 + Number(match[2]));
    if (!Number.isFinite(start) || start <= Date.now()) return null;
    return { start: new Date(start).toISOString(), end: new Date(start + minutes * MINUTE).toISOString(), dayKey: kstDayKeyOf(start) };
  }, [manualDay, manualTime, minutes]);

  const selected = manual ? manualSlot : options[Number(choice)] || options[0] || null;

  function pickMinutes(value) {
    setMinutes(value);
    rememberMinutes(subjectType, value);
  }

  function submit(event) {
    event.preventDefault();
    if (!selected || busy) return;
    onConfirm?.(selected, { addToCalendar: mode === 'create' && writable && addToCalendar, minutes });
  }

  const optionLabel = (slot, index) => (index === 0 ? '권장' : slot.isToday ? '그다음 빈 시간' : '다음 근무일 첫 빈 시간');

  return (
    <form className="ci-panel" onSubmit={submit} aria-label={label}>
      {suggestions ? (
        <div className="ci-band__head">
          <CertaintyBadge state="recommended" label="권장 시간" />
          <span>일정과 잡아 둔 일 사이의 빈 시간 · 근무 시간 09–19시</span>
        </div>
      ) : (
        <TruthBadge state={calendarNotice(calendar?.status).state} reason={calendarNotice(calendar?.status).reason} />
      )}
      {suggestions?.noRoomToday ? <p className="ci-note">오늘은 빈 시간이 없습니다 — 다음 근무일을 권합니다.</p> : null}

      <div className="ci-presets" role="group" aria-label="언제">
        {options.map((slot, index) => (
          <button key={slot.start} type="button" className="ci-preset" aria-pressed={!manual && Number(choice) === index} onClick={() => setChoice(index)}>
            <span className="mono">{formatSlot(slot)}</span><small>{optionLabel(slot, index)}</small>
          </button>
        ))}
        <button type="button" className="ci-preset" aria-pressed={manual} onClick={() => setChoice('manual')}>
          직접 고르기<small>날짜와 시작 시각</small>
        </button>
      </div>

      {manual ? (
        <div className="ci-panel__row">
          <TextField label="날짜" type="date" value={manualDay} min={today} max={dayAfter(today, 30)} onChange={(e) => setManualDay(e.target.value)} fieldStyle={{ flex: '0 0 180px' }} />
          <TextField label="시작" type="time" step={300} value={manualTime} onChange={(e) => setManualTime(e.target.value)} fieldStyle={{ flex: '0 0 140px' }} />
        </div>
      ) : null}

      <div>
        <div className="fx-eyebrow" style={{ marginBottom: 8 }}>얼마나</div>
        <div className="ci-presets ci-presets--compact" role="group" aria-label="소요 시간">
          {DURATION_CHOICES.map((value) => (
            <button key={value} type="button" className="ci-preset" aria-pressed={minutes === value} onClick={() => pickMinutes(value)}>
              {durationLabel(value)}
            </button>
          ))}
        </div>
      </div>

      {mode === 'create' ? (
        writable ? (
          <CheckboxRow checked={addToCalendar} onChange={setAddToCalendar} text="구글 캘린더에도 넣기" />
        ) : (
          <p className="ci-note" role="status">Moonlight에만 잡힙니다 — {CHECK_CALENDAR_BLOCKED}</p>
        )
      ) : hasCalendarEvent ? (
        <p className="ci-note">구글 캘린더 일정도 같은 시간으로 옮깁니다.</p>
      ) : null}

      <PanelError message={error}>{errorActions}</PanelError>
      <div className="ci-panel__actions">
        <button type="submit" className="fx-pill-btn fx-pill-btn--primary" disabled={busy || !selected}>
          {busy ? '저장 중…' : selected ? `${formatSlot(selected)}${mode === 'move' ? '로 옮기기' : '에 잡기'}` : manual ? '시작 시각을 골라 주세요' : '시간을 골라 주세요'}
        </button>
      </div>
    </form>
  );
}

// ── 카드의 시간 잡기 띠 ─────────────────────────────────────────
// 접힌 띠: 권장 시간 한 줄 + `잡기`(권장 시간 그대로) + `다른 시간`(고르기 칸). `T`도 고르기 칸을 연다.
export function ScheduleBand({ item, calendar, blocks = [], open = false, onToggle, onScheduled, emphasize = false, fetchImpl = globalThis.fetch }) {
  const subjectType = item?.subject?.type;
  const minutes = rememberedMinutes(subjectType, item?.schedule?.minutes || scheduleMinutesFor(subjectType));
  const suggestions = slotSuggestions({ calendar, blocks, minutes });
  const recommended = suggestions?.recommended || null;
  const { run, busy } = useCheckWrite(`schedule:${item?.signalKey}`, fetchImpl);
  const [error, setError] = React.useState('');
  const [failedSlot, setFailedSlot] = React.useState(null);
  const [restoredSlot, setRestoredSlot] = React.useState(null);

  async function schedule(slot, { addToCalendar = false } = {}) {
    if (busy) return;
    if (!restoredSlot && slotPassed(slot)) { setError('그 시간은 이미 지났습니다 — 다시 골라 주세요.'); return; }
    const submitted = restoredSlot || slot;
    const result = await run({ slot: submitted }, () => ({ receiptId: crypto.randomUUID() }), async (ownedFetch, command) =>
      scheduleItem(ownedFetch, item, { slot: command.input.slot, addToCalendar, requestId: command.ids.receiptId, context: command.context }));
    if (result.stale) return;
    if (result.restore) setRestoredSlot(result.restore.slot);
    if (!result.ok) { setError(result.message); return; }
    onScheduled?.({ slot: submitted, receipt: result.receipt, eventId: result.eventId });
  }

  // 구글 쓰기가 실패하면 조용히 Moonlight에만 잡지 않는다 — 운영자가 둘 중 하나를 고른다(§4.6).
  const errorActions = failedSlot ? (
    <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button type="button" className="fx-pill-btn" onClick={() => schedule(failedSlot, { addToCalendar: true })}>다시 시도</button>
      <button type="button" className="fx-pill-btn fx-pill-btn--ghost" onClick={() => schedule(failedSlot, { addToCalendar: false })}>Moonlight에만 잡기</button>
    </span>
  ) : null;

  const passed = item?.scheduled?.state === 'passed';

  return (
    <div className="ci-band-wrap">
      <div className="ci-band" data-emphasis={emphasize ? 'true' : undefined}>
        <span className="ci-band__lead">
          <Kbd>T</Kbd>
          {passed ? '다시 잡기 — 지난 시간은 자동으로 옮기지 않습니다' : '지금 못 하면 시간 잡기'}
        </span>
        {recommended ? (
          <span className="ci-band__slot">
            <CertaintyBadge state="recommended" label="권장 시간" />
            <span className="mono">{formatSlot(recommended)}</span>
            <span>· {durationLabel(minutes)}</span>
          </span>
        ) : null}
        <span className="ci-band__actions">
          {recommended ? (
            <button
              type="button"
              className={`fx-pill-btn${emphasize && !open ? ' fx-pill-btn--primary' : ''}`}
              disabled={busy}
              onClick={() => schedule(recommended, { addToCalendar: false })}
            >
              {busy && !open ? '잡는 중…' : '잡기'}
            </button>
          ) : null}
          <button type="button" className={`fx-pill-btn${emphasize && !open && !recommended ? ' fx-pill-btn--primary' : ' fx-pill-btn--ghost'}`} aria-expanded={open} onClick={onToggle}>
            {recommended ? '다른 시간' : '시간 고르기'}
          </button>
        </span>
      </div>
      {restoredSlot ? <p className="ci-note">이전 요청 · {formatSlot(restoredSlot)} · 같은 요청으로 확인합니다.</p> : null}
      {!open && error ? <PanelError message={error}>{errorActions}</PanelError> : null}
      {open ? (
        <SchedulePicker
          key={`schedule-${item?.signalKey}`}
          subjectType={subjectType}
          defaultMinutes={item?.schedule?.minutes}
          calendar={calendar}
          blocks={blocks}
          busy={busy}
          error={error}
          errorActions={errorActions}
          onConfirm={schedule}
        />
      ) : null}
    </div>
  );
}

// 잡아 둔 시간이 된 카드의 띠 — 중립, 시계 글리프. 깜빡임·빨강 없음(§5.3).
export function ScheduledNowBand({ scheduled, now = Date.now() }) {
  if (!scheduled) return null;
  const range = formatSlot({ start: scheduled.start, end: scheduled.end || scheduled.start }, now);
  const left = scheduled.end ? Math.max(0, Math.ceil((Date.parse(scheduled.end) - now) / MINUTE)) : null;
  return (
    <span className="ci-flag" role="status">
      <Iconed name="clock" size={12} />
      {scheduled.state === 'passed'
        ? <>잡아 둔 시간이 지났습니다 · <span className="mono">{range}</span></>
        : <>잡아 둔 시간입니다 · <span className="mono">{range}</span>{left !== null ? <> · 남은 <span className="mono">{left}</span>분</> : null}</>}
    </span>
  );
}

// ── 레일: 잡아 둔 일 ────────────────────────────────────────────
const BLOCK_STATE_LABEL = { waiting: '기다림', now: '지금', passed: '지남' };

function ScheduledRow({ block, calendar, blocks, onChanged, onError, fetchImpl }) {
  const [moving, setMoving] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  async function cancel() {
    if (busy) return;
    setBusy(true);
    const result = await cancelScheduled(fetchImpl, block);
    setBusy(false);
    if (!result.ok) { onError?.(result.message); return; }
    onChanged?.(result.message || `취소했습니다 · ${block.title}`, { warn: Boolean(result.message) });
  }

  async function move(slot) {
    if (busy) return;
    if (slotPassed(slot)) { setError('그 시간은 이미 지났습니다 — 다시 골라 주세요.'); return; }
    setBusy(true);
    setError('');
    const result = await moveScheduled(fetchImpl, block, { slot });
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    setMoving(false);
    onChanged?.(result.message || `${formatSlot(slot)}로 옮겼습니다`, { warn: Boolean(result.message) });
  }

  return (
    <li className="ci-block" data-state={block.done ? 'done' : block.state}>
      <Iconed name={block.done ? 'check' : 'clock'} size={14} style={{ color: 'var(--fg-muted)', marginTop: 2 }} />
      <span>
        <span className="ci-block__title">{block.title || '확인할 것'}</span>
        <span className="ci-block__line">
          <span className="mono">{formatSlot({ start: block.start, end: block.end || block.start })}</span>
          {' · '}{block.done ? '끝냄' : BLOCK_STATE_LABEL[block.state] || ''}
          {block.calendarEventId ? ' · 구글 캘린더' : ''}
        </span>
      </span>
      {block.done ? <span /> : (
        <span className="ci-block__actions">
          <button type="button" className="fx-pill-btn fx-pill-btn--ghost" aria-expanded={moving} disabled={busy} onClick={() => setMoving((open) => !open)}>다른 시간</button>
          <button type="button" className="fx-pill-btn fx-pill-btn--ghost" disabled={busy} onClick={cancel}>취소</button>
        </span>
      )}
      {moving ? (
        <div className="ci-block__picker">
          <SchedulePicker
            subjectType={block.subject?.type}
            calendar={calendar}
            blocks={blocks}
            ignoreBlockId={block.id}
            mode="move"
            hasCalendarEvent={Boolean(block.calendarEventId)}
            busy={busy}
            error={error}
            onConfirm={move}
            label={`${block.title} 다른 시간`}
          />
        </div>
      ) : null}
    </li>
  );
}

export function ScheduledList({ blocks = [], calendar, onChanged, onError, fetchImpl = globalThis.fetch }) {
  if (!blocks.length) return null;
  const open = blocks.filter((block) => !block.done).length;
  return (
    <section aria-label="잡아 둔 일" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span className="fx-eyebrow">잡아 둔 일 · {open}</span>
      <ul className="ci-receipts">
        {blocks.map((block) => (
          <ScheduledRow key={block.id} block={block} calendar={calendar} blocks={blocks} onChanged={onChanged} onError={onError} fetchImpl={fetchImpl} />
        ))}
      </ul>
    </section>
  );
}
