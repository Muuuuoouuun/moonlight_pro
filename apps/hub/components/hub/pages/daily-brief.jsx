"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import { Badge, Dot, Card, SectionTitle, Button, Checkbox, Progress, Sparkline, SyncBadge, EmptyState } from "../hub-primitives";
import { BRIEF_SIGNALS, TODAY_BLOCKS, METRICS } from "../hub-data";
import { QUICK_LOG_ACTIONS as WO_EXECUTE_ACTIONS } from "@/lib/sales-os/outcome-attribution";

function formatBriefDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date).replace(',', ' ·').replace(',', ' ·');
}

function greetingFor(date) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// Matches the daily-brief API's money formatter so the KPI cards and the pipeline card
// read in the same ₩M/₩K units — no drift between server-formatted and client-formatted money.
function formatMoney(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n === 0) return '₩0';
  if (n >= 1000000) return `₩${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `₩${Math.round(n / 1000)}K`;
  return `₩${n}`;
}

const SIGNAL_TARGETS = {
  draft: 'dashboard/content/studio?new=draft',
  escalate: 'dashboard/revenue/deals',
  followup: 'dashboard/revenue/deals?draft=followup',
  deals: 'dashboard/revenue/deals',
  leads: 'dashboard/revenue/leads',
  revenue: 'dashboard/revenue/overview',
  wait: 'dashboard/work/rhythm',
  write: 'dashboard/content/studio',
  queue: 'dashboard/content/queue',
  delay: 'dashboard/content/queue',
  review: 'dashboard/automations/runs',
  flows: 'dashboard/automations/flows',
  dismiss: 'dashboard/daily-brief',
  accept: 'dashboard/work/roadmap',
  chat: 'dashboard/agents/chat',
  hold: 'dashboard/work/decisions',
  start: 'dashboard/work/rhythm?check=weekly-review',
  projects: 'dashboard/work/projects',
  decision: 'dashboard/work/decisions?new=decision',
  rhythm: 'dashboard/work/rhythm',
  focus: 'dashboard/work/calendar?focus=15',
  queueApprovals: 'dashboard/daily-brief',
};

const CONTEXT_TARGETS = {
  Revenue: 'dashboard/revenue/deals',
  Content: 'dashboard/content/queue',
  Automation: 'dashboard/automations/runs',
  Agent: 'dashboard/agents/council',
  Rhythm: 'dashboard/work/rhythm',
  Work: 'dashboard/work/projects',
};

// KPI cards click through to their surface (falls back to the API-provided m.target).
const METRIC_TARGETS = {
  MRR: 'dashboard/revenue/overview',
  Pipeline: 'dashboard/revenue/deals',
  'Leads (30d)': 'dashboard/revenue/leads',
  Published: 'dashboard/content/queue',
};

// Deep-link a signal decision to the specific record drawer when the target is the
// deals/leads board and the signal carries a real id — revenue.jsx reads ?deal=/?lead=.
// Sentinel refs (TODAY/NEW/PROPOSED…) are aggregate signals with no single record.
const SENTINEL_REFS = new Set(['TODAY', 'NEW', 'PROPOSED', 'QUEUE', '—', '']);
function withEntityRef(target, source) {
  if (!target || !source || !source.ref) return target;
  const ref = String(source.ref).trim();
  if (SENTINEL_REFS.has(ref.toUpperCase())) return target;
  const from = String(source.from || '').toLowerCase();
  const join = target.includes('?') ? '&' : '?';
  if (target.startsWith('dashboard/revenue/deals') && from.startsWith('deal')) {
    return `${target}${join}deal=${encodeURIComponent(ref)}`;
  }
  if (target.startsWith('dashboard/revenue/leads') && from.startsWith('lead')) {
    return `${target}${join}lead=${encodeURIComponent(ref)}`;
  }
  return target;
}

// Command Brief priority: the single most urgent signal becomes the full-width command;
// the rest fall into a triaged queue. danger → warning → info → success → neutral, then
// original API order (already urgency-sorted server-side) as the tiebreak.
const TONE_RANK = { danger: 0, warning: 1, info: 2, success: 3, neutral: 4 };
function rankSignals(signals) {
  return signals
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (TONE_RANK[a.s.tone] ?? 5) - (TONE_RANK[b.s.tone] ?? 5) || a.i - b.i)
    .map((x) => x.s);
}

function syncTone(state) {
  if (state === 'live') return 'success';
  if (state === 'error') return 'danger';
  if (state === 'mixed' || state === 'preview' || state === 'syncing') return 'warning';
  return 'neutral';
}

function sourceLabel(state) {
  if (state === 'live') return 'live';
  if (state === 'error') return 'error';
  if (state === 'syncing') return 'syncing';
  if (state === 'mixed') return 'mixed';
  return 'preview';
}

function useDailyBriefLedger() {
  const [state, setState] = React.useState({
    syncState: 'syncing',
    generatedAt: null,
    sources: [],
    summary: null,
    metrics: METRICS,
    signals: BRIEF_SIGNALS,
    blocks: TODAY_BLOCKS,
    morningBrief: null,
  });

  React.useEffect(() => {
    let active = true;

    async function load() {
      setState((prev) => ({ ...prev, syncState: 'syncing' }));
      try {
        const response = await fetch('/api/hub/daily-brief', { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (!active || !response.ok || !data) {
          if (active) setState((prev) => ({ ...prev, syncState: 'preview' }));
          return;
        }

        const liveCount = Number(data.summary?.liveCount || 0);
        const sourceCount = Array.isArray(data.sources) ? data.sources.length : 0;
        const nextSyncState = liveCount > 0 && liveCount === sourceCount
          ? 'live'
          : liveCount > 0
          ? 'mixed'
          : 'preview';

        setState({
          syncState: nextSyncState,
          generatedAt: data.generatedAt || null,
          sources: Array.isArray(data.sources) ? data.sources : [],
          summary: data.summary || null,
          metrics: liveCount > 0 && Array.isArray(data.metrics) && data.metrics.length ? data.metrics : METRICS,
          signals: Array.isArray(data.signals) && data.signals.length ? data.signals : BRIEF_SIGNALS,
          blocks: Array.isArray(data.blocks) && data.blocks.length ? data.blocks : TODAY_BLOCKS,
          morningBrief: data.morningBrief || null,
        });
      } catch {
        if (active) setState((prev) => ({ ...prev, syncState: 'preview' }));
      }
    }

    load();
    return () => { active = false; };
  }, []);

  return state;
}

function SignalCard({ s, index = 0, defaultExpanded, onNavigate }) {
  // Surface the highest-priority signal first-open, regardless of live-vs-mock ids (§3.1: <5s).
  const [expanded, setExpanded] = React.useState(defaultExpanded != null ? defaultExpanded : (index === 0 || s.tone === 'danger'));
  const [decided, setDecided] = React.useState(null);
  const borderTone = { danger: 'var(--danger-line)', warning: 'var(--warning-line)', success: 'var(--success-line)', info: 'var(--info-line)' }[s.tone] || 'var(--line)';
  const openContext = () => onNavigate?.(CONTEXT_TARGETS[s.kind] || 'dashboard/daily-brief');

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--line-soft)',
      borderLeft: `1px solid ${borderTone}`,
      borderRadius: 'var(--r-lg)',
      overflow: 'hidden',
      opacity: decided ? 0.55 : 1,
      transition: 'opacity .2s',
    }}>
      <div className="hub-stackable-row" onClick={() => setExpanded(e => !e)} style={{ padding: 'var(--card-pad)', cursor: 'pointer', display: 'flex', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, paddingTop: 2 }}>
          <Dot tone={s.tone} size={8} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <Badge tone={s.tone} size="xs">{s.kind}</Badge>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{s.meta}</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>from {s.source.from} · <span className="mono">{s.source.ref}</span></span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, color: decided ? 'var(--fg-muted)' : 'var(--fg)', marginBottom: 4, letterSpacing: '-0.01em' }}>
            {s.title}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.55, maxWidth: '70ch' }}>{s.summary}</div>
          {decided && (
            <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--success)' }}>
              <Iconed name="check" size={12} />
              <span>Decision · {decided}</span>
            </div>
          )}
        </div>
        <Iconed name="chevronD" size={14} style={{ color: 'var(--fg-faint)', transform: expanded ? '' : 'rotate(-90deg)', transition: 'transform .15s' }} />
      </div>
      {expanded && !decided && (
        <div style={{ padding: '0 var(--card-pad) var(--card-pad)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {s.decisions.map((d, i) => (
            <Button key={i} variant={d.primary ? 'primary' : 'secondary'} size="sm" icon={d.primary ? 'bolt' : null}
              onClick={() => {
                setDecided(d.label);
                const target = SIGNAL_TARGETS[d.action];
                if (target && target !== 'dashboard/daily-brief') onNavigate?.(withEntityRef(target, s.source));
              }}>
              {d.label}
            </Button>
          ))}
          <div style={{ flex: 1 }} />
          <Button variant="ghost" size="sm" icon="moreV" onClick={openContext}>More context</Button>
        </div>
      )}
    </div>
  );
}

function MetricCard({ m, onNavigate, compact }) {
  const target = m.target || METRIC_TARGETS[m.label];
  const clickable = Boolean(target && onNavigate);
  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onNavigate(target) : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(target); } } : undefined}
      onMouseEnter={clickable ? (e) => { e.currentTarget.style.borderColor = 'var(--line-strong)'; } : undefined}
      onMouseLeave={clickable ? (e) => { e.currentTarget.style.borderColor = 'var(--line-soft)'; } : undefined}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line-soft)',
        borderRadius: 'var(--r-lg)',
        padding: compact ? '10px 13px' : 'var(--card-pad)',
        boxShadow: compact ? 'none' : 'var(--shadow-soft)',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'border-color .12s ease',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ fontSize: compact ? 10.5 : 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 500 }}>{m.label}</div>
        {clickable && <Iconed name="chevronR" size={compact ? 11 : 12} style={{ color: 'var(--fg-faint)', marginLeft: 'auto' }} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: compact ? 4 : 8 }}>
        <div style={{ fontSize: compact ? 18 : 26, fontWeight: 600, letterSpacing: 0 }} className="mono">{m.value}</div>
        <div style={{ flex: 1 }} />
        <Sparkline values={m.spark} tone={m.tone === 'warning' ? 'warning' : m.tone === 'success' ? 'success' : 'moon'} width={compact ? 48 : 70} height={compact ? 16 : 22} />
      </div>
      <div style={{ marginTop: compact ? 3 : 6, fontSize: compact ? 10.5 : 11.5, color: m.tone === 'success' ? 'var(--success)' : m.tone === 'warning' ? 'var(--warning)' : 'var(--fg-faint)' }}>{m.delta}</div>
    </div>
  );
}

const WO_KIND_TONE = {
  outcome: 'moon', lead: 'moon', dm: 'moon',
  idea: 'info', engagement: 'info',
  review: 'warning', note: 'neutral',
  'followup-draft': 'moon', 'content-draft': 'info',
};

// Chief of Staff 브리핑 — the /api/cron/chief-of-staff composed agenda, read back from
// project_updates (ai.morning_brief) via /api/hub/daily-brief. Renders only when a fresh
// (<24h) brief exists; lanes map to identity tones (sales=company, brand=personal).
const BRIEF_LANE_META = {
  approve: { label: '승인', tone: 'moon' },
  sales: { label: '영업', tone: 'company' },
  brand: { label: '브랜드', tone: 'personal' },
};

function MorningBriefCard({ brief, onNavigate }) {
  if (!brief) return null;
  const items = Array.isArray(brief.items) ? brief.items : [];
  const when = brief.generatedAt
    ? new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(new Date(brief.generatedAt))
    : null;

  // approve-lane rows resolve right below in the approval queue — no navigation needed.
  const targetFor = (item) => {
    if (item.lane === 'sales') {
      return item.ref ? `dashboard/revenue/deals?deal=${encodeURIComponent(item.ref)}` : 'dashboard/revenue/deals';
    }
    if (item.lane === 'brand') return 'dashboard/content/queue';
    return null;
  };

  return (
    <div>
      <SectionTitle right={<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {when && <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{when}</span>}
        <Badge tone="moon" size="xs">Chief of Staff</Badge>
      </div>}>
        오늘 이 3개만
      </SectionTitle>
      <Card pad={false}>
        {items.length === 0 ? (
          <div style={{ padding: 14, fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
            {brief.summary || '오늘 급한 항목 없음 — 큐가 비었습니다.'}
          </div>
        ) : (
          items.map((item, i) => {
            const lane = BRIEF_LANE_META[item.lane] || { label: item.lane || '기타', tone: 'neutral' };
            const target = targetFor(item);
            return (
              <div
                key={`${item.lane}-${i}`}
                onClick={target ? () => onNavigate?.(target) : undefined}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 14px',
                  cursor: target ? 'pointer' : 'default',
                  borderBottom: i < items.length - 1 ? '1px solid var(--line-soft)' : 'none',
                }}
              >
                <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--moon-300)', width: 14, flexShrink: 0, paddingTop: 1 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.45 }}>{item.title}</div>
                  {item.detail && <div style={{ marginTop: 3, fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.5 }}>{item.detail}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, paddingTop: 1 }}>
                  <Badge tone={lane.tone} size="xs">{lane.label}</Badge>
                  {target && <Iconed name="chevronR" size={11} style={{ color: 'var(--fg-faint)' }} />}
                </div>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}

// The brief keeps the queue SHORT — the top 5 waiting decisions, not the full backlog. The
// full queue lives on Agents Orders; the brief is the "what do I act on first" cockpit.
const QUEUE_MAX_VISIBLE = 5;

// The 1-click approval cockpit — proposed work orders (persona/inbox/guru) decided in place.
// registry.json no_auto_send=true: nothing executes without this click.
function ApprovalQueueCard({ onNavigate }) {
  const [orders, setOrders] = React.useState([]);
  const [state, setState] = React.useState('loading');
  const [busyId, setBusyId] = React.useState(null);
  const [approved, setApproved] = React.useState({}); // id → true once approved (reveals execute row)
  const [copiedId, setCopiedId] = React.useState(null);

  // 딜 채널이 카톡/전화 중심이라 "복사"가 실제 발송 경로 — 초안을 클립보드로 옮겨 보내는 흐름.
  const copyDraft = async (o) => {
    const subject = o.body?.subject || o.body?.title || '';
    const text = [subject, o.body?.body || ''].filter(Boolean).join('\n\n');
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(o.id);
      window.setTimeout(() => setCopiedId((v) => (v === o.id ? null : v)), 1600);
    } catch { /* clipboard unavailable — silent */ }
  };

  React.useEffect(() => {
    let active = true;
    fetch('/api/hub/work-orders?status=proposed', { cache: 'no-store' })
      .then((r) => r.json().catch(() => null))
      .then((d) => {
        if (!active) return;
        if (d && Array.isArray(d.orders)) {
          setOrders(d.orders);
          setState(d.source === 'supabase' ? 'live' : 'empty');
        } else {
          setState('empty');
        }
      })
      .catch(() => active && setState('empty'));
    return () => { active = false; };
  }, []);

  async function post(id, body) {
    if (busyId) return false;
    setBusyId(id);
    try {
      const res = await fetch('/api/hub/work-orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, ...body }),
      });
      return res.ok;
    } finally {
      setBusyId(null);
    }
  }

  // proposed → approved reveals the execute row; execute logs the realized outcome and
  // closes the outcome-attribution loop. dismiss drops it.
  const approve = async (id) => { if (await post(id, { status: 'approved' })) setApproved((m) => ({ ...m, [id]: true })); };
  const dismiss = async (id) => { if (await post(id, { status: 'dismissed' })) setOrders((prev) => prev.filter((o) => o.id !== id)); };
  const execute = async (id, action) => { if (await post(id, { status: 'executed', outcome: { action } })) setOrders((prev) => prev.filter((o) => o.id !== id)); };
  // dm/lead capture → executed with no outcome payload, closes the lead-capture loop instead
  // (work_orders.lead_id back-fill — see work-orders.js promoteCaptureToLead).
  const promote = async (id) => { if (await post(id, { status: 'executed' })) setOrders((prev) => prev.filter((o) => o.id !== id)); };

  const pending = orders.filter((o) => !approved[o.id]).length;
  const visible = orders.slice(0, QUEUE_MAX_VISIBLE);
  const overflow = Math.max(0, orders.length - QUEUE_MAX_VISIBLE);
  // 페르소나별 대기 요약 — 큐를 5개로 줄여도 "누가 얼마나 기다리는지" 전체 모양은 유지한다.
  const personaCounts = Object.entries(
    orders.reduce((acc, o) => { const k = o.persona || '기타'; acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
  ).sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <div>
      <SectionTitle right={<Badge tone={pending ? 'moon' : 'success'} size="xs">{pending} 대기</Badge>}>
        승인 큐
      </SectionTitle>
      <Card pad={false}>
        {orders.length === 0 ? (
          <div style={{ padding: 14, fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
            {state === 'loading'
              ? '큐 확인 중…'
              : '승인 대기 중인 제안이 없습니다. /inbox·/team이 제안을 올리면 여기서 1클릭으로 처리합니다.'}
          </div>
        ) : (
          <>
          {personaCounts.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: '9px 14px', borderBottom: '1px solid var(--line-soft)', background: 'var(--surface-2)' }}>
              <span style={{ fontSize: 10, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>대기</span>
              {personaCounts.map(([p, c]) => (
                <Badge key={p} tone="neutral" variant="outline" size="xs">{p} {c}</Badge>
              ))}
            </div>
          )}
          {visible.map((o, i) => (
            <div key={o.id} style={{
              padding: '11px 14px', opacity: busyId === o.id ? 0.5 : 1,
              borderBottom: (i < visible.length - 1 || overflow > 0) ? '1px solid var(--line-soft)' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Badge tone={WO_KIND_TONE[o.kind] || 'neutral'} size="xs">{o.kind}</Badge>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--fg-faint)' }}>{o.persona}{o.channel ? ` · ${o.channel}` : ''}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.title}
                  </div>
                  {/* AI-drafted message (followup/content) — the operator reads this BEFORE approving. No auto-send. */}
                  {(o.kind === 'followup-draft' || o.kind === 'content-draft') && o.body?.body && (
                    <div style={{ marginTop: 5, fontSize: 11.5, color: 'var(--fg-muted)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                      {o.body.body}
                    </div>
                  )}
                </div>
                {!approved[o.id] && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {(o.kind === 'followup-draft' || o.kind === 'content-draft') && o.body?.body && (
                      <Button variant="ghost" size="xs" onClick={() => copyDraft(o)}>{copiedId === o.id ? '복사됨' : '복사'}</Button>
                    )}
                    <Button variant="primary" size="xs" onClick={() => approve(o.id)}>승인</Button>
                    <Button variant="ghost" size="xs" onClick={() => dismiss(o.id)}>보류</Button>
                  </div>
                )}
              </div>
              {approved[o.id] && (o.kind === 'dm' || o.kind === 'lead' ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Dot tone="success" size={6} /> 승인됨 · 신규 리드
                  </span>
                  <Button variant="outline" size="xs" onClick={() => promote(o.id)}>리드로 등록</Button>
                </div>
              ) : o.kind === 'content-draft' ? (
                // 승인 = Studio 파이프라인으로 구체화(서버가 idea→draft 승격 + variant 생성).
                // 콘텐츠 초안은 영업 퍼널 outcome을 절대 남기지 않는다 — 완료는 무-outcome executed.
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Dot tone="success" size={6} /> 승인됨 · Studio 초안 생성
                  </span>
                  <Button variant="outline" size="xs" onClick={() => onNavigate?.('dashboard/content/studio')}>Studio 열기</Button>
                  <Button variant="ghost" size="xs" onClick={() => promote(o.id)}>완료</Button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Dot tone="success" size={6} /> 승인됨 · 실행 결과
                  </span>
                  {o.kind === 'followup-draft' && o.body?.body && (
                    <Button variant="ghost" size="xs" onClick={() => copyDraft(o)}>{copiedId === o.id ? '복사됨' : '복사'}</Button>
                  )}
                  {WO_EXECUTE_ACTIONS.map((a) => (
                    <Button key={a.action} variant="outline" size="xs" onClick={() => execute(o.id, a.action)}>{a.label}</Button>
                  ))}
                </div>
              ))}
            </div>
          ))}
          {overflow > 0 && (
            <button
              onClick={() => onNavigate?.('dashboard/agents/orders')}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 14px', display: 'flex', alignItems: 'center',
                gap: 6, fontSize: 12, color: 'var(--fg-muted)', background: 'transparent', cursor: 'pointer',
              }}
            >
              <span>+{overflow}건 더 · 전체 승인 큐 보기</span>
              <Iconed name="arrowRight" size={12} style={{ marginLeft: 'auto', color: 'var(--fg-faint)' }} />
            </button>
          )}
          </>
        )}
      </Card>
    </div>
  );
}

// 파이프라인 형태 — 열린 딜의 단계 분포를 한 줄 세그먼트 바로. 딜이 어디에 몰려 있고(병목)
// 며칠째 정체된 게 몇 건인지 5초 안에 읽고 딜 보드로 넘어가게 한다. raw count가 아니라
// 분포 + 정체(urgency)를 보여주는 게 DESIGN.md 대시보드 원칙.
const PIPELINE_STAGES = [
  { key: 'lead', label: 'Lead', color: 'var(--fg-faint)' },
  { key: 'qual', label: 'Qual', color: 'var(--info)' },
  { key: 'prop', label: 'Prop', color: 'var(--moon-400)' },
  { key: 'neg', label: 'Neg', color: 'var(--warning)' },
];

function PipelineShapeCard({ onNavigate }) {
  const [data, setData] = React.useState(null);
  const [state, setState] = React.useState('loading');

  React.useEffect(() => {
    let active = true;
    fetch('/api/hub/revenue', { cache: 'no-store' })
      .then((r) => r.json().catch(() => null))
      .then((d) => {
        if (!active) return;
        if (d && d.source === 'supabase' && Array.isArray(d.deals)) {
          const open = d.deals.filter((x) => x.stage !== 'won' && x.stage !== 'lost');
          const byStage = PIPELINE_STAGES.map((s) => ({
            ...s,
            count: open.filter((x) => x.stage === s.key).length,
          }));
          const stalled = open
            .filter((x) => Number(x.age) >= 10)
            .sort((a, b) => Number(b.age) - Number(a.age));
          setData({
            open: open.length,
            value: open.reduce((sum, x) => sum + Number(x.value || 0), 0),
            byStage,
            stalled: stalled.length,
            top: stalled[0] || null,
          });
          setState('live');
        } else {
          setState('mock');
        }
      })
      .catch(() => active && setState('mock'));
    return () => { active = false; };
  }, []);

  return (
    <div>
      <SectionTitle right={<SyncBadge state={state} />}>
        파이프라인
      </SectionTitle>
      <Card>
        {state === 'live' && data ? (
          data.open > 0 ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span className="stat" style={{ fontSize: 24, fontWeight: 600 }}>
                  {data.open}<span style={{ color: 'var(--fg-faint)', fontWeight: 400, fontSize: 14 }}> 딜</span>
                </span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{formatMoney(data.value)}</span>
                <div style={{ flex: 1 }} />
                {data.stalled > 0 && <Badge tone="warning" size="xs">정체 {data.stalled}</Badge>}
              </div>
              {/* 단계 분포 세그먼트 바 — 폭 ∝ 딜 수, 빈 단계는 흐린 슬라이버로 남긴다. */}
              <div style={{ marginTop: 12, display: 'flex', gap: 3, height: 8, borderRadius: 999, overflow: 'hidden' }}>
                {data.byStage.map((s) => (
                  <div key={s.key} title={`${s.label} ${s.count}`} style={{
                    flex: s.count || 0.04, background: s.color, minWidth: s.count ? 6 : 2, opacity: s.count ? 1 : 0.25,
                  }} />
                ))}
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {data.byStage.map((s) => (
                  <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 2, background: s.color, flexShrink: 0, opacity: s.count ? 1 : 0.35 }} />
                    <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{s.label}</span>
                    <span className="mono" style={{ fontSize: 11, color: s.count ? 'var(--fg)' : 'var(--fg-faint)' }}>{s.count}</span>
                  </div>
                ))}
              </div>
              {data.top && (
                <button
                  onClick={() => onNavigate(`dashboard/revenue/deals?deal=${encodeURIComponent(data.top.id)}`)}
                  style={{
                    marginTop: 12, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--line-soft)',
                    borderRadius: 'var(--r-sm)', cursor: 'pointer',
                  }}
                >
                  <Dot tone="warning" size={6} />
                  <span style={{ fontSize: 12, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                    가장 정체: {data.top.name}
                  </span>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--warning)', flexShrink: 0 }}>{data.top.age}일</span>
                </button>
              )}
            </>
          ) : (
            <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
              열린 딜이 없습니다. 리드를 딜로 전환하면 파이프라인 형태가 여기 표시됩니다.
            </div>
          )
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
              Supabase 매출 원장이 연결되면 열린 딜의 단계 분포와 정체 딜이 여기에 표시됩니다.
            </div>
            <div style={{ marginTop: 12 }}>
              <Button variant="outline" size="sm" icon="deals" onClick={() => onNavigate('dashboard/revenue/deals')}>딜 보드 열기</Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// 계약 퍼널 — the contracts half of the 5x dashboard (the content half is ContentCadenceCard
// below). Renders the funnel every quick-log tap / executed work order writes into
// outreach_outcomes — the measurement loop that makes logging worth the extra taps.
const FUNNEL_LABEL = { sent: '접촉', replied: '응답', meeting: '미팅', proposal: '제안', won: '계약' };

function SalesFunnelCard({ onNavigate }) {
  const [stats, setStats] = React.useState(null);
  const [state, setState] = React.useState('loading');

  React.useEffect(() => {
    let active = true;
    fetch('/api/hub/outcomes?limit=1', { cache: 'no-store' })
      .then((r) => r.json().catch(() => null))
      .then((d) => {
        if (!active) return;
        if (d && d.stats?.source === 'supabase') {
          setStats(d.stats);
          setState('live');
        } else {
          setState('mock');
        }
      })
      .catch(() => active && setState('mock'));
    return () => { active = false; };
  }, []);

  const funnel = stats?.funnel || [];
  const sent = funnel.find((f) => f.stage === 'sent')?.count || 0;
  const won = funnel.find((f) => f.stage === 'won')?.count || 0;

  return (
    <div>
      <SectionTitle right={<SyncBadge state={state} />}>
        계약 퍼널
      </SectionTitle>
      <Card>
        {state === 'live' && stats ? (
          stats.total > 0 ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span className="stat" style={{ fontSize: 24, fontWeight: 600 }}>
                  {won}<span style={{ color: 'var(--fg-faint)', fontWeight: 400, fontSize: 14 }}> 계약</span>
                </span>
                <div style={{ flex: 1 }} />
                <Badge tone={won > 0 ? 'success' : 'neutral'} size="xs">접촉→계약 {stats.ratios?.overall ?? 0}%</Badge>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
                {funnel.map((f) => (
                  <div key={f.stage} style={{ flex: 1, minWidth: 0 }}>
                    <div className="mono" style={{ fontSize: 13, fontWeight: 600, textAlign: 'center' }}>{f.count}</div>
                    <div style={{ marginTop: 4, height: 3, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 999, background: 'var(--moon-500)', width: `${sent > 0 ? Math.round((f.count / sent) * 100) : 0}%` }} />
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--fg-faint)', textAlign: 'center', marginTop: 4 }}>{FUNNEL_LABEL[f.stage] || f.stage}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, fontSize: 11, color: 'var(--fg-muted)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span>응답률 <span className="mono">{stats.ratios?.replyRate ?? 0}%</span></span>
                <span>미팅 전환 <span className="mono">{stats.ratios?.meetingRate ?? 0}%</span></span>
                <span>계약 전환 <span className="mono">{stats.ratios?.winRate ?? 0}%</span></span>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
                아직 기록된 실행 결과가 없습니다. 승인 큐·Follow-ups의 결과 버튼(전화함/응답/미팅)이 이 퍼널을 채웁니다.
              </div>
              <div style={{ marginTop: 12 }}>
                <Button variant="outline" size="sm" icon="bell" onClick={() => onNavigate('dashboard/revenue/followups')}>Follow-ups 열기</Button>
              </div>
            </>
          )
        ) : (
          <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
            Supabase 연결 후 접촉→응답→미팅→제안→계약 퍼널이 여기에 표시됩니다.
          </div>
        )}
      </Card>
    </div>
  );
}

function ContentCadenceCard({ onNavigate }) {
  const [data, setData] = React.useState(null);
  const [state, setState] = React.useState("loading");

  React.useEffect(() => {
    let active = true;
    fetch("/api/hub/content", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((d) => {
        if (!active) return;
        if (d && d.source === "supabase" && d.cadence) {
          setData({ cadence: d.cadence, ideas: Array.isArray(d.ideaQueue) ? d.ideaQueue : [] });
          setState("live");
        } else {
          setState("mock");
        }
      })
      .catch(() => active && setState("mock"));
    return () => { active = false; };
  }, []);

  const cadence = data?.cadence;
  const ideas = data?.ideas || [];
  const pct = cadence ? Math.min(100, Math.round((cadence.published / Math.max(cadence.goal, 1)) * 100)) : 0;

  return (
    <div>
      <SectionTitle right={<SyncBadge state={state} />}>
        콘텐츠 발행
      </SectionTitle>
      <Card>
        {state === "live" && cadence ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span className="stat" style={{ fontSize: 24, fontWeight: 600 }}>
                {cadence.published}<span style={{ color: "var(--fg-faint)", fontWeight: 400 }}>/{cadence.goal}</span>
              </span>
              <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>이번 주</span>
              <div style={{ flex: 1 }} />
              <Badge tone={cadence.behind ? "warning" : "success"} size="xs">
                {cadence.behind ? `${cadence.remaining}건 남음` : "목표 달성"}
              </Badge>
            </div>
            <div style={{ marginTop: 10 }}>
              <Progress value={pct} tone={cadence.behind ? "warning" : "success"} />
            </div>
            <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-faint)" }}>오늘의 아이디어</span>
              <span className="mono" style={{ fontSize: 10.5, color: cadence.queueDepth >= 10 ? "var(--fg-faint)" : "var(--warning)" }}>큐 {cadence.queueDepth}</span>
            </div>
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {ideas.slice(0, 3).map((idea) => (
                <button
                  key={idea.id}
                  onClick={() => onNavigate("dashboard/content/queue")}
                  style={{
                    textAlign: "left", display: "flex", alignItems: "center", gap: 8,
                    padding: "7px 9px", background: "var(--surface-2)",
                    border: "1px solid var(--line-soft)", borderRadius: "var(--r-sm)",
                  }}
                >
                  <span className="mono" style={{ fontSize: 10.5, color: "var(--moon-300)", flexShrink: 0 }}>{Math.round(idea.rank)}</span>
                  <span style={{ fontSize: 12, color: "var(--fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{idea.title}</span>
                </button>
              ))}
              {ideas.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--fg-faint)" }}>큐에 아이디어가 없습니다. Studio에서 추가하세요.</div>
              )}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.5 }}>
              Supabase 콘텐츠 원장이 연결되면 이번 주 발행 진척과 아이디어 큐가 여기에 표시됩니다.
            </div>
            <div style={{ marginTop: 12 }}>
              <Button variant="outline" size="sm" icon="queue" onClick={() => onNavigate("dashboard/content/queue")}>Queue 열기</Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// Slim replacement for the old full-card DataTrustStrip — one quiet status line, with the
// per-ledger source badges tucked behind a toggle so telemetry stops competing with signal.
function StatusLine({ state }) {
  const [open, setOpen] = React.useState(false);
  const liveCount = Number(state.summary?.liveCount || 0);
  const sourceCount = state.sources.length;
  const label = state.syncState === 'mixed' ? `${liveCount}/${sourceCount || 6} live` : sourceLabel(state.syncState);
  const detail = state.syncState === 'preview'
    ? 'preview · Supabase 연결 후 live 전환'
    : state.syncState === 'mixed'
    ? '일부 원장은 live, 일부는 preview'
    : state.syncState === 'syncing'
    ? '원장 상태 확인 중'
    : '모든 운영 원장 live';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--fg-faint)', padding: '0 2px' }}>
      <Dot tone={syncTone(state.syncState)} size={6} />
      <span className="mono" style={{ color: 'var(--fg-dim)', letterSpacing: 0 }}>{label}</span>
      <span style={{ color: 'var(--fg-faint)' }}>· {detail}</span>
      {sourceCount > 0 && (
        <button onClick={() => setOpen((o) => !o)} style={{ color: 'var(--fg-faint)', fontSize: 11, background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>
          {open ? '원장 숨기기' : `원장 ${sourceCount}`}
        </button>
      )}
      {open && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', width: '100%', marginTop: 6 }}>
          {state.sources.map((source) => (
            <Badge key={source.key} tone={syncTone(source.state)} variant="outline" size="xs">
              {source.label} · {sourceLabel(source.state)}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// The command — the single highest-priority signal, rendered full-width with its decisions
// already exposed. This is the "<5s, what's my next move?" surface (DESIGN.md §3.1).
function CommandCard({ s, remaining, onNavigate }) {
  const [decided, setDecided] = React.useState(null);
  const line = { danger: 'var(--danger-line)', warning: 'var(--warning-line)', success: 'var(--success-line)', info: 'var(--info-line)' }[s.tone] || 'var(--line)';
  const accent = { danger: 'var(--danger)', warning: 'var(--warning)', success: 'var(--success)', info: 'var(--info)' }[s.tone] || 'var(--moon-300)';
  const hasRecord = s.source?.ref && !SENTINEL_REFS.has(String(s.source.ref).trim().toUpperCase());
  const openRecord = () => onNavigate?.(withEntityRef(CONTEXT_TARGETS[s.kind] || 'dashboard/daily-brief', s.source));
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: 'var(--surface)',
      border: '1px solid var(--line-soft)',
      borderLeft: `1px solid ${line}`,
      borderRadius: 'var(--r-xl)',
      padding: '20px 22px',
      boxShadow: `0 0 0 1px ${line}, 0 18px 44px -26px ${line}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: accent, boxShadow: `0 0 8px ${accent}`, animation: s.tone === 'danger' ? 'mlMoonPulse 1.4s ease-in-out infinite' : 'none', flexShrink: 0 }} />
        <span className="mono" style={{ fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-dim)' }}>지금 가장 급한 결정</span>
        <Badge tone={s.tone} size="xs">{s.kind}</Badge>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{s.meta}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>from {s.source?.from} · <span className="mono">{s.source?.ref}</span></span>
      </div>
      <div style={{ fontSize: 21, fontWeight: 500, letterSpacing: '-0.015em', color: 'var(--fg)', marginBottom: 8, lineHeight: 1.25 }}>{s.title}</div>
      <div style={{ fontSize: 13.5, color: 'var(--fg-muted)', lineHeight: 1.6, maxWidth: '76ch' }}>{s.summary}</div>
      {decided ? (
        <div style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--success)' }}>
          <Iconed name="check" size={14} />
          <span>Decision · {decided}</span>
          <Button variant="ghost" size="sm" onClick={() => setDecided(null)}>되돌리기</Button>
        </div>
      ) : (
        <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {s.decisions.map((d, i) => (
            <Button key={i} variant={d.primary ? 'primary' : 'secondary'} size="md" icon={d.primary ? 'bolt' : null}
              onClick={() => {
                setDecided(d.label);
                const target = SIGNAL_TARGETS[d.action];
                if (target && target !== 'dashboard/daily-brief') onNavigate?.(withEntityRef(target, s.source));
              }}>
              {d.label}
            </Button>
          ))}
          {hasRecord && <Button variant="outline" size="md" iconRight="arrowRight" onClick={openRecord}>레코드 열기</Button>}
          <div style={{ flex: 1 }} />
          {remaining > 0 && <span style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>대기 결정 {remaining}건 ↓</span>}
        </div>
      )}
    </div>
  );
}

