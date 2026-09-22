"use client";

import React from "react";
import { Badge, EmptyState, Skeleton, TruthBadge } from "./hub-primitives";
import { StreakMark } from "./burning-streak";
import { summarizeRitualsByCategory } from "@/lib/rhythm-ui";

/**
 * 리듬 커맨드 비주얼라이저 — 몰입도 × 성과 매트릭스 + 카테고리별 루틴 구성.
 *
 * 2026-09-22까지 이 컴포넌트는 3탭(매트릭스/업로드 리듬/성과 반응) 구조였고, 뒤 두 탭은
 * 100% 하드코딩 상수(defaultUploads/defaultPerformance)로 실데이터가 전혀 없었다. 콘텐츠
 * 업로드·조회수 지표를 연결할 실데이터 소스가 아직 정해지지 않아, 이번 재설계에서 두 탭을
 * 들어내고 실제로 있는 데이터(루틴의 카테고리·주간 목표)로 만든 "루틴 구성" 섹션으로
 * 대체했다. matrix는 실측 focusData(work.jsx가 todos를 실제로 배선)를 그대로 쓴다.
 *
 * tasksStatus는 /api/hub/tasks 봉투의 truth 상태(live·partial·preview·error·loading)다. live가
 * 아니면 매트릭스 옆에 TruthBadge로 밝힌다 — 할 일 read 실패가 "완료 0건"으로 보이지 않게.
 * rhythmPartial은 루틴 기록이 조회 한도에서 잘렸다는 뜻이라 체크인 집계 옆에 같은 방식으로 표시한다.
 *
 * matrix는 할 일(tasksStatus)과 루틴(rhythmState) 두 소스를 합산하므로, 빈 상태 문구도 두
 * truth를 합쳐 판정한다(matrixTruth) — 한쪽만 보면 나머지 read 실패가 "완료 0건"으로 위장된다.
 */
