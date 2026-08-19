"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import { buildProjectPortfolioMetrics } from "./project-pms-metrics";

// 컨테이너 모노그램 마크 — 모양·무게가 제각각인 기하 글리프(◐ ◇ □ △ …)를 렌더에서
// 대체한다(2026-08-19 운영자 지시 "아이콘 변경"). 이름 첫 글자를 고정 타일에 새겨
// 목록의 시각 무게를 균일하게 만들고, '전체 브랜드'(kind:index)만 brand 아이콘을 쓴다.
// meta.glyph 데이터는 그대로 둔다 — 표현만 교체라 되돌리기 쉽다.
export function BrandMark({ brand, size = 18, active = false, style }) {
  const isIndex = !brand || brand.kind === 'index' || brand.key === 'all';
  const letter = isIndex ? '' : (Array.from(String(brand.name || '').trim())[0] || '·').toUpperCase();
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: Math.max(4, Math.round(size * 0.26)),
        background: active ? 'var(--elevated)' : 'var(--surface-3)',
        border: '1px solid var(--line-soft)',
        color: active ? 'var(--fg)' : 'var(--fg-muted)',
        // 타일 글자도 §6 크기 플로어(10.5px) 아래로 내리지 않는다.
        fontSize: Math.max(10.5, Math.round(size * 0.55)),
        fontWeight: 600, lineHeight: 1, letterSpacing: 0,
        ...style,
      }}
    >
      {isIndex ? <Iconed name="brand" size={Math.round(size * 0.62)} /> : letter}
    </span>
  );
}

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

const PORTFOLIO_CELLS = [
  { key: "active", label: "진행 중", description: "active 원장 상태" },
  { key: "blockedOrOverdue", label: "막힘 · 지연", description: "막힘 또는 기한 경과" },
  { key: "dueSoon", label: "7일 내 기한", description: "오늘 포함 다음 7일" },
  { key: "unmeasured", label: "진척 미측정", description: "관찰 가능한 근거 없음" },
];

export function ProjectPortfolioSummary({ projects = [], sourceState = "live", projectCorePartial = false }) {
  const metrics = buildProjectPortfolioMetrics(projects, { sourceState, projectCorePartial });
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
          <strong className="hub-pms-summary__value stat">
            {metrics.lowerBound ? `${metrics[cell.key]}+` : metrics[cell.key]}
          </strong>
          <span className="hub-pms-summary__description">
            {cell.description}{metrics.lowerBound ? " · 일부 범위" : ""}
          </span>
        </div>
      ))}
    </section>
  );
}
