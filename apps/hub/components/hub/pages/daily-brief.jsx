"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import { Badge, Dot, Card, SectionTitle, Button, Checkbox, Progress, Sparkline, SyncBadge } from "../hub-primitives";
import { BRIEF_SIGNALS, TODAY_BLOCKS, METRICS } from "../hub-data";

function formatBriefDate(date) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(date).replace(',', ' ·').replace(',', ' ·');
}

function greetingFor(date) {
  const hour = date.getHours();
  if (hour < 12) return '좋은 아침이에요';
  if (hour < 18) return '좋은 오후예요';
  return '수고 많았어요, 오늘 마무리해요';
}

const SIGNAL_TARGETS = {
  draft: 'dashboard/content/studio?new=draft',
  escalate: 'dashboard/classin/pipeline',
  followup: 'dashboard/classin/pipeline',
  deals: 'dashboard/classin/pipeline',
  leads: 'dashboard/classin/revenue',
  revenue: 'dashboard/classin/revenue',
  write: 'dashboard/content/studio',
  queue: 'dashboard/content/queue',
  delay: 'dashboard/content/queue',
  review: 'dashboard/automations/runs',
  flows: 'dashboard/automations/flows',
  dismiss: 'dashboard/daily-brief',
  accept: 'dashboard/work/roadmap',
  chat: 'dashboard/agents/chat?agent=guru',
  hold: 'dashboard/work/decisions',
  start: 'dashboard/work/rhythm?check=weekly-review',
  projects: 'dashboard/work/projects',
  decision: 'dashboard/work/decisions?new=decision',
  rhythm: 'dashboard/work/rhythm',
  focus: 'dashboard/work/calendar?focus=15',
  queueApprovals: 'dashboard/daily-brief',
};

const CONTEXT_TARGETS = {
  Revenue: 'dashboard/classin/pipeline',
  Risk: 'dashboard/classin/pipeline',
  Content: 'dashboard/content/queue',
  Automation: 'dashboard/automations/runs',
  Agent: 'dashboard/agents/council',
  Queue: 'approval-queue',
  Rhythm: 'dashboard/work/rhythm',
  Work: 'dashboard/work/projects',
};

function briefDecisionStorageKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `hub:brief-decided:${y}-${m}-${d}`;
}

