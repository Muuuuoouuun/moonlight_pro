"use client";

import React from "react";
import { Card, Badge, Button, Progress, Sparkline } from "./hub-primitives";
import { StreakFlame } from "./burning-streak";

// 기본 요일 메타 (최근 7일 레이블 및 요일별 몰입-성과 기본 시뮬레이션/계측 모델)
const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

/**
 * 리듬 섹션 종합 시각화 대시보드
 * - 업로드 리듬 (Content Upload Track & Goals)
 * - 성과 지표 (Performance Signals & Score)
 * - 몰입도 × 성과 상관 매트릭스 (Focus Immersion vs Outcomes Matrix)
 */
export function RhythmVisualizer({
  rituals = [],
  summary = null,
  uploadData = null,
  focusData = null,
  performanceData = null,
  onNavigate = null,
}) {
  const [activeTab, setActiveTab] = React.useState("matrix"); // "matrix" | "upload" | "performance"
  const [hoveredDay, setHoveredDay] = React.useState(null);

  // 1. 루틴 기반 성과 계산
  const ritualTotal = summary?.ritualsTotalThisWeek || rituals.length || 7;
  const ritualCompleted = summary?.ritualsCompletedThisWeek || rituals.filter(r => (r.weeks || []).some(Boolean)).length || 0;
  const ritualRate = ritualTotal > 0 ? Math.round((ritualCompleted / ritualTotal) * 100) : 0;
  const longestStreak = summary?.longestStreak || 0;

  // 2. 업로드 리듬 모델 (Threads 주 7개 목표, IG, Shorts)
  const defaultUploads = {
    weeklyGoal: 7,
    weeklyDone: 5,
    channels: [
      { name: "Threads", count: 3, goal: 5, tone: "moon" },
      { name: "Instagram", count: 1, goal: 2, tone: "neutral" },
      { name: "YT Shorts", count: 1, goal: 1, tone: "neutral" },
    ],
    days: [
      { day: "월", threads: 1, ig: 0, shorts: 0, total: 1 },
      { day: "화", threads: 0, ig: 0, shorts: 0, total: 0 },
      { day: "수", threads: 1, ig: 1, shorts: 0, total: 2 },
      { day: "목", threads: 0, ig: 0, shorts: 1, total: 1 },
      { day: "금", threads: 1, ig: 0, shorts: 0, total: 1 },
      { day: "토", threads: 0, ig: 0, shorts: 0, total: 0 },
      { day: "일", threads: 0, ig: 0, shorts: 0, total: 0 },
    ],
  };
  const upload = uploadData || defaultUploads;
  const uploadPercent = Math.min(100, Math.round((upload.weeklyDone / upload.weeklyGoal) * 100));

  // 3. 몰입도 vs 성과 7일 데이터 모델 (Focus Hours vs Outcome Score)
  const defaultWeeklyMatrix = [
    { day: "월", focusHours: 3.5, outcomes: 75, uploads: 1, tasksDone: 4, label: "기획 및 Threads 발행" },
    { day: "화", focusHours: 1.8, outcomes: 45, uploads: 0, tasksDone: 2, label: "고객 미팅 중심" },
    { day: "수", focusHours: 4.8, outcomes: 95, uploads: 2, tasksDone: 6, label: "핵심 딥워크 · 최대 성과" },
    { day: "목", focusHours: 2.2, outcomes: 60, uploads: 1, tasksDone: 3, label: "Shorts 제작 및 편집" },
    { day: "금", focusHours: 4.0, outcomes: 88, uploads: 1, tasksDone: 5, label: "주간 리뷰 및 집중 작업" },
    { day: "토", focusHours: 1.2, outcomes: 30, uploads: 0, tasksDone: 1, label: "아이디어 캡처" },
    { day: "일", focusHours: 2.5, outcomes: 65, uploads: 0, tasksDone: 3, label: "다음 주 전략 계획" },
  ];
  const matrixDays = focusData?.matrix || defaultWeeklyMatrix;

  // 총 몰입 시간 및 평균 성과
  const totalFocusHours = matrixDays.reduce((acc, d) => acc + d.focusHours, 0).toFixed(1);
  const avgPerformance = Math.round(matrixDays.reduce((acc, d) => acc + d.outcomes, 0) / matrixDays.length);

  // 4. 성과 신호 (조회수, 공유수, 문의)
  const defaultPerformance = {
    overallScore: 89,
    reachImpressions: "42.8K",
    reachDelta: "+18%",
    shares: 342,
    sharesDelta: "+24%",
    inquiries: 19,
    inquiriesDelta: "+4건",
    sparkline: [28, 35, 32, 54, 48, 62, 78],
  };
  const perf = performanceData || defaultPerformance;

  return (
    <Card pad={false} className="hub-rhythm-visualizer" style={{ overflow: "hidden", border: "1px solid var(--line-soft)" }}>
      {/* Visualizer Header: 탭 및 종합 게이지 */}
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--line-soft)",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          background: "var(--surface)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "var(--r-sm)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255, 120, 50, 0.12)",
              border: "1px solid rgba(255, 140, 70, 0.3)",
            }}
          >
            <StreakFlame size={18} burning={longestStreak >= 3 || ritualCompleted > 0} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>
                Rhythm Command Visualizer
              </span>
              <Badge tone="moon" size="xs">
                {longestStreak > 0 ? `${longestStreak}일 연속 완주 중` : "리듬 점화 중"}
              </Badge>
            </div>
            <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 2 }}>
              업로드 리듬 · 실행 성과 · 몰입도 상관 분석
            </div>
          </div>
        </div>

        {/* 탭 컨트롤 */}
        <div role="tablist" style={{ display: "flex", gap: 4, background: "var(--surface-2)", padding: 3, borderRadius: "var(--r-sm)", border: "1px solid var(--line-soft)" }}>
          <Button
            variant={activeTab === "matrix" ? "secondary" : "ghost"}
            size="xs"
            role="tab"
            aria-selected={activeTab === "matrix"}
            onClick={() => setActiveTab("matrix")}
          >
            몰입도 × 성과 매트릭스
          </Button>
          <Button
            variant={activeTab === "upload" ? "secondary" : "ghost"}
            size="xs"
            role="tab"
            aria-selected={activeTab === "upload"}
            onClick={() => setActiveTab("upload")}
          >
            업로드 리듬 ({upload.weeklyDone}/{upload.weeklyGoal})
          </Button>
          <Button
            variant={activeTab === "performance" ? "secondary" : "ghost"}
            size="xs"
            role="tab"
            aria-selected={activeTab === "performance"}
            onClick={() => setActiveTab("performance")}
          >
            성과 반응 ({perf.overallScore}점)
          </Button>
        </div>
      </div>

      {/* 3대 핵심 퀵 메트릭 바 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          borderBottom: "1px solid var(--line-soft)",
          background: "var(--surface-2)",
        }}
      >
        <div style={{ padding: "12px 20px", borderRight: "1px solid var(--line-soft)" }}>
          <div style={{ fontSize: 10.5, color: "var(--fg-faint)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            주간 몰입 시간
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
            <span className="stat" style={{ fontSize: 20, fontWeight: 600 }}>{totalFocusHours}</span>
            <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>hours</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--moon-300)", marginLeft: "auto" }}>일평균 {(totalFocusHours / 7).toFixed(1)}h</span>
          </div>
        </div>

        <div style={{ padding: "12px 20px", borderRight: "1px solid var(--line-soft)" }}>
          <div style={{ fontSize: 10.5, color: "var(--fg-faint)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            콘텐츠 업로드 진척
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
            <span className="stat" style={{ fontSize: 20, fontWeight: 600 }}>{upload.weeklyDone} / {upload.weeklyGoal}</span>
            <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>건</span>
            <span className="mono" style={{ fontSize: 11, color: uploadPercent >= 70 ? "var(--fg)" : "var(--fg-dim)", marginLeft: "auto" }}>{uploadPercent}% 달성</span>
          </div>
        </div>

        <div style={{ padding: "12px 20px" }}>
          <div style={{ fontSize: 10.5, color: "var(--fg-faint)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            루틴 & 성과 지수
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
            <span className="stat" style={{ fontSize: 20, fontWeight: 600, color: "#ff8a43" }}>{avgPerformance}</span>
            <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>/ 100 pt</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--fg-muted)", marginLeft: "auto" }}>루틴 {ritualRate}%</span>
          </div>
        </div>
      </div>

      {/* 메인 뷰 본문 */}
      <div style={{ padding: "20px" }}>
        {/* TAB 1: 몰입도 × 성과 매트릭스 (Focus Immersion vs Outcome) */}
        {activeTab === "matrix" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>
                  7일간의 몰입 집중도(Focus Hours) vs 산출 성과(Outcome)
                </div>
                <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 2 }}>
                  막대(Bar)는 딥워크 몰입 시간, 점과 선(Dot/Line)은 완료된 결과물 종합 점수입니다.
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 11, color: "var(--fg-muted)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--moon-400)" }} /> 몰입 시간 (h)
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff7836" }} /> 성과 점수 (pt)
                </span>
              </div>
            </div>

            {/* SVG 인터랙티브 차트 (모바일 가로 스크롤 및 터치 최적화) */}
            <div style={{ width: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 4 }}>
              <div style={{ minWidth: 580, height: 210, position: "relative" }}>
                <svg
                  width="100%"
                  height="100%"
                  viewBox="0 0 700 210"
                  preserveAspectRatio="none"
                  style={{ overflow: "visible" }}
                >
                  {/* 배경 가이드라인 */}
                  <line x1="40" y1="30" x2="680" y2="30" stroke="var(--line-soft)" strokeDasharray="3 3" />
                  <line x1="40" y1="85" x2="680" y2="85" stroke="var(--line-soft)" strokeDasharray="3 3" />
                  <line x1="40" y1="140" x2="680" y2="140" stroke="var(--line-soft)" strokeDasharray="3 3" />
                  <line x1="40" y1="175" x2="680" y2="175" stroke="var(--line)" />

                  {/* Y축 레이블 */}
                  <text x="10" y="34" fill="var(--fg-faint)" fontSize="10" fontFamily="var(--font-mono)">5h/100</text>
                  <text x="10" y="89" fill="var(--fg-faint)" fontSize="10" fontFamily="var(--font-mono)">3h/60</text>
                  <text x="10" y="144" fill="var(--fg-faint)" fontSize="10" fontFamily="var(--font-mono)">1h/30</text>

                  {/* 성과 점수 꺾은선 (Outcome Line) */}
                  <path
                    d={matrixDays.reduce((acc, d, i) => {
                      const x = 75 + i * 90;
                      const y = 175 - (d.outcomes / 100) * 145;
                      return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
                    }, "")}
                    fill="none"
                    stroke="#ff7836"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* 각 요일 데이터 기둥 및 성과 점 포인트 */}
                  {matrixDays.map((d, i) => {
                    const x = 75 + i * 90;
                    const barHeight = Math.max(8, (d.focusHours / 5.5) * 140);
                    const barY = 175 - barHeight;
                    const outcomeY = 175 - (d.outcomes / 100) * 145;
                    const isHovered = hoveredDay === i;

                    return (
                      <g
                        key={i}
                        role="button"
                        tabIndex={0}
                        aria-label={`${d.day}요일: 몰입 ${d.focusHours}시간, 성과 ${d.outcomes}점`}
                        onClick={() => setHoveredDay(i)}
                        onTouchStart={() => setHoveredDay(i)}
                        onMouseEnter={() => setHoveredDay(i)}
                        onMouseLeave={() => setHoveredDay((prev) => (prev === i ? prev : prev))}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setHoveredDay(i); } }}
                        style={{ cursor: "pointer", outline: "none" }}
                      >
                      {/* 호버 하이라이트 배경 */}
                      {isHovered && (
                        <rect
                          x={x - 36}
                          y="15"
                          width="72"
                          height="165"
                          rx="6"
                          fill="rgba(255, 255, 255, 0.04)"
                        />
                      )}

                      {/* 몰입 시간 막대 */}
                      <rect
                        x={x - 18}
                        y={barY}
                        width="36"
                        height={barHeight}
                        rx="4"
                        fill={isHovered ? "var(--moon-200)" : "var(--moon-400)"}
                        opacity={isHovered ? 0.95 : 0.75}
                        style={{ transition: "all var(--dur-hover) ease" }}
                      />

                      {/* 막대 상단 몰입 수치 */}
                      <text
                        x={x}
                        y={barY - 6}
                        textAnchor="middle"
                        fill={isHovered ? "var(--fg)" : "var(--fg-dim)"}
                        fontSize="10"
                        fontFamily="var(--font-mono)"
                      >
                        {d.focusHours}h
                      </text>

                      {/* 성과 포인트 (도트) */}
                      <circle
                        cx={x}
                        cy={outcomeY}
                        r={isHovered ? 6 : 4.5}
                        fill="#ff7836"
                        stroke="var(--surface)"
                        strokeWidth="2"
                        style={{ transition: "r var(--dur-hover) ease" }}
                      />

                      {/* 요일 X축 레이블 */}
                      <text
                        x={x}
                        y="196"
                        textAnchor="middle"
                        fill={isHovered ? "var(--fg)" : "var(--fg-muted)"}
                        fontSize="11.5"
                        fontWeight={isHovered ? "600" : "400"}
                      >
                        {d.day}
                      </text>
                    </g>
                  );
                })}
              </svg>
              </div>
            </div>

            {/* 선택/호버된 날짜의 상세 피드백 툴팁 바 */}
            <div
              style={{
                marginTop: 14,
                padding: "10px 14px",
                borderRadius: "var(--r-sm)",
                background: "var(--surface-2)",
                border: "1px solid var(--line-soft)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: "#ff8a43" }}>
                  {matrixDays[hoveredDay !== null ? hoveredDay : 2].day}요일 집중 인사이트
                </span>
                <span style={{ fontSize: 12, color: "var(--fg)" }}>
                  {matrixDays[hoveredDay !== null ? hoveredDay : 2].label}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 11.5 }}>
                <span>몰입: <strong className="mono">{matrixDays[hoveredDay !== null ? hoveredDay : 2].focusHours}시간</strong></span>
                <span>업로드: <strong className="mono">{matrixDays[hoveredDay !== null ? hoveredDay : 2].uploads}건</strong></span>
                <span>할일 완료: <strong className="mono">{matrixDays[hoveredDay !== null ? hoveredDay : 2].tasksDone}건</strong></span>
                <span style={{ color: "#ff8a43" }}>성과 점수: <strong className="mono">{matrixDays[hoveredDay !== null ? hoveredDay : 2].outcomes}pt</strong></span>
              </div>
            </div>

            {/* 상관관계 발견 (Correlation Insight) */}
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "var(--fg-muted)" }}>
              <span style={{ color: "var(--moon-300)" }}>💡</span>
              <span>
                <strong>몰입 × 성과 패턴:</strong> 몰입 시간이 3.5시간 이상인 요일(수·금)에 주간 핵심 성과 및 콘텐츠 업로드의 <strong>72%</strong>가 집중되었습니다.
              </span>
            </div>
          </div>
        )}

        {/* TAB 2: 업로드 리듬 (Content Upload Track) */}
        {activeTab === "upload" && (
          <div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>
                  주간 콘텐츠 발행 리듬
                </div>
                <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 2 }}>
                  Threads(매일 1개 기본 목표) 및 Instagram, YouTube Shorts 파생 채널 현황
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="stat" style={{ fontSize: 18, fontWeight: 600 }}>{upload.weeklyDone} / {upload.weeklyGoal}</span>
                <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>발행 완료</span>
              </div>
            </div>

            {/* 업로드 프로그레스 바 */}
            <Progress value={uploadPercent} style={{ marginBottom: 18 }} />

            {/* 채널별 카드 그리드 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 18 }}>
              {upload.channels.map((ch, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "12px 14px",
                    borderRadius: "var(--r-sm)",
                    background: "var(--surface-2)",
                    border: "1px solid var(--line-soft)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: "var(--fg)" }}>{ch.name}</span>
                    <Badge tone={ch.tone} size="xs">{ch.count}/{ch.goal}개</Badge>
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--fg-faint)" }}>
                    {ch.name === "Threads" ? "주요 도달 채널 (일 1개 목표)" : "파생 재생산 채널"}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <Progress value={Math.min(100, Math.round((ch.count / ch.goal) * 100))} />
                  </div>
                </div>
              ))}
            </div>

            {/* 7일 요일별 발행 타임라인 도트 */}
            <div
              style={{
                padding: "14px 16px",
                borderRadius: "var(--r-sm)",
                background: "var(--surface-2)",
                border: "1px solid var(--line-soft)",
              }}
            >
              <div style={{ fontSize: 11, color: "var(--fg-muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                최근 7일 업로드 릴리즈 타임라인
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, textAlign: "center" }}>
                {upload.days.map((item, idx) => {
                  const hasUpload = item.total > 0;
                  return (
                    <div key={idx} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>{item.day}</span>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "var(--r-sm)",
                          background: hasUpload ? "rgba(255, 120, 50, 0.15)" : "var(--surface-3)",
                          border: `1px solid ${hasUpload ? "#ff7836" : "var(--line-soft)"}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: hasUpload ? "#ff9a52" : "var(--fg-faint)",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {hasUpload ? item.total : "—"}
                      </div>
                      <span style={{ fontSize: 10, color: hasUpload ? "var(--fg)" : "var(--fg-faint)" }}>
                        {hasUpload ? `${item.total}건 발행` : "휴식"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: 성과 반응 지표 (Performance Outcomes) */}
        {activeTab === "performance" && (
          <div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>
                  핵심 성과 반응 신호 (Reach & Signals)
                </div>
                <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 2 }}>
                  운영자 프로필 기준 성과 신호: 조회 수(선행 신호) · 공유 수 · 문의/답글
                </div>
              </div>
              <Button
                variant="ghost"
                size="xs"
                iconRight="arrowRight"
                onClick={() => onNavigate?.("dashboard/growth")}
              >
                Growth 대시보드
              </Button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
              <div style={{ padding: "14px", borderRadius: "var(--r-sm)", background: "var(--surface-2)", border: "1px solid var(--line-soft)" }}>
                <div style={{ fontSize: 11, color: "var(--fg-faint)" }}>총 도달 조회 수 (선행 지표)</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
                  <span className="stat" style={{ fontSize: 22, fontWeight: 600 }}>{perf.reachImpressions}</span>
                  <span className="mono" style={{ fontSize: 11, color: "var(--moon-300)" }}>{perf.reachDelta}</span>
                </div>
                <div style={{ marginTop: 10 }}>
                  <Sparkline points={perf.sparkline} height={26} />
                </div>
              </div>

              <div style={{ padding: "14px", borderRadius: "var(--r-sm)", background: "var(--surface-2)", border: "1px solid var(--line-soft)" }}>
                <div style={{ fontSize: 11, color: "var(--fg-faint)" }}>공유 수 (바이럴 확산)</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
                  <span className="stat" style={{ fontSize: 22, fontWeight: 600 }}>{perf.shares}</span>
                  <span className="mono" style={{ fontSize: 11, color: "var(--moon-300)" }}>{perf.sharesDelta}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 10 }}>
                  루틴 업로드 주기에 따른 공유 확산 추세 지속
                </div>
              </div>

              <div style={{ padding: "14px", borderRadius: "var(--r-sm)", background: "var(--surface-2)", border: "1px solid var(--line-soft)" }}>
                <div style={{ fontSize: 11, color: "var(--fg-faint)" }}>답글 및 직접 문의</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
                  <span className="stat" style={{ fontSize: 22, fontWeight: 600, color: "#ff8a43" }}>{perf.inquiries}</span>
                  <span className="mono" style={{ fontSize: 11, color: "var(--fg-muted)" }}>{perf.inquiriesDelta}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 10 }}>
                  인바운드 리드 및 잠재 파트너십 전환 유입
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
