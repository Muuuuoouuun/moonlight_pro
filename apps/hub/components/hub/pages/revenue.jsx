"use client";

import React from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Iconed } from "../hub-icons";
import { Badge, Dot, Card, Button, Avatar, Input, Tabs, IconButton, Divider, EmptyState, SyncBadge, Kbd, EditDrawer, SegmentedControl, ScrollShadowX } from "../hub-primitives";
import { requestGuruCoaching, guruChatPath } from "../guru-client";
import { getWorkspace, filterLeadsByWorkspace, filterDealsByWorkspace, filterAccountsByWorkspace } from "../workspace-map";
import { buildLeadTagSummary } from "@/lib/sales-os/lead-view";
import { STAGE_FILL, STAGE_LINE } from "@/lib/deal-stages";

// HW/SW 딜은 100만원 미만 건도 흔해서 M 고정 포맷은 "₩0.1M" 같은 값을 만든다.
// revenue-ledger.js의 formatMoneyLabel과 같은 K/M 임계값으로 맞춘다.
const fmt = v => {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return '₩0';
  if (n >= 1000000) return '₩' + (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return '₩' + Math.round(n / 1000) + 'K';
  return '₩' + n;
};

// A deal counts as "stalled" once it has aged this many days in an open stage. Two weeks
// is the follow-up window — high enough that a deal mid-motion isn't flagged as neglected.
const STALLED_DAYS = 14;


// Shared All/Personal/Company scope filter for every Revenue surface (Leads, Deals,
// Accounts). One source so the identity dots and labels can't drift between pages.
const SCOPE_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'personal', label: 'Personal', dot: 'personal' },
  { key: 'company', label: 'Company', dot: 'company' },
];

// Parse a display amount ("₩1.2M", "₩900K", "₩0", or a raw number) to a comparable number,
// so the Leads table can sort by value even though the display model stores a string.
function parseAmount(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v || '').replace(/[₩,\s]/g, '');
  const m = /([0-9.]+)\s*([MmKk]?)/.exec(s);
  if (!m) return 0;
  const n = parseFloat(m[1]) || 0;
  const unit = (m[2] || '').toLowerCase();
  return unit === 'm' ? n * 1e6 : unit === 'k' ? n * 1e3 : n;
}

// Funnel order so "Stage" sorts by pipeline position, not alphabetically.
const LEAD_STAGE_ORDER = { New: 0, Contact: 1, Qualified: 2, Customer: 3, Lost: 4 };

// Sort a lead list by the active column. Value sorts numerically (parsed), Stage by funnel
// position, everything else case-insensitively. Returns the input untouched when no key is set.
function sortLeads(list, sort) {
  if (!sort.key) return list;
  const dir = sort.dir === 'asc' ? 1 : -1;
  const keyOf = (l) => {
    if (sort.key === 'value') return parseAmount(l.value);
    if (sort.key === 'score') return Number(l.score) || 0;
    if (sort.key === 'stage') return LEAD_STAGE_ORDER[l.stage] ?? 99;
    return String(l[sort.key] || '').toLowerCase();
  };
  return [...list].sort((a, b) => {
    const va = keyOf(a), vb = keyOf(b);
    return va < vb ? -dir : va > vb ? dir : 0;
  });
}

function formatPercentDelta(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return '—';
  if (previous === 0) return current === 0 ? '0%' : 'new';
  const delta = Math.round(((current - previous) / previous) * 100);
  return `${delta > 0 ? '+' : ''}${delta}%`;
}

function buildRevenueAttention(leads, deals) {
  const items = [];
  deals
    .filter((deal) => deal.stage !== 'closing' && deal.stage !== 'lost' && Number(deal.age) >= STALLED_DAYS)
    .slice(0, 3)
    .forEach((deal) => {
      items.push({
        tone: 'warning',
        t: `${deal.name} — ${deal.age}d stalled`,
        s: 'follow-up 필요',
      });
    });

  const newLeads = leads.filter((lead) => lead.stage === 'New').length;
  if (newLeads > 0) {
    items.push({
      tone: 'info',
      t: `신규 리드 ${newLeads}건`,
      s: '분류·할당 필요',
    });
  }

  const wonDeals = deals.filter((deal) => deal.stage === 'closing');
  if (wonDeals.length > 0) {
    const wonTotal = wonDeals.reduce((sum, deal) => sum + deal.value, 0);
    items.push({
      tone: 'success',
      t: `Won ${wonDeals.length}건 · ${fmt(wonTotal)}`,
      s: '온보딩 킥오프',
    });
  }

  return items.slice(0, 4);
}

