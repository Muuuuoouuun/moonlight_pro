"use client";

import React from "react";

/**
 * 연속 완주 표시 — DESIGN.md §4·§5.2·§5.3·§9·§10.
 *
 * 2026-09-21까지 이 파일은 앰버·오렌지 화염(원색 16건)과 무한 애니메이션 2종으로 그려졌다.
 * §4는 warm gold/amber 재도입을 금지하고, §9는 라이브 인디케이터 duration을 mlMoonPulse
 * 1.4s 하나로 고정하며, §5.3은 "색 단독으로 상태를 나르지 않는다"를 요구한다.
 * 지표(연속 일수)는 그대로 두고 표현만 중립으로 되돌렸다. 2026-09-25 운영자가 불꽃 모양을 다시 골랐다 —
 * 색·반복 모션 없이 불꽃의 크기·채움·불티 수가 단계를 나르므로 흑백·색각 차이에서도 읽힌다.
 * 팔레트 회귀는 palette.test.mjs가 막는다.
 */

// 연속 일수 → 5단계(1·3·7·14·30일). 색이 아니라 불꽃의 크기·채움·불티 수가 단계를 말한다.
export function streakLevel(streak) {
  if (streak >= 30) return 5;
  if (streak >= 14) return 4;
  if (streak >= 7) return 3;
  if (streak >= 3) return 2;
  if (streak >= 1) return 1;
  return 0;
}

export const STREAK_LEVEL_LABELS = ["대기", "불씨", "불꽃", "타오름", "활활", "한 달"];

// 24 박스 기준 불꽃 외곽과 속불. 속불은 마스크로 뚫어 어느 면 위에서도 배경이 비친다.
const FLAME = "M12 2.5c.8 3.6 5.8 5.6 5.8 11.3a5.8 5.8 0 0 1-11.6 0c0-2.9 1.6-4.8 2.8-6.6.1 1.9.9 3 2 3.3-.4-3 .1-5.5 1-8z";
const CORE = "M12 12.2c.5 1.8 2.6 2.7 2.6 5a2.6 2.6 0 0 1-5.2 0c0-1.5.9-2.4 1.5-3.3.2.8.6 1.2 1.1 1.4-.1-1.2 0-2.1 0-3.1z";
// 바닥 중심(12, 20)을 축으로 줄인다 — 단계가 오를수록 같은 자리에서 커진다.
const at = (scale, baseY = 20) => `translate(12 ${baseY}) scale(${scale}) translate(-12 -20)`;
const spark = (cx, cy, r) => `M${cx} ${cy - r}L${cx + r * 0.62} ${cy}L${cx} ${cy + r}L${cx - r * 0.62} ${cy}Z`;

/**
 * 연속 불꽃 — 0 점선 빈 불꽃 · 1 불씨 · 2 윤곽 불꽃 · 3 채운 불꽃 · 4 속불 + 불티 둘 · 5 한 달 배지(원 + 불꽃 + 불티 셋).
 * 2026-09-25 운영자 선택(§15). 단색(--fg / --fg-muted)·정지 그림이고, 4·5단계만 나타날 때 한 번
 * 불이 붙는다(--dur-celebrate, 반복 없음 §9). 09-22에 뺀 것은 앰버색과 무한 깜빡임이지 모양이 아니다.
 */
export function StreakMark({ size = 18, level = 0, className = "", style = {} }) {
  const lit = Math.max(0, Math.min(5, Number.isInteger(level) ? level : 0));
  const maskId = `streak-core-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const ink = lit >= 3 ? "var(--fg)" : "var(--fg-muted)";
  const cored = lit >= 4;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={["hub-streak-mark", cored ? "hub-streak-ignite" : "", className].filter(Boolean).join(" ")}
      data-level={lit}
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      {cored && (
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
            <rect width="24" height="24" fill="white" />
            <path d={CORE} fill="black" transform={lit === 5 ? at(0.74, 18.6) : undefined} />
          </mask>
        </defs>
      )}
      {lit === 0 && <path d={FLAME} transform={at(0.66)} stroke="var(--line-strong)" strokeWidth="1.2" strokeDasharray="1.6 1.8" vectorEffect="non-scaling-stroke" />}
      {lit === 1 && <>
        <circle cx="12" cy="17" r="2.6" fill={ink} />
        <path d="M12 11v2.2" stroke={ink} strokeWidth="1.6" strokeLinecap="round" />
      </>}
      {lit === 2 && <path d={FLAME} transform={at(0.7)} stroke={ink} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
      {lit === 3 && <path d={FLAME} transform={at(0.84)} fill={ink} />}
      {lit === 4 && <>
        <path className="hub-streak-flame" d={FLAME} fill={ink} mask={`url(#${maskId})`} />
        <path className="hub-streak-spark" d={spark(19.6, 6, 1.9)} fill={ink} />
        <path className="hub-streak-spark" d={spark(4.6, 9.2, 1.4)} fill={ink} />
      </>}
      {lit === 5 && <>
        <circle cx="12" cy="12" r="11" stroke={ink} strokeWidth="1.3" vectorEffect="non-scaling-stroke" />
        <g mask={`url(#${maskId})`}>
          <path className="hub-streak-flame" d={FLAME} transform={at(0.74, 18.6)} fill={ink} />
        </g>
        <path className="hub-streak-spark" d={spark(17.2, 6.4, 1.7)} fill={ink} />
        <path className="hub-streak-spark" d={spark(6.6, 7.6, 1.3)} fill={ink} />
        <path className="hub-streak-spark" d={spark(17.6, 12.6, 1.1)} fill={ink} />
      </>}
    </svg>
  );
}