function resolveSignalTarget(signal, decision) {
  const target = decision.target || SIGNAL_TARGETS[decision.action];
  if (!target) return null;
  if (
    signal.source?.from === 'Deals' &&
    signal.source?.ref &&
    target === 'dashboard/classin/pipeline'
  ) {
    return `${target}?deal=${encodeURIComponent(signal.source.ref)}`;
  }
  return target;
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
    queue: null,
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
          queue: data.queue || null,
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

function DataTrustStrip({ state }) {
  const liveCount = Number(state.summary?.liveCount || 0);
  const sourceCount = state.sources.length;
  const label = state.syncState === 'mixed'
    ? `${liveCount}/${sourceCount || 5} live`
    : sourceLabel(state.syncState);
  const detail = state.syncState === 'preview'
    ? 'preview data · Supabase 연결 후 live 전환'
    : state.syncState === 'mixed'
    ? '일부 원장은 live, 일부는 preview'
    : state.syncState === 'syncing'
    ? '원장 상태 확인 중'
    : '모든 운영 원장 live';

  return (
    <Card style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--surface-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Iconed name="signal" size={14} style={{ color: 'var(--moon-300)' }} />
        <Badge tone={syncTone(state.syncState)} size="xs">{label}</Badge>
        <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{detail}</span>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {state.sources.map((source) => (
          <Badge key={source.key} tone={syncTone(source.state)} variant="outline" size="xs">
            {source.label} · {sourceLabel(source.state)}
          </Badge>
        ))}
      </div>
    </Card>
  );
}

function SignalCard({ s, onNavigate, onApprovalQueueFocus, defaultExpanded = false, decided = null, onDecision }) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const borderTone = { danger: 'oklch(0.5 0.1 25 / 0.5)', warning: 'oklch(0.5 0.09 85 / 0.5)', success: 'oklch(0.5 0.08 155 / 0.5)', info: 'oklch(0.5 0.06 230 / 0.5)' }[s.tone] || 'var(--line)';
  const contextTarget = CONTEXT_TARGETS[s.kind];
  const openContext = () => {
    if (contextTarget === 'approval-queue') {
      onApprovalQueueFocus?.();
      return;
    }
    if (contextTarget) onNavigate?.(contextTarget);
  };

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
      <button
        type="button"
        className="hub-stackable-row"
        aria-expanded={expanded}
        aria-label={`${s.title} 상세 ${expanded ? '접기' : '펼치기'}`}
        onClick={() => setExpanded(e => !e)}
        style={{ width: '100%', padding: 'var(--card-pad)', cursor: 'pointer', display: 'flex', gap: 14, textAlign: 'left' }}
      >
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
      </button>
      {expanded && !decided && (
        <div style={{ padding: '0 var(--card-pad) var(--card-pad)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {s.decisions.map((d, i) => (
            <Button key={i} variant={d.primary ? 'primary' : 'secondary'} size="sm" icon={d.primary ? 'bolt' : null}
              onClick={() => {
                onDecision?.(s.id, d.label);
                const target = resolveSignalTarget(s, d);
                if (target === 'dashboard/daily-brief') {
                  onApprovalQueueFocus?.();
                } else if (target) {
                  onNavigate?.(target);
                }
              }}>
              {d.label}
            </Button>
          ))}
          <div style={{ flex: 1 }} />
          {contextTarget && <Button variant="ghost" size="sm" icon="moreV" onClick={openContext}>More context</Button>}
        </div>
      )}
    </div>
  );
}

function MetricCard({ m, onNavigate }) {
  const [hovered, setHovered] = React.useState(false);
  const clickable = Boolean(m.target);

  return (
    <div
      onClick={clickable ? () => onNavigate?.(m.target) : undefined}
      onMouseEnter={clickable ? () => setHovered(true) : undefined}
      onMouseLeave={clickable ? () => setHovered(false) : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onNavigate?.(m.target);
        }
      } : undefined}
      style={{
        background: hovered ? 'var(--surface-2)' : 'var(--surface)',
        border: '1px solid var(--line-soft)',
        borderRadius: 'var(--r-lg)',
        padding: 'var(--card-pad)',
        boxShadow: 'var(--shadow-soft)',
        cursor: clickable ? 'pointer' : undefined,
        transition: clickable ? 'background .16s ease, border-color .16s ease' : undefined,
      }}>
      <div style={{ fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 500 }}>{m.label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8 }}>
        <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em' }} className="mono">{m.value}</div>
        <div style={{ flex: 1 }} />
        <Sparkline values={m.spark} tone={m.tone === 'warning' ? 'warning' : m.tone === 'success' ? 'success' : 'moon'} width={70} height={22} />
      </div>
      <div style={{ marginTop: 6, fontSize: 11.5, color: m.tone === 'success' ? 'var(--success)' : m.tone === 'warning' ? 'var(--warning)' : 'var(--fg-faint)' }}>{m.delta}</div>
    </div>
  );
}

