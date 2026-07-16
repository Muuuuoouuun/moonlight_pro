"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import { Badge, Card, SectionTitle, Button, Dot, Divider, EmptyState, SyncBadge, SegmentedControl, Sparkline, Progress } from "../hub-primitives";

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

// Project-status donut ring colors — keyed to operator-home-summary.js's
// PROJECT_SERIES keys (planning/active/review/blocked/done/backlog). 'blocked'
// stays warning to match the DistributionRows convention used elsewhere.
const RING_COLORS = {
  planning: 'var(--fg-faint)',
  active: 'var(--moon-300)',
  review: 'var(--info)',
  blocked: 'var(--warning)',
  done: 'var(--success)',
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
  source: 'preview',
  sources: [],
  kpis: { updatesThisWeek: 0, decisionsThisWeek: 0, publishedThisWeek: 0, activeProjects: 0, blockedProjects: 0 },
  activitySeries: [],
  operatorHome: null,
  revenue: { summary: {}, stageSeries: [] },
  automationsSummary: {},
  brandActivity: [],
  rhythm: { summary: {}, rituals: [] },
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
          if (active) setSyncState('preview');
          return;
        }
        setLedger(data);
        setSyncState(data.source === 'supabase' ? 'live' : 'preview');
      } catch {
        if (active) setSyncState('preview');
      }
    }
    load();
    return () => { active = false; };
  }, []);

  return { ledger, syncState };
}

// Stacked daily bars — work / decisions / content, bottom to top. Pure CSS/div,
// no charting library, same ceiling of sophistication as the rest of the hub
// (see Sparkline). Order puts the highest-volume series (work) at the base so
// the smaller series don't get visually swallowed. The "work" fill is
// --moon-300 to exactly match its own legend Dot (tone="moon" resolves to
// --moon-300) — a plain --moon-400 fill here reads as an off-shade mismatch
// against the legend right above it.
// Segment stack order, bottom → top. Colors match the legend Dots exactly
// (tone="moon"→--moon-300, info, success) so a fill never reads as an off-shade
// against the key right above the chart.
const ACTIVITY_SEGMENTS = [
  { key: 'work', label: '작업', color: 'var(--moon-300)', get: (d) => d.work },
  { key: 'decisions', label: '결정', color: 'var(--info)', get: (d) => d.decisions },
  { key: 'content', label: '발행', color: 'var(--success)', get: (d) => d.content },
];

const Y_AXIS_W = 24;

function ActivityChart({ series, days }) {
  const [hoverIndex, setHoverIndex] = React.useState(null);
  const data = series.slice(-days);
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
        style={{ width: Y_AXIS_W, height: CHART_HEIGHT, flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: 9.5, color: 'var(--fg-faint)', lineHeight: 1 }}
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
  const total = summary.ritualsTotalThisWeek ?? 0;
  const completed = summary.ritualsCompletedThisWeek ?? 0;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>리듬</div>
        <SyncBadge state={state || 'preview'} />
        <div style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" iconRight="arrowRight" onClick={() => onNavigate?.('dashboard/work/rhythm')}>열기</Button>
      </div>
      {total > 0 ? (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="stat" style={{ fontSize: 24, fontWeight: 600 }}>{completed}/{total}</span>
            <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>이번 주 완료</span>
          </div>
          <div style={{ marginTop: 10 }}><Progress value={percent} /></div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--fg-muted)' }}>
            최장 streak{' '}
            <span className="mono" style={{ color: summary.longestStreak > 0 ? 'var(--success)' : 'var(--fg-faint)' }}>{summary.longestStreak ?? 0}일</span>
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
        </>
      ) : (
        <EmptyState icon="rhythm" title="루틴 기록 없음" description="체크인이 기록되면 이번 주 리듬이 표시됩니다." style={{ minHeight: 140 }} />
      )}
    </Card>
  );
}

