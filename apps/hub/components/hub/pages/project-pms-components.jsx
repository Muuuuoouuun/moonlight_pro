"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import { BrandIcon } from "../brand-icons";
import { LifecycleBadge } from "../hub-primitives";
import { Button, Drawer, TextField } from "../hub-primitives";
import { buildProjectPortfolioMetrics } from "./project-pms-metrics";

// ── PMS 프로젝트 상태 → DESIGN.md §8.2 lifecycle 열거값 ──────────────────────
// §8.2: props는 색 이름이 아니라 의미 열거값이고, 표현은 primitive가 소유한다.
// §5.3 lifecycle 행: 아이콘 + 직접 텍스트, blocked만 danger를 상속한다.
// 기록 정규화가 내보내는 라벨은 Planning · Blocked · Done · Backlog ·
// 'In progress' 다섯 개이고, Review는 operator-home-summary가 아직 세는 유산 상태다.
//
//   In progress → active   착수해서 굴러가는 작업.
//   Review      → active   검토도 진행 중인 작업이다. 'waiting'은 §5.3이
//                          "pause glyph + named dependency"를 요구하는데
//                          프로젝트 레코드에 의존 대상 필드가 없다 —
//                          없는 의존을 지어내느니 active로 둔다.
//   Planning    → queued   착수 전.
//   Backlog     → queued   기록 'archived'(보류)의 표시 라벨. 'cancelled'는
//                          "취소"를 뜻해 오독이고, 이 행에는 되살리는
//                          "다시 열기" 체크박스가 붙어 있다. queued가
//                          덜 정확할 뿐 틀리지는 않고, 보이는 라벨 '백로그'가
//                          실제 단계를 말한다.
//   Blocked     → blocked  이 표면의 유일한 danger.
//   Done        → done
export const PROJECT_LIFECYCLE_STATE = {
  'In progress': 'active',
  Review: 'active',
  Planning: 'queued',
  Backlog: 'queued',
  Blocked: 'blocked',
  Done: 'done',
};

// §8.2 "visible Korean labels and an equivalent accessible name" — LifecycleBadge가
// 같은 문구로 aria-label('진행 상태: …')을 짜므로 라벨 정본은 여기 하나다.
export const PROJECT_STATUS_LABEL_KO = {
  'In progress': '작업 중',
  Review: '검토',
  Planning: '계획',
  Blocked: '막힘',
  Done: '완료',
  Backlog: '백로그',
};

export function projectLifecycleState(status) {
  return PROJECT_LIFECYCLE_STATE[status] || 'queued';
}

export function projectStatusLabel(status) {
  return PROJECT_STATUS_LABEL_KO[status] || status || '상태 미정';
}

// PMS의 모든 프로젝트 상태 칩은 이 어댑터 하나를 거친다(§8.1 primitives-first):
// List 행 · 완료/보관 목록 · Timeline 기한미정 · 상세 패널이 같은 라벨,
// 같은 접근성 이름, 같은 기하를 쓴다.
export function ProjectStatusBadge({ status, style }) {
  return (
    <LifecycleBadge
      state={projectLifecycleState(status)}
      label={projectStatusLabel(status)}
      style={style}
    />
  );
}

// 브랜드 소속 타일은 브랜드 목록과 같은 상징을 쓴다. '전체 브랜드'만 공용 브랜드
// 아이콘을 사용한다. 저장된 meta.glyph는 건드리지 않고 화면 표현만 교체한다.
// `tint` = projectGenreTint(project.genre) — only the project index passes it (§15 2026-09-24).
export function BrandMark({ brand, size = 18, active = false, tint = null, style }) {
  const isIndex = !brand || brand.kind === 'index' || brand.key === 'all';
  return (
    <span
      aria-hidden="true"
      data-genre={tint || undefined}
      style={{
        width: size, height: size, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: Math.max(4, Math.round(size * 0.26)),
        background: tint ? `var(--genre-${tint}-bg)` : active ? 'var(--elevated)' : 'var(--surface-3)',
        border: `1px solid ${tint ? `var(--genre-${tint}-line)` : 'var(--line-soft)'}`,
        color: tint ? `var(--genre-${tint}-fg)` : active ? 'var(--fg)' : 'var(--fg-muted)',
        ...style,
      }}
    >
      {isIndex ? <Iconed name="brand" size={Math.round(size * 0.72)} /> : <BrandIcon brand={brand} size={Math.round(size * 0.72)} />}
    </span>
  );
}

// 컨테이너 칩 — 이전 드롭다운 행은 2줄(이름 + "N개 새 변동 · 설명")에 우측 `7p/7t`
// 칼럼까지 달려 4개만 떠도 세로가 과했다. 칩은 한 줄(이름 · 프로젝트 수)로 줄이고
// 나머지는 접근 가능한 이름과 툴팁으로 보존한다. 모노그램 마크는 뺐다 — 이름 앞 첫
// 글자를 그대로 타일에 새기는 구조라 바로 옆 이름과 글자가 겹쳐 보였다(2026-09-15
// 운영자 지시). 새 변동은 숫자 칩 대신 중립 문스톤 점 하나 — 손실 신호가 아니다
// (DESIGN §5.2 no-warning-by-default).
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
      {changes > 0 && <span className="hub-pms-chip__dot" aria-hidden="true" />}
      <span className="hub-pms-chip__name">{name}</span>
      <span className="hub-pms-chip__count mono">{count}</span>
    </button>
  );
}

