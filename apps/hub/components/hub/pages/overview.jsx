"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import { Badge, Card, SectionTitle, Button, Dot, Divider, EmptyState, SyncBadge, SegmentedControl, Sparkline, Progress } from "../hub-primitives";
import {
  activitySeriesAvailability,
  buildAutomationMetricRows,
  buildOverviewKpiCards,
  overviewDisclosureMessages,
  overviewPanelAvailability,
  overviewSyncState,
  projectActivityAvailability,
  recentActivityAvailability,
} from "./overview-truth";

const fmtMoney = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return '₩0';
  if (n >= 1000000) return `₩${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `₩${Math.round(n / 1000)}K`;
  return `₩${n}`;
};

const PERIOD_OPTIONS = [
  { key: '7', label: '7일' },
  { key: '14', label: '14일' },
  { key: '30', label: '30일' },
];

const KIND_LABEL = { work: '작업', decision: '결정', content: '콘텐츠', automation: '자동화' };
const CHART_HEIGHT = 120;

// Project-status donut ring colors — categories use a monochrome Moonstone/neutral
// scale. Only genuinely blocked work receives the danger signal.
const RING_COLORS = {
  planning: 'var(--fg-faint)',
  active: 'var(--moon-300)',
  review: 'var(--moon-500)',
  blocked: 'var(--danger)',
  done: 'var(--fg-dim)',
  backlog: 'var(--line-strong)',
};

function relativeLabel(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMin = Math.round((Date.now() - then) / 60000);
  if (diffMin < 1) return '방금';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}일 전`;
  return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(new Date(iso));
}

function dayLabel(dateKey) {
  return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(new Date(`${dateKey}T00:00:00`));
}

const EMPTY_LEDGER = {
  status: 'preview',
  source: 'preview',
  failedSources: [],
  partialSources: [],
  sources: [],
  kpis: { updatesThisWeek: null, decisionsThisWeek: null, publishedThisWeek: null, activeProjects: null, blockedProjects: null },
  activitySeries: [],
  operatorHome: null,
  revenue: { summary: {}, stageSeries: [] },
  automationsSummary: {},
  brandActivity: [],
  rhythm: { state: 'preview', summary: {}, rituals: [] },
  recentActivity: [],
};