function SeriesRows({ series = [], label }) {
  const max = Math.max(1, ...series.map((item) => Number(item.value) || 0));
  return (
    <div role="img" aria-label={label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {series.map((item) => {
        const value = Number(item.value) || 0;
        return (
          <div key={item.key} style={{ display: 'grid', gridTemplateColumns: '56px minmax(0, 1fr) 26px', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{item.label}</span>
            <span style={{ height: 6, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: `${Math.max(value ? 6 : 0, Math.round((value / max) * 100))}%`, borderRadius: 999, background: item.key === 'blocked' ? 'var(--warning)' : 'var(--moon-500)', transition: 'width 260ms ease' }} />
            </span>
            <span className="mono" style={{ fontSize: 11, color: value ? 'var(--fg)' : 'var(--fg-faint)', textAlign: 'right' }}>{value}</span>
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
          <Sparkline values={k.spark} tone={k.tone === 'warning' ? 'warning' : k.tone === 'success' ? 'success' : 'moon'} width={56} height={20} />
        )}
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: k.tone === 'moon' ? 'var(--fg-faint)' : `var(--${k.tone})` }}>{k.hint}</div>
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
  const brandActivity = ledger.brandActivity || [];
  const activity = ledger.recentActivity || [];
  const visibleActivity = activityExpanded ? activity : activity.slice(0, 8);
  const hasPipelineValue = stageSeries.some((s) => s.count > 0);
  const sourceState = (key) => ledger.sources?.find((s) => s.key === key)?.state || 'preview';

  // Last 7 buckets of the same daily series feed each KPI's sparkline — no
  // separate fetch, just a different slice of activitySeries per pillar.
  const last7 = (ledger.activitySeries || []).slice(-7);
  const kpiCards = [
    { label: '최근 7일 작업 업데이트', value: kpis.updatesThisWeek ?? 0, hint: '프로젝트 진행 기록', tone: 'moon', nav: 'dashboard/work/projects', spark: last7.map((d) => d.work) },
    { label: '최근 7일 결정 기록', value: kpis.decisionsThisWeek ?? 0, hint: '기획·판단 로그', tone: 'info', nav: 'dashboard/work/decisions', spark: last7.map((d) => d.decisions) },
    { label: '최근 7일 발행', value: kpis.publishedThisWeek ?? 0, hint: '콘텐츠 발행 완료', tone: 'success', nav: 'dashboard/content/queue', spark: last7.map((d) => d.content) },
    { label: '진행 중 프로젝트', value: kpis.activeProjects ?? 0, hint: kpis.blockedProjects ? `${kpis.blockedProjects}건 막힘` : '막힌 프로젝트 없음', tone: kpis.blockedProjects ? 'warning' : 'moon', nav: 'dashboard/work/projects' },
  ];

  return (
    <div className="hub-page" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)', padding: 'var(--section-gap)', maxWidth: 1280, margin: '0 auto', width: '100%' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>현황</h2>
          <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--fg-muted)' }}>
            최근 작업과 기획 흐름을 정리합니다<SyncBadge state={syncState} />
          </div>
        </div>
        <SegmentedControl className="hub-page-actions" label="기간" options={PERIOD_OPTIONS} value={period} onChange={setPeriod} />
      </div>

      <div className="hub-grid--metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--gap)' }}>
        {kpiCards.map((k) => <KpiCard key={k.label} k={k} onNavigate={onNavigate} />)}
      </div>

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>작업·기획 활동 추이</div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Dot tone="moon" /> 작업</span>
            <span style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Dot tone="info" /> 결정</span>
            <span style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Dot tone="success" /> 발행</span>
          </div>
        </div>
        {ledger.activitySeries?.length ? (
          <ActivityChart series={ledger.activitySeries} days={Number(period)} />
        ) : (
          <EmptyState icon="signal" title="활동 기록이 없습니다" description="프로젝트 업데이트와 결정이 기록되면 추이가 표시됩니다." style={{ minHeight: 160 }} />
        )}
      </Card>

      <div className="hub-grid--three" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--gap)' }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>프로젝트 상태</div>
            <SyncBadge state={sourceState('projects')} />
            <div style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" iconRight="arrowRight" onClick={() => onNavigate?.('dashboard/work/projects')}>열기</Button>
          </div>
          {pms?.projectStatusSeries?.length ? (
            <DonutChart series={pms.projectStatusSeries} centerLabel="프로젝트" />
          ) : (
            <EmptyState icon="projects" title="프로젝트 데이터 없음" description="프로젝트가 생기면 상태 분포가 표시됩니다." style={{ minHeight: 140 }} />
          )}
        </Card>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>콘텐츠 파이프라인</div>
            <SyncBadge state={sourceState('content')} />
            <div style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" iconRight="arrowRight" onClick={() => onNavigate?.('dashboard/content/queue')}>열기</Button>
          </div>
          {contentSummary?.pipelineSeries?.length ? (
            <SeriesRows series={contentSummary.pipelineSeries} label="콘텐츠 파이프라인 분포" />
          ) : (
            <EmptyState icon="content" title="콘텐츠 데이터 없음" description="콘텐츠 아이템이 생기면 파이프라인이 표시됩니다." style={{ minHeight: 140 }} />
          )}
        </Card>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>브랜드별 최근 활동</div>
            <SyncBadge state={sourceState('projects')} />
            <div style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" iconRight="arrowRight" onClick={() => onNavigate?.('dashboard/work/projects')}>열기</Button>
          </div>
          {brandActivity.length ? (
            <BrandActivityBars brands={brandActivity} />
          ) : (
            <EmptyState icon="brand" title="브랜드 활동 없음" description="프로젝트 업데이트·결정이 쌓이면 브랜드별 비중이 표시됩니다." style={{ minHeight: 140 }} />
          )}
        </Card>
      </div>

      <div className="hub-grid--three" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--gap)' }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>파이프라인 단계</div>
            <div style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" iconRight="arrowRight" onClick={() => onNavigate?.('dashboard/revenue/overview')}>Revenue 열기</Button>
          </div>
          {hasPipelineValue ? (
            <>
              <div style={{ display: 'flex', gap: 2, height: 24, borderRadius: 'var(--r-sm)', overflow: 'hidden', background: 'var(--surface-3)', padding: 2 }}>
                {stageSeries.map((s) => (
                  <div
                    key={s.key}
                    title={`${s.label} · ${s.count}건`}
                    style={{
                      flex: s.count || 0.0001,
                      minWidth: s.count ? 3 : 0,
                      borderRadius: 3,
                      background: `var(--${s.color === 'neutral' ? 'fg-faint' : s.color === 'moon' ? 'moon-500' : s.color})`,
                      transition: 'flex 260ms ease',
                    }}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                {stageSeries.map((s) => (
                  <div key={s.key} style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Dot tone={s.color} />
                    <span style={{ color: 'var(--fg)' }}>{s.label}</span>
                    <span className="mono" style={{ color: 'var(--fg-faint)' }}>{s.count}건 · {fmtMoney(s.sum)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState icon="deals" title="딜이 없습니다" description="파이프라인에 딜이 생기면 단계별 분포가 표시됩니다." style={{ minHeight: 140 }} />
          )}
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>자동화 현황</div>
            <div style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" iconRight="arrowRight" onClick={() => onNavigate?.('dashboard/automations/runs')}>Runs 열기</Button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { l: '오늘 실행', v: automationsSummary.runsToday ?? 0, tone: 'fg' },
              { l: '실패', v: automationsSummary.failuresToday ?? 0, tone: automationsSummary.failuresToday ? 'danger' : 'success' },
              { l: '활성 자동화', v: automationsSummary.activeAutomations ?? 0, tone: 'fg' },
              { l: '연동됨', v: automationsSummary.integrationsConnected ?? 0, tone: 'info' },
            ].map((x) => (
              <div key={x.l} style={{ padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-soft)' }}>
                <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{x.l}</div>
                <div className="stat" style={{ fontSize: 18, fontWeight: 600, marginTop: 4, color: `var(--${x.tone})` }}>{x.v}</div>
              </div>
            ))}
          </div>
        </Card>

        <RhythmCard rhythm={ledger.rhythm} state={sourceState('work')} onNavigate={onNavigate} />
      </div>

      <div>
        <SectionTitle right={<span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>클릭하면 해당 서피스로 이동</span>}>최근 활동</SectionTitle>
        <Card>
          {activity.length === 0 ? (
            <EmptyState icon="clock" title="최근 활동이 없습니다" description="작업 업데이트, 결정, 발행, 자동화 실행이 기록되면 여기에 모입니다." style={{ minHeight: 160 }} />
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
  );
}