// PMS 컨테이너 선택 바 — 기본 화면에는 현재 소속 하나만 남긴다.
// 검색/선택은 compact Drawer를 재사용하고 관리 액션은 tail에서 접근한다.
export function ContainerFilterBar({
  allContainer,
  allCount = 0,
  groups = [],
  countOf = () => 0,
  selectedKey = "all",
  onSelect,
  onOpenChange,
  hiddenCount = 0,
  showEmpty = false,
  onToggleEmpty,
  tail = null,
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  React.useEffect(() => {
    onOpenChange?.(open);
    return () => onOpenChange?.(false);
  }, [open, onOpenChange]);
  const selected = groups.flatMap(group => group.items).find(item => item.key === selectedKey) || allContainer;
  const needle = query.trim().toLocaleLowerCase();
  const visibleGroups = groups.map(group => ({ ...group, items: group.items.filter(item =>
    `${group.label} ${item.folderLabel || ''} ${item.name}`.toLocaleLowerCase().includes(needle)) })).filter(group => group.items.length);
  const choose = key => { onSelect(key); setOpen(false); setQuery(''); };
  return (
    <nav className="hub-pms-filterbar" aria-label="프로젝트 컨테이너 필터">
      <Button variant="outline" size="sm" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        소속 · {selected?.name || '전체'} <Iconed name="chevronD" size={12} />
      </Button>
      {tail && <div className="hub-pms-filterbar__tail">{tail}</div>}
      {open && <Drawer title="소속 선택" presentation="compact" width="min(400px, 94vw)" onClose={() => { setOpen(false); setQuery(''); }}>
        <TextField label="소속 찾기" placeholder="브랜드·컨테이너 이름" value={query} onChange={event => setQuery(event.target.value)} />
        <div className="hub-container-options">
          <ContainerChip container={allContainer} count={allCount} selected={selectedKey === "all"} onSelect={choose} />
          {visibleGroups.map(group => <div key={group.key} className="hub-container-options__group">
            <span className="hub-container-options__scope">{group.label}</span>
            {group.items.map(container => <ContainerChip key={container.key} container={container} count={countOf(container)}
              folderLabel={container.folderLabel} selected={selectedKey === container.key} onSelect={choose} />)}
          </div>)}
          {needle && !visibleGroups.length && <p role="status">일치하는 소속이 없습니다.</p>}
          {(hiddenCount > 0 || showEmpty) && <Button variant="ghost" size="sm" aria-pressed={showEmpty} onClick={onToggleEmpty}>
            {showEmpty ? '빈 컨테이너 숨기기' : `숨긴 컨테이너 ${hiddenCount}개 보기`}
          </Button>}
        </div>
      </Drawer>}
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

  const isChecklist = progress.source === 'tasks' && Boolean(countLabel);
  const reading = isChecklist ? `${countLabel} 완료` : `${value}%`;

  return (
    <div
      className={`hub-pms-progress hub-pms-progress--evidence${compact ? " hub-pms-progress--compact" : ""}`}
      data-progress-source={progress.source || "reported"}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={valueText}
    >
      <div className="hub-pms-progress__reading">
        <span className="hub-pms-progress__value mono">{reading}</span>
        <span className="hub-pms-progress__evidence">
          {isChecklist ? "체크리스트" : sourceLabel}
        </span>
      </div>
      <div className="hub-pms-progress__track" aria-hidden="true">
        <span className="hub-pms-progress__fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

const PORTFOLIO_CELLS = [
  { key: "active", label: "진행 중", description: "active 기록 상태" },
  { key: "blockedOrOverdue", label: "막힘 · 지연", description: "막힘 또는 기한 경과" },
  { key: "dueSoon", label: "7일 내 기한", description: "오늘 포함 다음 7일" },
  { key: "unmeasured", label: "진척 미측정", description: "관찰 가능한 근거 없음" },
];

// onSelectCell이 있으면 각 칸이 원클릭 필터 토글이 된다 (Jira quick filter 문법,
// 2026-08-19 PMS 디벨롭). 선택 표시는 Moonstone 외곽 outline — §5.3 선택 채널.
export function ProjectPortfolioSummary({ projects = [], sourceState = "live", projectCorePartial = false, activeKey = null, onSelectCell = null }) {
  const metrics = buildProjectPortfolioMetrics(projects, { sourceState, projectCorePartial });
  const unavailableLabel = sourceState === "error"
    ? "프로젝트 기록을 읽지 못해 요약을 계산하지 않았습니다."
    : sourceState === "loading"
      ? "프로젝트 기록을 확인하는 중입니다."
      : "실제 프로젝트 기록이 연결되면 요약을 표시합니다.";

  if (!metrics || metrics.empty) {
    return (
      <section className="hub-pms-summary hub-pms-summary--empty" aria-label="프로젝트 포트폴리오 요약">
        <span>{metrics?.empty ? "표시할 기록 없음" : unavailableLabel}</span>
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