function CoreActionCenter({ ledger, blocks, onNavigate, onApprovalQueueFocus }) {
  const primarySignal = ledger.signals[0] || null;
  const pendingQueue = Number(ledger.queue?.pending || 0);
  const remainingBlocks = blocks.filter((block) => !block.done).length;
  const urgentCount = ledger.summary?.urgentCount ?? ledger.signals.filter(signal => signal.tone === 'danger').length;
  const firstTarget = primarySignal?.decisions?.[0]
    ? resolveSignalTarget(primarySignal, primarySignal.decisions[0])
    : null;

  const actions = [
    {
      key: 'next',
      icon: urgentCount ? 'bolt' : 'signal',
      tone: urgentCount ? 'danger' : 'moon',
      title: primarySignal ? primarySignal.title : '오늘 액션 정리',
      meta: primarySignal ? `${primarySignal.kind} · ${primarySignal.meta}` : `${remainingBlocks}개 블록 남음`,
      body: primarySignal ? primarySignal.summary : '신호가 없으면 생성·기록·일정부터 정리합니다.',
      cta: primarySignal ? '최우선 열기' : 'Today 보기',
      onClick: () => {
        if (firstTarget === 'dashboard/daily-brief') onApprovalQueueFocus?.();
        else if (firstTarget) onNavigate?.(firstTarget);
        else document.getElementById('today-blocks')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    },
    {
      key: 'create',
      icon: 'plus',
      tone: 'moon',
      title: '생성',
      meta: '딜 · 고객 · 프로젝트',
      body: '새 딜은 보드 lane의 + 딜에서, 고객은 Accounts에서 바로 만듭니다.',
      cta: '딜 보드',
      onClick: () => onNavigate?.('dashboard/classin/pipeline'),
    },
    {
      key: 'memo',
      icon: 'edit',
      tone: 'info',
      title: '메모 / 결정',
      meta: '맥락 남기기',
      body: '회의 메모, 선택 근거, 다음 액션을 결정 기록으로 남깁니다.',
      cta: '기록하기',
      onClick: () => onNavigate?.('dashboard/work/decisions?new=decision'),
    },
    {
      key: 'customer',
      icon: 'accounts',
      tone: pendingQueue ? 'warning' : 'moon',
      title: '고객 상태',
      meta: pendingQueue ? `${pendingQueue}개 승인/처리 대기` : '상태 · 기록 확인',
      body: '고객별 헬스, 최근 접점, 노트와 활동 타임라인을 확인합니다.',
      cta: '고객 열기',
      onClick: () => onNavigate?.('dashboard/classin/accounts'),
    },
    {
      key: 'schedule',
      icon: 'clock',
      tone: 'neutral',
      title: '일정',
      meta: `${remainingBlocks}개 남음`,
      body: '오늘 블록과 15분 집중 시간을 캘린더에 바로 올립니다.',
      cta: '15m focus',
      onClick: () => onNavigate?.('dashboard/work/calendar?focus=15'),
    },
  ];

  return (
    <Card style={{ padding: 14, background: 'var(--surface)', border: '1px solid var(--line-soft)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>오늘의 실행 허브</div>
          <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 2 }}>생성 · 관리 · 메모 · 일정 · 고객 기록을 한 번에</div>
        </div>
        <div style={{ flex: 1 }} />
        <Badge tone={urgentCount ? 'danger' : 'moon'} size="xs">{urgentCount ? `${urgentCount} urgent` : 'clear'}</Badge>
        <Badge tone={pendingQueue ? 'warning' : 'neutral'} size="xs">{pendingQueue} queue</Badge>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={action.onClick}
            style={{
              minHeight: 136,
              padding: 12,
              textAlign: 'left',
              background: 'var(--surface-2)',
              border: '1px solid var(--line-soft)',
              borderRadius: 'var(--r-sm)',
              color: 'var(--fg)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: action.tone === 'danger' ? 'var(--danger)' : action.tone === 'warning' ? 'var(--warning)' : 'var(--moon-300)' }}>
                <Iconed name={action.icon} size={14} />
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{action.title}</span>
            </div>
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{action.meta}</div>
            <div style={{ flex: 1, fontSize: 11.5, lineHeight: 1.45, color: 'var(--fg-muted)' }}>{action.body}</div>
            <span style={{ fontSize: 11.5, color: 'var(--moon-200)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {action.cta}<Iconed name="arrowRight" size={11} />
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}

const WO_KIND_TONE = {
  outcome: 'moon', lead: 'moon', dm: 'moon',
  idea: 'info', engagement: 'info',
  review: 'warning', note: 'neutral',
  content_handoff: 'info', content_export: 'moon', email_send: 'warning',
  sales_next_action: 'moon',
  followup: 'moon', onboarding: 'success',
};
const WO_STATUS_TONE = { proposed: 'warning', approved: 'info', executing: 'warning', executed: 'success', dismissed: 'neutral' };
const WO_EXECUTABLE_KINDS = new Set(['content_handoff', 'content_export', 'email_send']);

function workOrderStatusLabel(status) {
  return ({ proposed: '대기', approved: '승인됨', executing: '실행중', executed: '실행됨', dismissed: '보류' })[status] || status;
}

function workOrderHint(order) {
  const body = order.body || {};
  if (order.kind === 'followup') {
    const parts = [
      body.stage,
      Number.isFinite(Number(body.age)) ? `${body.age}일 정체` : null,
      body.value ? `₩${Number(body.value).toLocaleString('ko-KR')}` : null,
    ].filter(Boolean);
    return parts.join(' · ') || body.dealName || '정체 딜 팔로업 승인 요청';
  }
  if (order.kind === 'email_send') {
    return [body.recipientEmail, body.subject].filter(Boolean).join(' · ') || '고객 이메일 발송 요청';
  }
  if (order.kind === 'content_handoff' || order.kind === 'content_export') {
    return [body.targetChannel || body.channel, body.exportProfile, body.event].filter(Boolean).join(' · ') || '콘텐츠 전달/업로드 승인 요청';
  }
  if (body.summary) return String(body.summary).slice(0, 150);
  if (body.raw) return String(body.raw).slice(0, 150);
  return order.channel ? `${order.channel} · ${order.source}` : order.source || 'Moonlight work order';
}

function executeLabel(order) {
  if (WO_EXECUTABLE_KINDS.has(order.kind)) return '실행';
  return '완료';
}

// The 1-click approval cockpit — proposed work orders (persona/inbox/guru) decided in place.
// registry.json no_auto_send=true: nothing executes without this click.
function ApprovalQueueCard({ onNavigate, initialQueue, highlight }) {
  const initialOrders = Array.isArray(initialQueue?.orders) ? initialQueue.orders : [];
  const [orders, setOrders] = React.useState(initialOrders);
  const [state, setState] = React.useState(initialQueue ? (initialQueue.source === 'supabase' ? 'live' : 'empty') : 'loading');
  const [busyId, setBusyId] = React.useState(null);
  const [message, setMessage] = React.useState(null);
  const hasInitialQueue = React.useRef(!!initialQueue);

  React.useEffect(() => {
    if (!initialQueue || !Array.isArray(initialQueue.orders)) return;
    hasInitialQueue.current = true;
    setOrders(initialQueue.orders);
    setState(initialQueue.source === 'supabase' ? 'live' : 'empty');
  }, [initialQueue]);

  const load = React.useCallback((options = {}) => {
    setState('loading');
    setMessage(null);
    return fetch('/api/hub/work-orders?status=proposed,approved', { cache: 'no-store' })
      .then((r) => r.json().catch(() => null))
      .then((d) => {
        if (options.ignoreIfInitial && hasInitialQueue.current) return;
        if (d && Array.isArray(d.orders)) {
          setOrders(d.orders);
          setState(d.source === 'supabase' ? 'live' : 'empty');
        } else {
          setState('empty');
        }
      })
      .catch(() => setState('empty'));
  }, []);

  React.useEffect(() => {
    let active = true;
    if (initialQueue) return () => { active = false; };
    load({ ignoreIfInitial: true }).finally(() => {
      if (!active) return;
    });
    return () => { active = false; };
  }, [load]);

  async function decide(id, status) {
    if (busyId) return;
    setBusyId(id);
    setMessage(null);
    try {
      const res = await fetch('/api/hub/work-orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setOrders((prev) => status === 'approved'
          ? prev.map((o) => (o.id === id ? { ...o, status: 'approved' } : o))
          : prev.filter((o) => o.id !== id));
        setMessage({ tone: status === 'approved' ? 'info' : 'neutral', text: status === 'approved' ? '승인됨 · 실행 전 최종 큐에 유지됩니다.' : '보류 처리됨.' });
      } else {
        setMessage({ tone: 'danger', text: data.reason || data.error || `처리 실패 (${res.status})` });
      }
    } finally {
      setBusyId(null);
    }
  }

  async function execute(id) {
    if (busyId) return;
    setBusyId(id);
    setMessage(null);
    try {
      const res = await fetch('/api/hub/work-orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, action: 'execute' }),
      });
      const data = await res.json().catch(() => ({}));
      const completed = ['logged', 'sent', 'marked_executed'].includes(data.status) ||
        data.workOrderExecution?.persisted ||
        data.persistence?.workOrderExecution?.persisted;

      if (completed) {
        setOrders((prev) => prev.filter((o) => o.id !== id));
        setMessage({ tone: 'success', text: data.message || '실행 완료 · work_order가 executed로 전환됐습니다.' });
      } else {
        setMessage({
          tone: res.ok ? 'warning' : 'danger',
          text: data.error || data.message || `실행 대기 · ${data.status || res.status}`,
        });
      }
    } finally {
      setBusyId(null);
    }
  }

  const proposed = orders.filter((o) => o.status === 'proposed');
  const approved = orders.filter((o) => o.status === 'approved');
  const pending = proposed.length + approved.length;
  const renderOrder = (o, i, total) => (
    <div key={o.id} style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '11px 14px', opacity: busyId === o.id ? 0.5 : 1,
      borderBottom: i < total - 1 ? '1px solid var(--line-soft)' : 'none',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
          <Badge tone={WO_STATUS_TONE[o.status] || 'neutral'} size="xs">{workOrderStatusLabel(o.status)}</Badge>
          <Badge tone={WO_KIND_TONE[o.kind] || 'neutral'} size="xs">{o.kind}</Badge>
          <span className="mono" style={{ fontSize: 10, color: 'var(--fg-faint)' }}>{o.persona}{o.channel ? ` · ${o.channel}` : ''}</span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {o.title}
        </div>
        <div style={{ marginTop: 3, fontSize: 11.5, color: 'var(--fg-faint)', lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {workOrderHint(o)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {o.dealId && (
          <Button variant="ghost" size="xs" disabled={busyId === o.id} onClick={() => onNavigate?.(`dashboard/classin/pipeline?deal=${encodeURIComponent(o.dealId)}`)}>딜 열기</Button>
        )}
        {o.status === 'proposed' ? (
          <>
            <Button variant="primary" size="xs" disabled={busyId === o.id} onClick={() => decide(o.id, 'approved')}>승인</Button>
            <Button variant="ghost" size="xs" disabled={busyId === o.id} onClick={() => decide(o.id, 'dismissed')}>보류</Button>
          </>
        ) : (
          <>
            <Button variant="primary" size="xs" icon={WO_EXECUTABLE_KINDS.has(o.kind) ? 'play' : 'check'} disabled={busyId === o.id} onClick={() => execute(o.id)}>{executeLabel(o)}</Button>
            <Button variant="ghost" size="xs" disabled={busyId === o.id} onClick={() => decide(o.id, 'dismissed')}>보류</Button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div id="approval-queue" style={{
      outline: highlight ? '1px solid var(--moon-300)' : '1px solid transparent',
      outlineOffset: 3,
      borderRadius: 'var(--r-lg)',
      transition: 'outline-color .18s',
    }}>
      <SectionTitle right={<div style={{ display: 'flex', gap: 6 }}>
        <Badge tone={proposed.length ? 'warning' : 'success'} size="xs">{proposed.length} 대기</Badge>
        <Badge tone={approved.length ? 'info' : 'neutral'} size="xs">{approved.length} 승인됨</Badge>
      </div>}>
        승인 큐
      </SectionTitle>
      <Card pad={false}>
        {pending === 0 ? (
          <div style={{ padding: 14, fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
            {state === 'loading'
              ? '큐 확인 중…'
              : '승인 대기 중인 제안이 없습니다. /inbox·/team이 제안을 올리면 여기서 1클릭으로 처리합니다.'}
          </div>
        ) : (
          <>
            {proposed.map((o, i) => renderOrder(o, i, proposed.length + (approved.length ? 1 : 0)))}
            {approved.length ? (
              <div style={{ padding: '7px 14px', background: 'var(--surface-2)', borderTop: proposed.length ? '1px solid var(--line-soft)' : 'none', borderBottom: '1px solid var(--line-soft)' }}>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>APPROVED · EXECUTE WHEN READY</span>
              </div>
            ) : null}
            {approved.map((o, i) => renderOrder(o, i, approved.length))}
          </>
        )}
        {message && (
          <div style={{ padding: '9px 14px', borderTop: '1px solid var(--line-soft)', fontSize: 11.5, color: message.tone === 'danger' ? 'var(--danger)' : message.tone === 'success' ? 'var(--success)' : message.tone === 'warning' ? 'var(--warning)' : 'var(--fg-muted)' }}>
            {message.text}
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

  const syncTone = state === "live" ? "var(--success)" : state === "loading" ? "var(--warning)" : "var(--fg-faint)";
  const syncLabel = state === "live" ? "live" : state === "loading" ? "syncing" : "mock";
  const cadence = data?.cadence;
  const ideas = data?.ideas || [];
  const pct = cadence ? Math.min(100, Math.round((cadence.published / Math.max(cadence.goal, 1)) * 100)) : 0;

  return (
    <div>
      <SectionTitle right={<span className="mono" style={{ fontSize: 10.5, color: syncTone }}>{syncLabel}</span>}>
        콘텐츠 발행
      </SectionTitle>
      <Card>
        {state === "live" && cadence ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span className="mono" style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" }}>
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

export function DailyBrief({ onNavigate }) {
  const [now, setNow] = React.useState(() => new Date());
  const ledger = useDailyBriefLedger();
  const [blocks, setBlocks] = React.useState(TODAY_BLOCKS);
  const decisionStorageKey = React.useMemo(() => briefDecisionStorageKey(now), [now]);
  const [decisions, setDecisions] = React.useState({});
  const [queueHighlight, setQueueHighlight] = React.useState(false);
  const toggle = (i) => setBlocks(bs => bs.map((b, j) => j === i ? { ...b, done: !b.done } : b));

  const focusApprovalQueue = React.useCallback(() => {
    document.getElementById('approval-queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setQueueHighlight(true);
    window.setTimeout(() => setQueueHighlight(false), 1200);
  }, []);

  const rememberDecision = React.useCallback((id, label) => {
    setDecisions((prev) => {
      const next = { ...prev, [id]: label };
      try {
        window.localStorage.setItem(decisionStorageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [decisionStorageKey]);

  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    setBlocks(ledger.blocks);
  }, [ledger.blocks]);

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(decisionStorageKey);
      setDecisions(stored ? JSON.parse(stored) || {} : {});
    } catch {
      setDecisions({});
    }
  }, [decisionStorageKey]);

  const urgentCount = ledger.summary?.urgentCount ?? ledger.signals.filter(s => s.tone === 'danger').length;
  const todayCount = ledger.summary?.todayCount ?? ledger.signals.filter(s => s.tone === 'warning').length;
  const signalCount = ledger.signals.length;
  const statusCopy = ledger.syncState === 'live'
    ? '모든 운영 원장이 live입니다.'
    : ledger.syncState === 'mixed'
    ? 'live 원장과 preview 원장을 분리해 보여주고 있어요.'
    : ledger.syncState === 'syncing'
    ? '운영 원장 상태를 확인하고 있어요.'
    : 'preview 데이터입니다. Supabase 연결 후 live 운영으로 전환됩니다.';

  return (
    <div className="hub-page" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)', padding: 'var(--section-gap)', maxWidth: 1400, margin: '0 auto', width: '100%' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
        <div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>{formatBriefDate(now)}</div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 500, letterSpacing: '-0.02em' }}>{greetingFor(now)}, <span style={{ color: 'var(--moon-300)' }}>Hyeon</span></h1>
          <div style={{ marginTop: 6, fontSize: 13.5, color: 'var(--fg-muted)', maxWidth: '60ch', lineHeight: 1.55 }}>
            {signalCount}개의 신호가 오늘 결정이 필요해요. 그중 <span style={{ color: 'var(--danger)' }}>{urgentCount}개는 즉시 확인</span>, <span style={{ color: 'var(--warning)' }}>{todayCount}개는 오늘 처리</span>. {statusCopy}
          </div>
        </div>
        <div className="hub-page-actions" style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="md" icon="sparkle" onClick={() => onNavigate('dashboard/agents/chat?agent=council')}>Ask Council</Button>
          <Button variant="outline" size="md" icon="clock" onClick={() => onNavigate('dashboard/work/calendar?focus=15')}>Start 15m focus</Button>
        </div>
      </div>

      <DataTrustStrip state={ledger} />

      <CoreActionCenter
        ledger={ledger}
        blocks={blocks}
        onNavigate={onNavigate}
        onApprovalQueueFocus={focusApprovalQueue}
      />

      <div className="hub-grid--metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'var(--gap)' }}>
        {ledger.metrics.map(m => <MetricCard key={m.label} m={m} onNavigate={onNavigate} />)}
      </div>

      <div className="hub-grid--split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 'var(--section-gap)' }}>
        <div>
          <SectionTitle right={<div style={{ display: 'flex', gap: 6 }}>
            <Badge tone="danger" size="xs">{urgentCount} urgent</Badge>
            <Badge tone="warning" size="xs">{todayCount} today</Badge>
            <Badge tone="success" size="xs">{Math.max(0, signalCount - urgentCount - todayCount)} ok</Badge>
          </div>}>
            Signal feed
          </SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ledger.signals.map((s, index) => (
              <SignalCard
                key={s.id}
                s={s}
                onNavigate={onNavigate}
                onApprovalQueueFocus={focusApprovalQueue}
                defaultExpanded={index === 0 || s.tone === 'danger'}
                decided={decisions[s.id] || null}
                onDecision={rememberDecision}
              />
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)' }}>
          <ApprovalQueueCard onNavigate={onNavigate} initialQueue={ledger.queue} highlight={queueHighlight} />

          <div id="today-blocks">
            <SectionTitle right={<span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{blocks.filter(b => b.done).length}/{blocks.length}</span>}>Today</SectionTitle>
            <Card pad={false}>
              {blocks.map((b, i) => (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  aria-pressed={!!b.done}
                  aria-label={`${b.title} 완료 토글`}
                  onClick={() => toggle(i)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      toggle(i);
                    }
                  }}
                  style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  minHeight: 44, padding: '10px 14px', cursor: 'pointer',
                  borderBottom: i < blocks.length - 1 ? '1px solid var(--line-soft)' : 'none',
                }}>
                  <Checkbox checked={!!b.done} ariaLabel={`${b.title} 완료 토글`} onChange={() => toggle(i)} />
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

          <ContentCadenceCard onNavigate={onNavigate} />

          <div>
            <SectionTitle>This week rhythm <SyncBadge state="preview" /></SectionTitle>
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
      </div>
    </div>
  );
}