/**
 * 연속 달성 배지
 * - `streak`: 연속 완료 일수
 * - `todayCompleted`: 오늘 완료한 할 일 건수
 * - `recentDays`: 최근 7일 완료 여부 배열 [0, 1, 0, ...]
 * - `isPopping`: 완료 직후 1회 팝(§9 --dur-enter). 반복 애니메이션은 쓰지 않는다
 */
export function BurningStreakBadge({
  streak = 0,
  todayCompleted = 0,
  isBurning = false,
  recentDays = [],
  compact = false,
  isPopping = false,
  title = "할 일 연속 완주",
  style = {},
}) {
  const activeStreak = Math.max(0, streak);
  const level = streakLevel(activeStreak);
  // 기존 호출처가 넘기는 isBurning은 "3일 이상 또는 오늘 완료"를 뜻한다. 강조는 명도 한 단계로만.
  const sustained = isBurning || activeStreak >= 3 || (activeStreak > 0 && todayCompleted > 0);

  const headline = activeStreak > 0 ? `${activeStreak}일 연속` : "오늘 첫 완료 대기";

  if (compact) {
    return (
      <div
        className={isPopping ? "hub-streak-pop" : ""}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 8px 3px 6px",
          borderRadius: "var(--r-sm)",
          background: "var(--surface-2)",
          border: `1px solid ${sustained ? "var(--line)" : "var(--line-soft)"}`,
          fontSize: 11.5,
          fontWeight: 500,
          color: sustained ? "var(--fg)" : "var(--fg-muted)",
          transition: "border-color var(--dur-hover) var(--ease-hub)",
          ...style,
        }}
        title={`${title}: ${activeStreak}일 연속${todayCompleted > 0 ? ` (오늘 ${todayCompleted}건 완료)` : ""}`}
      >
        <StreakMark size={14} level={level} />
        <span className="mono" style={{ fontWeight: 600, color: sustained ? "var(--fg)" : "var(--fg-dim)" }}>
          {activeStreak}일
        </span>
        <span style={{ fontSize: 11, color: "var(--fg-faint)" }}>
          {activeStreak > 0 ? "연속" : "대기"}
        </span>
      </div>
    );
  }

  return (
    <div
      className={isPopping ? "hub-streak-pop" : ""}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 12px",
        borderRadius: "var(--r-sm)",
        background: "var(--surface-2)",
        border: `1px solid ${sustained ? "var(--line)" : "var(--line-soft)"}`,
        transition: "border-color var(--dur-hover) var(--ease-hub)",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <StreakMark size={20} level={level} />
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>{headline}</span>
            {todayCompleted > 0 && (
              <span className="mono" style={{ fontSize: 11, color: "var(--fg-muted)" }}>
                · 오늘 {todayCompleted}건 완료
              </span>
            )}
          </div>
          <span style={{ fontSize: 10.5, color: "var(--fg-faint)" }}>
            {sustained ? "오늘도 이어가는 중" : "하루 한 건 완료하면 이어집니다"}
          </span>
        </div>
      </div>

      {Array.isArray(recentDays) && recentDays.length === 7 && (
        <div
          role="img"
          aria-label={`최근 7일 완료 트랙: ${recentDays.map((v, i) => `${i === 6 ? "오늘" : `${6 - i}일전`}: ${v ? "완료" : "미완료"}`).join(", ")}`}
          style={{ display: "flex", alignItems: "center", gap: 3.5 }}
        >
          {recentDays.map((done, idx) => {
            const isToday = idx === 6;
            return (
              <span
                key={idx}
                title={isToday ? `오늘: ${done ? "완료됨" : "진행 중"}` : `${6 - idx}일 전: ${done ? "완료됨" : "건너뜀"}`}
                style={{
                  width: 9,
                  height: 14,
                  borderRadius: 2.5,
                  // 채움/빈칸은 명도 차이로만 구분한다 — 오늘 칸은 1px 강조 보더가 추가 채널(§5.3).
                  background: done ? "var(--fg-muted)" : "var(--surface-3)",
                  border: `1px solid ${isToday ? "var(--line-strong)" : "var(--line-soft)"}`,
                  transition: "background var(--dur-enter) var(--ease-hub)",
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
