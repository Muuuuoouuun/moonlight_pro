"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import { Badge, Button, Card, Checkbox, EmptyState, IconButton } from "../hub-primitives";
import { MAX_FOCUS_PER_DAY } from "@/lib/task-today";
import "./my-work-now.css";

// 내 작업 · 지금 렌즈(시안 E "지금 하나", 2026-10-21 운영자 확정).
// 지금 할 일 하나를 크게 → 다음 순서 → 기한 지남 · 오늘 시간표. 새 데이터 없이 attention 원장의
// 할 일·딜·일정을 다시 배치한다. 완료·미루기·오늘 3개·체크리스트는 목록 렌즈와 같은 처리기를 쓴다.

const timeOf = iso => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
const isAllDay = iso => typeof iso === "string" && !iso.includes("T");
const minutesUntil = (iso, now) => Math.round((Date.parse(iso) - now) / 60000);
const durationLabel = minutes => (minutes >= 60 ? `${Math.floor(minutes / 60)}시간${minutes % 60 ? ` ${minutes % 60}분` : ""}` : `${minutes}분`);

// 화면 머리줄과 본문이 같은 판단을 쓰도록 한 곳에서 고른다.
export function buildNowModel(items, { completingIds, dueBucketOf, now = Date.now() }) {
  const open = items.filter(item => !completingIds.has(item.id));
  const tasks = open.filter(item => item.lane === "task");
  const focus = tasks.filter(item => item.focusToday);
  const byDue = (a, b) => (Date.parse(a.whenAt) || Infinity) - (Date.parse(b.whenAt) || Infinity);
  const today = tasks.filter(item => !item.focusToday && dueBucketOf(item) === "today").sort(byDue);
  const week = tasks.filter(item => !item.focusToday && dueBucketOf(item) === "week").sort(byDue);
  // 오늘 3개 → 오늘 기한 → 이번 주 기한 순으로 "지금 하나"를 고른다. 기한 지남은 오른쪽에 따로 둔다.
  const current = focus[0] || today[0] || week[0] || null;
  const queue = [...focus, ...today, ...week].filter((item, index, list) => item !== current && list.indexOf(item) === index);
  const overdue = open.filter(item => item.lane !== "event" && dueBucketOf(item) === "overdue" && item !== current);
  const events = open
    .filter(item => item.lane === "event" && item.bucket === "today" && item.whenAt)
    .sort((a, b) => Date.parse(a.whenAt) - Date.parse(b.whenAt));
  const upcoming = events.find(item => !isAllDay(item.whenAt) && (Date.parse(item.endAt || item.whenAt) > now));
  return {
    current,
    focusIndex: current?.focusToday ? focus.indexOf(current) + 1 : null,
    currentDue: current ? dueBucketOf(current) : null,
    focusCount: focus.length,
    queue,
    overdue,
    events,
    upcoming,
    minutesToNext: upcoming && Date.parse(upcoming.whenAt) > now ? minutesUntil(upcoming.whenAt, now) : null,
    // 이번 주까지 할 일이 없을 때 여기서 바로 오늘 3개를 고를 수 있게 기한 없는 할 일 몇 개를 보인다.
    pickable: focus.length < 3 ? tasks.filter(item => !item.focusToday && dueBucketOf(item) === "later").slice(0, 3) : [],
    weekCount: tasks.filter(item => dueBucketOf(item) === "week").length,
    laterCount: tasks.filter(item => dueBucketOf(item) === "later").length,
  };
}