// Calm state when nothing is urgent — the brief still answers "what matters" with "nothing on fire".
function CommandClear({ signalCount }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-xl)',
      padding: '22px 22px', display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <span style={{ width: 34, height: 34, borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', border: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success)', flexShrink: 0 }}>
        <Iconed name="check" size={17} />
      </span>
      <div>
        <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--fg)' }}>지금 급한 결정은 없습니다</div>
        <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', marginTop: 3 }}>
          {signalCount > 0 ? `${signalCount}개 신호는 아래 큐에서 여유 있게 처리하세요.` : '새 신호가 들어오면 여기 가장 먼저 올라옵니다.'}
        </div>
      </div>
    </div>
  );
}

export function DailyBrief({ onNavigate }) {
  const [now, setNow] = React.useState(() => new Date());
  const ledger = useDailyBriefLedger();
  const [blocks, setBlocks] = React.useState(TODAY_BLOCKS);
  const toggle = (i) => setBlocks(bs => bs.map((b, j) => j === i ? { ...b, done: !b.done } : b));

  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    setBlocks(ledger.blocks);
  }, [ledger.blocks]);

  const urgentCount = ledger.summary?.urgentCount ?? ledger.signals.filter(s => s.tone === 'danger').length;
  const todayCount = ledger.summary?.todayCount ?? ledger.signals.filter(s => s.tone === 'warning').length;
  const signalCount = ledger.signals.length;
  const ranked = React.useMemo(() => rankSignals(ledger.signals), [ledger.signals]);
  const command = ranked[0] || null;
  const queue = ranked.slice(1);
  const okCount = Math.max(0, signalCount - urgentCount - todayCount);

  return (
    <div className="hub-page" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)', padding: 'var(--section-gap)', maxWidth: 1400, margin: '0 auto', width: '100%' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
        <div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>{formatBriefDate(now)}</div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 500, letterSpacing: '-0.02em' }}>{greetingFor(now)}, <span style={{ color: 'var(--moon-300)' }}>Hyeon</span></h1>
          <div style={{ marginTop: 6, fontSize: 13.5, color: 'var(--fg-muted)', maxWidth: '60ch', lineHeight: 1.55 }}>
            오늘 <span style={{ color: 'var(--fg)' }}>{signalCount}개 신호</span> · <span style={{ color: 'var(--danger)' }}>{urgentCount} 즉시</span> · <span style={{ color: 'var(--warning)' }}>{todayCount} 오늘</span> · {okCount} 여유
          </div>
        </div>
        <div className="hub-page-actions" style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="md" icon="sparkle" onClick={() => onNavigate('dashboard/agents/chat')}>Ask Council</Button>
          <Button variant="outline" size="md" icon="clock" onClick={() => onNavigate('dashboard/work/calendar?focus=15')}>Start 15m focus</Button>
        </div>
      </div>

      <StatusLine state={ledger} />

      {command ? (
        <CommandCard s={command} remaining={queue.length} onNavigate={onNavigate} />
      ) : (
        <CommandClear signalCount={signalCount} />
      )}

      <div className="hub-grid--split" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 'var(--section-gap)' }}>
        <div>
          <SectionTitle right={<div style={{ display: 'flex', gap: 6 }}>
            <Badge tone="danger" size="xs">{urgentCount} urgent</Badge>
            <Badge tone="warning" size="xs">{todayCount} today</Badge>
            <Badge tone="success" size="xs">{okCount} ok</Badge>
          </div>}>
            결정 큐
          </SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {queue.length ? (
              queue.map((s) => <SignalCard key={s.id} s={s} defaultExpanded={s.tone === 'danger'} onNavigate={onNavigate} />)
            ) : (
              <Card>
                <EmptyState icon="check" title={command ? '큐가 비었습니다' : '오늘 신호 없음'} description={command ? '가장 급한 하나만 위에 남았어요. 처리하면 브리핑이 정리됩니다.' : '새 신호가 들어오면 명령 카드로 가장 먼저 올라옵니다.'} />
              </Card>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)' }}>
          <MorningBriefCard brief={ledger.morningBrief} onNavigate={onNavigate} />
          <ApprovalQueueCard onNavigate={onNavigate} />

          <div>
            <SectionTitle right={<span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{blocks.filter(b => b.done).length}/{blocks.length}</span>}>Today</SectionTitle>
            <Card pad={false}>
              {blocks.map((b, i) => (
                <div key={i} onClick={() => toggle(i)} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', cursor: 'pointer',
                  borderBottom: i < blocks.length - 1 ? '1px solid var(--line-soft)' : 'none',
                }}>
                  <Checkbox checked={!!b.done} onChange={() => toggle(i)} />
                  <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)', width: 38 }}>{b.time}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: b.done ? 'var(--fg-faint)' : 'var(--fg)', textDecoration: b.done ? 'line-through' : 'none' }}>{b.title}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginTop: 2 }}>{b.kind}</div>
                  </div>
                  {b.tag === 'personal' && <Badge tone="personal" size="xs">Personal</Badge>}
                  {b.tag === 'company' && <Badge tone="company" size="xs">Company</Badge>}
                </div>
              ))}
            </Card>
          </div>

        </div>
      </div>

      <div>
        <SectionTitle right={<span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>클릭하면 해당 서피스로 이동</span>}>지표</SectionTitle>
        <div className="hub-grid--metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--gap)' }}>
          {ledger.metrics.map((m) => <MetricCard key={m.label} m={m} onNavigate={onNavigate} compact />)}
        </div>
      </div>

      <div className="hub-grid--three" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--section-gap)' }}>
        <PipelineShapeCard onNavigate={onNavigate} />
        <SalesFunnelCard onNavigate={onNavigate} />
        <ContentCadenceCard onNavigate={onNavigate} />
      </div>

      <div>
        <SectionTitle>This week rhythm</SectionTitle>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>4/5 rituals done</div>
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>80%</span>
          </div>
          <div style={{ marginTop: 10 }}><Progress value={80} /></div>
          <div style={{ marginTop: 14, display: 'flex', gap: 6 }}>
            {['월','화','수','목','금'].map((d, i) => (
              <div key={d} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{
                  height: 28, borderRadius: 6,
                  background: i < 4 ? 'var(--moon-600)' : 'var(--surface-3)',
                  border: i === 4 ? '1px dashed var(--warning)' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {i < 4 && <Iconed name="check" size={12} style={{ color: 'var(--moon-100)' }} />}
                  {i === 4 && <Iconed name="clock" size={11} style={{ color: 'var(--warning)' }} />}
                </div>
                <div style={{ fontSize: 10, color: 'var(--fg-faint)', marginTop: 4 }}>{d}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