function useRevenueLedger() {
  const [ledger, setLedger] = React.useState({
    source: 'preview',
    leads: [],
    deals: [],
    stages: [],
    accounts: [],
    cases: [],
    summary: null,
  });
  const [syncState, setSyncState] = React.useState('preview');

  React.useEffect(() => {
    let active = true;
    async function load() {
      setSyncState('loading');
      try {
        const response = await fetch('/api/hub/revenue', { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (!active || !response.ok || !data || data.status === 'error') {
          if (active) setSyncState('preview');
          return;
        }
        setLedger({
          source: data.source === 'supabase' ? 'supabase' : 'preview',
          leads: Array.isArray(data.leads) ? data.leads : [],
          deals: Array.isArray(data.deals) ? data.deals : [],
          stages: Array.isArray(data.stages) ? data.stages : [],
          accounts: Array.isArray(data.accounts) ? data.accounts : [],
          cases: Array.isArray(data.cases) ? data.cases : [],
          summary: data.summary || null,
        });
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

// Persist a Revenue drawer edit to the Supabase-backed write route. `kind` is
// 'lead' | 'deal' | 'case', `op` is 'create' | 'update' | 'delete'. Returns
// { ok, status, id } — `ok` is true only when the row actually saved; 'preview' means the
// backend isn't configured (or the DB refused the write) and the optimistic local row stands.
async function saveRevenueRecord(kind, op, record) {
  try {
    const resp = await fetch(`/api/hub/revenue/${kind}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op, ...record }),
    });
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok && data.status === 'saved', status: data.status || 'error', id: data.id, data };
  } catch (err) {
    return { ok: false, status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}

function GuruCoachPanel({ onNavigate }) {
  const [state, setState] = React.useState('idle'); // idle | loading | done | preview | error
  const [text, setText] = React.useState('');
  const [note, setNote] = React.useState('');

  const run = async () => {
    setState('loading');
    setText('');
    setNote('');
    const r = await requestGuruCoaching({ mode: 'pipeline-triage' });
    if (r.state === 'done') {
      setText(r.text);
      setState('done');
    } else {
      setNote(r.note || '');
      setState(r.state);
    }
  };

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Guru 코칭</div>
            <Badge tone="moon" size="xs">영업 멘토</Badge>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 2 }}>이번 주 파이프라인 분류 — 무엇부터 손댈지</div>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="primary" size="sm" icon="sparkle" onClick={run} disabled={state === 'loading'}>
          {state === 'loading' ? '분석 중…' : state === 'done' ? '다시 분류' : '파이프라인 분류'}
        </Button>
      </div>

      {state === 'idle' && (
        <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
          Guru에게 이번 주 파이프라인 분류를 요청하세요. 정체 딜·신규 리드·Won 신호를 근거로
          가장 먼저 손대야 할 3건과 이유를 우선순위로 제시합니다.
        </div>
      )}

      {state === 'loading' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--fg-muted)' }}>
          <div style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--moon-300)', boxShadow: '0 0 8px var(--moon-300)', animation: 'mlMoonPulse 1.2s ease-in-out infinite' }} />
          기록을 읽고 코칭을 정리하는 중…
        </div>
      )}

      {state === 'done' && (
        <div>
          <div style={{ fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{text}</div>
          <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
            <Button variant="outline" size="xs" iconRight="arrowRight" onClick={() => onNavigate?.(guruChatPath())}>Chat에서 이어가기</Button>
          </div>
        </div>
      )}

      {(state === 'preview' || state === 'error') && (
        <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.55 }}>
          <Badge tone={state === 'preview' ? 'neutral' : 'danger'} size="xs">{state === 'preview' ? 'preview' : 'error'}</Badge>
          <span style={{ marginLeft: 8 }}>
            {state === 'preview'
              ? 'Engine이 아직 연결되지 않아 코칭을 생성할 수 없습니다. (COM_MOON_ENGINE_URL 미설정)'
              : note}
          </span>
        </div>
      )}
    </Card>
  );
}

export function RevenueOverview({ onNavigate }) {
  const { ledger, syncState } = useRevenueLedger();
  const [period, setPeriod] = React.useState('MTD');
  const LEADS = ledger.leads;
  const DEALS = ledger.deals;
  const DEAL_STAGES = ledger.stages;
  const summary = ledger.summary;
  const isLiveLedger = ledger.source === 'supabase';
  const mrr = summary?.mrr ?? 0;
  const mrrPrev = summary?.mrrPrev ?? 0;
  const pipelineByStage = DEAL_STAGES.map(s => ({
    ...s,
    sum: DEALS.filter(d => d.stage === s.key).reduce((a, b) => a + b.value, 0),
    count: DEALS.filter(d => d.stage === s.key).length,
  }));
  const hasPipelineValue = pipelineByStage.some(s => s.sum > 0);
  const pipeline = summary?.pipeline ?? pipelineByStage.reduce((a, b) => a + b.sum, 0);
  const openLeads = summary?.leadsCount ?? LEADS.length;
  const openDeals = summary?.openDeals ?? DEALS.filter(d => d.stage !== 'closing').length;
  const wonMTD = summary?.wonMTD ?? DEALS.filter(d => d.stage === 'closing').reduce((a, b) => a + b.value, 0);
  const newThisMonth = summary?.newThisMonth ?? 0;
  const wonDealsCount = DEALS.filter(d => d.stage === 'closing').length;
  const byBrand = [];
  const totalBrandMRR = byBrand.reduce((a, b) => a + b.mrr, 0);
  const attentionItems = buildRevenueAttention(LEADS, DEALS);

  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)', maxWidth: 1280, margin: '0 auto', width: '100%' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'flex-end' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Revenue overview</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
            {new Intl.DateTimeFormat('ko-KR', { month: 'long' }).format(new Date())} · 이번 달 요약<SyncBadge state={syncState} />
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <SegmentedControl
          className="hub-page-actions"
          options={['MTD', 'QTD', 'YTD'].map(p => ({ key: p, label: p }))}
          value={period}
          onChange={setPeriod}
        />
      </div>

      <div className="hub-grid--metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--gap)' }}>
        {[
          { l: 'MRR', v: fmt(mrr), d: formatPercentDelta(mrr, mrrPrev), tone: mrr > mrrPrev ? 'success' : 'neutral' },
          { l: 'Pipeline', v: fmt(pipeline), d: `${openDeals} deals`, tone: 'moon' },
          { l: 'Open leads', v: openLeads, d: `이번달 신규 ${newThisMonth}`, tone: 'info' },
          { l: 'Won MTD', v: fmt(wonMTD), d: `${wonDealsCount} deals`, tone: wonMTD > 0 ? 'success' : 'neutral' },
        ].map((k, i) => (
          <Card key={i}>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)' }}>{k.l}</div>
            <div className="stat" style={{ fontSize: 28, marginTop: 10, fontWeight: 600, lineHeight: 1.1 }}>{k.v}</div>
            <div style={{ fontSize: 11, color: k.tone === 'neutral' ? 'var(--fg-faint)' : `var(--${k.tone})`, marginTop: 6 }}>{k.d}</div>
          </Card>
        ))}
      </div>

      <div className="hub-grid--split" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 'var(--gap)' }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Pipeline by stage</div>
            <div style={{ flex: 1 }} />
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{fmt(pipeline)}</span>
          </div>
          <div style={{ display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--line-soft)' }}>
            {hasPipelineValue ? pipelineByStage.map(s => (
              <div key={s.key} title={`${s.label} · ${fmt(s.sum)}`} style={{
                flex: s.sum,
                background: `var(--${s.color === 'neutral' ? 'fg-faint' : s.color === 'moon' ? 'moon-500' : s.color})`,
                opacity: 0.9,
              }} />
            )) : (
              <div title="No pipeline value" style={{ flex: 1, background: 'var(--surface-3)' }} />
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
            {pipelineByStage.map(s => (
              <div key={s.key} style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Dot tone={s.color} />
                <span style={{ color: 'var(--fg)' }}>{s.label}</span>
                <span className="mono" style={{ color: 'var(--fg-faint)' }}>{fmt(s.sum)} · {s.count}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Revenue by brand</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {byBrand.length === 0 && (
              <EmptyState
                icon="revenue"
                title="브랜드별 매출 집계 없음"
                description="Supabase revenue 기록은 live입니다. 브랜드별 매출 join이 준비되면 이 패널이 자동으로 채워집니다."
                style={{ minHeight: 170, padding: '22px 12px' }}
              />
            )}
            {byBrand.map(b => (
              <div key={b.key} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 72px', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 14 }}>{b.glyph}</span>
                <div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>{b.name}</div>
                  <div style={{ height: 5, background: 'var(--surface-3)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: totalBrandMRR > 0 ? `${(b.mrr / totalBrandMRR) * 100}%` : '0%', height: '100%', background: 'var(--moon-400)' }} />
                  </div>
                </div>
                <span className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)', textAlign: 'right' }}>{fmt(b.mrr)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="hub-grid--two" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--gap)' }}>
        <Card>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Top deals</div>
          {DEALS.length === 0 && (
            <EmptyState
              icon="deals"
              title="딜이 없습니다"
              description={isLiveLedger ? 'Supabase deals 기록에 표시할 딜이 없습니다.' : '딜이 생기면 금액순으로 표시됩니다.'}
              style={{ minHeight: 170, padding: '22px 12px' }}
            />
          )}
          {DEALS.slice().sort((a,b) => b.value - a.value).slice(0, 5).map((d, i, arr) => (
            <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 80px', gap: 10, padding: '9px 0', alignItems: 'center', borderBottom: i < arr.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginTop: 2 }}>{DEAL_STAGES.find(s => s.key === d.stage)?.label} · {d.close}</div>
              </div>
              <span className="mono" style={{ fontSize: 12, color: 'var(--moon-200)' }}>{fmt(d.value)}</span>
              <Badge tone={d.type === 'personal' ? 'personal' : 'company'} size="xs">{d.type === 'personal' ? 'Personal' : 'Company'}</Badge>
            </div>
          ))}
        </Card>

        <Card>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Attention needed</div>
          {attentionItems.length === 0 && (
            <EmptyState
              icon="bell"
              title="주의가 필요한 항목이 없습니다"
              description="stalled deal, 신규 리드, won deal 신호가 생기면 여기에 올라옵니다."
              style={{ minHeight: 170, padding: '22px 12px' }}
            />
          )}
          {attentionItems.map((x, i, arr) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
              <Dot tone={x.tone} />
              <div>
                <div style={{ fontSize: 12.5 }}>{x.t}</div>
                <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginTop: 2 }}>{x.s}</div>
              </div>
            </div>
          ))}
        </Card>
      </div>

      <GuruCoachPanel onNavigate={onNavigate} />
    </div>
  );
}

// Shared grid template for Leads rows — gap between columns so badges never butt the next cell
const LEADS_GRID = '26px 1fr 112px 112px 124px 100px 90px 92px';

function LeadEnrichmentPanel({ lead }) {
  if (!lead?.enrichmentTags?.length) return null;
  const summary = buildLeadTagSummary(lead.enrichmentTags);
  const calendar = lead.activityEvidence?.calendar || {};
  const directTouchCount = ['meeting', 'call', 'infoSession', 'other']
    .reduce((sum, key) => sum + (Number(calendar[key]) || 0), 0);
  const rows = [
    ['과목', summary.subjects],
    ['지역', summary.regions],
    ['직접 접점', summary.directActivities],
    ['접점 소스', summary.activitySources],
    ['공개 신호', summary.publicSignals],
    ['프로그램', summary.programs],
    ['공개 채널', summary.channels],
  ].filter(([, values]) => values.length > 0);

  return (
    <div style={{ padding: 12, border: '1px solid var(--line-soft)', borderRadius: 'var(--r)', background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-dim)' }}>분류 · 증거</span>
        <Badge tone={lead.engagementState === 'present' ? 'info' : 'neutral'} size="xs">
          {lead.engagementState === 'present' ? `접점 ${directTouchCount || '확인'}` : '접점 미확인'}
        </Badge>
        {lead.publicEvidenceCount > 0 && <Badge tone="neutral" size="xs">공개 근거 {lead.publicEvidenceCount}</Badge>}
      </div>
      {rows.map(([label, values]) => (
        <div key={label} style={{ display: 'grid', gridTemplateColumns: '68px 1fr', gap: 8, alignItems: 'start' }}>
          <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{label}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {values.map(value => <Badge key={value} tone="neutral" size="xs" variant="outline">{value}</Badge>)}
          </div>
        </div>
      ))}
      {lead.engagementState !== 'present' && (
        <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', lineHeight: 1.45 }}>
          확인된 콜·미팅 로그가 없습니다. 공개 설명회·채널 신호는 직접 접점 점수와 분리합니다.
        </div>
      )}
    </div>
  );
}

export function Leads({ workspace }) {
  const { ledger, syncState } = useRevenueLedger();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [localLeads, setLocalLeads] = React.useState([]);
  const [leadEdits, setLeadEdits] = React.useState({}); // { [id]: patch } — overlays any lead (local or ledger)
  const [deletedLeadIds, setDeletedLeadIds] = React.useState(() => new Set()); // hide removed ledger rows
  const [editLeadId, setEditLeadId] = React.useState(null);
  // Scope the merged ledger to the active workspace (pass-through when unscoped). The
  // The ledger hook only exposes API-backed rows — scoping never mixes sources. Drawer
  // edits overlay onto whichever row (local or ledger) they key to; deletes drop the row.
  const ws = getWorkspace(workspace);
  const mergedLeads = [...localLeads, ...ledger.leads]
    .filter(l => !deletedLeadIds.has(l.id))
    .map(l => (leadEdits[l.id] ? { ...l, ...leadEdits[l.id] } : l));
  const LEADS = filterLeadsByWorkspace(mergedLeads, workspace);
  const wsEmpty = Boolean(ws) && LEADS.length === 0;
  const editingLead = editLeadId ? mergedLeads.find(l => l.id === editLeadId) : null;
  const [filter, setFilter] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [sort, setSort] = React.useState({ key: null, dir: 'asc' });
  const term = search.trim().toLowerCase();
  const filtered = LEADS.filter(l => {
    const searchText = [l.name, l.source, l.stage, l.region, ...(l.enrichmentTags || [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return (filter === 'all' || l.type === filter) && (!term || searchText.includes(term));
  });
  const sortedLeads = sortLeads(filtered, sort);
  // Toggle a column: first click sorts asc, second flips to desc, third clears back to ledger order.
  const toggleSort = (key) => setSort(s =>
    s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : { key: null, dir: 'asc' }
  );
  // Clickable column header. Reserves the caret's width even when inactive so sorting never
  // shifts the header layout; active column brightens and shows the direction.
  const SortHead = ({ k, children, align }) => (
    <button type="button" onClick={() => toggleSort(k)} title={`${children} 기준 정렬`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3, width: '100%',
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em',
        color: sort.key === k ? 'var(--fg-muted)' : 'var(--fg-faint)',
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
      }}>
      {children}
      <span style={{ fontSize: 8, opacity: sort.key === k ? 1 : 0 }}>{sort.dir === 'desc' && sort.key === k ? '▼' : '▲'}</span>
    </button>
  );
  const stageTone = { New: 'info', Contact: 'moon', Qualified: 'moon', Customer: 'company', Lost: 'danger' };
  const createLead = () => {
    const id = `local-lead-${Date.now()}`;
    setLocalLeads(prev => [{
      id,
      name: '새 리드',
      type: filter === 'personal' || filter === 'company' ? filter : 'company',
      source: 'Manual',
      stage: 'New',
      value: '₩0',
      last: '방금',
      owner: 'Me',
      // Tag in-workspace creates so the scoped view doesn't silently drop them.
      ...(ws ? { workspace } : {}),
    }, ...prev]);
    setEditLeadId(id); // open the editor immediately so the new lead can be filled in
  };

  // Persist the drawer edit. New local rows (id `local-lead-…`) insert; on success the
  // returned real id replaces the local one so a later edit takes the update path and the
  // overlay re-keys onto it. `editingLead` carries the workspace tag → scoped creates stick.
  const persistLead = async () => {
    if (!editingLead) return { ok: false, status: 'error' };
    const isNew = String(editLeadId).startsWith('local-lead-');
    const r = await saveRevenueRecord('lead', isNew ? 'create' : 'update', editingLead);
    if (r.ok && isNew && r.id) {
      const realId = r.id;
      setLocalLeads(prev => prev.map(l => (l.id === editLeadId ? { ...l, id: realId } : l)));
      setLeadEdits(prev => {
        if (!prev[editLeadId]) return prev;
        const next = { ...prev, [realId]: prev[editLeadId] };
        delete next[editLeadId];
        return next;
      });
      setEditLeadId(realId);
    }
    return r;
  };

  // Delete: drop the row locally (optimistic) and best-effort remove it from the ledger.
  // Unsaved local rows (no DB id) skip the network call entirely.
  const deleteLead = async () => {
    if (!editLeadId) return { ok: false };
    const isLocal = String(editLeadId).startsWith('local-lead-');
    setLocalLeads(prev => prev.filter(l => l.id !== editLeadId));
    setDeletedLeadIds(prev => new Set(prev).add(editLeadId));
    if (isLocal) return { ok: true, status: 'local' };
    return saveRevenueRecord('lead', 'delete', { id: editLeadId });
  };

  // Deep-link: ?lead=<id> opens that lead's EditDrawer once the ledger has loaded and the
  // lead exists in the merged list. One-shot per param, then strip the query so a refresh
  // doesn't replay it. Makes Segments' openLead links functional.
  const leadParam = searchParams?.get('lead') || null;
  const consumedLeadRef = React.useRef(null);
  React.useEffect(() => {
    if (!leadParam || syncState === 'loading') return;
    if (consumedLeadRef.current === leadParam) return;
    if (mergedLeads.some(l => String(l.id) === String(leadParam))) {
      consumedLeadRef.current = leadParam;
      setEditLeadId(leadParam);
      if (pathname) router.replace(pathname);
    }
  }, [leadParam, syncState, mergedLeads, pathname, router]);

  // Page-level `n` — quick-create a lead when no drawer is open and focus isn't in a field.
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.key !== 'n' && e.key !== 'N') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (editLeadId) return;
      const t = e.target;
      const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
      e.preventDefault();
      createLead();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editLeadId, filter, ws, workspace]);

  const cardFileRef = React.useRef(null);
  const [cardState, setCardState] = React.useState(null); // { phase, status, fields, error }
  async function onCardFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCardState({ phase: 'reading' });
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error('파일 읽기 실패'));
        r.readAsDataURL(file);
      });
      const mime = (/data:(.*?);base64,/.exec(dataUrl) || [])[1] || file.type || 'image/jpeg';
      const imageBase64 = dataUrl.split(',')[1];
      const resp = await fetch('/api/hub/cards', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType: mime }),
      });
      const data = await resp.json().catch(() => ({}));
      setCardState({ phase: 'done', status: data.status || 'error', fields: data.fields, error: data.error });
    } catch (err) {
      setCardState({ phase: 'done', status: 'error', error: err instanceof Error ? err.message : String(err) });
    } finally {
      e.target.value = '';
    }
  }

  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Leads</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
            {LEADS.length} leads · {LEADS.filter(l => l.type === 'personal').length} personal · {LEADS.filter(l => l.type === 'company').length} company
            <SyncBadge state={syncState} />
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <SegmentedControl className="hub-toolbar" style={{ marginRight: 8 }} options={SCOPE_OPTIONS} value={filter} onChange={setFilter} />
        <Input className="hub-toolbar" placeholder="이름·소스·단계 검색…" icon="search" value={search} onChange={setSearch} />
        <div style={{ width: 8 }} />
        <Button variant="secondary" size="sm" icon="plus" onClick={() => cardFileRef.current?.click()}>명함</Button>
        <input ref={cardFileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onCardFile} />
        <div style={{ width: 6 }} />
        <Button variant="primary" size="sm" icon="plus" onClick={createLead}>Lead <Kbd>N</Kbd></Button>
      </div>

      {cardState && (() => {
        const reading = cardState.phase === 'reading';
        const s = cardState.status;
        const tone = reading ? 'info' : s === 'promoted' ? 'success' : s === 'review' ? 'warning' : s === 'preview' ? 'moon' : 'danger';
        const label = reading ? '추출 중' : s === 'promoted' ? '추가됨' : s === 'review' ? '확인 필요' : s === 'rejected' ? '식별 불가' : s === 'preview' ? '미리보기' : '실패';
        const f = cardState.fields || {};
        const summary = reading
          ? '명함을 읽고 있습니다…'
          : s === 'rejected'
          ? '이름·전화가 없어 식별할 수 없습니다. 다시 촬영하거나 직접 입력하세요.'
          : s === 'error'
          ? (cardState.error || '추출에 실패했습니다.')
          : [f.company, f.name, f.phone].filter(Boolean).join(' · ') || '추출된 필드가 없습니다.';
        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', border: '1px solid var(--line-soft)',
            borderRadius: 'var(--r-lg)', background: 'var(--surface)',
          }}>
            <Badge tone={tone} size="xs">{label}</Badge>
            <span style={{ fontSize: 12.5, color: 'var(--fg-muted)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>
            <div style={{ flex: 1 }} />
            {s === 'promoted' && (
              <Button variant="ghost" size="xs" onClick={() => window.location.reload()}>목록 새로고침</Button>
            )}
            {!reading && (
              <Button variant="ghost" size="xs" onClick={() => setCardState(null)}>닫기</Button>
            )}
          </div>
        );
      })()}

      {wsEmpty && (
        <Card>
          <EmptyState
            icon="leads"
            title={`${ws.label} — 해당하는 리드가 없습니다`}
            description={`이 워크스페이스에 매칭되는 리드가 없습니다. 다른 워크스페이스로 태그된 리드는 여기에 표시되지 않습니다. 리드를 등록하거나 기록에 ${ws.label} 태그가 연결되면 나타납니다.`}
            action={<Button variant="primary" size="sm" icon="plus" onClick={createLead}>{ws.label}에 리드 추가</Button>}
            style={{ minHeight: 200, padding: '28px 12px' }}
          />
        </Card>
      )}

      {!wsEmpty && (
      <Card pad={false} className="hub-table-card hub-leads-table">
        <div className="hub-leads-grid" style={{ display: 'grid', gridTemplateColumns: LEADS_GRID, gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--line-soft)', fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          <span /><SortHead k="name">Name</SortHead><span>Type</span><SortHead k="source">Source</SortHead><SortHead k="stage">Stage</SortHead><SortHead k="score">Score</SortHead><SortHead k="owner">Owner</SortHead><span style={{ textAlign: 'right' }}>Last</span>
        </div>
        {sortedLeads.length === 0 && (
          <div style={{ padding: '36px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Iconed name="search" size={20} style={{ color: 'var(--fg-faint)' }} />
            <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>일치하는 리드가 없습니다.</div>
            <div style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>
              {term ? <>"<span className="mono">{search}</span>" 검색 결과 0건 · 필터: {filter}</> : <>필터: {filter} · {LEADS.length}건 중 0건</>}
            </div>
            <div style={{ marginTop: 6 }}>
              {term
                ? <Button variant="ghost" size="xs" onClick={() => setSearch('')}>검색 지우기</Button>
                : <Button variant="secondary" size="xs" icon="plus" onClick={createLead}>리드 추가</Button>}
            </div>
          </div>
        )}
        {sortedLeads.map((l, i) => (
          <div key={l.id} className="hub-row hub-leads-grid"
            role="button" tabIndex={0}
            onClick={() => setEditLeadId(l.id)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditLeadId(l.id); } }}
            style={{
              display: 'grid', gridTemplateColumns: LEADS_GRID, gap: 12,
              padding: 'var(--pad-y) var(--pad-x)', alignItems: 'center', cursor: 'pointer',
              borderBottom: i < sortedLeads.length - 1 ? '1px solid var(--line-soft)' : 'none',
            }}
          >
            <span style={{ paddingRight: 4, display: 'flex' }}>
              <Avatar name={l.name.replace(/^.*—\s*/, '')} size={22} tone={l.type === 'personal' ? 'personal' : 'company'} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</span>
              {l.nextAction && <span className="hub-lead-next-action" style={{ display: 'block', marginTop: 2, fontSize: 10.5, color: 'var(--fg-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.nextAction}</span>}
              <span className="hub-lead-mobile-meta">
                {l.type === 'personal' ? 'Personal' : 'Company'} · {l.owner || 'Unassigned'} · score {l.score ?? '—'}{l.priorityLane === 'customer_success' ? ' · CS' : ''}
              </span>
            </span>
            <span style={{ paddingRight: 8, minWidth: 0 }}>
              <Badge tone={l.type === 'personal' ? 'personal' : 'company'} size="xs">
                <Iconed name={l.type === 'personal' ? 'user' : 'building'} size={9} />
                {l.type === 'personal' ? 'Personal' : 'Company'}
              </Badge>
            </span>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)', paddingRight: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.source}</span>
            <span style={{ paddingRight: 8, minWidth: 0 }}>
              <Badge tone={stageTone[l.stage]} size="xs" variant="outline">{l.stage}</Badge>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="mono" style={{ fontSize: 12, color: l.score >= 70 ? 'var(--moon-200)' : 'var(--fg-muted)' }}>{l.score ?? '—'}</span>
              {l.priorityLane === 'customer_success' && <Badge tone="company" size="xs">CS</Badge>}
            </span>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.owner}</span>
            <span className="mono" style={{ textAlign: 'right', fontSize: 11.5, color: 'var(--fg-faint)' }}>{l.last}</span>
          </div>
        ))}
      </Card>
      )}

      <EditDrawer
        title={editingLead ? (editingLead.name || '리드 편집') : ''}
        subtitle="리드 정보 편집"
        record={editingLead}
        fields={[
          { key: 'name', label: '이름' },
          { key: 'type', label: '타입', type: 'select', options: [{ value: 'company', label: 'Company' }, { value: 'personal', label: 'Personal' }] },
          { key: 'source', label: '유입경로 (소스)', placeholder: 'Referral · Website · Meta · 설명회…' },
          { key: 'region', label: '지역', placeholder: '서울 · 경기 · 부산…' },
          { key: 'scale', label: '규모', placeholder: '학생수 · 직원수 · 매출 규모' },
          { key: 'units', label: '도입 댓수', inputType: 'number', placeholder: '0' },
          { key: 'situation', label: '현재 상황', placeholder: '검토중 · 경쟁사 사용 · 예산확보…' },
          { key: 'stage', label: '단계', type: 'select', options: [{ value: 'New', label: 'New' }, { value: 'Contact', label: 'Contact' }, { value: 'Qualified', label: 'Qualified' }, { value: 'Customer', label: 'Customer' }, { value: 'Lost', label: 'Lost' }] },
          { key: 'value', label: '금액', placeholder: '₩0' },
          { key: 'owner', label: '담당' },
        ]}
        onChange={(key, val) => setLeadEdits(prev => ({ ...prev, [editLeadId]: { ...prev[editLeadId], [key]: val } }))}
        onSave={persistLead}
        onDelete={deleteLead}
        onClose={() => setEditLeadId(null)}
      >
        <LeadEnrichmentPanel lead={editingLead} />
      </EditDrawer>
    </div>
  );
}

export function Deals({ workspace, onNavigate }) {
  const { ledger, syncState } = useRevenueLedger();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const DEAL_STAGES = ledger.stages;
  const [deals, setDeals] = React.useState(ledger.deals);
  const [drag, setDrag] = React.useState(null);
  const [filter, setFilter] = React.useState('all');
  const [editDealId, setEditDealId] = React.useState(null);
  const dragMovedRef = React.useRef(false); // true from dragStart until just after dragEnd — suppresses the card click

  // Sync local deals state when live data arrives
  React.useEffect(() => {
    setDeals(ledger.deals);
  }, [ledger.deals]);

  // Scope BEFORE grouping by stage so the kanban columns only ever show in-workspace
  // deals (pass-through when unscoped). setDeals still holds the full ledger set.
  const ws = getWorkspace(workspace);
  const scopedDeals = filterDealsByWorkspace(deals, workspace);
  const wsEmpty = Boolean(ws) && scopedDeals.length === 0;
  const editingDeal = editDealId ? deals.find(d => d.id === editDealId) : null;

  const totals = DEAL_STAGES.reduce((acc, s) => {
    const items = scopedDeals.filter(d => d.stage === s.key && (filter === 'all' || d.type === filter));
    acc[s.key] = { count: items.length, sum: items.reduce((a, b) => a + b.value, 0) };
    return acc;
  }, {});
  // Command-deck readout split: money in motion (open stages) vs money landed (closing).
  // The old single grandTotal blended won deals into "pipeline", overstating what's open.
  const openStages = DEAL_STAGES.filter(s => s.key !== 'closing' && s.key !== 'lost');
  const openTotal = openStages.reduce((a, s) => a + (totals[s.key]?.sum || 0), 0);
  const openCount = openStages.reduce((a, s) => a + (totals[s.key]?.count || 0), 0);
  const closingTotal = totals.closing?.sum || 0;
  // Drag-to-move: optimistic local move, then persist the stage in the background for
  // ledger-backed deals (local cards persist once saved through the drawer). Fire-and-forget —
  // the optimistic move stands regardless of the write result.
  const move = (id, to) => {
    setDeals(ds => ds.map(d => d.id === id ? { ...d, stage: to } : d));
    if (!String(id).toLowerCase().startsWith('local-')) {
      saveRevenueRecord('deal', 'update', { id, stage: to });
    }
  };
  // `stage` lets a column's inline "+ 딜 추가" seed the deal directly in that stage, so
  // creating where you're looking needs no follow-up drag. Falls back to the first stage.
  const createDeal = (stage) => {
    const id = `LOCAL-${Date.now().toString().slice(-4)}`;
    setDeals(prev => [{
      id,
      name: '새 딜',
      type: filter === 'personal' || filter === 'company' ? filter : 'company',
      stage: (typeof stage === 'string' && stage) || DEAL_STAGES[0]?.key || 'consult',
      value: 0,
      owner: 'Me',
      close: '미정',
      age: 0,
      // Tag in-workspace creates so the scoped pipeline doesn't silently drop them.
      ...(ws ? { workspace } : {}),
    }, ...prev]);
    setEditDealId(id); // open the editor immediately so the new deal can be filled in
  };

  // Persist the drawer edit. New local rows (id `LOCAL-…`) insert; on success the returned
  // real id replaces the local one so a later edit takes the update path. `close` (free-text)
  // and `owner` are not reversed back to expected_close_at / owner_id — best-effort by design.
  const persistDeal = async () => {
    if (!editingDeal) return { ok: false, status: 'error' };
    const isNew = String(editDealId).toLowerCase().startsWith('local-');
    const r = await saveRevenueRecord('deal', isNew ? 'create' : 'update', editingDeal);
    if (r.ok && isNew && r.id) {
      const realId = r.id;
      setDeals(ds => ds.map(d => (d.id === editDealId ? { ...d, id: realId } : d)));
      setEditDealId(realId);
    }
    return r;
  };

  // Delete: drop the card locally (optimistic) and best-effort remove it from the ledger.
  const deleteDeal = async () => {
    if (!editDealId) return { ok: false };
    const isLocal = String(editDealId).toLowerCase().startsWith('local-');
    setDeals(ds => ds.filter(d => d.id !== editDealId));
    if (isLocal) return { ok: true, status: 'local' };
    return saveRevenueRecord('deal', 'delete', { id: editDealId });
  };

  // Deep-link: ?deal=<id> opens that deal's EditDrawer once the ledger has loaded. One-shot
  // per param, then strip the query so a refresh doesn't replay it.
  const dealParam = searchParams?.get('deal') || null;
  const consumedDealRef = React.useRef(null);
  React.useEffect(() => {
    if (!dealParam || syncState === 'loading') return;
    if (consumedDealRef.current === dealParam) return;
    if (deals.some(d => String(d.id) === String(dealParam))) {
      consumedDealRef.current = dealParam;
      setEditDealId(dealParam);
      if (pathname) router.replace(pathname);
    }
  }, [dealParam, syncState, deals, pathname, router]);

  // Page-level `n` — quick-create a deal when no drawer is open and focus isn't in a field.
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.key !== 'n' && e.key !== 'N') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (editDealId) return;
      const t = e.target;
      const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
      e.preventDefault();
      createDeal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editDealId, filter, ws, workspace]);

  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)', height: '100%' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Deals</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
            열린 파이프라인 <span className="mono" style={{ color: 'var(--fg)' }}>{fmt(openTotal)}</span> · <span className="mono">{openCount}</span>건
            {closingTotal > 0 && <> · 클로징 <span className="mono" style={{ color: 'var(--success)' }}>{fmt(closingTotal)}</span></>}
            <SyncBadge state={syncState} />
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <SegmentedControl className="hub-toolbar" style={{ marginRight: 8 }} options={SCOPE_OPTIONS} value={filter} onChange={setFilter} />
        <Button variant="primary" size="sm" icon="plus" onClick={() => createDeal()}>Deal <Kbd>N</Kbd></Button>
      </div>

      {/* 게이지 마스트헤드 — 열린 딜 금액의 단계 분포를 한 줄 세그먼트로. 아래 컬럼들의
          top 스트라이프와 같은 heat 토큰을 써서 게이지와 보드가 하나의 계기로 읽힌다.
          (읽기 전용 — 모바일 44px 버튼 플로어와 충돌하는 클릭 타깃을 만들지 않는다.) */}
      {!wsEmpty && openTotal > 0 && (
        <div style={{ display: 'flex', gap: 2, height: 6, borderRadius: 999, overflow: 'hidden' }} aria-hidden="true">
          {openStages.map(s => {
            const sum = totals[s.key]?.sum || 0;
            return (
              <div
                key={s.key}
                title={`${s.label} · ${fmt(sum)} · ${totals[s.key]?.count || 0}건`}
                style={{
                  flex: sum || 0.02,
                  minWidth: sum ? 6 : 2,
                  background: STAGE_FILL[s.color] || 'var(--fg-faint)',
                  opacity: sum ? 0.9 : 0.25,
                }}
              />
            );
          })}
        </div>
      )}

      {wsEmpty && (
        <Card>
          <EmptyState
            icon="deals"
            title={`${ws.label} — 해당하는 딜이 없습니다`}
            description={`이 워크스페이스에 매칭되는 딜이 없습니다. 다른 워크스페이스로 태그된 딜은 여기에 표시되지 않습니다. 딜을 등록하거나 기록에 ${ws.label} 태그가 연결되면 파이프라인이 채워집니다.`}
            style={{ minHeight: 200, padding: '28px 12px' }}
          />
        </Card>
      )}

      {!wsEmpty && (
      <ScrollShadowX>
        {DEAL_STAGES.map(s => {
          const items = scopedDeals.filter(d => d.stage === s.key && (filter === 'all' || d.type === filter));
          return (
            <div key={s.key}
              onDragOver={e => e.preventDefault()}
              onDrop={() => drag && move(drag, s.key)}
              style={{
                width: 260, flexShrink: 0,
                background: 'var(--surface)',
                border: '1px solid var(--line-soft)',
                borderRadius: 'var(--r-lg)',
                display: 'flex', flexDirection: 'column',
                // Stage heat as a 2px top stripe (§5.2 inset-stripe idiom, rotated to the
                // column top) — replaces the 6px Dot so the funnel's cold→hot gradient reads
                // across the whole board and ties each column to its masthead gauge segment.
                boxShadow: `inset 0 2px 0 0 ${STAGE_LINE[s.color] || 'var(--line-strong)'}`,
              }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-soft)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{s.label}</span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)', marginLeft: 'auto' }}>{totals[s.key].count}</span>
                </div>
                <div className="mono" style={{ fontSize: 12, color: totals[s.key].sum ? 'var(--fg-muted)' : 'var(--fg-faint)', marginTop: 4 }}>{fmt(totals[s.key].sum)}</div>
              </div>
              <div className="scroll-y" style={{ flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 100 }}>
                {items.map(d => {
                  // Stalled = open (not won/lost) and aged past the follow-up window. Surfaces
                  // in every open column, not just Negotiation, and marks the card with a
                  // danger inset stripe (§5.2 left-accent — never a full fill or a thick border).
                  const stalled = Number(d.age) >= STALLED_DAYS && s.key !== 'closing' && s.key !== 'lost';
                  return (
                  <div key={d.id}
                    className="hub-kanban-card"
                    draggable
                    role="button" tabIndex={0}
                    onClick={() => { if (dragMovedRef.current) return; setEditDealId(d.id); }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditDealId(d.id); } }}
                    onDragStart={() => { dragMovedRef.current = true; setDrag(d.id); }}
                    onDragEnd={() => { setDrag(null); setTimeout(() => { dragMovedRef.current = false; }, 0); }}
                    style={{
                      background: 'var(--surface-2)',
                      border: '1px solid var(--line-soft)',
                      borderRadius: 'var(--r-sm)',
                      padding: '10px 11px', cursor: 'grab',
                      opacity: drag === d.id ? 0.4 : 1,
                      boxShadow: stalled ? 'inset 2px 0 0 var(--danger-line)' : undefined,
                    }}>
                    {/* 이름이 첫 줄 — UUID는 판단 데이터가 아니라 드로어 부제로 충분한 계기
                        소음이었다. 카드에서 가장 좋은 자리는 고객이 갖는다. */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <div style={{
                        flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--fg)', lineHeight: 1.35,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>{d.name}</div>
                      <IconButton
                        icon="sparkle"
                        size={20}
                        iconSize={12}
                        tooltip="Guru에게 진단 요청"
                        onClick={(e) => { e.stopPropagation(); onNavigate?.(guruChatPath({ mode: 'deal-review', ref: d.id })); }}
                      />
                      <Badge tone={d.type === 'personal' ? 'personal' : 'company'} size="xs">
                        {d.type === 'personal' ? 'P' : 'C'}
                      </Badge>
                    </div>
                    {/* 금액이 카드에서 가장 밝은 데이터 — 영업 보드의 두 번째 읽기 대상. */}
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                      <span className="mono" style={{ fontSize: 12.5, color: d.value ? 'var(--moon-100)' : 'var(--fg-faint)' }}>{fmt(d.value)}</span>
                      <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{d.close}</span>
                    </div>
                    {stalled && (
                      <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Iconed name="clock" size={10} /> {d.age}일 정체
                      </div>
                    )}
                  </div>
                  );
                })}
                <button
                  onClick={() => createDeal(s.key)}
                  title={`${s.label}에 새 딜 추가`}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    width: '100%', padding: '7px 8px', marginTop: items.length ? 2 : 0,
                    fontSize: 11.5, color: 'var(--fg-faint)',
                    border: '1px dashed var(--line-soft)', borderRadius: 'var(--r-sm)',
                    background: 'transparent', cursor: 'pointer',
                    transition: 'color 120ms ease, border-color 120ms ease, background 120ms ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--fg-muted)'; e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.background = 'var(--surface-2)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-faint)'; e.currentTarget.style.borderColor = 'var(--line-soft)'; e.currentTarget.style.background = 'transparent'; }}>
                  <Iconed name="plus" size={11} /> 딜 추가
                </button>
              </div>
            </div>
          );
        })}
      </ScrollShadowX>
      )}

      <EditDrawer
        title={editingDeal ? (editingDeal.name || '딜 편집') : ''}
        subtitle={editingDeal ? `${editingDeal.id} · 딜 정보 편집` : ''}
        record={editingDeal}
        fields={[
          { key: 'name', label: '딜 이름' },
          { key: 'type', label: '타입', type: 'select', options: [{ value: 'company', label: 'Company' }, { value: 'personal', label: 'Personal' }] },
          { key: 'stage', label: '단계', type: 'select', options: [
            ...DEAL_STAGES.map(s => ({ value: s.key, label: s.label })),
            ...(DEAL_STAGES.some(s => s.key === 'lost') ? [] : [{ value: 'lost', label: 'Lost' }]),
          ] },
          { key: 'value', label: '금액 (₩)', inputType: 'number', placeholder: '0' },
          { key: 'close', label: '예상 마감', placeholder: '5월 12일' },
          { key: 'owner', label: '담당' },
        ]}
        onChange={(key, val) => setDeals(ds => ds.map(d => (d.id === editDealId ? { ...d, [key]: val } : d)))}
        onSave={persistDeal}
        onDelete={deleteDeal}
        onClose={() => setEditDealId(null)}
      />
    </div>
  );
}

// Shared grid template for Cases — gap added so Type/Priority/Status chips never butt the next column
const CASES_GRID = '80px 1fr 160px 112px 100px 100px 110px 90px';

export function Cases() {
  const { ledger, syncState } = useRevenueLedger();
  const [localCases, setLocalCases] = React.useState([]);
  const [caseEdits, setCaseEdits] = React.useState({}); // { [id]: patch } — overlays any case
  const [deletedCaseIds, setDeletedCaseIds] = React.useState(() => new Set());
  const [editCaseId, setEditCaseId] = React.useState(null);
  const ledgerCases = Array.isArray(ledger.cases) ? ledger.cases : [];
  const cases = [...localCases, ...ledgerCases]
    .filter(c => !deletedCaseIds.has(c.id))
    .map(c => (caseEdits[c.id] ? { ...c, ...caseEdits[c.id] } : c));
  const editingCase = editCaseId ? cases.find(c => c.id === editCaseId) : null;
  const sTone = { Open: 'warning', Waiting: 'info', Resolved: 'success' };
  const pTone = { high: 'danger', med: 'warning', low: 'neutral' };
  const createCase = () => {
    const id = `CASE-${Date.now()}`;
    setLocalCases(prev => [{
      id,
      title: '새 운영 케이스',
      account: '미지정',
      type: 'company',
      priority: 'med',
      status: 'Open',
      opened: '방금',
      owner: 'Me',
    }, ...prev]);
    setEditCaseId(id); // open the editor immediately so the new case can be filled in
  };

  // Persist the drawer edit. New local rows (id `CASE-…`) insert; on success the returned
  // real id replaces the local one so a later edit takes the update path and the overlay re-keys.
  const persistCase = async () => {
    if (!editingCase) return { ok: false, status: 'error' };
    const isNew = String(editCaseId).startsWith('CASE-');
    const r = await saveRevenueRecord('case', isNew ? 'create' : 'update', editingCase);
    if (r.ok && isNew && r.id) {
      const realId = r.id;
      setLocalCases(prev => prev.map(c => (c.id === editCaseId ? { ...c, id: realId } : c)));
      setCaseEdits(prev => {
        if (!prev[editCaseId]) return prev;
        const next = { ...prev, [realId]: prev[editCaseId] };
        delete next[editCaseId];
        return next;
      });
      setEditCaseId(realId);
    }
    return r;
  };

  // Delete: drop the row locally (optimistic) and best-effort remove it from the ledger.
  const deleteCase = async () => {
    if (!editCaseId) return { ok: false };
    const isLocal = String(editCaseId).startsWith('CASE-');
    setLocalCases(prev => prev.filter(c => c.id !== editCaseId));
    setDeletedCaseIds(prev => new Set(prev).add(editCaseId));
    if (isLocal) return { ok: true, status: 'local' };
    return saveRevenueRecord('case', 'delete', { id: editCaseId });
  };

  // Page-level `n` — quick-create a case when no drawer is open and focus isn't in a field.
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.key !== 'n' && e.key !== 'N') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (editCaseId) return;
      const t = e.target;
      const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
      e.preventDefault();
      createCase();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editCaseId]);

  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Cases</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
            Support & account issues · {cases.filter(c => c.status !== 'Resolved').length} open
            <SyncBadge state={syncState} />
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="primary" size="sm" icon="plus" onClick={createCase}>Case <Kbd>N</Kbd></Button>
      </div>
      <Card pad={false} className="hub-table-card">
        <div style={{ display: 'grid', gridTemplateColumns: CASES_GRID, gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--line-soft)', fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          <span>ID</span><span>Title</span><span>Account</span><span>Type</span><span>Priority</span><span>Status</span><span>Opened</span><span style={{ textAlign: 'right' }}>Owner</span>
        </div>
        {cases.length === 0 && (
          <EmptyState
            icon="cases"
            title="운영 케이스가 없습니다"
            description={syncState === 'live' ? 'Supabase operation_cases 기록에 표시할 케이스가 없습니다.' : '지원/운영 이슈가 생기면 계정과 함께 표시됩니다.'}
            action={<Button variant="primary" size="sm" icon="plus" onClick={createCase}>케이스 추가</Button>}
          />
        )}
        {cases.map((c, i) => (
          <div key={c.id} className="hub-row"
            role="button" tabIndex={0}
            onClick={() => setEditCaseId(c.id)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditCaseId(c.id); } }}
            style={{
              display: 'grid', gridTemplateColumns: CASES_GRID, gap: 12,
              padding: 'var(--pad-y) var(--pad-x)', alignItems: 'center', cursor: 'pointer',
              borderBottom: i < cases.length - 1 ? '1px solid var(--line-soft)' : 'none',
              // High-priority open cases carry a danger left-accent (§5.2) — resolved ones stay quiet.
              boxShadow: c.priority === 'high' && c.status !== 'Resolved' ? 'inset 2px 0 0 var(--danger-line)' : undefined,
            }}
          >
            <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{c.id}</span>
            <span style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</span>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.account}</span>
            <span style={{ paddingRight: 8, minWidth: 0 }}>
              <Badge tone={c.type === 'personal' ? 'personal' : 'company'} size="xs">{c.type === 'personal' ? 'Personal' : 'Company'}</Badge>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: pTone[c.priority] === 'danger' ? 'var(--danger)' : 'var(--fg-muted)' }}>
              <Dot tone={pTone[c.priority]} />{c.priority}
            </span>
            <span style={{ paddingRight: 8, minWidth: 0 }}>
              <Badge tone={sTone[c.status]} size="xs">{c.status}</Badge>
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>{c.opened}</span>
            <span style={{ textAlign: 'right', fontSize: 12, color: 'var(--fg-muted)' }}>{c.owner}</span>
          </div>
        ))}
      </Card>

      <EditDrawer
        title={editingCase ? (editingCase.title || '케이스 편집') : ''}
        subtitle={editingCase ? `${editingCase.id} · 운영 케이스 편집` : ''}
        record={editingCase}
        fields={[
          { key: 'title', label: '제목' },
          { key: 'account', label: '계정', placeholder: '계정·고객명' },
          { key: 'type', label: '타입', type: 'select', options: [{ value: 'company', label: 'Company' }, { value: 'personal', label: 'Personal' }] },
          { key: 'priority', label: '우선순위', type: 'select', options: [{ value: 'low', label: 'Low' }, { value: 'med', label: 'Med' }, { value: 'high', label: 'High' }] },
          { key: 'status', label: '상태', type: 'select', options: [{ value: 'Open', label: 'Open' }, { value: 'Waiting', label: 'Waiting' }, { value: 'Resolved', label: 'Resolved' }] },
          { key: 'opened', label: '오픈 시점' },
          { key: 'owner', label: '담당' },
        ]}
        onChange={(key, val) => setCaseEdits(prev => ({ ...prev, [editCaseId]: { ...prev[editCaseId], [key]: val } }))}
        onSave={persistCase}
        onDelete={deleteCase}
        onClose={() => setEditCaseId(null)}
      />
    </div>
  );
}

// ---------- ACCOUNTS (lightweight CRM) ----------

const H_TONE = { ok: 'success', warning: 'warning', risk: 'danger' };

const ACT_ICON = { email: 'email', meeting: 'calendar', call: 'signal', note: 'edit', deal: 'deals' };
const ACT_TONE = { email: 'info', meeting: 'moon', call: 'warning', note: 'neutral', deal: 'success' };
const ACT_LABEL = { email: 'Email', meeting: 'Meeting', call: 'Call', note: 'Note', deal: 'Deal' };

function emptyDetail() {
  return { mrr: 0, contacts: [], activity: [], notes: [] };
}

function HealthDot({ health }) {
  const pulse = health === 'warning';
  return (
    <span
      title={health}
      style={{
        width: 7, height: 7, borderRadius: 999,
        background: `var(--${H_TONE[health]})`,
        display: 'inline-block',
        animation: pulse ? 'mlMoonPulse 1.4s ease-in-out infinite' : 'none',
        flexShrink: 0,
      }}
    />
  );
}

function ContactMenu({ onAction }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const items = [
    { key: 'email',   icon: 'email',    label: '📧 Send email' },
    { key: 'meeting', icon: 'calendar', label: '📅 Schedule meeting' },
    { key: 'chat',    icon: 'chat',     label: '💬 Open chat thread' },
    { key: 'call',    icon: 'signal',   label: '📞 Log call' },
  ];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <Button variant="outline" size="xs" iconRight="chevronD" onClick={() => setOpen(v => !v)}>Contact</Button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 10,
          minWidth: 180,
          background: 'var(--elevated, var(--surface-3))',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r-sm)',
          boxShadow: '0 8px 24px -8px oklch(0 0 0 / 0.5)',
          padding: 4,
        }}>
          {items.map(it => (
            <button key={it.key}
              onClick={() => { onAction(it.key); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', width: '100%',
                padding: '7px 10px', fontSize: 12, color: 'var(--fg)',
                background: 'transparent', border: 'none', borderRadius: 4,
                cursor: 'pointer', textAlign: 'left',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LogComposer({ onLog }) {
  const [type, setType] = React.useState('note');
  const [text, setText] = React.useState('');
  const save = () => {
    const body = text.trim();
    if (!body) return;
    onLog({ type, msg: body });
    setText('');
    setType('note');
  };
  return (
    <div style={{
      background: 'var(--surface-2)',
      border: '1px solid var(--line-soft)',
      borderRadius: 'var(--r-sm)',
      padding: 10,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="활동 기록… (이메일 회신, 통화 메모, 결정 요약 등)"
        rows={2}
        style={{
          width: '100%', resize: 'vertical',
          background: 'transparent', border: 'none', outline: 'none',
          color: 'var(--fg)', fontSize: 12.5, fontFamily: 'inherit',
          lineHeight: 1.5,
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <select
          value={type}
          onChange={e => setType(e.target.value)}
          style={{
            height: 26, padding: '0 8px', fontSize: 11.5,
            background: 'var(--surface-3)', color: 'var(--fg)',
            border: '1px solid var(--line)', borderRadius: 'var(--r-sm)',
            outline: 'none',
          }}
        >
          {Object.keys(ACT_LABEL).map(k => <option key={k} value={k}>{ACT_LABEL[k]}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <Button variant="primary" size="xs" onClick={save}>Save</Button>
      </div>
    </div>
  );
}

function QuickActions({ onAction }) {
  const acts = [
    { k: 'email',   label: 'Send email',       variant: 'primary',  icon: 'email' },
    { k: 'meeting', label: 'Schedule meeting', variant: 'outline',  icon: 'calendar' },
    { k: 'deal',    label: 'New deal',         variant: 'outline',  icon: 'deals' },
    { k: 'call',    label: 'Log call',         variant: 'outline',  icon: 'signal' },
    { k: 'note',    label: 'Add note',         variant: 'outline',  icon: 'edit' },
  ];
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {acts.map(a => (
        <Button key={a.k} variant={a.variant} size="xs" icon={a.icon} onClick={() => onAction(a.k)}>{a.label}</Button>
      ))}
    </div>
  );
}

function DetailPanel({ account, detail, onAction, onLog, onPinNote, onAddNote, onNavigate }) {
  const [tab, setTab] = React.useState('activity');
  const [noteText, setNoteText] = React.useState('');
  if (!account) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: 'var(--fg-faint)', fontSize: 13, gap: 6,
        padding: 40,
      }}>
        <Iconed name="accounts" size={28} />
        <div>좌측에서 계정을 선택하세요</div>
      </div>
    );
  }

  const d = detail || emptyDetail();
  const tabs = [
    { key: 'activity', label: 'Activity', count: d.activity.length },
    { key: 'contacts', label: 'Contacts', count: d.contacts.length },
    { key: 'notes',    label: 'Notes',    count: d.notes.length },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: 'var(--card-pad)', borderBottom: '1px solid var(--line-soft)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <Avatar name={account.name} size={52} tone={account.type === 'personal' ? 'personal' : 'company'} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 17, fontWeight: 500 }}>{account.name}</div>
              <Badge tone={account.type === 'personal' ? 'personal' : 'company'} size="xs">
                <Iconed name={account.type === 'personal' ? 'user' : 'building'} size={9} />
                {account.type === 'personal' ? 'Personal' : 'Company'}
              </Badge>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--fg-muted)' }}>
                <HealthDot health={account.health} />
                {account.health === 'warning' ? '주의' : account.health === 'risk' ? '위험' : '양호'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 18, marginTop: 10 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Deals</div>
                <div className="mono" style={{ fontSize: 13, marginTop: 3 }}>{account.deals}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Value</div>
                <div className="mono" style={{ fontSize: 13, marginTop: 3, color: 'var(--moon-200)' }}>{fmt(account.value)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>MRR</div>
                <div className="mono" style={{ fontSize: 13, marginTop: 3 }}>{d.mrr ? fmt(d.mrr) : '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Last contact</div>
                <div className="mono" style={{ fontSize: 12, marginTop: 3, color: 'var(--fg-muted)' }}>{account.last} · {account.lastAt}</div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <QuickActions onAction={onAction} />
          <Button
            variant="secondary"
            size="xs"
            icon="sparkle"
            onClick={() => onNavigate?.(guruChatPath({ mode: 'deal-review', ref: account.name }))}
          >
            Ask Guru
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} active={tab} onChange={setTab} style={{ padding: '0 var(--card-pad)' }} />

      {/* Body */}
      <div className="scroll-y" style={{ flex: 1, minHeight: 0, padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tab === 'activity' && (
          <>
            <LogComposer onLog={onLog} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {d.activity.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--fg-faint)', padding: '12px 0' }}>아직 기록이 없습니다.</div>
              )}
              {d.activity.map((a, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '18px 1fr auto',
                  gap: 10, padding: '10px 0',
                  borderBottom: i < d.activity.length - 1 ? '1px solid var(--line-soft)' : 'none',
                  alignItems: 'flex-start',
                }}>
                  <span style={{ color: `var(--${ACT_TONE[a.type] === 'neutral' ? 'fg-muted' : ACT_TONE[a.type]})`, marginTop: 1 }}>
                    <Iconed name={ACT_ICON[a.type] || 'edit'} size={13} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{a.msg}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginTop: 3, display: 'flex', gap: 6, alignItems: 'center' }}>
                      <Badge tone={ACT_TONE[a.type]} size="xs" variant="outline">{ACT_LABEL[a.type]}</Badge>
                      <span>{a.who}</span>
                    </div>
                  </div>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', whiteSpace: 'nowrap' }}>{a.at}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'contacts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {d.contacts.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--fg-faint)' }}>등록된 연락처가 없습니다.</div>
            )}
            {d.contacts.map((c, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: 12,
                background: 'var(--surface-2)',
                border: '1px solid var(--line-soft)',
                borderRadius: 'var(--r-sm)',
              }}>
                <Avatar name={c.name} size={34} tone={account.type === 'personal' ? 'personal' : 'company'} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>· {c.role}</span>
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span>{c.email}</span>
                    <span>{c.phone}</span>
                  </div>
                  <div className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginTop: 3 }}>Last: {c.lastContact}</div>
                </div>
                <ContactMenu onAction={(kind) => onAction(kind, c.name)} />
              </div>
            ))}
          </div>
        )}

        {tab === 'notes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--line-soft)',
              borderRadius: 'var(--r-sm)',
              padding: 10,
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="노트 추가… 키워드·결정·다음 액션 기록"
                rows={2}
                style={{
                  width: '100%', resize: 'vertical',
                  background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--fg)', fontSize: 12.5, fontFamily: 'inherit', lineHeight: 1.5,
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="primary" size="xs" onClick={() => { if (noteText.trim()) { onAddNote(noteText.trim()); setNoteText(''); } }}>Add note</Button>
              </div>
            </div>

            {d.notes.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--fg-faint)' }}>아직 노트가 없습니다.</div>
            )}

            {d.notes.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)).map((n, i) => (
              <div key={i} style={{
                background: 'var(--surface-2)',
                border: `1px solid ${n.pinned ? 'var(--moon-600)' : 'var(--line-soft)'}`,
                borderRadius: 'var(--r-sm)',
                padding: 12,
                display: 'flex', gap: 10, alignItems: 'flex-start',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{n.body}</div>
                  <div className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginTop: 6 }}>{n.at}</div>
                </div>
                <IconButton
                  icon="star"
                  onClick={() => onPinNote(n)}
                  tooltip={n.pinned ? 'Unpin' : 'Pin'}
                  style={n.pinned ? { color: 'var(--moon-200)' } : {}}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function Accounts({ workspace, onNavigate }) {
  const { ledger, syncState } = useRevenueLedger();
  const [localAccounts, setLocalAccounts] = React.useState([]);
  const ledgerAccounts = Array.isArray(ledger.accounts) ? ledger.accounts : [];
  // Scope the merged ledger to the active workspace (pass-through when unscoped). The
  // The ledger hook only exposes API-backed records; scoping never mixes sources.
  const ws = getWorkspace(workspace);
  const ACCOUNTS = filterAccountsByWorkspace([...localAccounts, ...ledgerAccounts], workspace);
  const wsEmpty = Boolean(ws) && ACCOUNTS.length === 0;
  const [view, setView] = React.useState('cards'); // cards | list | detail
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState('all');
  const [selected, setSelected] = React.useState(null);
  const [details, setDetails] = React.useState({});

  const term = search.trim().toLowerCase();
  const filtered = ACCOUNTS.filter(a =>
    (filter === 'all' || a.type === filter) &&
    (!term || a.name.toLowerCase().includes(term))
  );

  // Keep selection valid across filter changes
  React.useEffect(() => {
    if (view === 'detail' && !filtered.find(a => a.name === selected)) {
      setSelected(filtered[0]?.name ?? null);
    }
  }, [view, filtered, selected]);

  const getDetail = (name) => details[name] || emptyDetail();

  const pushActivity = (name, entry) => {
    setDetails(prev => {
      const cur = prev[name] || emptyDetail();
      return {
        ...prev,
        [name]: { ...cur, activity: [{ at: '방금', who: 'Me', ...entry }, ...cur.activity] },
      };
    });
  };

  const handleAction = (name) => (kind, contactName) => {
    const labels = {
      email:   contactName ? `${contactName}에게 이메일 발송 기록` : '이메일 발송 기록',
      meeting: contactName ? `${contactName}와 미팅 일정 등록` : '미팅 일정 등록',
      chat:    contactName ? `${contactName} 채팅 스레드 오픈` : '채팅 스레드 오픈',
      call:    contactName ? `${contactName} 통화 기록` : '통화 기록',
      deal:    '새 딜 초안 생성',
      note:    '노트 추가 (간단)',
    };
    const type = kind === 'chat' ? 'note' : kind;
    pushActivity(name, { type, msg: labels[kind] || `${kind} 액션` });
  };

  const handleLog = (name) => ({ type, msg }) => {
    pushActivity(name, { type, msg });
  };

  const handlePinNote = (name) => (note) => {
    setDetails(prev => {
      const cur = prev[name] || emptyDetail();
      return {
        ...prev,
        [name]: {
          ...cur,
          notes: cur.notes.map(n => n === note ? { ...n, pinned: !n.pinned } : n),
        },
      };
    });
  };

  const handleAddNote = (name) => (body) => {
    setDetails(prev => {
      const cur = prev[name] || emptyDetail();
      return {
        ...prev,
        [name]: { ...cur, notes: [{ at: '방금', pinned: false, body }, ...cur.notes] },
      };
    });
  };

  const selectedAcc = filtered.find(a => a.name === selected) || null;

  const openDetail = (name) => {
    setSelected(name);
    setView('detail');
  };
  const createAccount = () => {
    const name = '새 계정';
    setLocalAccounts(prev => [{
      name,
      type: filter === 'personal' || filter === 'company' ? filter : 'company',
      health: 'ok',
      value: 0,
      deals: 0,
      last: '방금',
      owner: 'Me',
      lastAt: '방금',
      // Tag in-workspace creates so the scoped view doesn't silently drop them.
      ...(ws ? { workspace } : {}),
    }, ...prev]);
    setSelected(name);
    setView('detail');
  };

  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Accounts</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
            {ACCOUNTS.filter(a => a.type === 'company').length} companies · {ACCOUNTS.filter(a => a.type === 'personal').length} individuals
            <SyncBadge state={syncState} />
          </div>
        </div>
        <div style={{ flex: 1 }} />

        {/* View mode toggle */}
        <SegmentedControl
          className="hub-toolbar"
          options={[{ key: 'cards', label: 'Cards' }, { key: 'list', label: 'List' }, { key: 'detail', label: 'Detail' }]}
          value={view}
          onChange={(k) => {
            setView(k);
            if (k === 'detail' && !selected) setSelected(filtered[0]?.name ?? null);
          }}
        />

        {/* Type filter */}
        <SegmentedControl className="hub-toolbar" options={SCOPE_OPTIONS} value={filter} onChange={setFilter} />

        <Input className="hub-toolbar" placeholder="계정 검색…" icon="search" value={search} onChange={setSearch} />
        <Button variant="primary" size="sm" icon="plus" onClick={createAccount}>Account</Button>
      </div>

      {wsEmpty && (
        <Card>
          <EmptyState
            icon="accounts"
            title={`${ws.label} — 해당하는 계정이 없습니다`}
            description={`이 워크스페이스에 매칭되는 계정이 없습니다. 다른 워크스페이스로 태그된 계정은 여기에 표시되지 않습니다. 계정을 등록하거나 기록에 ${ws.label} 태그가 연결되면 나타납니다.`}
            style={{ minHeight: 200, padding: '28px 12px' }}
          />
        </Card>
      )}

      {/* Content by view */}
      {!wsEmpty && view === 'cards' && (
        <div className="hub-card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--gap)' }}>
          {filtered.map(a => (
            <Card key={a.name} interactive style={{ cursor: 'pointer' }}>
              <div onClick={() => openDetail(a.name)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <Avatar name={a.name} size={36} tone={a.type === 'personal' ? 'personal' : 'company'} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <Badge tone={a.type === 'personal' ? 'personal' : 'company'} size="xs">{a.type === 'personal' ? 'Personal' : 'Company'}</Badge>
                      <HealthDot health={a.health} />
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingTop: 10, borderTop: '1px solid var(--line-soft)' }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Value</div>
                    <div className="mono" style={{ fontSize: 13, color: 'var(--fg)', marginTop: 3 }}>{fmt(a.value)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Deals · Last</div>
                    <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 3 }}>
                      {a.deals} · <span className="mono">{a.last}</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
          {filtered.length === 0 && (
            <Card style={{ gridColumn: '1 / -1' }}>
              <EmptyState
                icon="accounts"
                title="계정이 없습니다"
                description={syncState === 'live' ? 'Supabase customer_accounts 기록에 표시할 계정이 없습니다.' : '필터나 검색어를 조정하면 계정을 다시 찾을 수 있습니다.'}
                action={<Button variant="primary" size="sm" icon="plus" onClick={createAccount}>Account</Button>}
              />
            </Card>
          )}
        </div>
      )}

      {!wsEmpty && view === 'list' && (
        <Card pad={false} className="hub-table-card">
          <div style={{
            display: 'grid',
            gridTemplateColumns: '32px 1.6fr 110px 70px 110px 70px 120px 100px 100px',
            gap: 12,
            padding: '10px 16px',
            borderBottom: '1px solid var(--line-soft)',
            fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em',
          }}>
            <span /><span>Name</span><span>Type</span><span>Health</span><span>Value</span><span>Deals</span><span>Last contact</span><span>Owner</span><span style={{ textAlign: 'right' }}>마지막 접점 시간</span>
          </div>
          {filtered.map((a, i) => (
            <div key={a.name}
              onClick={() => openDetail(a.name)}
              style={{
                display: 'grid',
                gridTemplateColumns: '32px 1.6fr 110px 70px 110px 70px 120px 100px 100px',
                gap: 12,
                padding: 'var(--pad-y) var(--pad-x)', alignItems: 'center',
                borderBottom: i < filtered.length - 1 ? '1px solid var(--line-soft)' : 'none',
                cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ paddingRight: 4, display: 'flex' }}>
                <Avatar name={a.name} size={24} tone={a.type === 'personal' ? 'personal' : 'company'} />
              </span>
              <span style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
              <span style={{ paddingRight: 8 }}>
                <Badge tone={a.type === 'personal' ? 'personal' : 'company'} size="xs">
                  <Iconed name={a.type === 'personal' ? 'user' : 'building'} size={9} />
                  {a.type === 'personal' ? 'Personal' : 'Company'}
                </Badge>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <HealthDot health={a.health} />
                <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{a.health}</span>
              </span>
              <span className="mono" style={{ fontSize: 12, color: 'var(--moon-200)' }}>{fmt(a.value)}</span>
              <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{a.deals}</span>
              <span className="mono" style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{a.last}</span>
              <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{a.owner}</span>
              <span className="mono" style={{ textAlign: 'right', fontSize: 11, color: 'var(--fg-faint)' }}>{a.lastAt}</span>
            </div>
          ))}
          {filtered.length === 0 && (
            <EmptyState
              icon="accounts"
              title="계정이 없습니다"
              description={syncState === 'live' ? 'Supabase customer_accounts 기록이 비어 있습니다.' : '필터나 검색어를 조정하면 계정을 다시 찾을 수 있습니다.'}
            />
          )}
        </Card>
      )}

      {!wsEmpty && view === 'detail' && (
        <Card pad={false} className="hub-detail-card" style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
          <div style={{ width: '30%', minWidth: 240, borderRight: '1px solid var(--line-soft)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line-soft)', fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {filtered.length} accounts
            </div>
            <div className="scroll-y" style={{ flex: 1, minHeight: 0 }}>
              {filtered.map(a => {
                const isSel = a.name === selected;
                return (
                  <div key={a.name}
                    onClick={() => setSelected(a.name)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px', cursor: 'pointer',
                      borderLeft: `2px solid ${isSel ? 'var(--moon-300)' : 'transparent'}`,
                      background: isSel ? 'var(--surface-2)' : 'transparent',
                      borderBottom: '1px solid var(--line-soft)',
                    }}
                    onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--surface-2)'; }}
                    onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Avatar name={a.name} size={28} tone={a.type === 'personal' ? 'personal' : 'company'} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
                        <HealthDot health={a.health} />
                      </div>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>
                        {fmt(a.value)} · <span style={{ color: 'var(--fg-faint)' }}>{a.last}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <EmptyState
                  icon="accounts"
                  title="계정 없음"
                  description="선택할 계정이 없습니다."
                  style={{ minHeight: 220, padding: '24px 12px' }}
                />
              )}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <DetailPanel
              account={selectedAcc}
              detail={selectedAcc ? getDetail(selectedAcc.name) : null}
              onAction={selectedAcc ? handleAction(selectedAcc.name) : () => {}}
              onLog={selectedAcc ? handleLog(selectedAcc.name) : () => {}}
              onPinNote={selectedAcc ? handlePinNote(selectedAcc.name) : () => {}}
              onAddNote={selectedAcc ? handleAddNote(selectedAcc.name) : () => {}}
              onNavigate={onNavigate}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