function CurrentTask({ item, focusIndex, dueLabel, deferLabel, onComplete, onDefer, onOpen, onToggleChecklist, checklistSaving }) {
  const steps = Array.isArray(item.checklist) ? item.checklist : [];
  const done = steps.filter(step => step.done).length;
  const currentStep = steps.find(step => !step.done);
  const meta = [item.projectName, item.whenLabel].filter(Boolean).join(" · ");
  return (
    <Card className="mwn-current" style={CURRENT_STYLE} aria-label="지금 할 일">
      <div className="mwn-current__top">
        {focusIndex ? <span className="mwn-tag"><Iconed name="star" size={10} />오늘 3개 · {focusIndex}</span> : <span className="mwn-tag">{dueLabel}</span>}
        {meta && <span className="mwn-dim">{meta}</span>}
        {steps.length > 0 && <span className="mwn-dim mwn-push">단계 <span className="mono">{done}/{steps.length}</span></span>}
      </div>
      <h3 className="mwn-current__title">{item.title}</h3>
      {steps.length > 0 && (
        <>
          <div className="mwn-progress" role="img" aria-label={`단계 ${steps.length}개 중 ${done}개 완료`}>
            <i style={{ width: `${(done / steps.length) * 100}%` }} />
          </div>
          <ul className="mwn-steps" aria-busy={checklistSaving ? "true" : undefined}>
            {steps.map(step => (
              <li key={step.id} className={`mwn-step${step === currentStep ? " mwn-step--current" : ""}${step.done ? " mwn-step--done" : ""}`}>
                <Checkbox checked={step.done} disabled={checklistSaving || !item.updatedAt} onChange={() => onToggleChecklist(item, step.id)} label={`${step.title} ${step.done ? "완료됨" : "완료"}`} />
                <span className="mwn-step__text">{step.title}</span>
                {step === currentStep && <span className="mwn-dim">지금 단계</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mwn-current__actions">
        <Button variant="primary" icon="check" onClick={event => onComplete(item, event)}>할 일 완료</Button>
        <Button variant="secondary" icon="edit" onClick={() => onOpen(item)}>{steps.length ? "상세 · 단계" : "상세 · 단계 추가"}</Button>
        <Button variant="ghost" onClick={() => onDefer(item)}>{deferLabel}로 미루기</Button>
      </div>
    </Card>
  );
}

function QueueRow({ item, index, onOpen, onToggleFocus, focusFull }) {
  return (
    <li className="mwn-row hub-row" role="button" tabIndex={0} onClick={() => onOpen(item)} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpen(item); } }}>
      {index ? <span className="mwn-num mono">{index}</span> : <span className="mwn-num" aria-hidden="true"><Iconed name="plus" size={11} /></span>}
      <span className="mwn-row__title">{item.title}</span>
      {item.focusToday && <span className="mwn-tag">오늘 3개</span>}
      <span className="mwn-row__meta">{[item.projectName, item.whenLabel].filter(Boolean).join(" · ")}</span>
      {!item.focusToday && (
        <IconButton icon="star" size={28} iconSize={13} disabled={focusFull} tooltip={focusFull ? `오늘 3개가 찼습니다 (${MAX_FOCUS_PER_DAY}/${MAX_FOCUS_PER_DAY})` : "오늘 3개에 넣기"} aria-pressed="false"
          onClick={event => { event.stopPropagation(); onToggleFocus(item); }} onKeyDown={event => event.stopPropagation()} />
      )}
    </li>
  );
}

export function MyWorkNow({ model, deferLabel, focusFull, checklistSavingId, onComplete, onDefer, onOpen, onToggleFocus, onToggleChecklist, onShowList }) {
  const { current, focusIndex, queue, overdue, events } = model;
  const railed = overdue.length > 0 && overdue.length <= 3;
  const now = Date.now();

  return (
    <div className="mwn">
      <div className="mwn-main">
        {current ? (
          <CurrentTask item={current} focusIndex={focusIndex} dueLabel={model.currentDue === 'week' ? '이번 주' : '오늘'} deferLabel={deferLabel} onComplete={onComplete} onDefer={onDefer} onOpen={onOpen} onToggleChecklist={onToggleChecklist} checklistSaving={checklistSavingId === current.id} />
        ) : (
          <Card style={CURRENT_STYLE}>
            <EmptyState icon="check" title="지금 할 일이 없습니다" description="오늘이나 이번 주가 기한인 할 일이 없습니다. 아래에서 오늘 할 것을 고르면 여기에 올라옵니다." action={model.pickable.length ? undefined : <Button variant="outline" size="sm" onClick={onShowList}>목록 열기</Button>} style={{ minHeight: 160 }} />
          </Card>
        )}

        <Card className="mwn-panel" style={PANEL_STYLE} aria-label="다음 순서">
          {queue.length || !model.pickable.length ? (
            <>
              <div className="mwn-panel__head"><h3>다음 순서</h3><span>완료하면 한 칸씩 올라옵니다</span></div>
              {queue.length ? (
                <ul className="mwn-list">
                  {queue.slice(0, 3).map((item, index) => <QueueRow key={item.id} item={item} index={index + 2} onOpen={onOpen} onToggleFocus={onToggleFocus} focusFull={focusFull} />)}
                </ul>
              ) : <p className="mwn-empty">이번 주에 남은 할 일이 없습니다.</p>}
            </>
          ) : (
            <>
              <div className="mwn-panel__head"><h3>오늘 할 것 고르기</h3><span>별을 누르면 오늘 3개에 들어갑니다</span></div>
              <ul className="mwn-list">
                {model.pickable.map(item => <QueueRow key={item.id} item={item} index={null} onOpen={onOpen} onToggleFocus={onToggleFocus} focusFull={focusFull} />)}
              </ul>
            </>
          )}
          <button type="button" className="mwn-more hub-row" onClick={onShowList}>
            전체 보기 · 이번 주 <span className="mono">{model.weekCount}</span> · 나중 <span className="mono">{model.laterCount}</span>
            <Iconed name="chevronR" size={12} />
          </button>
        </Card>
      </div>

      <div className="mwn-side">
        <Card className="mwn-panel" style={PANEL_STYLE} aria-label="기한 지남">
          <div className="mwn-panel__head">
            <h3 className={overdue.length ? "mwn-danger" : undefined}>{overdue.length > 0 && <Iconed name="alert" size={13} />}기한 지남 <span className="mono">{overdue.length}</span></h3>
            {overdue.length > 0 && <span>지금 일 끝나고 보기</span>}
          </div>
          {overdue.length ? (
            <ul className="mwn-list">
              {overdue.slice(0, 5).map(item => (
                <li key={item.id} className={`mwn-row${railed && item.lane === "task" ? " mwn-row--rail" : ""}`}>
                  {item.lane === "task"
                    ? <Checkbox checked={false} onChange={(_next, event) => onComplete(item, event)} label={`${item.title} 완료`} />
                    : <Badge tone="neutral" size="xs" variant="outline">딜</Badge>}
                  <button type="button" className="mwn-row__title mwn-link" onClick={() => onOpen(item)}>{item.title}</button>
                  {item.lane === "task"
                    ? <Button variant="secondary" size="xs" onClick={() => onDefer(item)}>{deferLabel}로</Button>
                    : <Button variant="secondary" size="xs" onClick={() => onOpen(item)}>열기</Button>}
                </li>
              ))}
            </ul>
          ) : <p className="mwn-empty"><Iconed name="check" size={13} /> 밀린 일이 없습니다.</p>}
          {overdue.length > 5 && <button type="button" className="mwn-more hub-row" onClick={onShowList}>기한 지남 {overdue.length - 5}건 더 보기<Iconed name="chevronR" size={12} /></button>}
        </Card>

        <Card className="mwn-panel" style={PANEL_STYLE} aria-label="오늘 시간표">
          <div className="mwn-panel__head"><h3>오늘 시간표</h3><span>일정 <span className="mono">{events.length}</span></span></div>
          {events.length ? (
            <ol className="mwn-slots">
              {events.map((event, index) => {
                const allDay = isAllDay(event.whenAt);
                const ended = !allDay && Date.parse(event.endAt || event.whenAt) <= now;
                const isNext = event === model.upcoming;
                const startsIn = isNext ? minutesUntil(event.whenAt, now) : null;
                const previous = events[index - 1];
                const gap = previous && !allDay && !isAllDay(previous.whenAt) && previous.endAt ? minutesUntil(event.whenAt, Date.parse(previous.endAt)) : 0;
                return (
                  <React.Fragment key={event.id}>
                    {gap >= 60 && <li className="mwn-slot"><span className="mwn-slot__time" /><span className="mwn-gap">빈 {durationLabel(gap)}</span></li>}
                    <li className="mwn-slot">
                      <span className="mwn-slot__time mono">{allDay ? "종일" : timeOf(event.whenAt)}</span>
                      <button type="button" className={`mwn-event${isNext ? " mwn-event--next" : ""}${ended ? " mwn-event--past" : ""}`} onClick={() => onOpen(event)}>
                        {isNext && <span className="mwn-event__when">{startsIn > 0 ? `${durationLabel(startsIn)} 뒤` : "진행 중"}</span>}
                        <span className="mwn-event__title">{event.title}</span>
                        {event.meta && <span className="mwn-event__meta">{event.meta}</span>}
                      </button>
                    </li>
                  </React.Fragment>
                );
              })}
            </ol>
          ) : <p className="mwn-empty">오늘 일정이 없습니다.</p>}
        </Card>
      </div>
    </div>
  );
}

// Card는 패딩·모서리를 인라인으로 정한다 — 클래스로 이기지 못하므로 style로 넘긴다.
const PANEL_STYLE = { padding: 18, borderRadius: "var(--r-xl)" };
const CURRENT_STYLE = { padding: 24, borderRadius: "var(--r-xl)" };
