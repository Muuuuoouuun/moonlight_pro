"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import { Badge, Dot, Card, SectionTitle, Button, Checkbox, Progress, Sparkline } from "../hub-primitives";
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
    ? `${liveCount}/${sourceCount || 6} live`
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

function SignalCard({ s, onNavigate }) {
  const [expanded, setExpanded] = React.useState(s.id === 's1');
  const [decided, setDecided] = React.useState(null);
  const borderTone = { danger: 'oklch(0.5 0.1 25 / 0.5)', warning: 'oklch(0.5 0.09 85 / 0.5)', success: 'oklch(0.5 0.08 155 / 0.5)', info: 'oklch(0.5 0.06 230 / 0.5)' }[s.tone] || 'var(--line)';
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
                if (target && target !== 'dashboard/daily-brief') onNavigate?.(target);
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

function MetricCard({ m }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--line-soft)',
      borderRadius: 'var(--r-lg)',
      padding: 'var(--card-pad)',
      boxShadow: 'var(--shadow-soft)',
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

const WO_KIND_TONE = {
  outcome: 'moon', lead: 'moon', dm: 'moon',
  idea: 'info', engagement: 'info',
  review: 'warning', note: 'neutral',
};

// The 1-click approval cockpit — proposed work orders (persona/inbox/guru) decided in place.
// registry.json no_auto_send=true: nothing executes without this click.
function ApprovalQueueCard({ onNavigate }) {
  const [orders, setOrders] = React.useState([]);
  const [state, setState] = React.useState('loading');
  const [busyId, setBusyId] = React.useState(null);
  const [approved, setApproved] = React.useState({}); // id → true once approved (reveals execute row)

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
          orders.map((o, i) => (
            <div key={o.id} style={{
              padding: '11px 14px', opacity: busyId === o.id ? 0.5 : 1,
              borderBottom: i < orders.length - 1 ? '1px solid var(--line-soft)' : 'none',
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
                </div>
                {!approved[o.id] && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
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
              ) : (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Dot tone="success" size={6} /> 승인됨 · 실행 결과
                  </span>
                  {WO_EXECUTE_ACTIONS.map((a) => (
                    <Button key={a.action} variant="outline" size="xs" onClick={() => execute(o.id, a.action)}>{a.label}</Button>
                  ))}
                </div>
              ))}
            </div>
          ))
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

  const syncColor = state === 'live' ? 'var(--success)' : state === 'loading' ? 'var(--warning)' : 'var(--fg-faint)';
  const syncLabel = state === 'live' ? 'live' : state === 'loading' ? 'syncing' : 'mock';
  const funnel = stats?.funnel || [];
  const sent = funnel.find((f) => f.stage === 'sent')?.count || 0;
  const won = funnel.find((f) => f.stage === 'won')?.count || 0;

  return (
    <div>
      <SectionTitle right={<span className="mono" style={{ fontSize: 10.5, color: syncColor }}>{syncLabel}</span>}>
        계약 퍼널
      </SectionTitle>
      <Card>
        {state === 'live' && stats ? (
          stats.total > 0 ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span className="mono" style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' }}>
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
          <Button variant="secondary" size="md" icon="sparkle" onClick={() => onNavigate('dashboard/agents/chat')}>Ask Council</Button>
          <Button variant="outline" size="md" icon="clock" onClick={() => onNavigate('dashboard/work/calendar?focus=15')}>Start 15m focus</Button>
        </div>
      </div>

      <DataTrustStrip state={ledger} />

      <div className="hub-grid--metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--gap)' }}>
        {ledger.metrics.map(m => <MetricCard key={m.label} m={m} />)}
      </div>

      <div className="hub-grid--split" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 'var(--section-gap)' }}>
        <div>
          <SectionTitle right={<div style={{ display: 'flex', gap: 6 }}>
            <Badge tone="danger" size="xs">{urgentCount} urgent</Badge>
            <Badge tone="warning" size="xs">{todayCount} today</Badge>
            <Badge tone="success" size="xs">{Math.max(0, signalCount - urgentCount - todayCount)} ok</Badge>
          </div>}>
            Signal feed
          </SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ledger.signals.map(s => <SignalCard key={s.id} s={s} onNavigate={onNavigate} />)}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)' }}>
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

          <SalesFunnelCard onNavigate={onNavigate} />

          <ContentCadenceCard onNavigate={onNavigate} />

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
      </div>
    </div>
  );
}
