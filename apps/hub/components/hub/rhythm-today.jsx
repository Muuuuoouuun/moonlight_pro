"use client";

import React from "react";
import { EmptyState, IconButton, TruthBadge } from "./hub-primitives";
import { StreakMark } from "./burning-streak";
import { RITUAL_CATEGORY_LABELS } from "@/lib/rhythm-ui";
import "./rhythm-today.css";

/**
 * 오늘의 리듬 — 매일 지키는 생활 루틴(기도·청소·운동…)을 체크하는 표면.
 *
 * 오늘 할 일(tasks)과 섞지 않는다(2026-09-23 운영자). 데이터는 lib/rhythm-today.js의
 * buildTodayRhythm 뷰 모델 하나이고, 이 파일은 그리기만 한다.
 *
 * 만족감은 색이 아니라 기하와 움직임으로 낸다(DESIGN.md §5.2·§5.3 — done은 초록이 아니라
 * 체크 글리프 + 낮춘 텍스트). 체크 원이 --fg로 차오르고, 체크 표시가 그려지고, 이름에 줄이
 * 그어지고, 하루 링이 닫힌다. 모든 전이는 §9 토큰이고 reduced-motion에서는 rhythm-today.css가
 * 전부 끈다. 긴급/연속 끊김은 빨강으로 칠하지 않는다 — "오늘 이어가기" 문구가 말한다.
 */

function streakLevel(streak) {
  if (streak >= 14) return 4;
  if (streak >= 7) return 3;
  if (streak >= 3) return 2;
  if (streak >= 1) return 1;
  return 0;
}

function itemStatusCopy(item) {
  if (item.doneToday) return item.streak >= 2 ? `${item.streak}일 연속` : "오늘 완료";
  if (item.resting) return "이번 주 목표 채움 · 쉬어도 돼요";
  if (item.streakAtStake) return `${item.pendingStreak}일 연속 · 오늘 이어가기`;
  return item.target >= 7 ? "매일" : `주 ${item.target}회`;
}

export function RhythmDayRing({ done = 0, due = 0, allDone = false, celebrate = false, partial = false }) {
  const size = 96;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = due > 0 ? Math.min(1, done / due) : 0;
  const label = partial
    ? `일부 기록에서 관측된 오늘의 리듬 ${done} / ${due}`
    : `오늘의 리듬 ${done} / ${due} 완료`;
  return (
    <div
      className="hub-rhythm-ring"
      data-complete={allDone ? "true" : "false"}
      data-celebrate={celebrate ? "true" : "false"}
      role={partial ? "status" : "progressbar"}
      aria-label={label}
      {...(partial ? {} : { "aria-valuemin": 0, "aria-valuemax": due, "aria-valuenow": done })}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="hub-rhythm-ring__track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" />
        <circle
          className="hub-rhythm-ring__value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="hub-rhythm-ring__center" aria-hidden="true">
        {allDone ? (
          <svg className="hub-rhythm-ring__check" width="30" height="30" viewBox="0 0 24 24" fill="none">
            <path d="M5 12.5l4.2 4.2L19 7" pathLength="1" />
          </svg>
        ) : (
          <span className="stat hub-rhythm-ring__count">
            {done}<span className="hub-rhythm-ring__of">/{due}</span>
          </span>
        )}
      </div>
    </div>
  );
}

function CheckMark() {
  return (
    <span className="hub-rhythm-check" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path className="hub-rhythm-check__mark" d="M5 12.5l4.2 4.2L19 7" pathLength="1" />
      </svg>
    </span>
  );
}

function WeekDots({ item, dayLabels }) {
  const text = item.weeks
    .map((v, i) => `${dayLabels[i]?.label || ""} ${v ? "완료" : "미완료"}`)
    .join(", ");
  return (
    <div className="hub-rhythm-dots" role="img" aria-label={`최근 7일 체크 기록: ${text}`}>
      {item.weeks.map((v, i) => (
        <span key={i} className="hub-rhythm-dot" data-on={v ? "true" : "false"} data-today={i === 6 ? "true" : "false"} />
      ))}
    </div>
  );
}

