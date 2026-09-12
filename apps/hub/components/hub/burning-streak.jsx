"use client";

import React from "react";

/**
 * 정밀 SVG 화염 아이콘 (Linear / Moonstone 스타일)
 * burning=true 일 때 일렁이는 버닝 애니메이션과 앰버-오렌지 화염 그라디언트가 활성화됩니다.
 */
export function StreakFlame({ size = 18, burning = false, className = "", style = {} }) {
  const gradId = React.useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${burning ? "hub-streak-flame--burning" : ""} ${className}`.trim()}
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        flexShrink: 0,
        ...style,
      }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${gradId}-outer`} x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
          {burning ? (
            <>
              <stop offset="0%" stopColor="#ff9a52" />
              <stop offset="45%" stopColor="#ff5f2e" />
              <stop offset="100%" stopColor="#d9381e" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="var(--fg-faint)" />
              <stop offset="100%" stopColor="var(--line-strong)" />
            </>
          )}
        </linearGradient>
        <linearGradient id={`${gradId}-inner`} x1="12" y1="11" x2="12" y2="21" gradientUnits="userSpaceOnUse">
          {burning ? (
            <>
              <stop offset="0%" stopColor="#ffe699" />
              <stop offset="70%" stopColor="#ffaa33" />
              <stop offset="100%" stopColor="#ff5e00" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="var(--fg-dim)" />
              <stop offset="100%" stopColor="var(--fg-faint)" />
            </>
          )}
        </linearGradient>
      </defs>

      {/* 바깥 화염 (Outer flame contour) */}
      <path
        d="M12 2.5C12 2.5 13.8 6.2 13.8 8.4C13.8 9.7 13.2 10.8 12.5 11.6C12.3 11.8 12 11.7 12 11.4C12 9.5 10.6 8.2 9.2 7.1C7.8 6 6.5 4.4 6.5 4.4C5.2 6.5 4.5 9 4.5 11.8C4.5 16.5 7.9 20.5 12 21.5C16.1 20.5 19.5 16.5 19.5 11.8C19.5 8.1 17.2 4.9 14.8 3.5C13.6 2.8 12.8 2.2 12 2.5Z"
        fill={`url(#${gradId}-outer)`}
        fillOpacity={burning ? 0.95 : 0.65}
      />

      {/* 중심 코어 화염 (Inner burning core) */}
      <path
        d="M12 12C12.8 12 14.5 14 14.5 16C14.5 17.8 13.4 19.4 12 19.9C10.6 19.4 9.5 17.8 9.5 16C9.5 14.6 10.4 13.2 11.2 12.4C11.5 12.1 12 12 12 12Z"
        fill={`url(#${gradId}-inner)`}
        fillOpacity={burning ? 1 : 0.4}
      />
    </svg>
  );
}

/**
 * 연속 달성 버닝 스트릭 배지 및 헤더 위젯
 * - `streak`: 연속 완료 일수
 * - `todayCompleted`: 오늘 완료한 할 일 건수
 * - `recentDays`: 최근 7일 완료 여부 배열 [0, 1, 0, ...]
 * - `isPopping`: 완료 직후 팝 애니메이션 trigger
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
  const burning = isBurning || activeStreak >= 3 || (activeStreak > 0 && todayCompleted > 0);

  // 텍스트 카피 결정
  let streakText = "";
  if (activeStreak === 0) {
    streakText = "오늘 첫 완료로 버닝 시작";
  } else if (activeStreak === 1) {
    streakText = "할 일 완성 1일째! 🔥";
  } else if (activeStreak < 3) {
    streakText = `할 일 완성 ${activeStreak}일째! 🔥`;
  } else {
    streakText = `할 일 완성 ${activeStreak}일째! 연속 버닝 중 🔥`;
  }

  if (compact) {
    return (
      <div
        className={`${burning ? "hub-streak-badge--burning" : ""} ${isPopping ? "hub-streak-pop" : ""}`.trim()}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 8px 3px 6px",
          borderRadius: "var(--r-sm)",
          background: burning ? "rgba(255, 110, 40, 0.08)" : "var(--surface-2)",
          border: `1px solid ${burning ? "rgba(255, 130, 60, 0.35)" : "var(--line-soft)"}`,
          fontSize: 11.5,
          fontWeight: 500,
          color: burning ? "var(--fg)" : "var(--fg-muted)",
          transition: "all var(--dur-enter) var(--ease-hub)",
          ...style,
        }}
        title={`${title}: ${activeStreak}일 연속${todayCompleted > 0 ? ` (오늘 ${todayCompleted}건 완료)` : ""}`}
      >
        <StreakFlame size={14} burning={burning} />
        <span className="mono" style={{ fontWeight: 600, color: burning ? "var(--fg)" : "var(--fg-dim)" }}>
          {activeStreak}일
        </span>
        <span style={{ fontSize: 11, color: burning ? "var(--fg-muted)" : "var(--fg-faint)" }}>
          {activeStreak >= 3 ? "연속 버닝" : activeStreak > 0 ? "완성 중" : "도전"}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`${burning ? "hub-streak-badge--burning" : ""} ${isPopping ? "hub-streak-pop" : ""}`.trim()}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 12px",
        borderRadius: "var(--r-sm)",
        background: burning
          ? "linear-gradient(90deg, rgba(255, 115, 45, 0.09) 0%, rgba(82, 116, 168, 0.04) 100%)"
          : "var(--surface-2)",
        border: `1px solid ${burning ? "rgba(255, 130, 60, 0.3)" : "var(--line-soft)"}`,
        transition: "all var(--dur-enter) var(--ease-hub)",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <StreakFlame size={20} burning={burning} />
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>
              {streakText}
            </span>
            {todayCompleted > 0 && (
              <span className="mono" style={{ fontSize: 11, color: "var(--fg-muted)" }}>
                · 오늘 {todayCompleted}건 완료
              </span>
            )}
          </div>
          <span style={{ fontSize: 10.5, color: "var(--fg-faint)" }}>
            {burning ? "루틴과 매일 할 일이 강력하게 연결되고 있습니다" : "매일 한 건씩 완료하면 연속 버닝이 켜집니다"}
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
                  background: done
                    ? (burning ? "#ff7836" : "var(--moon-400)")
                    : "var(--surface-3)",
                  border: isToday
                    ? `1px solid ${done ? "#ff9a52" : "var(--line-strong)"}`
                    : "1px solid var(--line-soft)",
                  opacity: done ? 1 : 0.6,
                  transition: "background var(--dur-enter) ease",
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
