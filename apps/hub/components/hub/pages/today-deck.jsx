"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import { Button, IconButton, Skeleton, TruthBadge, useToast } from "../hub-primitives";
import { DailyReviewCue } from "../daily-review-cue";
import { useUndoableAction } from "../use-undoable-action";
import { dateKeyInZone, isDurableTaskUpdateResult, MAX_FOCUS_PER_DAY } from "@/lib/task-today";
import { shiftDateKey } from "@/lib/rhythm-calendar";
import { REVIEW_EVENING_HOUR } from "@/lib/daily-review-rhythm";
import { buildTodayDeck, DAY_END, DAY_START, dayPos, durationLabel, hm, MORNING_END_HOUR } from "./today-deck-model";
import "./today-deck.css";

const FOCUS_SECONDS = 15 * 60;

// 오늘 13a "하루 시계 위에 세 자리"(2026-10-21 운영자 확정). 아침에 고르고 · 낮에 하고 · 저녁에 닫는다.
// 세 자리는 오늘 3개(tasks.meta.focus_dates)이고, 시간대는 기기 시계가 정한다. 새 저장소 없이
// 할 일·캘린더 원장만 다시 배치한다. 시간 칩(자리를 빈 시간에 놓기)은 저장할 곳이 없어 넣지 않았다.

// 1분마다(창으로 돌아올 때도) 다시 그린다 — 시간대 전환과 지금 선이 같은 시계를 본다.
function useMinuteClock() {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, 60_000);
    window.addEventListener("focus", tick);
    return () => { window.clearInterval(id); window.removeEventListener("focus", tick); };
  }, []);
  return now;
}

const dateLabel = (now) => new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short" }).format(now);

export function TodayHeadline({ taskToday, agenda }) {
  const now = useMinuteClock();
  const deck = buildTodayDeck({ taskToday, agenda, now });
  return (
    <>
      <div className="today-deck__date">오늘 · {dateLabel(now)} · <span className="mono">{hm(deck.minute)}</span></div>
      <h2 className="today-deck__title">{deck.headline}</h2>
    </>
  );
}

const PHASES = [
  ["morning", DAY_START, MORNING_END_HOUR * 60, "아침 · 고르기"],
  ["day", MORNING_END_HOUR * 60, REVIEW_EVENING_HOUR * 60, "낮 · 하기"],
  ["evening", REVIEW_EVENING_HOUR * 60, DAY_END, "저녁 · 닫기"],
];

export function DayStrip({ agenda }) {
  const now = useMinuteClock();
  const deck = buildTodayDeck({ agenda, now });
  const shown = deck.events.filter((event) => event.e > DAY_START && event.s < DAY_END);
  const summary = deck.agendaReadable ? `일정 ${shown.length}개${agenda.state === "partial" ? " · 일부만 확인" : ""}` : "일정 확인 안 됨";
  return (
    <div className="today-strip" role="img" aria-label={`하루 띠 07–21시 · 지금 ${hm(deck.minute)} · ${summary}`}>
      <div className="today-strip__track"><i style={{ width: `${dayPos(deck.minute)}%` }} /></div>
      {PHASES.map(([key, s, e, label]) => (
        <span key={key} className="today-strip__phase" data-on={key === deck.mode || undefined} style={{ left: `${dayPos(s)}%`, width: `${dayPos(e) - dayPos(s)}%` }}>{label}</span>
      ))}
      {shown.map((event) => (
        <span key={event.id} className="today-strip__ev" data-past={event.e <= deck.minute || undefined}
          style={{ left: `${dayPos(event.s)}%`, width: `calc(${dayPos(event.e) - dayPos(event.s)}% - 2px)` }} title={`${hm(event.s)} ${event.title}`} />
      ))}
      <span className="today-strip__now" style={{ left: `${dayPos(deck.minute)}%` }}><b className="mono">{hm(deck.minute)}</b></span>
    </div>
  );
}

async function patchTask(body) {
  const response = await fetch("/api/hub/tasks", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !isDurableTaskUpdateResult(data)) throw new Error(data.error || data.status || `저장 실패 (${response.status})`);
}

const fmtLeft = (sec) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;