export function RhythmVisualizer({
  rituals = [],
  summary = null,
  focusData = null,
  tasksStatus = "live",
  rhythmState = "live",
  rhythmPartial = false,
}) {
  const [hoveredDay, setHoveredDay] = React.useState(null);

  const ritualTotal = summary?.ritualsTotalThisWeek ?? rituals.length;
  const ritualCompleted = summary?.ritualsCompletedThisWeek
    ?? rituals.filter((r) => (r.weeks || []).some(Boolean)).length;
  const ritualRate = ritualTotal > 0 ? Math.round((ritualCompleted / ritualTotal) * 100) : 0;
  const longestStreak = summary?.longestStreak || 0;

  const matrixDays = Array.isArray(focusData?.matrix) ? focusData.matrix : [];
  // 활동(할 일·루틴 완료)이 하루도 없으면 빈 상태 — 0으로 채운 차트는 측정값처럼 읽힌다.
  const hasMatrix = matrixDays.length === 7
    && matrixDays.some((d) => (d.tasksDone || 0) + (d.ritualsDone || 0) > 0);
  const totalFocusHours = hasMatrix
    ? matrixDays.reduce((acc, d) => acc + d.focusHours, 0).toFixed(1)
    : "0.0";
  const avgPerformance = hasMatrix
    ? Math.round(matrixDays.reduce((acc, d) => acc + d.outcomes, 0) / matrixDays.length)
    : 0;

  const categories = React.useMemo(() => summarizeRitualsByCategory(rituals), [rituals]);
  const categoryCompleted = categories.reduce((acc, c) => acc + c.completedThisWeek, 0);
  const categoryTarget = categories.reduce((acc, c) => acc + c.targetThisWeek, 0);
  const categoryPercent = categoryTarget > 0 ? Math.min(100, Math.round((categoryCompleted / categoryTarget) * 100)) : 0;

  // 두 소스를 합친 truth — 덜 확실한 쪽이 이긴다. 'live-empty'는 읽기가 성공한 빈 기록이라 live다.
  const matrixTruth = React.useMemo(() => {
    const norm = (s) => (s === "live-empty" ? "live" : s);
    const states = [norm(tasksStatus), norm(rhythmState)];
    for (const rank of ["loading", "error", "preview", "partial"]) {
      if (states.includes(rank)) return rank;
    }
    return "live";
  }, [tasksStatus, rhythmState]);

  const focusedIndex = hoveredDay !== null ? hoveredDay : (hasMatrix ? 6 : null);
  const focusedDay = focusedIndex !== null ? matrixDays[focusedIndex] : null;

  return (
    <div className="fx-card hub-rhythm-visualizer">
      {/* 헤더 — 스트릭 마크 + 타이틀 + 배지 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "var(--fx-pill)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--surface-2)",
            }}
          >
            <StreakMark size={18} level={longestStreak >= 14 ? 4 : longestStreak >= 7 ? 3 : longestStreak >= 3 ? 2 : (longestStreak >= 1 || ritualCompleted > 0) ? 1 : 0} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)" }}>
                Rhythm Command Visualizer
              </span>
              <Badge tone="moon" size="xs">
                {longestStreak > 0 ? `${longestStreak}일 연속 완주 중` : "리듬 점화 중"}
              </Badge>
            </div>
            <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 2 }}>
              몰입도 × 성과 상관 · 카테고리별 루틴 구성
            </div>
          </div>
        </div>
      </div>

      {/* 3대 핵심 퀵 메트릭 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
          marginTop: 22,
          paddingTop: 18,
          borderTop: "1px solid var(--line-soft)",
        }}
      >
        <div>
          <div style={{ fontSize: 10.5, color: "var(--fg-faint)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            주간 몰입 시간
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
            <span className="stat" style={{ fontSize: 22, fontWeight: 500 }}>{totalFocusHours}</span>
            <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>hours</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--fg-dim)", marginLeft: "auto" }}>일평균 {(Number(totalFocusHours) / 7).toFixed(1)}h</span>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 10.5, color: "var(--fg-faint)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            주간 목표 대비 체크인
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
            <span className="stat" style={{ fontSize: 22, fontWeight: 500 }}>{categoryCompleted} / {categoryTarget}</span>
            <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>건</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--fg-dim)", marginLeft: "auto" }}>{categoryPercent}% 달성</span>
          </div>
          {rhythmPartial && (
            <TruthBadge state="partial" reason="루틴 기록 최근분만 집계" style={{ marginTop: 6 }} />
          )}
        </div>

        <div>
          <div style={{ fontSize: 10.5, color: "var(--fg-faint)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            루틴 & 성과 지수
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
            <span className="stat" style={{ fontSize: 22, fontWeight: 500, color: "var(--moon-200)" }}>{avgPerformance}</span>
            <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>/ 100 pt</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--fg-muted)", marginLeft: "auto" }}>루틴 {ritualRate}%</span>
          </div>
        </div>
      </div>

      {/* 몰입도 × 성과 매트릭스 */}
      <div style={{ marginTop: 26 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>
              7일간의 몰입 집중도(Focus Hours) vs 산출 성과(Outcome)
            </div>
            <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 2 }}>
              막대는 딥워크 몰입 시간(할 일·루틴 완료 기반 추정치), 점선은 완료된 결과물 종합 점수입니다.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 11, color: "var(--fg-muted)", flexWrap: "wrap" }}>
            {tasksStatus !== "live" && (
              <TruthBadge
                state={tasksStatus === "partial" || tasksStatus === "preview" || tasksStatus === "loading" ? tasksStatus : "error"}
                reason={tasksStatus === "loading" ? undefined : "할 일 데이터"}
              />
            )}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--moon-400)" }} /> 몰입 시간 (h)
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--moon-200)" }} /> 성과 점수 (pt · 점선)
            </span>
          </div>
        </div>

        {!hasMatrix && matrixTruth === "loading" ? (
          /* 로딩은 레이아웃을 예고한다(§11) — EmptyState는 "비어 있음"이라는 다른 truth다. */
          <Skeleton lines={4} height={28} gap={14} label="리듬 매트릭스 불러오는 중" style={{ minHeight: 210, padding: "8px 0" }} />
        ) : !hasMatrix ? (
          /* live가 아니면 "체크인이 없습니다"라고 단정하지 않는다 — 원인만 말하고, 다시 읽기는
             페이지 상단 배너가 이미 갖고 있다(work.jsx의 rhythmState 배너). */
          <EmptyState
            icon="rhythm"
            title={matrixTruth === "live" ? "최근 7일 체크인이 없습니다" : "매트릭스를 그릴 수 없습니다"}
            description={matrixTruth === "live"
              ? "최근 7일 동안 완료한 할 일·루틴 체크인이 없습니다."
              : matrixTruth === "preview"
                ? "할 일·루틴 기록이 연결되면 7일 매트릭스를 그립니다."
                : "할 일·루틴 데이터를 읽지 못해 7일 매트릭스를 그릴 수 없습니다."}
            style={{ minHeight: 210 }}
          />
        ) : (
          <div style={{ width: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 4 }}>
            <div style={{ minWidth: 580, height: 210, position: "relative" }}>
              <svg width="100%" height="100%" viewBox="0 0 700 210" preserveAspectRatio="none" style={{ overflow: "visible" }}>
                <line x1="40" y1="30" x2="680" y2="30" stroke="var(--line-soft)" strokeDasharray="3 3" />
                <line x1="40" y1="85" x2="680" y2="85" stroke="var(--line-soft)" strokeDasharray="3 3" />
                <line x1="40" y1="140" x2="680" y2="140" stroke="var(--line-soft)" strokeDasharray="3 3" />
                <line x1="40" y1="175" x2="680" y2="175" stroke="var(--line)" />

                <text x="10" y="34" fill="var(--fg-faint)" fontSize="10.5" fontFamily="var(--font-mono)">5h/100</text>
                <text x="10" y="89" fill="var(--fg-faint)" fontSize="10.5" fontFamily="var(--font-mono)">3h/60</text>
                <text x="10" y="144" fill="var(--fg-faint)" fontSize="10.5" fontFamily="var(--font-mono)">1h/30</text>

                <path
                  d={matrixDays.reduce((acc, d, i) => {
                    const x = 75 + i * 90;
                    const y = 175 - (d.outcomes / 100) * 145;
                    return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
                  }, "")}
                  fill="none"
                  stroke="var(--moon-200)"
                  strokeDasharray="5 3"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {matrixDays.map((d, i) => {
                  const x = 75 + i * 90;
                  const barHeight = Math.max(8, (d.focusHours / 5.5) * 140);
                  const barY = 175 - barHeight;
                  const outcomeY = 175 - (d.outcomes / 100) * 145;
                  // 강조와 아래 상세 스트립의 기준을 하나로 — 초기 상태(오늘)에서도 막대가 강조된다.
                  const isHovered = focusedIndex === i;

                  return (
                    <g
                      key={i}
                      role="button"
                      tabIndex={0}
                      aria-label={`${d.day}요일: 몰입 ${d.focusHours}시간, 성과 ${d.outcomes}점`}
                      onClick={() => setHoveredDay(i)}
                      onFocus={() => setHoveredDay(i)}
                      onTouchStart={() => setHoveredDay(i)}
                      onMouseEnter={() => setHoveredDay(i)}
                      onMouseLeave={() => setHoveredDay(null)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setHoveredDay(i); } }}
                      style={{ cursor: "pointer" }}
                    >
                      {isHovered && (
                        <rect x={x - 36} y="15" width="72" height="165" rx="6" fill="var(--surface-2)" />
                      )}

                      <rect
                        x={x - 18}
                        y={barY}
                        width="36"
                        height={barHeight}
                        rx="4"
                        fill={isHovered ? "var(--moon-200)" : "var(--moon-400)"}
                        opacity={isHovered ? 0.95 : 0.75}
                        style={{ transition: "all var(--dur-hover) var(--ease-hub)" }}
                      />

                      <text x={x} y={barY - 6} textAnchor="middle" fill={isHovered ? "var(--fg)" : "var(--fg-dim)"} fontSize="10.5" fontFamily="var(--font-mono)">
                        {d.focusHours}h
                      </text>

                      <circle cx={x} cy={outcomeY} r={isHovered ? 6 : 4.5} fill="var(--moon-200)" stroke="var(--surface)" strokeWidth="2" style={{ transition: "r var(--dur-hover) var(--ease-hub)" }} />

                      <text x={x} y="196" textAnchor="middle" fill={isHovered ? "var(--fg)" : "var(--fg-muted)"} fontSize="11.5" fontWeight={isHovered ? "600" : "400"}>
                        {d.day}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        )}

        {focusedDay && (
          <div
            style={{
              marginTop: 14,
              padding: "10px 14px",
              borderRadius: "var(--r-sm)",
              background: "var(--surface-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: "var(--moon-200)" }}>
                {focusedDay.day}요일
              </span>
              <span style={{ fontSize: 12, color: "var(--fg)" }}>{focusedDay.label}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 11.5 }}>
              <span>몰입: <strong className="mono">{focusedDay.focusHours}시간</strong></span>
              <span>할일 완료: <strong className="mono">{focusedDay.tasksDone}건</strong></span>
              <span>루틴 완료: <strong className="mono">{focusedDay.ritualsDone}건</strong></span>
              <span style={{ color: "var(--moon-200)" }}>성과 점수: <strong className="mono">{focusedDay.outcomes}pt</strong></span>
            </div>
          </div>
        )}
      </div>

      {/* 카테고리별 루틴 구성 — 실데이터(하드코딩 업로드/성과 탭 대체, 2026-09-22) */}
      <div style={{ marginTop: 26, paddingTop: 22, borderTop: "1px solid var(--line-soft)" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>카테고리별 루틴 구성</div>
            <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 2 }}>
              루틴마다 지정한 카테고리·주간 목표 대비 이번 주 완료 현황입니다.
            </div>
          </div>
        </div>

        {categories.length === 0 ? (
          <div style={{ padding: "20px 16px", textAlign: "center", color: "var(--fg-faint)", fontSize: 12, background: "var(--surface-2)", borderRadius: "var(--r-sm)" }}>
            아직 카테고리가 지정된 루틴이 없습니다.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {categories.map((c) => {
              const percent = c.targetThisWeek > 0 ? Math.min(100, Math.round((c.completedThisWeek / c.targetThisWeek) * 100)) : 0;
              return (
                <div key={c.category} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ width: 64, fontSize: 12, color: "var(--fg)", flexShrink: 0 }}>{c.label}</span>
                  <span className="mono" style={{ width: 36, fontSize: 10.5, color: "var(--fg-faint)", flexShrink: 0 }}>{c.count}개</span>
                  <div style={{ flex: 1, height: 6, borderRadius: "var(--fx-pill)", background: "var(--surface-3)", overflow: "hidden" }}>
                    <div style={{ width: `${percent}%`, height: "100%", background: "var(--fg-muted)", borderRadius: "var(--fx-pill)", transition: "width var(--dur-enter) var(--ease-hub)" }} />
                  </div>
                  <span className="mono" style={{ width: 64, textAlign: "right", fontSize: 11, color: "var(--fg-muted)", flexShrink: 0 }}>
                    {c.completedThisWeek}/{c.targetThisWeek}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