function RhythmItem({ item, dayLabels, pending, feedback, justChecked, onToggle, onEdit }) {
  const category = RITUAL_CATEGORY_LABELS[item.category] || RITUAL_CATEGORY_LABELS.general;
  const scope = item.projectName ? `${item.projectName} · ` : "";
  return (
    <li
      className="hub-rhythm-item"
      data-done={item.doneToday ? "true" : "false"}
      data-resting={item.resting ? "true" : "false"}
      data-celebrate={justChecked && item.doneToday ? "true" : "false"}
    >
      <button
        type="button"
        className="hub-rhythm-toggle"
        aria-pressed={item.doneToday}
        aria-label={`${scope}${item.name} ${item.doneToday ? "오늘 완료 취소" : "오늘 완료로 체크"}`}
        disabled={pending}
        onClick={() => onToggle(item)}
      >
        <CheckMark />
        <span className="hub-rhythm-item__body">
          <span className="hub-rhythm-item__name">{item.name}</span>
          <span className="hub-rhythm-item__meta">
            <span>{category}</span>
            <span className="hub-rhythm-sep" aria-hidden="true">·</span>
            <span className="hub-rhythm-item__status">
              {item.streakAtStake || (item.doneToday && item.streak >= 2) ? (
                <StreakMark size={12} level={streakLevel(item.doneToday ? item.streak : item.pendingStreak)} />
              ) : null}
              {itemStatusCopy(item)}
            </span>
            {item.projectName ? (
              <>
                <span className="hub-rhythm-sep" aria-hidden="true">·</span>
                <span>{item.projectName}</span>
              </>
            ) : null}
          </span>
        </span>
      </button>
      <WeekDots item={item} dayLabels={dayLabels} />
      <IconButton
        icon="edit"
        size={36}
        tooltip={`${item.name} 루틴 편집`}
        className="hub-rhythm-item__edit"
        onClick={() => onEdit(item)}
      />
      {feedback && feedback.kind !== "saved" && feedback.kind !== "duplicate" && (
        <span className="hub-rhythm-item__feedback" data-kind={feedback.kind} aria-live="polite">
          {feedback.message}
        </span>
      )}
    </li>
  );
}

export function RhythmToday({
  today,
  dayLabels,
  recentWeek,
  pendingById = {},
  feedbackById = {},
  justCheckedIds,
  celebrate = false,
  partial = false,
  emptyTitle,
  emptyDescription,
  emptyAction,
  presets = [],
  onToggle,
  onEdit,
  onPreset,
}) {
  const hasItems = today.total > 0;
  const headline = !hasItems
    ? "매일 지킬 리듬을 정해 보세요"
    : today.allDone
      ? "오늘의 리듬 완주"
      : today.due === 0
        ? "오늘은 쉬어 가는 날"
        : `남은 리듬 ${today.remaining}개`;

  return (
    <>
      <section className="fx-card hub-rhythm-hero" data-complete={today.allDone ? "true" : "false"} data-celebrate={celebrate ? "true" : "false"} aria-label="오늘의 리듬 요약">
        <RhythmDayRing done={today.done} due={today.due} allDone={today.allDone} celebrate={celebrate} partial={partial} />
        <div className="hub-rhythm-hero__text">
          <div className="fx-eyebrow">오늘의 리듬</div>
          <div className="hub-rhythm-hero__headline" aria-live="polite">{headline}</div>
          <div className="hub-rhythm-hero__meta">
            {today.bestStreak.streak > 0 && (
              <span className="hub-rhythm-hero__stat">
                <StreakMark size={14} level={streakLevel(today.bestStreak.streak)} />
                <span>최장 <span className="num">{today.bestStreak.streak}</span>일 · {today.bestStreak.name}</span>
              </span>
            )}
            {recentWeek.target > 0 && (
              <span className="hub-rhythm-hero__stat">
                최근 7일 달성 <span className="num">{recentWeek.percent}%</span>
                <span className="hub-rhythm-hero__faint">({recentWeek.done}/{recentWeek.target})</span>
              </span>
            )}
            {today.resting > 0 && (
              <span className="hub-rhythm-hero__stat">쉬는 루틴 <span className="num">{today.resting}</span></span>
            )}
            {partial && <TruthBadge state="partial" />}
          </div>
        </div>
      </section>

      {!hasItems && (
        <div className="fx-card">
          <EmptyState
            icon="rhythm"
            title={emptyTitle}
            description={emptyDescription}
            action={emptyAction}
            style={{ minHeight: 180 }}
          />
          {presets.length > 0 && <PresetChips presets={presets} onPreset={onPreset} />}
        </div>
      )}

      {today.groups.map((group) => (
        <section key={group.key} className="fx-card hub-rhythm-group" aria-labelledby={`rhythm-group-${group.key}`}>
          <header className="hub-rhythm-group__head">
            <h3 id={`rhythm-group-${group.key}`} className="hub-rhythm-group__title">{group.label}</h3>
            {group.isNow && <span className="hub-rhythm-now">지금</span>}
            <span className="hub-rhythm-group__count mono">{group.done}/{group.due}</span>
          </header>
          <ul className="hub-rhythm-list stagger-up">
            {group.items.map((item) => (
              <RhythmItem
                key={item.id}
                item={item}
                dayLabels={dayLabels}
                pending={Boolean(pendingById[item.id])}
                feedback={feedbackById[item.id]}
                justChecked={justCheckedIds?.has(item.id)}
                onToggle={onToggle}
                onEdit={onEdit}
              />
            ))}
          </ul>
        </section>
      ))}

      {hasItems && presets.length > 0 && (
        <div className="hub-rhythm-suggest">
          <span className="hub-rhythm-suggest__label">루틴 더하기</span>
          <PresetChips presets={presets} onPreset={onPreset} />
        </div>
      )}
    </>
  );
}

function PresetChips({ presets, onPreset }) {
  return (
    <div className="hub-rhythm-chips">
      {presets.map((preset) => (
        <button key={preset.label} type="button" className="hub-rhythm-chip" onClick={() => onPreset(preset)}>
          <span aria-hidden="true">+</span> {preset.label}
        </button>
      ))}
    </div>
  );
}