function useOverviewLedger() {
  const [ledger, setLedger] = React.useState(EMPTY_LEDGER);
  const [syncState, setSyncState] = React.useState('preview');

  React.useEffect(() => {
    let active = true;
    async function load() {
      setSyncState('loading');
      try {
        const response = await fetch('/api/hub/overview', { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (!active || !response.ok || !data) {
          if (active) setSyncState('error');
          return;
        }
        setLedger(data);
        setSyncState(overviewSyncState(data));
      } catch {
        if (active) setSyncState('error');
      }
    }
    load();
    return () => { active = false; };
  }, []);

  return { ledger, syncState };
}

// 패널 문구 단일 테이블 — 이전에는 카드마다 4중첩 삼항 안에 문구가 흩어져 있어 같은
// 상태(preview/error/partial/empty)인데도 표현이 조금씩 달랐다. reason → [제목, 설명].
const PANEL_COPY = {
  projects: {
    title: '프로젝트 상태',
    icon: 'projects',
    preview: ['프로젝트 원장 미연결', '프로젝트 원장을 연결하면 상태 분포가 표시됩니다.'],
    error: ['프로젝트 원장 읽기 실패', '프로젝트 원장을 다시 읽은 뒤 상태 분포를 표시합니다.'],
    partial: ['프로젝트 부분 데이터', '원장의 일부만 읽혀 빈 상태로 확정할 수 없습니다.'],
    empty: ['프로젝트 데이터 없음', '프로젝트가 생기면 상태 분포가 표시됩니다.'],
    partialNotice: '프로젝트 부분 데이터 · 읽힌 프로젝트만 표시합니다.',
  },
  content: {
    title: '콘텐츠 파이프라인',
    icon: 'content',
    preview: ['콘텐츠 원장 미연결', '콘텐츠 원장을 연결하면 파이프라인이 표시됩니다.'],
    error: ['콘텐츠 원장 읽기 실패', '콘텐츠 원장을 다시 읽은 뒤 파이프라인을 표시합니다.'],
    partial: ['콘텐츠 부분 데이터', '원장의 일부만 읽혀 빈 상태로 확정할 수 없습니다.'],
    empty: ['콘텐츠 데이터 없음', '콘텐츠 아이템이 생기면 파이프라인이 표시됩니다.'],
    partialNotice: '콘텐츠 부분 데이터 · 읽힌 항목만 표시합니다.',
  },
  brand: {
    title: '브랜드별 최근 활동',
    icon: 'brand',
    preview: ['브랜드 활동 원장 미연결', '프로젝트 원장을 연결하면 브랜드별 활동이 표시됩니다.'],
    error: ['브랜드 활동 원장을 읽지 못했습니다', '프로젝트 업데이트와 결정 원장을 다시 읽은 뒤 표시합니다.'],
    partial: ['브랜드 활동 부분 데이터', '원장의 일부만 읽혀 비중을 확정할 수 없습니다.'],
    empty: ['브랜드 활동 없음', '프로젝트 업데이트·결정이 쌓이면 브랜드별 비중이 표시됩니다.'],
    partialNotice: '브랜드 활동 부분 데이터 · 읽힌 기록만 표시합니다.',
  },
  revenue: {
    title: '파이프라인 단계',
    icon: 'deals',
    preview: ['매출 원장 미연결', '매출 원장을 연결하면 파이프라인 단계가 표시됩니다.'],
    error: ['매출 원장 읽기 실패', '매출 원장을 다시 읽은 뒤 파이프라인을 표시합니다.'],
    partial: ['매출 원장 부분 데이터', '원장의 일부만 읽혀 딜이 없다고 확정할 수 없습니다.'],
    empty: ['딜이 없습니다', '파이프라인에 딜이 생기면 단계별 분포가 표시됩니다.'],
    partialNotice: '매출 원장 부분 데이터 · 읽힌 딜만 표시합니다.',
  },
  automations: {
    title: '자동화 현황',
    icon: 'automations',
    preview: ['자동화 원장 미연결', '자동화 원장을 연결하면 실행 현황이 표시됩니다.'],
    error: ['자동화 원장 읽기 실패', '자동화 원장을 다시 읽은 뒤 실행 현황을 표시합니다.'],
    partial: ['자동화 원장 부분 데이터', '원장의 일부만 읽혀 실행 수를 확정할 수 없습니다.'],
    empty: ['자동화 데이터 없음', '자동화가 생기면 실행 현황이 표시됩니다.'],
    partialNotice: '자동화 원장 부분 데이터 · 읽힌 지표만 표시합니다.',
  },
  rhythm: {
    title: '리듬',
    icon: 'rhythm',
    preview: ['리듬 원장 미연결', '리듬 원장을 연결하면 이번 주 체크인이 표시됩니다.'],
    error: ['리듬 원장 읽기 실패', '리듬 원장을 다시 읽은 뒤 체크인을 표시합니다.'],
    partial: ['리듬 원장 부분 데이터', '원장의 일부만 읽혀 빈 상태로 확정할 수 없습니다.'],
    empty: ['루틴 기록 없음', '체크인이 기록되면 이번 주 리듬이 표시됩니다.'],
    partialNotice: '리듬 원장 부분 데이터 · 읽힌 체크인만 표시합니다.',
  },
};

// 카드 헤더(제목 · SyncBadge · 이동 버튼)와 availability 기반 본문 분기를 한 곳으로 흡수.
// 이전에는 이 마크업이 6개 패널에 복붙돼 있었고(§8.1 primitives-first 위반) marginBottom도
// 12/14로 이미 드리프트가 시작돼 있었다. availability는 overviewPanelAvailability()의
// { state, showData, reason } 계약을 그대로 받는다.
function PanelCard({ panel, availability, onOpen, openLabel = '열기', action, children }) {
  const copy = PANEL_COPY[panel];
  const [emptyTitle, emptyDescription] = copy[availability.reason] || copy.empty;
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{copy.title}</div>
        <SyncBadge state={availability.state} />
        <div style={{ flex: 1 }} />
        {action || (onOpen && (
          <Button variant="ghost" size="sm" iconRight="arrowRight" onClick={onOpen}>{openLabel}</Button>
        ))}
      </div>
      {availability.showData ? (
        <>
          {availability.reason === 'partial' && copy.partialNotice && (
            <div role="status" style={{ marginBottom: 10, fontSize: 11, color: 'var(--fg-muted)' }}>{copy.partialNotice}</div>
          )}
          {children}
        </>
      ) : (
        <EmptyState icon={copy.icon} title={emptyTitle} description={emptyDescription} style={{ minHeight: 140 }} />
      )}
    </Card>
  );
}

// Stacked daily bars — category distinction stays within the Moonstone/neutral
// luminance scale so green/yellow never imply success or warning by accident.
const ACTIVITY_SEGMENTS = [
  // §5.3 charts: series separate by Moonstone luminance only — accent is reserved for
  // interaction (current/selected), never a category color.
  { key: 'work', label: '작업', color: 'var(--moon-300)', get: (d) => d.work },
  { key: 'decisions', label: '결정', color: 'var(--moon-500)', get: (d) => d.decisions },
  { key: 'content', label: '발행', color: 'var(--fg-dim)', get: (d) => d.content },
];

const Y_AXIS_W = 24;

function ActivityChart({ series, days, sources, status }) {
  const [hoverIndex, setHoverIndex] = React.useState(null);
  const data = series.slice(-days);
  const availability = activitySeriesAvailability(data, { sources, status });
  if (!availability.available) {
    return (
      <EmptyState
        icon="signal"
        title={availability.state === 'preview' ? '활동 원장 미연결' : '활동 원장 일부를 읽지 못했습니다'}
        description={availability.state === 'preview'
          ? '프로젝트·콘텐츠 원장을 연결하면 활동 추이가 표시됩니다.'
          : `${availability.failedSegments.join(', ')} 기록을 다시 읽은 뒤 추이를 표시합니다.`}
        style={{ minHeight: 160 }}
      />
    );
  }
  const max = Math.max(1, ...data.map((d) => d.work + d.decisions + d.content));
  const mid = Math.round(max / 2);
  const tickEvery = days <= 7 ? 1 : days <= 14 ? 2 : 5;
  const gap = days <= 7 ? 8 : days <= 14 ? 5 : 3;
  const hovered = hoverIndex != null ? data[hoverIndex] : null;

  return (
    <div style={{ display: 'flex', gap: 10 }}>
      {/* Y-axis scale — max / mid / 0, aligned to the gridlines so the bars read
          against a real scale instead of floating. */}
      <div
        className="mono"
        aria-hidden="true"
        style={{ width: Y_AXIS_W, height: CHART_HEIGHT, flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: 10.5, color: 'var(--fg-faint)', lineHeight: 1 }}
      >
        <span>{max}</span>
        <span>{mid}</span>
        <span>0</span>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ position: 'relative' }}>
          {hovered && (
            <div
              className="mono"
              style={{
                position: 'absolute',
                bottom: CHART_HEIGHT + 12,
                left: `${((hoverIndex + 0.5) / data.length) * 100}%`,
                transform: 'translateX(-50%)',
                padding: '8px 11px',
                background: 'var(--elevated)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--r-sm)',
                boxShadow: 'var(--shadow-card)',
                fontSize: 10.5,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                zIndex: 3,
              }}
            >
              <div style={{ color: 'var(--fg-faint)', marginBottom: 5 }}>{dayLabel(hovered.date)}</div>
              <div style={{ display: 'flex', gap: 10 }}>
                {ACTIVITY_SEGMENTS.map((seg) => (
                  <span key={seg.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--fg-muted)' }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: seg.color }} />
                    {seg.get(hovered)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Gridlines at mid + top, matched to the y-axis labels. */}
          <div style={{ position: 'absolute', inset: 0, height: CHART_HEIGHT, pointerEvents: 'none' }}>
            {[1, 0.5].map((f) => (
              <div key={f} style={{ position: 'absolute', left: 0, right: 0, bottom: `${f * 100}%`, borderTop: '1px dashed var(--line-soft)' }} />
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap, height: CHART_HEIGHT, borderBottom: '1px solid var(--line)', position: 'relative' }}>
            {data.map((d, i) => {
              const total = d.work + d.decisions + d.content;
              const dimmed = hoverIndex != null && hoverIndex !== i;
              const active = hoverIndex === i;
              const topKey = [...ACTIVITY_SEGMENTS].reverse().find((s) => s.get(d) > 0)?.key;
              return (
                <div
                  key={d.date}
                  role="button"
                  tabIndex={-1}
                  aria-label={`${dayLabel(d.date)} · 작업 ${d.work} · 결정 ${d.decisions} · 발행 ${d.content}`}
                  onMouseEnter={() => setHoverIndex(i)}
                  onMouseLeave={() => setHoverIndex((cur) => (cur === i ? null : cur))}
                  style={{ flex: 1, minWidth: 3, height: CHART_HEIGHT, position: 'relative', cursor: 'default' }}
                >
                  {/* Hover crosshair — a soft column highlight behind the bar. */}
                  <div style={{ position: 'absolute', inset: '0 -2px', borderRadius: 3, background: active ? 'var(--surface-2)' : 'transparent', transition: 'background 160ms ease' }} />
                  <div
                    style={{
                      position: 'absolute', inset: 0,
                      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 1.5,
                      opacity: dimmed ? 0.45 : 1,
                      transform: active ? 'translateY(-2px)' : 'none',
                      transition: 'opacity 180ms ease, transform 180ms ease',
                    }}
                  >
                    {total > 0 ? (
                      // Bottom → top; render reversed so 'work' sits at the base.
                      [...ACTIVITY_SEGMENTS].reverse().map((seg) => {
                        const val = seg.get(d);
                        if (!val) return null;
                        const h = Math.max(3, Math.round((val / max) * CHART_HEIGHT));
                        const isTop = seg.key === topKey;
                        return (
                          <div
                            key={seg.key}
                            style={{
                              width: '100%', height: h,
                              background: seg.color,
                              borderRadius: isTop ? '3px 3px 1.5px 1.5px' : 1.5,
                              boxShadow: isTop ? 'inset 0 1px 0 0 oklch(1 0 0 / 0.18)' : undefined,
                              transition: 'height 260ms ease',
                            }}
                          />
                        );
                      })
                    ) : (
                      <div style={{ width: 4, height: 4, margin: '0 auto', borderRadius: 999, background: 'var(--line-strong)' }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', gap, marginTop: 7 }}>
          {data.map((d, i) => (
            <div key={d.date} className="mono" style={{ flex: 1, minWidth: 3, textAlign: 'center', fontSize: 10.5, color: hoverIndex === i ? 'var(--fg-muted)' : 'var(--fg-faint)', transition: 'color 180ms ease' }}>
              {i % tickEvery === 0 || hoverIndex === i ? dayLabel(d.date) : ''}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Compact SVG ring chart — the donut's rotation is applied to the <svg> box
// itself (not a nested <g>), so the sibling center-label overlay below stays
// upright without any counter-rotation math.
function DonutChart({ series = [], size = 128, strokeWidth = 16, centerLabel }) {
  const total = series.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--surface-3)" strokeWidth={strokeWidth} />
          {total > 0 && series.map((item) => {
            const value = Number(item.value) || 0;
            if (!value) return null;
            const length = (value / total) * circumference;
            const dashoffset = -cumulative;
            cumulative += length;
            return (
              <circle
                key={item.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={RING_COLORS[item.key] || 'var(--moon-400)'}
                strokeWidth={strokeWidth}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={dashoffset}
                strokeLinecap="butt"
                style={{ transition: 'stroke-dasharray 260ms ease, stroke-dashoffset 260ms ease' }}
              />
            );
          })}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div className="stat" style={{ fontSize: 22, fontWeight: 600, lineHeight: 1 }}>{total}</div>
          {centerLabel && <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginTop: 4 }}>{centerLabel}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1, minWidth: 0 }}>
        {series.map((item) => {
          const value = Number(item.value) || 0;
          return (
            <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: RING_COLORS[item.key] || 'var(--moon-400)', flexShrink: 0 }} />
              <span style={{ color: 'var(--fg-muted)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
              <span className="mono" style={{ color: value ? 'var(--fg)' : 'var(--fg-faint)' }}>{value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Which brand recent work landed on — proportional bars, same visual language
// as RevenueOverview's "Revenue by brand" panel but counting activity events
// instead of currency.
function BrandActivityBars({ brands = [] }) {
  const max = Math.max(1, ...brands.map((b) => Number(b.count) || 0));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {brands.map((b) => (
        <div key={b.key} style={{ display: 'grid', gridTemplateColumns: '22px 1fr 28px', gap: 10, alignItems: 'center' }}>
          <span aria-hidden="true" style={{ fontSize: 13, color: 'var(--fg-muted)', textAlign: 'center' }}>{b.glyph || '●'}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11.5, marginBottom: 4, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.label}</div>
            <div style={{ height: 5, background: 'var(--surface-3)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(6, Math.round((b.count / max) * 100))}%`, height: '100%', background: 'var(--moon-500)', transition: 'width 260ms ease' }} />
            </div>
          </div>
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)', textAlign: 'right' }}>{b.count}</span>
        </div>
      ))}
    </div>
  );
}

// Folds the existing Rhythm page's core read (this-week completion + longest
// streak + per-ritual weekly grid) into a compact card — same routine_checks
// data as dashboard/work/rhythm, no separate computation.
function RhythmCard({ rhythm, state, onNavigate }) {
  const summary = rhythm?.summary || {};
  const rituals = Array.isArray(rhythm?.rituals) ? rhythm.rituals : [];
  const totalAvailable = summary.ritualsTotalThisWeek !== null
    && summary.ritualsTotalThisWeek !== undefined
    && Number.isFinite(Number(summary.ritualsTotalThisWeek));
  const completedAvailable = summary.ritualsCompletedThisWeek !== null
    && summary.ritualsCompletedThisWeek !== undefined
    && Number.isFinite(Number(summary.ritualsCompletedThisWeek));
  const total = totalAvailable ? Number(summary.ritualsTotalThisWeek) : null;
  const completed = completedAvailable ? Number(summary.ritualsCompletedThisWeek) : null;
  const percent = total > 0 && completedAvailable ? Math.round((completed / total) * 100) : null;
  const availability = overviewPanelAvailability({ state, hasData: total > 0 });
  const longestStreakAvailable = summary.longestStreak !== null
    && summary.longestStreak !== undefined
    && Number.isFinite(Number(summary.longestStreak));

  return (
    <PanelCard panel="rhythm" availability={availability} onOpen={() => onNavigate?.('dashboard/work/rhythm')}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="stat" style={{ fontSize: 24, fontWeight: 600 }}>{completedAvailable ? completed : '—'}/{total}</span>
        <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>이번 주 완료</span>
      </div>
      {percent !== null && <div style={{ marginTop: 10 }}><Progress value={percent} /></div>}
      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--fg-muted)' }}>
        최장 streak{' '}
        {/* 좋은 수치를 색으로 축하하지 않는다(§13 high-score) — 값 자체가 정보. */}
        <span className="mono" style={{ color: longestStreakAvailable && summary.longestStreak > 0 ? 'var(--fg)' : 'var(--fg-faint)' }}>{longestStreakAvailable ? `${summary.longestStreak}일` : '—'}</span>
        {summary.longestStreakRitual ? <span style={{ color: 'var(--fg-faint)' }}> · {summary.longestStreakRitual}</span> : null}
      </div>
      {rituals.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rituals.map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--fg-muted)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              <div style={{ display: 'flex', gap: 2 }}>
                {(r.weeks || []).map((v, i) => (
                  <span key={i} style={{ width: 8, height: 8, borderRadius: 2, background: v ? 'var(--moon-400)' : 'var(--surface-3)' }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </PanelCard>
  );
}

// 순서가 있는 단계 분포(퍼널)의 단일 표현. 콘텐츠 파이프라인과 딜 파이프라인 단계가 같은
// "단계별 분포"인데도 각각 가로 막대행 / 세그먼트 바로 그려져 서로 비교가 안 됐다 —
// 두 퍼널을 이 컴포넌트 하나로 통일한다. `meta`(예: 금액)는 값 옆에 흐리게 붙는다.
// 구성(부분-전체)인 프로젝트 상태만 도넛을 유지한다 — 합계가 의미를 갖는 유일한 패널.
function SeriesRows({ series = [], label }) {
  const max = Math.max(1, ...series.map((item) => Number(item.value) || 0));
  const hasMeta = series.some((item) => item.meta);
  return (
    <div role="img" aria-label={label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {series.map((item) => {
        const available = item.value !== null && item.value !== undefined && Number.isFinite(Number(item.value));
        const value = available ? Number(item.value) : null;
        return (
          <div key={item.key} style={{ display: 'grid', gridTemplateColumns: `56px minmax(0, 1fr) ${hasMeta ? 'auto' : '26px'}`, gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
            <span style={{ height: 6, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: `${Math.max(value ? 6 : 0, Math.round(((value || 0) / max) * 100))}%`, borderRadius: 999, background: item.key === 'blocked' ? 'var(--danger)' : 'var(--moon-500)', transition: 'width 260ms ease' }} />
            </span>
            <span className="mono" style={{ fontSize: 11, textAlign: 'right', whiteSpace: 'nowrap' }}>
              <span style={{ color: value ? 'var(--fg)' : 'var(--fg-faint)' }}>{available ? value : '—'}</span>
              {item.meta && <span style={{ color: 'var(--fg-faint)' }}> · {item.meta}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function KpiCard({ k, onNavigate }) {
  const clickable = Boolean(k.nav && onNavigate);
  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onNavigate(k.nav) : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(k.nav); } } : undefined}
      className="hub-metric-card"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line-soft)',
        borderRadius: 'var(--r-lg)',
        padding: 'var(--card-pad)',
        boxShadow: 'var(--shadow-soft)',
        cursor: clickable ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>{k.label}</div>
        {clickable && <Iconed name="chevronR" size={12} style={{ color: 'var(--fg-faint)', marginLeft: 'auto' }} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 10 }}>
        <div className="stat" style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.1 }}>{k.value}</div>
        <div style={{ flex: 1 }} />
        {k.spark && k.spark.some((v) => v > 0) && (
          <Sparkline values={k.spark} tone="moon" width={56} height={20} />
        )}
      </div>
      {/* §5.2: hint labels classify the metric (기획·발행 등) — category text stays neutral;
          only a real blocker keeps the danger channel. */}
      <div style={{ marginTop: 6, fontSize: 11, color: k.tone === 'danger' ? 'var(--danger)' : 'var(--fg-faint)' }}>{k.hint}</div>
    </div>
  );
}

function ActivityRow({ item, onNavigate }) {
  const clickable = Boolean(item.nav && onNavigate);
  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onNavigate(item.nav) : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(item.nav); } } : undefined}
      className="hub-row"
      style={{ display: 'flex', gap: 10, padding: '10px 6px', alignItems: 'flex-start', cursor: clickable ? 'pointer' : 'default', borderRadius: 'var(--r-sm)' }}
    >
      <Dot tone={item.tone} style={{ marginTop: 5, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Badge tone={item.tone} size="xs">{KIND_LABEL[item.kind] || item.kind}</Badge>
          <span style={{ fontSize: 12.5, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
        </div>
        {item.summary ? (
          <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 3, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>{item.summary}</div>
        ) : null}
      </div>
      <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', flexShrink: 0, marginTop: 2 }}>{relativeLabel(item.at)}</span>
    </div>
  );
}

export function Overview({ onNavigate }) {
  const { ledger, syncState } = useOverviewLedger();
  const [period, setPeriod] = React.useState('14');
  const [activityExpanded, setActivityExpanded] = React.useState(false);

  const kpis = ledger.kpis || {};
  const pms = ledger.operatorHome?.pms || null;
  const contentSummary = ledger.operatorHome?.content || null;
  const stageSeries = ledger.revenue?.stageSeries || [];
  const automationsSummary = ledger.automationsSummary || {};
  const brandActivity = Array.isArray(ledger.brandActivity) ? ledger.brandActivity : [];
  const activity = Array.isArray(ledger.recentActivity) ? ledger.recentActivity : [];
  const visibleActivity = activityExpanded ? activity : activity.slice(0, 8);
  const hasPipelineValue = stageSeries.some((s) => s.count > 0);
  const overviewStatus = ledger.status || syncState;
  const panelAvailability = (sourceKey, hasData, dependencies) => overviewPanelAvailability({
    sources: ledger.sources || [],
    status: overviewStatus,
    sourceKey,
    dependencies,
    hasData,
  });
  const projectPanel = panelAvailability(
    'projects',
    pms?.projectStatusSeries?.some((item) => Number(item.value) > 0),
    ['projects'],
  );
  const contentPanel = panelAvailability(
    'content',
    contentSummary?.pipelineSeries?.some((item) => Number(item.value) > 0),
    ['content_items', 'items'],
  );
  const revenuePanel = panelAvailability('revenue', hasPipelineValue);
  const automationSourceState = panelAvailability('automations', false).state;
  const automationMetrics = buildAutomationMetricRows(automationsSummary, automationSourceState);
  const automationPanel = panelAvailability(
    'automations',
    automationMetrics.some((metric) => metric.value !== '—'),
  );
  const sourceState = (key) => panelAvailability(key, false).state;
  const disclosureMessages = overviewDisclosureMessages({
    failedSources: ledger.failedSources,
    partialSources: ledger.partialSources,
  });
  const projectActivity = projectActivityAvailability(ledger.sources || [], ledger.status || syncState);
  const recentActivityTruth = recentActivityAvailability(ledger.sources || [], ledger.status || syncState);
  // 브랜드 활동은 projectActivityAvailability(업데이트·결정 두 슬라이스 모두 필요)를 쓰므로
  // 다른 패널과 계약이 다르다 — PanelCard가 이해하는 { state, showData, reason }로 맞춘다.
  const brandPanel = {
    state: projectActivity.state === 'live-empty' ? 'live' : projectActivity.state,
    showData: projectActivity.brandActivity && brandActivity.length > 0,
    reason: !projectActivity.brandActivity
      ? (projectActivity.reason === 'preview' ? 'preview' : projectActivity.reason === 'partial' ? 'partial' : 'error')
      : brandActivity.length === 0 ? 'empty' : null,
  };

  // KPI는 헤더에서 고른 기간을 그대로 따른다 — 스파크라인은 계속 최근 7일 모양을 보여준다
  // (카드 안 미니 추세는 창 길이와 무관하게 "최근 흐름"을 뜻함).
  const kpiCards = buildOverviewKpiCards({
    kpis,
    activitySeries: ledger.activitySeries || [],
    sources: ledger.sources || [],
    status: ledger.status || syncState,
    days: Number(period),
  });

  return (
    <div className="hub-page" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)', padding: 'var(--section-gap)', maxWidth: 1280, margin: '0 auto', width: '100%' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>현황</h2>
          <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--fg-muted)' }}>
            최근 작업과 기획 흐름을 정리합니다<SyncBadge state={syncState} />
          </div>
          {disclosureMessages.map((message) => (
            <div key={message.kind} role="status" style={{ marginTop: 5, fontSize: 11.5, color: 'var(--fg-muted)' }}>
              {message.text}
            </div>
          ))}
        </div>
        <SegmentedControl className="hub-page-actions" label="기간" options={PERIOD_OPTIONS} value={period} onChange={setPeriod} />
      </div>

      <div className="hub-grid--metrics stagger-up" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--gap)' }}>
        {kpiCards.map((k) => <KpiCard key={k.label} k={k} onNavigate={onNavigate} />)}
      </div>

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>작업·기획 활동 추이</div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 12 }}>
            {ACTIVITY_SEGMENTS.map((segment) => (
              <span key={segment.key} style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: segment.color }} />
                {segment.label}
              </span>
            ))}
          </div>
        </div>
        {ledger.activitySeries?.length ? (
          <ActivityChart
            series={ledger.activitySeries}
            days={Number(period)}
            sources={ledger.sources || []}
            status={ledger.status || syncState}
          />
        ) : (
          syncState === 'preview' ? (
            <EmptyState icon="signal" title="활동 원장 미연결" description="프로젝트·콘텐츠 원장을 연결하면 활동 추이가 표시됩니다." style={{ minHeight: 160 }} />
          ) : syncState === 'error' || syncState === 'partial' ? (
            <EmptyState icon="signal" title="활동 원장 일부를 읽지 못했습니다" description="활동 원장을 다시 읽은 뒤 추이를 표시합니다." style={{ minHeight: 160 }} />
          ) : (
            <EmptyState icon="signal" title="활동 기록이 없습니다" description="프로젝트 업데이트와 결정이 기록되면 추이가 표시됩니다." style={{ minHeight: 160 }} />
          )
        )}
      </Card>

      {/* 좌: 도메인 분포(무엇이 어디에 쌓여 있나) · 우: 흐름 레일(리듬 + 최근 활동).
          이전에는 7개 카드가 3+3+1 균등 격자로 늘어서 위계가 없었다(§3.1 "5초 안에 무엇이
          중요한지", §13 overpacked dashboard). 지표→추세→분포/흐름 순으로 눈이 흐르게 하고,
          최하단에 묻혀 있던 최근 활동을 우측 레일로 끌어올린다. hub-grid--split은 ≤1200px에서
          1열로 접힌다. */}
      <div className="hub-grid--split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 'var(--gap)', alignItems: 'start' }}>
        <div className="hub-grid--two" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--gap)' }}>
          <PanelCard panel="projects" availability={projectPanel} onOpen={() => onNavigate?.('dashboard/work/projects')}>
            <DonutChart series={pms?.projectStatusSeries || []} centerLabel="프로젝트" />
          </PanelCard>

          <PanelCard panel="content" availability={contentPanel} onOpen={() => onNavigate?.('dashboard/content/queue')}>
            <SeriesRows series={contentSummary?.pipelineSeries || []} label="콘텐츠 파이프라인 분포" />
          </PanelCard>

          <PanelCard panel="revenue" availability={revenuePanel} onOpen={() => onNavigate?.('dashboard/revenue/overview')} openLabel="Revenue 열기">
            {/* 딜 단계도 콘텐츠와 같은 퍼널이므로 같은 표현을 쓴다 — 이전에는 세그먼트 바 +
                별도 범례라 같은 성격의 두 패널을 나란히 두고도 비교가 안 됐다. */}
            <SeriesRows
              series={stageSeries.map((s) => ({ key: s.key, label: s.label, value: s.count, meta: fmtMoney(s.sum) }))}
              label="딜 파이프라인 단계 분포"
            />
          </PanelCard>

          <PanelCard panel="automations" availability={automationPanel} onOpen={() => onNavigate?.('dashboard/automations/runs')} openLabel="Runs 열기">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {automationMetrics.map((metric) => (
                <div key={metric.key} style={{ padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-soft)' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{metric.label}</div>
                  {/* truth-model tone은 정직성 신호(성공=live 증명)로 유지하고, 색은 §5.2대로
                      danger만 칠한다 — 실패 0을 초록으로 축하하지 않는다. */}
                  <div className="stat" style={{ fontSize: 18, fontWeight: 600, marginTop: 4, color: metric.tone === 'danger' ? 'var(--danger)' : metric.tone === 'neutral' ? 'var(--fg-faint)' : 'var(--fg)' }}>{metric.value}</div>
                </div>
              ))}
            </div>
          </PanelCard>

          <div style={{ gridColumn: '1 / -1' }}>
            <PanelCard panel="brand" availability={brandPanel} onOpen={() => onNavigate?.('dashboard/work/projects')}>
              <BrandActivityBars brands={brandActivity} />
            </PanelCard>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)', minWidth: 0 }}>
          <RhythmCard rhythm={ledger.rhythm} state={ledger.rhythm?.state || sourceState('work')} onNavigate={onNavigate} />

          <div>
            <SectionTitle right={<span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>클릭하면 이동</span>}>최근 활동</SectionTitle>
            <Card>
              {!recentActivityTruth.complete && (
                <div role="status" style={{ padding: '10px 12px', marginBottom: activity.length ? 8 : 0, border: '1px dashed var(--line)', borderRadius: 'var(--r-sm)', color: 'var(--fg-muted)', fontSize: 11.5 }}>
                  {recentActivityTruth.reason === 'preview'
                    ? `최근 활동 원장 미연결 · ${recentActivityTruth.unavailableSources.join(', ')} 원장을 연결하면 빈 상태를 확인할 수 있습니다.`
                    : recentActivityTruth.reason === 'partial'
                      ? `최근 활동 원장 부분 데이터 · ${recentActivityTruth.unavailableSources.join(', ')} 기록이 일부만 읽혔습니다.`
                      : `최근 활동 원장 일부를 읽지 못했습니다 · ${recentActivityTruth.unavailableSources.join(', ')} 기록을 다시 확인하세요.`}
                </div>
              )}
              {activity.length === 0 ? (
                recentActivityTruth.complete ? (
                  <EmptyState icon="clock" title="최근 활동이 없습니다" description="작업 업데이트, 결정, 발행, 자동화 실행이 기록되면 여기에 모입니다." style={{ minHeight: 160 }} />
                ) : null
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {visibleActivity.map((item, i) => (
                      <React.Fragment key={item.id}>
                        <ActivityRow item={item} onNavigate={onNavigate} />
                        {i < visibleActivity.length - 1 && <Divider />}
                      </React.Fragment>
                    ))}
                  </div>
                  {activity.length > visibleActivity.length && (
                    <Button variant="ghost" size="sm" icon="chevronD" onClick={() => setActivityExpanded(true)} style={{ marginTop: 8 }}>
                      활동 {activity.length - visibleActivity.length}건 더 보기
                    </Button>
                  )}
                </>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
