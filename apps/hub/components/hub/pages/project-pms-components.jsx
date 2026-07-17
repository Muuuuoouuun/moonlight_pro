"use client";

import React from "react";
import { buildProjectPortfolioMetrics } from "./project-pms-metrics";

function evidenceCount(progress) {
  if (!Number.isFinite(progress?.done) || !Number.isFinite(progress?.total)) return "";
  return `${progress.done}/${progress.total}`;
}

export function ProjectProgressGauge({ progress, compact = false, ariaLabel = "프로젝트 진척" }) {
  const determinate = Number.isFinite(progress?.value) && !progress?.partial;
  const sourceLabel = progress?.label || "진척 근거 없음";
  const countLabel = evidenceCount(progress);

  if (!determinate) {
    return (
      <div
        className={`hub-pms-progress hub-pms-progress--empty${compact ? " hub-pms-progress--compact" : ""}`}
        data-progress-source={progress?.source || "none"}
        role="group"
        aria-label={ariaLabel}
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
      aria-label={ariaLabel}
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
      : "실제 프로젝트 원장이 연결되면 요약을 표시합니다.";

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