export function TodaySlots({ taskToday, onChanged }) {
  const now = useMinuteClock();
  const toast = useToast();
  const { schedule, cancel } = useUndoableAction();
  const deck = buildTodayDeck({ taskToday, now });
  // 완료는 3.5초 되돌리기 창이 닫힌 뒤에만 저장한다(오늘 할 일 목록과 같은 계약). 창 동안은 끝낸 자리로 보인다.
  const [doneIds, setDoneIds] = React.useState(() => new Set());
  const [busyId, setBusyId] = React.useState(null);
  const [timer, setTimer] = React.useState(null); // { id, endsAt }
  const [, setTick] = React.useState(0);

  React.useEffect(() => {
    if (!timer) return undefined;
    const id = window.setInterval(() => {
      if (Date.now() >= timer.endsAt) {
        window.clearInterval(id);
        setTimer(null);
        toast.info("15분 지났어요 — 끝냈으면 끝을 눌러 주세요");
      } else setTick((n) => n + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [timer, toast]);

  const tomorrowKey = shiftDateKey(dateKeyInZone(now), 1);
  const state = taskToday?.state;
  if (["loading", "syncing"].includes(state)) {
    return <div className="today-slots" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="today-slot"><Skeleton lines={3} label="오늘 3개 확인 중" /></div>)}</div>;
  }
  if (!["live", "partial"].includes(state)) {
    // 읽지 못한 오늘 3개를 빈 자리로 그리지 않는다 — 아래 할 일 목록이 원인과 다시 읽기를 말한다.
    return (
      <div className="today-slots today-slots--unknown" role="status">
        <TruthBadge state={state === "preview" ? "preview" : "error"} />
        <span>{state === "preview" ? "할 일 기록이 연결되면 오늘 3개가 여기 놓입니다." : "오늘 3개를 읽지 못했습니다 — 비어 보여도 고른 일이 있을 수 있습니다."}</span>
      </div>
    );
  }

  const open = deck.focusOpen.filter((task) => !doneIds.has(task.id));
  const localDone = deck.focusOpen.filter((task) => doneIds.has(task.id));
  const serverDone = deck.done ?? 0;
  const slots = [
    ...open.map((task) => ({ task })),
    ...localDone.map((task) => ({ task, done: true })),
    ...Array.from({ length: serverDone }, () => ({ done: true })),
  ].slice(0, MAX_FOCUS_PER_DAY);
  const anyPicked = slots.length > 0;
  while (slots.length < MAX_FOCUS_PER_DAY) slots.push(null);

  function complete(task) {
    setDoneIds((ids) => new Set(ids).add(task.id));
    if (timer?.id === task.id) setTimer(null);
    toast.success(`끝냄 · ${task.title}`, { action: { label: "되돌리기", onClick: () => undo(task) } });
    schedule(task.id, async () => {
      try {
        await patchTask({ id: task.id, status: "done" });
        onChanged?.();
      } catch (error) {
        setDoneIds((ids) => { const next = new Set(ids); next.delete(task.id); return next; });
        toast.error(`끝냄을 저장하지 못했습니다 · ${task.title} — ${error.message}`);
      }
    });
  }
  function undo(task) {
    if (!cancel(task.id)) return;
    setDoneIds((ids) => { const next = new Set(ids); next.delete(task.id); return next; });
  }
  async function run(task, body, message) {
    setBusyId(task.id);
    try {
      await patchTask({ id: task.id, ...body });
      toast.success(message);
      onChanged?.();
    } catch (error) {
      toast.error(`${task.title} — ${error.message}`);
    } finally {
      setBusyId(null);
    }
  }
  const release = (task) => run(task, { focus: { on: false } }, `오늘 3개에서 뺐습니다 · ${task.title}`);
  const carry = (task) => run(task, { dueAt: tomorrowKey }, `내일로 넘김 · ${task.title} — 내일 오늘 할 일에 올라옵니다`);

  return (
    <div className="today-slots" role="group" aria-label="오늘 3개">
      {slots.map((slot, index) => {
        const n = <span className="today-slot__n mono">{index + 1}</span>;
        if (!slot) {
          return (
            <div key={`empty-${index}`} className="today-slot today-slot--empty">
              {n}
              <span className="today-slot__empty">비어 있음</span>
              <span className="today-slot__meta">{deck.mode === "morning" || !anyPicked ? "아래 할 일에서 ★로 고르세요" : "오늘은 두 개로도 충분합니다"}</span>
            </div>
          );
        }
        if (!slot.task) {
          return (
            <div key={`done-${index}`} className="today-slot today-slot--done">
              <div className="today-slot__top">{n}<span className="today-slot__chip">할 일</span></div>
              <span className="today-slot__title">끝낸 자리</span>
              <span className="today-slot__push" />
              <span className="today-slot__state"><Iconed name="check" size={15} />끝냄</span>
            </div>
          );
        }
        const { task } = slot;
        const dueKey = dateKeyInZone(task.dueAt);
        const overdue = Boolean(dueKey) && dueKey < dateKeyInZone(now) && !slot.done;
        const carried = dueKey === tomorrowKey;
        const running = timer?.id === task.id && !slot.done;
        const hasDue = task.due && task.due !== "미정";
        const meta = [task.projectName, hasDue ? `기한 ${task.due}${overdue ? " 지남" : ""}` : overdue ? "기한 지남" : null].filter(Boolean).join(" · ");
        const busy = busyId === task.id;
        let foot;
        if (slot.done) {
          foot = <span className="today-slot__state"><Iconed name="check" size={15} />끝냄<Button variant="ghost" size="xs" onClick={() => undo(task)}>되돌리기</Button></span>;
        } else if (deck.mode === "evening") {
          foot = carried
            ? <span className="today-slot__state"><Iconed name="arrowRight" size={14} />내일로 넘김</span>
            : <div className="today-slot__actions">
              <Button variant="secondary" size="sm" icon="arrowRight" disabled={busy} onClick={() => carry(task)}>내일로</Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => release(task)}>놓아주기</Button>
              <Button variant="ghost" size="sm" icon="check" disabled={busy} onClick={() => complete(task)}>끝</Button>
            </div>;
        } else if (running) {
          foot = <div className="today-slot__actions">
            <span className="today-slot__timer stat" aria-live="off">{fmtLeft(Math.max(0, Math.round((timer.endsAt - Date.now()) / 1000)))}</span>
            <span className="today-slot__meta">집중 중</span>
            <span className="today-slot__push" />
            <Button variant="secondary" size="sm" icon="pause" onClick={() => setTimer(null)}>멈춤</Button>
            <Button variant="primary" size="sm" icon="check" onClick={() => complete(task)}>끝</Button>
          </div>;
        } else {
          foot = <div className="today-slot__actions">
            {carried && <span className="today-slot__meta">내일로 넘김</span>}
            <span className="today-slot__push" />
            <Button variant="secondary" size="sm" icon="play" onClick={() => setTimer({ id: task.id, endsAt: Date.now() + FOCUS_SECONDS * 1000 })}>15분</Button>
            <Button variant="secondary" size="sm" icon="check" onClick={() => complete(task)}>끝</Button>
          </div>;
        }
        return (
          <article key={task.id} className="today-slot" data-running={running || undefined} data-done={slot.done || undefined} data-urgent={overdue || undefined} aria-label={`${index + 1}번 자리 · ${task.title}`}>
            <div className="today-slot__top">
              {n}
              <span className="today-slot__chip">할 일</span>
              <span className="today-slot__push" />
              {deck.mode === "morning" && !slot.done && <IconButton icon="x" size={32} iconSize={13} tooltip={`${task.title} 오늘 3개에서 빼기`} disabled={busy} onClick={() => release(task)} />}
            </div>
            <span className="today-slot__title">{task.title}</span>
            {meta && <span className="today-slot__meta" data-urgent={overdue || undefined}>{overdue && <Iconed name="alert" size={11} />}{meta}</span>}
            <span className="today-slot__push" />
            {foot}
          </article>
        );
      })}
    </div>
  );
}

// 시간대에 맞는 보조 칸 하나 — 아침 빈 시간 · 낮 지금/다음 일정 · 저녁 하루 리뷰.
export function TodayModePanel({ taskToday, agenda, onNavigate }) {
  const now = useMinuteClock();
  const deck = buildTodayDeck({ taskToday, agenda, now });
  const openCalendar = () => onNavigate?.("dashboard/work/calendar");
  const agendaTruth = !deck.agendaReadable
    ? <p className="today-panel__empty">{agenda?.state === "preview" ? "캘린더를 연결하면 일정 사이 빈 시간을 보여 줍니다." : agenda?.state === "loading" || !agenda ? "일정 확인 중" : "캘린더를 읽지 못했습니다 — 일정이 있어도 보이지 않습니다."}</p>
    : null;
  const badge = deck.agendaReadable && agenda.state === "partial" ? <TruthBadge state="partial" label="일부 확인" />
    : !deck.agendaReadable && agenda ? <TruthBadge state={agenda.state === "preview" ? "preview" : agenda.state === "loading" ? "loading" : "error"} /> : null;

  if (deck.mode === "evening") {
    const tomorrowKey = shiftDateKey(dateKeyInZone(now), 1);
    const carried = deck.focusOpen.filter((task) => dateKeyInZone(task.dueAt) === tomorrowKey);
    return (
      <section className="today-panel" aria-label="하루 리뷰">
        <div className="today-panel__head"><h3>하루 리뷰 · 1분</h3></div>
        <DailyReviewCue />
        <Button variant="ghost" size="sm" iconRight="arrowRight" onClick={() => onNavigate?.("dashboard/work/daily-review")}>하루 리뷰 열기</Button>
        <div className="today-panel__head"><h3>내일로 넘긴 것</h3><span className="mono">{carried.length}</span></div>
        {carried.length
          ? <ul className="today-panel__list">{carried.map((task) => <li key={task.id}><Iconed name="arrowRight" size={13} />{task.title}</li>)}</ul>
          : <p className="today-panel__empty">끝내지 못한 자리에서 "내일로"를 고르면 내일 오늘 할 일에 올라옵니다.</p>}
      </section>
    );
  }

  if (deck.mode === "day") {
    const event = deck.current || deck.next;
    const ended = deck.events.filter((item) => item.endKnown && item.e <= deck.minute);
    return (
      <section className="today-panel" aria-label="지금 일정">
        <div className="today-panel__head">
          {event ? (deck.current
            ? <span className="today-panel__chip" data-ink><Iconed name="clock" size={12} />진행 중</span>
            : <span className="today-panel__chip">다음 일정</span>) : <h3>오늘 일정</h3>}
          {event && <span className="mono">{hm(event.s)}{event.endKnown ? ` – ${hm(event.e)}` : ""}</span>}
          <span className="today-slot__push" />
          {badge}
          <Button variant="ghost" size="xs" onClick={openCalendar}>캘린더 열기</Button>
        </div>
        {agendaTruth || (event ? <>
          <p className="today-panel__event">{event.title}</p>
          {!deck.current && <p className="today-panel__meta">{durationLabel(event.s - deck.minute)} 뒤</p>}
        </> : <p className="today-panel__empty">{agenda.state === "partial" ? "읽힌 일정 중 남은 것이 없습니다." : "남은 일정이 없습니다."}</p>)}
        {ended.length > 0 && <p className="today-panel__meta">끝난 일정 {ended.length} · {ended.map((item) => item.title).join(" · ")}</p>}
      </section>
    );
  }

  // 이미 지난 앞부분은 잘라 내고, 남은 길이가 30분 미만이면 빼낸다.
  const nowGaps = deck.gaps.map((gap) => ({ s: Math.max(gap.s, deck.minute), e: gap.e })).filter((gap) => gap.e - gap.s >= 30);
  return (
    <section className="today-panel" aria-label="오늘의 빈 시간">
      <div className="today-panel__head"><h3>오늘의 빈 시간</h3><span>일정 사이 · 09–18시</span><span className="today-slot__push" />{badge}</div>
      {agendaTruth || (nowGaps.length
        ? <ul className="today-panel__gaps">{nowGaps.map((gap) => (
          <li key={gap.s}><span className="mono">{hm(gap.s)}–{hm(gap.e)}</span><span>{durationLabel(gap.e - gap.s)}</span></li>
        ))}</ul>
        : <p className="today-panel__empty">{agenda.state === "partial" ? "읽힌 일정 기준으로 30분 넘는 빈 시간이 없습니다." : "오늘은 30분 넘게 빈 시간이 없습니다."}</p>)}
      <p className="today-panel__meta">세 자리를 이 사이에 하나씩 넣어 보세요.</p>
    </section>
  );
}
