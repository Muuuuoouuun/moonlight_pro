"use client";

import React from "react";

/**
 * 연속 완주 표시 — DESIGN.md §4·§5.2·§5.3·§9·§10.
 *
 * 2026-09-21까지 이 파일은 앰버·오렌지 화염(원색 16건)과 무한 애니메이션 2종으로 그려졌다.
 * §4는 warm gold/amber 재도입을 금지하고, §9는 라이브 인디케이터 duration을 mlMoonPulse
 * 1.4s 하나로 고정하며, §5.3은 "색 단독으로 상태를 나르지 않는다"를 요구한다.
 * 지표(연속 일수)는 그대로 두고 표현만 중립 기하로 되돌렸다 — 채워진 칸의 수와 막대 높이가
 * 정보를 나르므로 흑백·색각 차이에서도 읽힌다. 팔레트 회귀는 palette.test.mjs가 막는다.
 */

// 연속 일수 → 4단계. 색이 아니라 채워진 막대 수가 단계를 말한다.
function streakLevel(streak) {
  if (streak >= 14) return 4;
  if (streak >= 7) return 3;
  if (streak >= 3) return 2;
  if (streak >= 1) return 1;
  return 0;
}

/**
 * 오름차순 막대 4개. `level` 만큼 채운다.
 * 채움은 포그라운드 명도(--fg / --fg-muted)이고 빈 칸은 하이라인(--line) — accent 아님(§5.2).
 */
export function StreakMark({ size = 18, level = 0, className = "", style = {} }) {
  const lit = Math.max(0, Math.min(4, level));
  const bars = [
    { x: 2.5, y: 14.5, h: 6.5 },
    { x: 8, y: 11, h: 10 },
    { x: 13.5, y: 7.5, h: 13.5 },
    { x: 19, y: 4, h: 17 },
  ];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      {bars.map((b, i) => (
        <rect
          key={b.x}
          x={b.x}
          y={b.y}
          width={2.5}
          height={b.h}
          rx={1.25}
          fill={i < lit ? (lit >= 3 ? "var(--fg)" : "var(--fg-muted)") : "var(--line)"}
        />
      ))}
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
