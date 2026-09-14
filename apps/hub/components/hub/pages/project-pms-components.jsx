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

// 컨테이너 칩 — 이전 드롭다운 행은 2줄(이름 + "N개 새 변동 · 설명")에 우측 `7p/7t`
// 칼럼까지 달려 4개만 떠도 세로가 과했다. 칩은 한 줄(마크 · 이름 · 프로젝트 수)로 줄이고
// 나머지는 접근 가능한 이름과 툴팁으로 보존한다. 새 변동은 숫자 칩 대신 중립 문스톤 점
// 하나 — 손실 신호가 아니다(DESIGN §5.2 no-warning-by-default).
function ContainerChip({ container, count, selected, folderLabel, onSelect }) {
  const changes = container?.changes || 0;
  const name = container?.name || "컨테이너";
  const detail = [
    `프로젝트 ${count}개`,
    changes > 0 ? `새 변동 ${changes}개` : null,
    folderLabel || null,
    container?.desc || null,
  ].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      className="hub-pms-chip"
      aria-pressed={selected}
      aria-label={`${name} · ${detail}`}
      title={`${name} · ${detail}`}
      data-container-chip={container?.key || "all"}
      onClick={() => onSelect(container?.key)}
    >
      <span className="hub-pms-chip__mark">
        <BrandMark brand={container} size={14} active={selected} />
        {changes > 0 && <span className="hub-pms-chip__dot" aria-hidden="true" />}
      </span>
      <span className="hub-pms-chip__name">{name}</span>
      <span className="hub-pms-chip__count mono">{count}</span>
    </button>
  );
}

// PMS 컨테이너 선택 바 — 헤더 드롭다운을 상시 한 줄 태그 필터로 대체한다
// (2026-09-11 운영자 지시). 선택은 단일(brand state 계약 무변경)이고, 분류 텍스트 헤더
// 없이 칩 순서 + 스코프 경계 1px hairline만으로 묶음을 읽게 한다. 드롭다운 안에만 있던
// 관리 액션(생성·편집·숨긴 컨테이너)은 `tail`로 받아 도달 불가가 되지 않게 한다.
export function ContainerFilterBar({
  allContainer,
  allCount = 0,
  groups = [],
  countOf = () => 0,
  selectedKey = "all",
  onSelect,
  hiddenCount = 0,
  showEmpty = false,
  onToggleEmpty,
  tail = null,
}) {
  const trackRef = React.useRef(null);

  // 선택 칩이 가로 스크롤 밖에 있으면 스스로 보이는 자리로 — 딥링크·사이드바 선택으로
  // 브랜드가 바뀌었을 때 활성 칩이 화면 밖에 남으면 "선택이 없는 것"처럼 읽힌다.
  React.useEffect(() => {
    const node = trackRef.current?.querySelector(`[data-container-chip="${CSS.escape(String(selectedKey))}"]`);
    node?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedKey]);

  return (
    <nav className="hub-pms-filterbar" aria-label="프로젝트 컨테이너 필터">
      <div className="hub-pms-filterbar__track" ref={trackRef}>
        <ContainerChip
          container={allContainer}
          count={allCount}
          selected={selectedKey === "all"}
          onSelect={onSelect}
        />
        {groups.map((group) => (
          <React.Fragment key={group.key}>
            <span className="hub-pms-filterbar__sep" role="separator" aria-orientation="vertical" aria-label={group.label} />
            {group.items.map((container) => (
              <ContainerChip
                key={container.key}
                container={container}
                count={countOf(container)}
                folderLabel={container.folderLabel}
                selected={selectedKey === container.key}
                onSelect={onSelect}
              />
            ))}
          </React.Fragment>
        ))}
        {(hiddenCount > 0 || showEmpty) && (
          <button
            type="button"
            className="hub-pms-chip hub-pms-chip--ghost"
            aria-pressed={showEmpty}
            onClick={onToggleEmpty}
          >
            <span className="hub-pms-chip__name">{showEmpty ? "빈 컨테이너 숨기기" : "숨긴 컨테이너"}</span>
            {!showEmpty && <span className="hub-pms-chip__count mono">{hiddenCount}</span>}
          </button>
        )}
      </div>
      {tail && <div className="hub-pms-filterbar__tail">{tail}</div>}
    </nav>
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

  const isCompleted = value >= 100;

  return (
    <div
      className={`hub-pms-progress${compact ? " hub-pms-progress--compact" : ""}${isCompleted ? " hub-pms-progress--completed" : ""}`}
      data-progress-source={progress.source || "reported"}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={valueText}
    >
      <div className="hub-pms-progress__reading">
        <span className={`hub-pms-progress__value mono${isCompleted ? " hub-pms-progress__value--100" : ""}`}>
          {value}%{isCompleted && <span className="hub-pms-sparkle-mark" aria-hidden="true">✦</span>}
        </span>
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

// onSelectCell이 있으면 각 칸이 원클릭 필터 토글이 된다 (Jira quick filter 문법,
// 2026-08-19 PMS 디벨롭). 선택 표시는 Moonstone 외곽 outline — §5.3 선택 채널.
export function ProjectPortfolioSummary({ projects = [], sourceState = "live", projectCorePartial = false, activeKey = null, onSelectCell = null }) {
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
      {PORTFOLIO_CELLS.map((cell) => {
        const content = (
          <>
            <span className="hub-pms-summary__label">{cell.label}</span>
            <strong className="hub-pms-summary__value stat">
              {metrics.lowerBound ? `${metrics[cell.key]}+` : metrics[cell.key]}
            </strong>
            <span className="hub-pms-summary__description">
              {cell.description}{metrics.lowerBound ? " · 일부 범위" : ""}
            </span>
          </>
        );
        if (!onSelectCell) {
          return <div className="hub-pms-summary__cell" key={cell.key}>{content}</div>;
        }
        const selected = activeKey === cell.key;
        return (
          <button
            type="button"
            key={cell.key}
            className="hub-pms-summary__cell hub-row"
            aria-pressed={selected}
            aria-label={`${cell.label} 필터${selected ? ' 해제' : ''}`}
            onClick={() => onSelectCell(selected ? null : cell.key)}
            style={{
              textAlign: 'left', cursor: 'pointer',
              ...(selected ? { outline: '1px solid var(--moon-300)', outlineOffset: -1 } : {}),
            }}
          >
            {content}
          </button>
        );
      })}
    </section>
  );
}
