"use client";

import React from "react";

const DAY_MS = 86_400_000;
const TERMINAL_PROJECT_STATUSES = new Set([
  "done",
  "completed",
  "archived",
  "cancelled",
  "canceled",
]);

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizedStatus(project) {
  return String(project?.statusKey || project?.status || "").trim().toLowerCase();
}

function evidenceCount(progress) {
  if (!Number.isFinite(progress?.done) || !Number.isFinite(progress?.total)) return "";
  return `${progress.done}/${progress.total}`;
}

export function ProjectProgressGauge({ progress, compact = false }) {
  const determinate = Number.isFinite(progress?.value) && !progress?.partial;
  const sourceLabel = progress?.label || "진척 근거 없음";
  const countLabel = evidenceCount(progress);

  if (!determinate) {
    return (
      <div
        className={`hub-pms-progress hub-pms-progress--empty${compact ? " hub-pms-progress--compact" : ""}`}
        data-progress-source={progress?.source || "none"}
      >
        <span className="hub-pms-progress__empty">진척 데이터 없음</span>
        {progress && (
          <span className="hub-pms-progress__evidence">
            {progress.label}{countLabel ? ` · ${countLabel} 확인` : ""}
          </span>
        )}
      </div>
    );
  }

  const value = Math.max(0, Math.min(100, Math.round(progress.value)));
  const valueText = `${value}% · ${sourceLabel}${countLabel ? ` · ${countLabel} 완료` : ""}`;

  return (
    <div
      className={`hub-pms-progress${compact ? " hub-pms-progress--compact" : ""}`}
      data-progress-source={progress.source || "reported"}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={valueText}
    >
      <div className="hub-pms-progress__reading">
        <span className="hub-pms-progress__value mono">{value}%</span>
        <span className="hub-pms-progress__evidence">
          {sourceLabel}{countLabel ? ` · ${countLabel}` : ""}
        </span>
      </div>
      <div className="hub-pms-progress__track" aria-hidden="true">
        <span className="hub-pms-progress__fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function ProjectPlanningLinks({ projectId, projectName = "프로젝트" }) {
  if (!projectId) return null;
  const encodedProjectId = encodeURIComponent(projectId);
  const links = [
    { label: "상세 · 목록", href: `/dashboard/work/projects?project=${encodedProjectId}` },
    { label: "Timeline", href: `/dashboard/work/projects?view=timeline&project=${encodedProjectId}` },
    { label: "Roadmap", href: `/dashboard/work/roadmap?project=${encodedProjectId}` },
    { label: "Rhythm", href: `/dashboard/work/rhythm?project=${encodedProjectId}` },
  ];

  return (
    <nav className="hub-project-planning-links" aria-label={`${projectName} 기획 화면`}>
      {links.map((link) => <a key={link.label} href={link.href}>{link.label}</a>)}
    </nav>
  );
}

export function buildProjectPortfolioMetrics(projects = [], {
  today = new Date(),
  sourceState = "live",
} = {}) {
  if (sourceState !== "live") return null;
  if (!Array.isArray(projects) || projects.length === 0) {
    return { empty: true, active: null, blockedOrOverdue: null, dueSoon: null, unmeasured: null };
  }

  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);
  const dueSoonEnd = new Date(todayStart.getTime() + (7 * DAY_MS));
  const now = todayStart.getTime();
  const soon = dueSoonEnd.getTime();

  let active = 0;
  let blockedOrOverdue = 0;
  let dueSoon = 0;
  let unmeasured = 0;

  projects.forEach((project) => {
    const status = normalizedStatus(project);
    const terminal = TERMINAL_PROJECT_STATUSES.has(status);
    const due = validDate(project.dueAt);
    const overdue = !terminal && due && due.getTime() < now;

    if (status === "active" || status === "in progress") active += 1;
    if (!terminal && (status === "blocked" || overdue)) blockedOrOverdue += 1;
    if (!terminal && due && due.getTime() >= now && due.getTime() < soon) dueSoon += 1;
    if (!Number.isFinite(project.displayProgress?.value)) unmeasured += 1;
  });

  return { empty: false, active, blockedOrOverdue, dueSoon, unmeasured };
}

const PORTFOLIO_CELLS = [
  { key: "active", label: "진행 중", description: "active 원장 상태" },
  { key: "blockedOrOverdue", label: "막힘 · 지연", description: "막힘 또는 기한 경과" },
  { key: "dueSoon", label: "7일 내 기한", description: "오늘 포함 다음 7일" },
  { key: "unmeasured", label: "진척 미측정", description: "관찰 가능한 근거 없음" },
];

export function ProjectPortfolioSummary({ projects = [], sourceState = "live" }) {
  const metrics = buildProjectPortfolioMetrics(projects, { sourceState });
  const unavailableLabel = sourceState === "error"
    ? "프로젝트 원장을 읽지 못해 요약을 계산하지 않았습니다."
    : sourceState === "loading"
      ? "프로젝트 원장을 확인하는 중입니다."
      : "preview에서는 실제 원장 요약을 표시하지 않습니다.";

  if (!metrics || metrics.empty) {
    return (
      <section className="hub-pms-summary hub-pms-summary--empty" aria-label="프로젝트 포트폴리오 요약">
        <span>{metrics?.empty ? "표시할 원장 없음" : unavailableLabel}</span>
      </section>
    );
  }

  return (
    <section className="hub-pms-summary" aria-label="프로젝트 포트폴리오 요약">
      {PORTFOLIO_CELLS.map((cell) => (
        <div className="hub-pms-summary__cell" key={cell.key}>
          <span className="hub-pms-summary__label">{cell.label}</span>
          <strong className="hub-pms-summary__value stat">{metrics[cell.key]}</strong>
          <span className="hub-pms-summary__description">{cell.description}</span>
        </div>
      ))}
    </section>
  );
}
