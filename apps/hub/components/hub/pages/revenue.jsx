"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { Iconed } from "../hub-icons";
import { Badge, Dot, Card, Button, Avatar, Input, Tabs, IconButton, Divider, EmptyState, Sparkline, EditDrawer, SyncBadge, SegmentedControl, Drawer } from "../hub-primitives";
import {
  LEADS as FALLBACK_LEADS,
  DEAL_STAGES as FALLBACK_DEAL_STAGES,
  DEALS as FALLBACK_DEALS,
  BRANDS,
  ACCOUNT_DETAIL,
} from "../hub-data";
import { requestGuruCoaching, guruChatPath } from "../guru-client";
import { getWorkspace, filterLeadsByWorkspace, filterDealsByWorkspace } from "../workspace-map";

const fmt = v => {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return '₩0';
  return '₩' + (n / 1000000).toFixed(1) + 'M';
};

// Persist a drawer edit to the Supabase-backed write route. `kind` is 'lead' | 'deal',
// `op` is 'create' | 'update'. Returns { ok, status, id } — `ok` only when the row was
// actually saved; 'preview' means the backend isn't configured and the local row stands.
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

// Activity timeline persistence (crm_activities). create/pin/delete via POST; read via GET.
async function saveActivity(op, payload) {
  try {
    const resp = await fetch('/api/hub/revenue/activity', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op, ...payload }),
    });
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok && data.status === 'saved', status: data.status || 'error', activity: data.activity, id: data.id };
  } catch (err) {
    return { ok: false, status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}

async function fetchActivities({ accountId, leadId, dealId }) {
  const q = new URLSearchParams();
  if (accountId) q.set('accountId', accountId);
  if (leadId) q.set('leadId', leadId);
  if (dealId) q.set('dealId', dealId);
  try {
    const resp = await fetch(`/api/hub/revenue/activity?${q.toString()}`);
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: data.status || 'error', activities: Array.isArray(data.activities) ? data.activities : [] };
  } catch {
    return { ok: false, status: 'error', activities: [] };
  }
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
    .filter((deal) => deal.stage !== 'won' && deal.stage !== 'lost' && Number(deal.age) > 10)
    .slice(0, 3)
    .forEach((deal) => {
      items.push({
        tone: 'warning',
        t: `${deal.name} — ${deal.age}d stalled`,
        s: 'follow-up 필요',
        go: 'dashboard/revenue/deals',
      });
    });

  const newLeads = leads.filter((lead) => lead.stage === 'New').length;
  if (newLeads > 0) {
    items.push({
      tone: 'info',
      t: `신규 리드 ${newLeads}건`,
      s: '분류·할당 필요',
      go: 'dashboard/revenue/leads',
    });
  }

  const wonDeals = deals.filter((deal) => deal.stage === 'won');
  if (wonDeals.length > 0) {
    const wonTotal = wonDeals.reduce((sum, deal) => sum + deal.value, 0);
    items.push({
      tone: 'success',
      t: `Won ${wonDeals.length}건 · ${fmt(wonTotal)}`,
      s: '온보딩 킥오프',
      go: 'dashboard/revenue/accounts',
    });
  }

  return items.slice(0, 4);
}

const FALLBACK_ACCOUNTS = [
  { name: '클래스인',        type: 'company',  deals: 2, value: 18000000, last: '오늘',    lastAt: '11:02', health: 'warning', owner: 'Me' },
  { name: 'Studio Park',     type: 'company',  deals: 1, value: 6000000,  last: '3일 전',  lastAt: '3d',    health: 'ok',      owner: 'Me' },
  { name: 'Beanly Coffee',   type: 'company',  deals: 1, value: 4200000,  last: '오늘',    lastAt: '14:15', health: 'ok',      owner: 'Council' },
  { name: 'Han 스튜디오',    type: 'company',  deals: 1, value: 3500000,  last: '5일 전',  lastAt: '5d',    health: 'warning', owner: 'Me' },
  { name: '베어브릭',         type: 'company',  deals: 1, value: 7800000,  last: '2주 전',  lastAt: '14d',   health: 'ok',      owner: 'Me' },
  { name: '이재민',           type: 'personal', deals: 1, value: 1200000,  last: '오늘',    lastAt: '08:45', health: 'ok',      owner: 'Me' },
  { name: '정하윤',           type: 'personal', deals: 1, value: 900000,   last: '어제',    lastAt: '1d',    health: 'ok',      owner: 'Me' },
  { name: 'Jihoon (코칭)',    type: 'personal', deals: 1, value: 600000,   last: '오늘',    lastAt: '16:00', health: 'ok',      owner: 'Me' },
];

const FALLBACK_CASES = [
  { id: 'CS-104', title: 'Spring Cohort 계약 검토', account: '클래스인', type: 'company', status: 'Open', priority: 'high', opened: '3일 전', owner: 'Me' },
  { id: 'CS-103', title: '결제 영수증 재발행', account: '이재민', type: 'personal', status: 'Waiting', priority: 'low', opened: '어제', owner: 'Automation' },
  { id: 'CS-102', title: '뉴스레터 구독 취소 이슈', account: 'Studio Park', type: 'company', status: 'Open', priority: 'med', opened: '2일 전', owner: 'Me' },
  { id: 'CS-101', title: '도메인 인증 재설정', account: 'Moonlight', type: 'company', status: 'Resolved', priority: 'med', opened: '5일 전', owner: 'Me' },
  { id: 'CS-099', title: '코칭 일정 재조정', account: 'Jihoon', type: 'personal', status: 'Resolved', priority: 'low', opened: '지난 주', owner: 'Me' },
];

function useRevenueLedger() {
  const [ledger, setLedger] = React.useState({
    source: 'mock',
    leads: FALLBACK_LEADS,
    deals: FALLBACK_DEALS,
    stages: FALLBACK_DEAL_STAGES,
    accounts: FALLBACK_ACCOUNTS,
    cases: FALLBACK_CASES,
    summary: null,
  });
  const [syncState, setSyncState] = React.useState('mock');
  // Bump to re-run the fetch effect. reload() surfaces it so callers (business-card promote,
  // score recompute) can refresh the ledger in place instead of a full window reload.
  const [reloadTick, setReloadTick] = React.useState(0);
  const reload = React.useCallback(() => setReloadTick(t => t + 1), []);

  React.useEffect(() => {
    let active = true;
    async function load() {
      setSyncState('loading');
      try {
        const response = await fetch('/api/hub/revenue', { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (!active || !response.ok || !data || data.status === 'error') {
          if (active) setSyncState('mock');
          return;
        }
        if (data.source === 'supabase') {
          setLedger({
            source: 'supabase',
            leads: Array.isArray(data.leads) ? data.leads : [],
            deals: Array.isArray(data.deals) ? data.deals : [],
            stages: Array.isArray(data.stages) && data.stages.length ? data.stages : FALLBACK_DEAL_STAGES,
            accounts: Array.isArray(data.accounts) ? data.accounts : [],
            cases: Array.isArray(data.cases) ? data.cases : [],
            summary: data.summary || null,
          });
          setSyncState('live');
        } else {
          setSyncState('mock');
        }
      } catch {
        if (active) setSyncState('mock');
      }
    }
    load();
    return () => { active = false; };
  }, [reloadTick]);

  return { ledger, syncState, reload };
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
          원장을 읽고 코칭을 정리하는 중…
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

  const mrr = summary?.mrr ?? (isLiveLedger ? 0 : 8400000);
  const mrrPrev = summary?.mrrPrev ?? (isLiveLedger ? 0 : 7500000);
  const pipelineByStage = DEAL_STAGES.map(s => ({
    ...s,
    sum: DEALS.filter(d => d.stage === s.key).reduce((a, b) => a + b.value, 0),
    count: DEALS.filter(d => d.stage === s.key).length,
  }));
  const hasPipelineValue = pipelineByStage.some(s => s.sum > 0);
  const pipeline = summary?.pipeline ?? pipelineByStage.reduce((a, b) => a + b.sum, 0);
  const openLeads = summary?.leadsCount ?? LEADS.length;
  const openDeals = summary?.openDeals ?? DEALS.filter(d => d.stage !== 'won').length;
  const wonMTD = summary?.wonMTD ?? DEALS.filter(d => d.stage === 'won').reduce((a, b) => a + b.value, 0);
  const newThisMonth = summary?.newThisMonth ?? (isLiveLedger ? 0 : 12);
  const wonDealsCount = DEALS.filter(d => d.stage === 'won').length;
  // Live join: group won-deal value by the deal's brand meta (mapDeal → resolveBrand).
  // Brands outside the BRANDS registry still show, with a neutral glyph and their raw key.
  const byBrand = isLiveLedger
    ? (() => {
      const sums = new Map();
      DEALS.filter(d => d.stage === 'won' && d.brand).forEach(d => {
        sums.set(d.brand, (sums.get(d.brand) || 0) + Number(d.value || 0));
      });
      return [...sums.entries()]
        .map(([key, mrr]) => {
          const meta = BRANDS.find(b => b.key === key);
          return { key, name: meta?.name || key, glyph: meta?.glyph || '◾', mrr };
        })
        .sort((a, b) => b.mrr - a.mrr)
        .slice(0, 6);
    })()
    : BRANDS.filter(b => b.key !== 'all').slice(0, 6).map((b, i) => ({
      ...b,
      mrr: [2.4, 1.8, 0.6, 2.0, 0.9, 0.7][i] * 1000000,
    }));
  const totalBrandMRR = byBrand.reduce((a, b) => a + b.mrr, 0);
  const attentionItems = isLiveLedger
    ? buildRevenueAttention(LEADS, DEALS)
    : [
      { tone: 'danger', t: '클래스인 — 계약서 응답 2일째', s: '리마인드 메일 추천', go: 'dashboard/revenue/deals' },
      { tone: 'warning', t: 'Studio Park — 제안서 14일 정체', s: 'follow-up 필요', go: 'dashboard/revenue/deals' },
      { tone: 'info', t: '이번 주 신규 리드 +12', s: '분류·할당 필요', go: 'dashboard/revenue/leads' },
      { tone: 'success', t: 'Won: 베어브릭 콜라보 ₩7.8M', s: '온보딩 킥오프', go: 'dashboard/revenue/accounts' },
    ];

  // Summary data stays month-scope until the ledger exposes QTD/YTD aggregates —
  // the toggle drives the caption so the header never shows a stale hardcoded month.
  const now = new Date();
  const periodLabel = period === 'QTD'
    ? `Q${Math.floor(now.getMonth() / 3) + 1} · 분기 요약`
    : period === 'YTD'
    ? `${now.getFullYear()}년 · 연간 요약`
    : `${now.getMonth() + 1}월 · 이번 달 요약`;

  const kpis = [
    { l: isLiveLedger ? 'MRR (추정)' : 'MRR', v: fmt(mrr), d: isLiveLedger ? 'won MTD 기반 추정' : formatPercentDelta(mrr, mrrPrev), tone: mrr > mrrPrev ? 'success' : 'neutral', go: 'dashboard/revenue/accounts', trend: isLiveLedger ? null : [6.2, 6.8, 6.5, 7.1, 7.5, 7.5, 8.4], trendTone: 'success' },
    { l: 'Pipeline', v: fmt(pipeline), d: `${openDeals} deals`, tone: 'moon', go: 'dashboard/revenue/deals', trend: isLiveLedger ? null : [24, 28, 26, 31, 30, 33, 33.5], trendTone: 'moon' },
    { l: 'Open leads', v: openLeads, d: `이번달 신규 ${newThisMonth}`, tone: 'info', go: 'dashboard/revenue/leads', trend: isLiveLedger ? null : [3, 5, 4, 7, 9, 12, 12], trendTone: 'moon' },
    { l: 'Won MTD', v: fmt(wonMTD), d: `${wonDealsCount} deals`, tone: wonMTD > 0 ? 'success' : 'neutral', go: 'dashboard/revenue/deals', trend: null },
  ];

  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)', maxWidth: 1280, margin: '0 auto', width: '100%' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'flex-end' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Revenue overview</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
            {periodLabel}<SyncBadge state={syncState} />
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <SegmentedControl
          className="hub-page-actions"
          options={['MTD','QTD','YTD'].map(p => ({ key: p, label: p }))}
          value={period}
          onChange={setPeriod}
        />
      </div>

      <div className="hub-grid--metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'var(--gap)' }}>
        {kpis.map((k) => (
          <Card key={k.l} interactive onClick={() => onNavigate?.(k.go)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)' }}>{k.l}</span>
              <span style={{ flex: 1 }} />
              <Iconed name="arrowRight" size={11} style={{ color: 'var(--fg-faint)', opacity: 0.6 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              <div className="mono" style={{ fontSize: 26, marginTop: 10, fontWeight: 500 }}>{k.v}</div>
              <div style={{ flex: 1 }} />
              {k.trend && (
                <span style={{ marginBottom: 4 }}>
                  <Sparkline values={k.trend} width={60} height={18} tone={k.trendTone} />
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: k.tone === 'neutral' ? 'var(--fg-faint)' : `var(--${k.tone})`, marginTop: 4 }}>{k.d}</div>
          </Card>
        ))}
      </div>

      <div className="hub-grid--split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 'var(--gap)' }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Pipeline by stage</div>
            <div style={{ flex: 1 }} />
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{fmt(pipeline)}</span>
            <Button variant="ghost" size="xs" iconRight="arrowRight" onClick={() => onNavigate?.('dashboard/revenue/deals')}>Deals</Button>
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
                description="won 딜에 brand 메타가 붙으면 여기 자동 집계됩니다. (딜 meta.brand · Supabase live)"
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Top deals</div>
            <div style={{ flex: 1 }} />
            <Button variant="ghost" size="xs" iconRight="arrowRight" onClick={() => onNavigate?.('dashboard/revenue/deals')}>전체 보기</Button>
          </div>
          {DEALS.length === 0 && (
            <EmptyState
              icon="deals"
              title="딜이 없습니다"
              description={isLiveLedger ? 'Supabase deals 원장에 표시할 딜이 없습니다.' : '딜이 생기면 금액순으로 표시됩니다.'}
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
            <div key={i}
              onClick={() => x.go && onNavigate?.(x.go)}
              onMouseEnter={e => { if (x.go) e.currentTarget.style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '9px 8px', margin: '0 -8px', borderRadius: 'var(--r-sm)',
                cursor: x.go ? 'pointer' : 'default',
                borderBottom: i < arr.length - 1 ? '1px solid var(--line-soft)' : 'none',
              }}
            >
              <Dot tone={x.tone} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5 }}>{x.t}</div>
                <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginTop: 2 }}>{x.s}</div>
              </div>
              {x.go && <Iconed name="chevronR" size={12} style={{ color: 'var(--fg-faint)', marginTop: 2, flexShrink: 0 }} />}
            </div>
          ))}
        </Card>
      </div>

      <GuruCoachPanel onNavigate={onNavigate} />
    </div>
  );
}

// Shared grid template for Leads rows — gap between columns so badges never butt the next cell
const LEADS_GRID = '26px 1fr 112px 112px 124px 64px 100px 90px 92px';

// Compact meta tags under a lead name — 지역·규모·현재 상황·도입 댓수 (blank ones are skipped).
function LeadTagChips({ lead }) {
  const chips = [];
  if (lead.region) chips.push({ icon: 'globe', text: lead.region });
  if (lead.units) chips.push({ icon: 'tag', text: `${lead.units}대` });
  if (lead.scale) chips.push({ icon: null, text: lead.scale });
  if (lead.situation) chips.push({ icon: null, text: lead.situation });
  if (chips.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 3 }}>
      {chips.map((c, i) => (
        <span key={i} style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          fontSize: 10, color: 'var(--fg-faint)',
          background: 'var(--surface-2)', border: '1px solid var(--line-soft)',
          borderRadius: 4, padding: '1px 6px',
          whiteSpace: 'nowrap', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {c.icon && <Iconed name={c.icon} size={9} />}
          {c.text}
        </span>
      ))}
    </div>
  );
}

// Mini kanban-card chips for a joined lead — reuses LeadTagChips' visual language (region · units)
// but inline and capped at 2 so the card height gain stays ≤ 1 line. Renders null when absent.
function DealLeadMiniChips({ lead }) {
  if (!lead) return null;
  const chips = [];
  if (lead.region) chips.push({ icon: 'globe', text: lead.region });
  if (lead.units) chips.push({ icon: 'tag', text: `${lead.units}대` });
  if (chips.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap', marginBottom: 8, overflow: 'hidden' }}>
      {chips.slice(0, 2).map((c, i) => (
        <span key={i} style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          fontSize: 9.5, color: 'var(--fg-faint)',
          background: 'var(--surface-3)', border: '1px solid var(--line-soft)',
          borderRadius: 4, padding: '1px 5px',
          whiteSpace: 'nowrap', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {c.icon && <Iconed name={c.icon} size={8} />}
          {c.text}
        </span>
      ))}
    </div>
  );
}

// Reusable activity timeline for the Lead/Deal EditDrawer children slot. Mirrors the Accounts
// optimistic pattern (pushActivity tmp-id → server id swap + in-flight merge). Skips entirely for
// unsaved local rows; in preview (no live ledger) shows a muted note instead of fabricating rows.
function DrawerTimeline({ entityType, entityId, title = '활동 타임라인' }) {
  const isLocal = String(entityId ?? '').startsWith('local-') || String(entityId ?? '').toLowerCase().startsWith('local-');
  const [rows, setRows] = React.useState([]);
  const [phase, setPhase] = React.useState('idle'); // idle | loading | live | preview
  const [kind, setKind] = React.useState('call');
  const [body, setBody] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (isLocal || !entityId) { setRows([]); setPhase('idle'); return undefined; }
    let cancelled = false;
    setPhase('loading');
    setRows([]);
    const q = entityType === 'deal' ? { dealId: entityId } : { leadId: entityId };
    fetchActivities(q).then(res => {
      if (cancelled) return;
      if (res.status === 'live') {
        setRows(res.activities.map(a => ({ id: a.id, kind: a.kind, body: a.body, at: a.at, who: a.who })));
        setPhase('live');
      } else {
        setPhase('preview');
      }
    });
    return () => { cancelled = true; };
  }, [entityType, entityId, isLocal]);

  if (isLocal || !entityId) return null;

  const log = async () => {
    const text = body.trim();
    if (!text || saving) return;
    const tmp = `tmp-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    setRows(prev => [{ id: tmp, kind, body: text, at: '방금', who: 'Me' }, ...prev]);
    setBody('');
    setSaving(true);
    const payload = entityType === 'deal'
      ? { dealId: entityId, entityType: 'deal', kind, body: text }
      : { leadId: entityId, entityType: 'lead', kind, body: text };
    const r = await saveActivity('create', payload);
    setSaving(false);
    if (r.ok && r.activity) {
      setRows(prev => prev.map(a => a.id === tmp
        ? { id: r.activity.id, kind: r.activity.kind, body: r.activity.body, at: r.activity.at, who: r.activity.who }
        : a));
    }
  };

  const visible = rows.slice(0, 30);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-faint)' }}>{title}</div>

      {/* Mini composer */}
      <div style={{
        background: 'var(--surface-2)', border: '1px solid var(--line-soft)',
        borderRadius: 'var(--r-sm)', padding: 8, display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="활동 기록… (통화·미팅·이메일 메모)"
          rows={2}
          style={{
            width: '100%', resize: 'vertical', background: 'transparent', border: 'none', outline: 'none',
            color: 'var(--fg)', fontSize: 12.5, fontFamily: 'inherit', lineHeight: 1.5,
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            value={kind}
            onChange={e => setKind(e.target.value)}
            style={{
              height: 26, padding: '0 8px', fontSize: 11.5,
              background: 'var(--surface-3)', color: 'var(--fg)',
              border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', outline: 'none',
            }}
          >
            {ACTIVITY_KIND_OPTIONS.map(k => <option key={k} value={k}>{ACT_LABEL[k]}</option>)}
          </select>
          <div style={{ flex: 1 }} />
          <Button variant="primary" size="xs" onClick={log} disabled={saving || !body.trim()}>기록</Button>
        </div>
      </div>

      {/* Timeline rows */}
      {phase === 'preview' && (
        <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', padding: '6px 0', lineHeight: 1.5 }}>
          기록 없음 · Supabase 연결 시 저장됩니다
        </div>
      )}
      {phase === 'live' && visible.length === 0 && (
        <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', padding: '6px 0' }}>아직 기록이 없습니다.</div>
      )}
      {(phase === 'live' || rows.length > 0) && visible.length > 0 && (
        <div className="scroll-y" style={{ display: 'flex', flexDirection: 'column', maxHeight: 240 }}>
          {visible.map((a, i) => (
            <div key={a.id} style={{
              display: 'grid', gridTemplateColumns: '18px 1fr auto', gap: 10, padding: '9px 0',
              borderBottom: i < visible.length - 1 ? '1px solid var(--line-soft)' : 'none',
              alignItems: 'flex-start',
            }}>
              <span style={{ color: `var(--${ACT_TONE[a.kind] === 'neutral' ? 'fg-muted' : ACT_TONE[a.kind] || 'fg-muted'})`, marginTop: 1 }}>
                <Iconed name={ACT_ICON[a.kind] || 'edit'} size={13} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{a.body}</div>
                <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginTop: 3, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <Badge tone={ACT_TONE[a.kind] || 'neutral'} size="xs" variant="outline">{ACT_LABEL[a.kind] || a.kind}</Badge>
                  <span>{a.who}</span>
                </div>
              </div>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', whiteSpace: 'nowrap' }}>{a.at}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Leads({ workspace, onNavigate }) {
  const { ledger, syncState, reload } = useRevenueLedger();
  const searchParams = useSearchParams();
  const [localLeads, setLocalLeads] = React.useState([]);
  const [leadEdits, setLeadEdits] = React.useState({}); // { [id]: patch } — overlays any lead (local or ledger)
  const [deletedLeadIds, setDeletedLeadIds] = React.useState(() => new Set()); // hide removed ledger rows
  const [editLeadId, setEditLeadId] = React.useState(null);
  const [convertNote, setConvertNote] = React.useState(null); // { tone, text } — inline 리드→딜 전환 feedback
  const [toast, setToast] = React.useState(null); // { text } — transient bottom-right feedback (score recompute)
  const [recomputing, setRecomputing] = React.useState(false);
  const toastTimerRef = React.useRef(null);
  const showToast = React.useCallback((text) => {
    setToast({ text });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);
  React.useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);
  const ws = getWorkspace(workspace);
  const mergedLeads = [...localLeads, ...ledger.leads]
    .filter(l => !deletedLeadIds.has(l.id))
    .map(l => (leadEdits[l.id] ? { ...l, ...leadEdits[l.id] } : l));
  const LEADS = filterLeadsByWorkspace(mergedLeads, workspace);
  const editingLead = editLeadId ? mergedLeads.find(l => l.id === editLeadId) : null;

  // Deep-link: ?lead=<id> opens that lead's EditDrawer once the ledger has loaded and the
  // lead exists in the merged list. Guarded per param value so closing the drawer is sticky.
  const leadParam = searchParams.get('lead');
  const consumedLeadRef = React.useRef(null);
  React.useEffect(() => {
    if (!leadParam || syncState === 'loading') return;
    if (consumedLeadRef.current === leadParam) return;
    if (mergedLeads.some(l => String(l.id) === String(leadParam))) {
      consumedLeadRef.current = leadParam;
      setEditLeadId(leadParam);
    }
  }, [leadParam, syncState, mergedLeads]);
  const wsEmpty = Boolean(ws) && LEADS.length === 0;
  const [filter, setFilter] = React.useState('all');
  const [stageFilter, setStageFilter] = React.useState('all');
  const [sortByScore, setSortByScore] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const term = search.trim().toLowerCase();
  const filtered = LEADS.filter(l =>
    (filter === 'all' || l.type === filter) &&
    (stageFilter === 'all' || l.stage === stageFilter) &&
    (!term || l.name.toLowerCase().includes(term) || l.source.toLowerCase().includes(term) || l.stage.toLowerCase().includes(term))
  );
  const visibleLeads = sortByScore ? filtered.slice().sort((a, b) => (b.score || 0) - (a.score || 0)) : filtered;
  const stageTone = { New: 'info', Contact: 'moon', Qualified: 'success', Lost: 'danger' };
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
  // returned real id replaces the local one so a later edit takes the update path.
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

  // 리드 → 딜 전환. Creates a deal seeded from the lead (value accepts '₩1.2M' style — parsed
  // server-side by buildDealWrite), logs a [전환] activity, then deep-links to the pipeline.
  // Preview (DB down): keep the drawer open and surface an inline note near the button.
  const [converting, setConverting] = React.useState(false);
  const convertLeadToDeal = async () => {
    if (!editingLead || converting) return;
    setConverting(true);
    setConvertNote(null);
    const r = await saveRevenueRecord('deal', 'create', {
      name: editingLead.name,
      type: editingLead.type,
      stage: 'qual',
      value: editingLead.value,
      ...(editingLead.workspace ? { workspace: editingLead.workspace } : (ws ? { workspace } : {})),
    });
    setConverting(false);
    if (r.ok && r.id) {
      saveActivity('create', {
        leadId: String(editingLead.id).startsWith('local-lead-') ? null : editingLead.id,
        entityType: 'lead',
        kind: 'deal',
        body: `[전환] ${editingLead.name} → 딜 생성`,
      }).catch(() => {});
      const target = ws ? 'dashboard/classin/pipeline' : 'dashboard/revenue/deals';
      onNavigate?.(`${target}?deal=${r.id}`);
    } else {
      setConvertNote({
        tone: r.status === 'preview' ? 'neutral' : 'danger',
        text: r.status === 'preview'
          ? '저장 위치(Supabase)가 설정되지 않아 딜을 생성할 수 없습니다.'
          : '딜 전환에 실패했습니다. 다시 시도하세요.',
      });
    }
  };

  // 스코어 재계산 — POST the existing followups recompute action, then reload the ledger in place.
  // Same-origin write (operator session/origin covers the guard, like the other Revenue writes).
  const recomputeScores = async () => {
    if (recomputing) return;
    setRecomputing(true);
    try {
      const resp = await fetch('/api/hub/followups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'recompute-scores' }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && (data.status === 'ok' || data.status === 'skipped')) {
        showToast(data.status === 'ok' ? '스코어 재계산 완료' : '재계산 완료 · 반영할 리드 없음');
        reload();
      } else {
        showToast('스코어 재계산 실패 · 다시 시도하세요');
      }
    } catch {
      showToast('스코어 재계산 실패 · 다시 시도하세요');
    } finally {
      setRecomputing(false);
    }
  };

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
        <SegmentedControl
          className="hub-toolbar"
          style={{ marginRight: 8 }}
          options={[{ key: 'all', label: 'All' }, { key: 'personal', label: 'Personal', dot: 'personal' }, { key: 'company', label: 'Company', dot: 'company' }]}
          value={filter}
          onChange={setFilter}
        />
        <Input className="hub-toolbar" placeholder="이름·소스·단계 검색…" icon="search" value={search} onChange={setSearch} />
        <button className="hub-toolbar" onClick={() => setSortByScore(v => !v)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', fontSize: 11.5, borderRadius: 999,
          border: `1px solid ${sortByScore ? 'var(--line-strong)' : 'var(--line-soft)'}`,
          color: sortByScore ? 'var(--fg)' : 'var(--fg-muted)',
          background: sortByScore ? 'var(--surface-3)' : 'var(--surface-2)',
        }}>
          <Dot tone="success" />
          Score
        </button>
        <Button className="hub-toolbar" variant="ghost" size="xs" icon="bolt" onClick={recomputeScores} disabled={recomputing} style={{ marginLeft: 4 }}>
          {recomputing ? '재계산 중…' : '스코어 재계산'}
        </Button>
        <div style={{ width: 8 }} />
        <Button variant="secondary" size="sm" icon="plus" onClick={() => cardFileRef.current?.click()}>명함</Button>
        <input ref={cardFileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onCardFile} />
        <div style={{ width: 6 }} />
        <Button variant="primary" size="sm" icon="plus" onClick={createLead}>Lead</Button>
      </div>

      {!wsEmpty && LEADS.length > 0 && (
        <div className="hub-toolbar" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {Object.keys(stageTone).map(st => {
            const count = LEADS.filter(l => l.stage === st).length;
            const active = stageFilter === st;
            return (
              <button key={st} onClick={() => setStageFilter(active ? 'all' : st)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 10px', fontSize: 11.5, borderRadius: 999,
                border: `1px solid ${active ? 'var(--line-strong)' : 'var(--line-soft)'}`,
                background: active ? 'var(--surface-3)' : 'var(--surface)',
                color: active ? 'var(--fg)' : 'var(--fg-muted)',
              }}>
                <Dot tone={stageTone[st]} />
                {st}
                <span className="mono" style={{ fontSize: 10.5, color: active ? 'var(--fg)' : 'var(--fg-faint)' }}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

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
              <Button variant="ghost" size="xs" onClick={() => { reload(); setCardState(null); }}>목록 새로고침</Button>
            )}
            {(s === 'review' || s === 'rejected') && (
              <Button variant="ghost" size="xs" iconRight="arrowRight" onClick={() => onNavigate?.('dashboard/classin/intake')}>인박스에서 검토 →</Button>
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
            title={`${ws.label} — 아직 연결된 리드가 없습니다.`}
            description={`${ws.label} 워크스페이스에 매칭되는 리드가 없습니다. 리드를 등록하거나 원장에 ${ws.label} 태그가 연결되면 여기에 표시됩니다.`}
            style={{ minHeight: 200, padding: '28px 12px' }}
          />
        </Card>
      )}

      {!wsEmpty && (
      <Card pad={false} className="hub-table-card">
        <div style={{ display: 'grid', gridTemplateColumns: LEADS_GRID, gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--line-soft)', fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          <span /><span>Name</span><span>Type</span><span>Source</span><span>Stage</span><span>Score</span><span>Value</span><span>Owner</span><span style={{ textAlign: 'right' }}>Last</span>
        </div>
        {filtered.length === 0 && (
          <div style={{ padding: '36px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Iconed name="search" size={20} style={{ color: 'var(--fg-faint)' }} />
            <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>일치하는 리드가 없습니다.</div>
            <div style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>
              {term ? <>"<span className="mono">{search}</span>" 검색 결과 0건 · 필터: {filter}{stageFilter !== 'all' ? ` · ${stageFilter}` : ''}</> : <>필터: {filter}{stageFilter !== 'all' ? ` · ${stageFilter}` : ''} · {LEADS.length}건 중 0건</>}
            </div>
          </div>
        )}
        {visibleLeads.map((l, i) => (
          <div key={l.id} style={{
            display: 'grid', gridTemplateColumns: LEADS_GRID, gap: 12,
            padding: '12px 16px', alignItems: 'center', cursor: 'pointer',
            borderBottom: i < visibleLeads.length - 1 ? '1px solid var(--line-soft)' : 'none',
          }}
            onClick={() => setEditLeadId(l.id)}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ paddingRight: 4, display: 'flex' }}>
              <Avatar name={l.name.replace(/^.*—\s*/, '')} size={22} tone={l.type === 'personal' ? 'personal' : 'company'} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</div>
              <LeadTagChips lead={l} />
            </div>
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
            {typeof l.score === 'number' && l.score > 0 ? (
              <span className="mono" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Dot tone={l.score >= 70 ? 'success' : l.score >= 40 ? 'warning' : 'neutral'} />{l.score}
              </span>
            ) : (
              <span className="mono" style={{ fontSize: 12, color: 'var(--fg-faint)' }}>—</span>
            )}
            <span className="mono" style={{ fontSize: 12 }}>{l.value}</span>
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
          { key: 'situation', label: '현재 상황', placeholder: '검토중 · 경쟁사 사용 · 예산확보…' },
          { key: 'units', label: '도입 댓수', inputType: 'number', placeholder: '0' },
          { key: 'stage', label: '단계', type: 'select', options: [{ value: 'New', label: 'New' }, { value: 'Contact', label: 'Contact' }, { value: 'Qualified', label: 'Qualified' }, { value: 'Lost', label: 'Lost' }] },
          { key: 'value', label: '금액', placeholder: '₩0' },
          { key: 'owner', label: '담당' },
        ]}
        onChange={(key, val) => setLeadEdits(prev => ({ ...prev, [editLeadId]: { ...prev[editLeadId], [key]: val } }))}
        onSave={persistLead}
        onDelete={deleteLead}
        onClose={() => { setEditLeadId(null); setConvertNote(null); }}
      >
        {editingLead && (
          <DrawerTimeline entityType="lead" entityId={editingLead.id} title="활동 타임라인" />
        )}
      </EditDrawer>

      {/* 리드 → 딜 전환 — anchored above the EditDrawer footer. Non-local leads only. */}
      {editingLead && !String(editLeadId).startsWith('local-lead-') && (
        <div style={{
          position: 'fixed', right: 0, bottom: 60, zIndex: 62,
          width: 'min(380px, 92vw)',
          padding: '10px 16px',
          borderTop: '1px solid var(--line-soft)',
          background: 'var(--surface)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {convertNote && (
            <div style={{ fontSize: 11, lineHeight: 1.4, color: convertNote.tone === 'danger' ? 'var(--danger)' : 'var(--fg-muted)' }}>
              {convertNote.text}
            </div>
          )}
          <Button
            variant={editingLead.stage === 'Qualified' ? 'primary' : 'secondary'}
            size="sm"
            icon="deals"
            onClick={convertLeadToDeal}
            disabled={converting}
          >
            {converting ? '전환 중…' : '딜로 전환'}
          </Button>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', right: 20, bottom: 20, zIndex: 70,
          maxWidth: 'min(360px, calc(100vw - 40px))',
          padding: '11px 14px',
          background: 'var(--surface)',
          border: '1px solid var(--line-soft)',
          borderRadius: 'var(--r-lg)',
          boxShadow: '0 8px 24px -12px oklch(0 0 0 / 0.55)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.45 }}>{toast.text}</span>
        </div>
      )}
    </div>
  );
}

export function Deals({ workspace, onNavigate }) {
  const { ledger, syncState } = useRevenueLedger();
  const searchParams = useSearchParams();
  const DEAL_STAGES = ledger.stages;
  const [deals, setDeals] = React.useState(ledger.deals);
  const [drag, setDrag] = React.useState(null);
  const [overStage, setOverStage] = React.useState(null);
  const [filter, setFilter] = React.useState('all');
  const [stalledOnly, setStalledOnly] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [editDealId, setEditDealId] = React.useState(null);
  const [editDealPrevStage, setEditDealPrevStage] = React.useState(null);
  const [queuedDeals, setQueuedDeals] = React.useState(() => new Set()); // deals with a proposed follow-up (seeded from the queue on mount)
  const [guruDeal, setGuruDeal] = React.useState(null);
  const [guru, setGuru] = React.useState({ phase: 'idle', text: '', state: null });
  const [guruSaved, setGuruSaved] = React.useState(false); // '활동으로 저장' one-shot in the diagnosis drawer
  const [toast, setToast] = React.useState(null); // { text, action? } — transient bottom-right feedback
  const toastTimerRef = React.useRef(null);

  // Show a transient toast (auto-dismiss ~4s). `action` = { label, go } renders a mini link button.
  const showToast = React.useCallback((text, action = null) => {
    setToast({ text, action });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);
  React.useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  // Seed the queued set once from the approval queue so already-proposed follow-ups render as
  // "queued" (no double-proposing). Only kind 'followup' orders with a dealId count.
  const queueSeededRef = React.useRef(false);
  React.useEffect(() => {
    if (queueSeededRef.current) return;
    queueSeededRef.current = true;
    let active = true;
    (async () => {
      try {
        const resp = await fetch('/api/hub/work-orders?status=proposed', { cache: 'no-store' });
        const data = await resp.json().catch(() => null);
        const orders = Array.isArray(data?.orders) ? data.orders : [];
        const ids = orders.filter(o => o.kind === 'followup' && o.dealId).map(o => o.dealId);
        if (active && ids.length) setQueuedDeals(prev => { const next = new Set(prev); ids.forEach(id => next.add(id)); return next; });
      } catch {
        // queue unreachable — leave the set as-is
      }
    })();
    return () => { active = false; };
  }, []);

  // Propose a follow-up work order for a stalled deal. Optimistic: the card flags "제안됨"
  // immediately; the queue item lands in work_orders (status 'proposed') for operator approval.
  const queueFollowup = async (deal) => {
    if (queuedDeals.has(deal.id)) return;
    setQueuedDeals(prev => new Set(prev).add(deal.id));
    try {
      await fetch('/api/hub/work-orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          persona: 'guru',
          kind: 'followup',
          title: `${deal.name} — ${deal.age}d 정체 follow-up`,
          dealId: String(deal.id).startsWith('LOCAL-') ? null : deal.id,
          source: 'manual',
          body: { reason: 'stalled', age: deal.age, stage: deal.stage, value: deal.value },
        }),
      });
    } catch {
      // optimistic — leave the flag set even if the queue write is unreachable
    }
    showToast('follow-up 제안이 큐에 추가됨 · Daily Brief에서 승인', { label: '브리프 열기', go: 'dashboard/daily-brief' });
  };

  // Sync local deals state when live data arrives
  React.useEffect(() => {
    setDeals(ledger.deals);
  }, [ledger.deals]);
  const editingDeal = editDealId ? deals.find(d => d.id === editDealId) : null;

  React.useEffect(() => {
    if (!guruDeal) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setGuruDeal(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guruDeal]);

  const ws = getWorkspace(workspace);
  const scopedDeals = filterDealsByWorkspace(deals, workspace);
  const wsEmpty = Boolean(ws) && scopedDeals.length === 0;

  // Join a deal back to its lead (by leadId) so the drawer can link out and the kanban card can
  // surface region/units chips. Keyed on the live ledger's leads; empty in preview/mock.
  const leadById = React.useMemo(() => {
    const m = new Map();
    (ledger.leads || []).forEach(l => { if (l && l.id != null) m.set(String(l.id), l); });
    return m;
  }, [ledger.leads]);
  const leadForDeal = (deal) => (deal && deal.leadId != null ? leadById.get(String(deal.leadId)) || null : null);

  const term = search.trim().toLowerCase();
  const isStalled = (d) => d.stage !== 'won' && d.stage !== 'lost' && Number(d.age) > 10;
  const matches = (d) => (filter === 'all' || d.type === filter)
    && (!stalledOnly || isStalled(d))
    && (!term || String(d.name || '').toLowerCase().includes(term) || String(d.owner || '').toLowerCase().includes(term));
  const totals = DEAL_STAGES.reduce((acc, s) => {
    const items = scopedDeals.filter(d => d.stage === s.key && matches(d));
    acc[s.key] = { count: items.length, sum: items.reduce((a, b) => a + b.value, 0) };
    return acc;
  }, {});
  // Header total stays the true pipeline (type filter only) — stalledOnly narrows the board, not the fact.
  const grandTotal = scopedDeals.filter(d => filter === 'all' || d.type === filter).reduce((a, b) => a + b.value, 0);
  const stalledCount = scopedDeals.filter(d => (filter === 'all' || d.type === filter) && isStalled(d)).length;
  const openDealEditor = (deal) => {
    setEditDealPrevStage(deal?.stage ?? null);
    setEditDealId(deal?.id ?? null);
  };
  const fireStageTransition = (deal, from, to) => {
    if (!deal || String(deal.id).toLowerCase().startsWith('local-') || from === to) return;
    if (to === 'won' && from !== 'won') {
      fetch('/api/hub/work-orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          persona: 'guru',
          kind: 'onboarding',
          title: `[Won] ${deal.name} 온보딩 시작 제안`,
          dealId: deal.id,
          body: { reason: 'won-trigger', stage_from: from, value: deal.value },
          source: 'manual',
        }),
      }).catch(() => {});
      saveActivity('create', {
        dealId: deal.id,
        entityType: 'deal',
        kind: 'deal',
        body: `[Won] ${deal.name} — 계약 성사 (${from} → won)`,
      }).catch(() => {});
      showToast('온보딩 제안 생성됨 · 승인 대기', { label: '브리프 열기', go: 'dashboard/daily-brief' });
    }
    if (to === 'lost' && from !== 'lost') {
      saveActivity('create', {
        dealId: deal.id,
        entityType: 'deal',
        kind: 'update',
        body: `[Lost] ${deal.name} — 실패 처리 (${from} → lost)`,
      }).catch(() => {});
    }
  };
  const openGuruDiagnosis = async (deal) => {
    setGuruDeal(deal);
    setGuruSaved(false);
    setGuru({ phase: 'loading', text: '', state: null });
    try {
      const r = await requestGuruCoaching({ mode: 'deal-review', ref: deal.id });
      setGuru({ phase: 'done', text: r.text || r.note || '', state: r.state });
    } catch (err) {
      setGuru({ phase: 'done', text: err instanceof Error ? err.message : '진단 요청에 실패했습니다.', state: 'error' });
    }
  };

  // Save the Guru diagnosis as a deal note (crm_activities). Truncate the body at ~2000 chars.
  const saveGuruDiagnosis = async () => {
    if (!guruDeal || guruSaved) return;
    const body = `[Guru 진단] ${guru.text}`.slice(0, 2000);
    const r = await saveActivity('create', {
      dealId: String(guruDeal.id).toLowerCase().startsWith('local-') ? null : guruDeal.id,
      entityType: 'deal',
      kind: 'note',
      body,
    });
    if (r.ok) setGuruSaved(true);
  };

  // Deep-link: ?deal=<id> opens that deal's EditDrawer; ?deal=<id>&guru=1 opens the Guru
  // diagnosis drawer instead. One-shot per param value; silent if the deal isn't in the list.
  const dealParam = searchParams.get('deal');
  const guruParam = searchParams.get('guru');
  const consumedDealRef = React.useRef(null);
  React.useEffect(() => {
    if (!dealParam || syncState === 'loading') return;
    const token = `${dealParam}:${guruParam || ''}`;
    if (consumedDealRef.current === token) return;
    const target = deals.find(d => String(d.id) === String(dealParam));
    if (!target) return;
    consumedDealRef.current = token;
    if (guruParam === '1') openGuruDiagnosis(target);
    else openDealEditor(target);
  }, [dealParam, guruParam, syncState, deals]);

  const move = (id, to) => {
    const cur = deals.find(d => d.id === id);
    setDeals(ds => ds.map(d => (d.id === id ? { ...d, stage: to } : d)));
    // Persist the stage change in the background; the optimistic move stands regardless.
    // Unsaved local cards (no DB id) only persist once saved through the drawer.
    if (!String(id).toLowerCase().startsWith('local-')) {
      saveRevenueRecord('deal', 'update', { id, stage: to });
    }
    if (cur) fireStageTransition(cur, cur.stage, to);
  };
  const createDeal = () => {
    const id = `LOCAL-${Date.now().toString().slice(-4)}`;
    const deal = {
      id,
      name: '새 딜',
      type: filter === 'personal' || filter === 'company' ? filter : 'company',
      stage: DEAL_STAGES[0]?.key || 'lead',
      value: 0,
      owner: 'Me',
      close: '미정',
      age: 0,
      // Tag in-workspace creates so the scoped pipeline doesn't silently drop them.
      ...(ws ? { workspace } : {}),
    };
    setDeals(prev => [deal, ...prev]);
    openDealEditor(deal); // open the editor immediately so the new deal can be filled in
  };

  // Persist the drawer edit. New local rows (id `LOCAL-…`) insert; on success the returned
  // real id replaces the local one so a later edit takes the update path. `close` (free-text)
  // and `owner` are not reversed back to expected_close_at / owner_id — best-effort by design.
  const persistDeal = async () => {
    if (!editingDeal) return { ok: false, status: 'error' };
    const isNew = String(editDealId).toLowerCase().startsWith('local-');
    const savedDeal = { ...editingDeal };
    const r = await saveRevenueRecord('deal', isNew ? 'create' : 'update', editingDeal);
    if (r.ok && isNew && r.id) {
      const realId = r.id;
      savedDeal.id = realId;
      setDeals(ds => ds.map(d => (d.id === editDealId ? { ...d, id: realId } : d)));
      setEditDealId(realId);
    }
    if (r.ok && editDealPrevStage && editDealPrevStage !== savedDeal.stage && (savedDeal.stage === 'won' || savedDeal.stage === 'lost')) {
      fireStageTransition(savedDeal, editDealPrevStage, savedDeal.stage);
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

  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)', height: '100%' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Deals</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
            Pipeline <span className="mono" style={{ color: 'var(--fg)' }}>{fmt(grandTotal)}</span> across {DEAL_STAGES.length} stages
            <SyncBadge state={syncState} />
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <SegmentedControl
          className="hub-toolbar"
          style={{ marginRight: 8 }}
          options={[{ key: 'all', label: 'All' }, { key: 'personal', label: 'Personal' }, { key: 'company', label: 'Company' }]}
          value={filter}
          onChange={setFilter}
        />
        <Input className="hub-toolbar" placeholder="딜·담당 검색…" icon="search" value={search} onChange={setSearch} style={{ marginRight: 8 }} />
        {stalledCount > 0 && (
          <button
            onClick={() => setStalledOnly(v => !v)}
            title={stalledOnly ? '전체 딜 보기' : '정체 딜만 보기'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', fontSize: 11.5, borderRadius: 999, marginRight: 8,
              border: `1px solid ${stalledOnly ? 'var(--line-strong)' : 'var(--line-soft)'}`,
              background: stalledOnly ? 'var(--danger-bg)' : 'var(--surface-2)',
              color: 'var(--danger)',
            }}
          >
            <Iconed name="clock" size={11} />
            {stalledCount} stalled
          </button>
        )}
        <Button variant="primary" size="sm" icon="plus" onClick={createDeal}>Deal</Button>
      </div>

      {wsEmpty && (
        <Card>
          <EmptyState
            icon="deals"
            title={`${ws.label} — 아직 연결된 딜이 없습니다.`}
            description={`${ws.label} 워크스페이스에 매칭되는 딜이 없습니다. 딜을 등록하거나 원장에 ${ws.label} 태그가 연결되면 파이프라인이 채워집니다.`}
            style={{ minHeight: 200, padding: '28px 12px' }}
          />
        </Card>
      )}

      {!wsEmpty && (
      <div className="hub-scroll-x" style={{ display: 'flex', gap: 'var(--gap)', overflowX: 'auto', flex: 1, paddingBottom: 4 }}>
        {DEAL_STAGES.map(s => {
          const items = scopedDeals.filter(d => d.stage === s.key && matches(d));
          const isOver = Boolean(drag) && overStage === s.key;
          return (
            <div key={s.key}
              onDragOver={e => { e.preventDefault(); if (drag) setOverStage(s.key); }}
              onDragLeave={() => setOverStage(cur => (cur === s.key ? null : cur))}
              onDrop={() => { if (drag) move(drag, s.key); setOverStage(null); }}
              style={{
                width: 260, flexShrink: 0,
                background: isOver ? 'var(--surface-2)' : 'var(--surface)',
                border: `1px solid ${isOver ? 'var(--line-strong)' : 'var(--line-soft)'}`,
                borderRadius: 'var(--r-lg)',
                display: 'flex', flexDirection: 'column',
                transition: 'background .12s ease, border-color .12s ease',
              }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-soft)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Dot tone={s.color} />
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{s.label}</span>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginLeft: 'auto' }}>{totals[s.key].count}</span>
                </div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 4 }}>{fmt(totals[s.key].sum)}</div>
              </div>
              <div className="scroll-y" style={{ flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 100 }}>
                {items.map(d => (
                  <div key={d.id}
                    draggable
                    onClick={() => openDealEditor(d)}
                    onDragStart={() => setDrag(d.id)}
                    onDragEnd={() => { setDrag(null); setOverStage(null); }}
                    style={{
                      background: 'var(--surface-2)',
                      border: '1px solid var(--line-soft)',
                      borderRadius: 'var(--r-sm)',
                      padding: '10px 11px', cursor: 'grab',
                      opacity: drag === d.id ? 0.4 : 1,
                    }}>
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 6 }}>
                      <span className="mono" style={{ fontSize: 9.5, color: 'var(--fg-faint)' }}>{d.id}</span>
                      <div style={{ flex: 1 }} />
                      {d.age > 10 && s.key !== 'won' && s.key !== 'lost' && (
                        <IconButton
                          icon="queue"
                          size={20}
                          iconSize={12}
                          tooltip={queuedDeals.has(d.id) ? '큐에 있음' : 'follow-up 작업 큐에 추가'}
                          onClick={(e) => { e.stopPropagation(); if (!queuedDeals.has(d.id)) queueFollowup(d); }}
                          style={queuedDeals.has(d.id) ? { color: 'var(--moon-200)' } : undefined}
                        />
                      )}
                      <IconButton
                        icon="sparkle"
                        size={20}
                        iconSize={12}
                        tooltip="Guru에게 진단 요청"
                        onClick={(e) => { e.stopPropagation(); openGuruDiagnosis(d); }}
                      />
                      <Badge tone={d.type === 'personal' ? 'personal' : 'company'} size="xs">
                        {d.type === 'personal' ? 'P' : 'C'}
                      </Badge>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.4, marginBottom: 8 }}>{d.name}</div>
                    <DealLeadMiniChips lead={leadForDeal(d)} />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span className="mono" style={{ fontSize: 12, color: 'var(--moon-200)' }}>{fmt(d.value)}</span>
                      <span style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{d.close}</span>
                    </div>
                    {isStalled(d) && (
                      <div style={{ marginTop: 6, fontSize: 10, color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Iconed name="clock" size={10} /> {d.age}d stalled
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      )}

      {guruDeal && (
        <Drawer
          title="Guru 딜 진단"
          subtitle={`${guruDeal.name} · ${guruDeal.stage} · ${fmt(guruDeal.value)}`}
          onClose={() => setGuruDeal(null)}
          width="min(440px, 92vw)"
          borderLeft="var(--line-soft)"
          footerStyle={{ flexWrap: 'wrap' }}
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => openGuruDiagnosis(guruDeal)} disabled={guru.phase === 'loading'}>다시 진단</Button>
              {guru.phase === 'done' && guru.state === 'done' && (
                <Button variant="outline" size="sm" icon="edit" onClick={saveGuruDiagnosis} disabled={guruSaved}>
                  {guruSaved ? '저장됨' : '활동으로 저장'}
                </Button>
              )}
              <div style={{ flex: 1 }} />
              {guruDeal.age > 10 && guruDeal.stage !== 'won' && guruDeal.stage !== 'lost' ? (
                <Button variant="primary" size="sm" icon="queue" onClick={() => queueFollowup(guruDeal)}>follow-up 큐에 추가</Button>
              ) : (
                <Button variant="primary" size="sm" iconRight="arrowRight" onClick={() => onNavigate?.(guruChatPath({ mode: 'deal-review', ref: guruDeal.id }))}>Chat에서 이어가기</Button>
              )}
            </>
          }
        >
          {guru.phase === 'loading' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--fg-muted)' }}>
              <div style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--moon-300)', boxShadow: '0 0 8px var(--moon-300)', animation: 'mlMoonPulse 1.2s ease-in-out infinite' }} />
              컨텍스트 조립 → Engine 진단 중…
            </div>
          )}
          {guru.phase === 'done' && guru.state === 'done' && (
            <div style={{ fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{guru.text}</div>
          )}
          {guru.phase === 'done' && guru.state === 'preview' && (
            <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.55 }}>
              <Badge tone="neutral" size="xs">preview</Badge>
              <span style={{ marginLeft: 8 }}>Engine이 아직 연결되지 않아 코칭을 생성할 수 없습니다. (COM_MOON_ENGINE_URL 미설정)</span>
            </div>
          )}
          {guru.phase === 'done' && guru.state === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 12, color: 'var(--danger)', lineHeight: 1.55 }}>
                Guru 진단에 실패했습니다. 잠시 후 다시 시도하세요.
              </div>
              <Button variant="ghost" size="sm" onClick={() => openGuruDiagnosis(guruDeal)}>다시 시도</Button>
            </div>
          )}
        </Drawer>
      )}

      {toast && (
        <div style={{
          position: 'fixed', right: 20, bottom: 20, zIndex: 70,
          maxWidth: 'min(360px, calc(100vw - 40px))',
          padding: '11px 14px',
          background: 'var(--surface)',
          border: '1px solid var(--line-soft)',
          borderRadius: 'var(--r-lg)',
          boxShadow: '0 8px 24px -12px oklch(0 0 0 / 0.55)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.45 }}>{toast.text}</span>
          {toast.action && (
            <Button variant="ghost" size="xs" iconRight="arrowRight" onClick={() => { onNavigate?.(toast.action.go); setToast(null); }}>{toast.action.label}</Button>
          )}
        </div>
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
        onClose={() => { setEditDealId(null); setEditDealPrevStage(null); }}
      >
        {editingDeal && (() => {
          const linkedLead = leadForDeal(editingDeal);
          // Mirror convertLeadToDeal's path pick: in-workspace → classin, else the flat leads route.
          const leadPath = ws ? 'dashboard/classin/revenue' : 'dashboard/revenue/leads';
          return (
            <>
              {linkedLead && (
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4,
                  padding: 10, background: 'var(--surface-2)',
                  border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-faint)' }}>연결된 리드</span>
                    <div style={{ flex: 1 }} />
                    <Button variant="ghost" size="xs" iconRight="arrowRight" onClick={() => onNavigate?.(`${leadPath}?lead=${linkedLead.id}`)}>리드 열기</Button>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--fg)' }}>{linkedLead.name}</div>
                  <LeadTagChips lead={linkedLead} />
                </div>
              )}
              <DrawerTimeline entityType="deal" entityId={editingDeal.id} title="활동 타임라인" />
            </>
          );
        })()}
      </EditDrawer>
    </div>
  );
}

// Shared grid template for Cases — gap added so Type/Priority/Status chips never butt the next column
const CASES_GRID = '80px 1fr 160px 112px 100px 100px 110px 90px';

export function Cases({ onNavigate }) {
  const { ledger, syncState } = useRevenueLedger();
  const [localCases, setLocalCases] = React.useState([]);
  const [caseEdits, setCaseEdits] = React.useState({}); // { [id]: patch } — overlays any case
  const [deletedCaseIds, setDeletedCaseIds] = React.useState(() => new Set());
  const [editCaseId, setEditCaseId] = React.useState(null);
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const ledgerCases = ledger.source === 'supabase'
    ? (Array.isArray(ledger.cases) ? ledger.cases : [])
    : (Array.isArray(ledger.cases) ? ledger.cases : FALLBACK_CASES);
  const cases = [...localCases, ...ledgerCases]
    .filter(c => !deletedCaseIds.has(c.id))
    .map(c => (caseEdits[c.id] ? { ...c, ...caseEdits[c.id] } : c));
  const term = search.trim().toLowerCase();
  // Signal first: keep incoming order but sink resolved cases below live ones.
  const visibleCases = cases.filter(c =>
    (statusFilter === 'all' || c.status === statusFilter) &&
    (typeFilter === 'all' || c.type === typeFilter) &&
    (!term || String(c.title || '').toLowerCase().includes(term) || String(c.account || '').toLowerCase().includes(term))
  )
    .slice()
    .sort((a, b) => Number(a.status === 'Resolved') - Number(b.status === 'Resolved'));
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
    setEditCaseId(id);
  };

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

  const deleteCase = async () => {
    if (!editCaseId) return { ok: false };
    const isLocal = String(editCaseId).startsWith('CASE-');
    setLocalCases(prev => prev.filter(c => c.id !== editCaseId));
    setDeletedCaseIds(prev => new Set(prev).add(editCaseId));
    if (isLocal) return { ok: true, status: 'local' };
    return saveRevenueRecord('case', 'delete', { id: editCaseId });
  };

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
        <SegmentedControl
          className="hub-toolbar"
          style={{ marginRight: 8 }}
          options={[{ key: 'all', label: 'All' }, { key: 'personal', label: 'Personal', dot: 'personal' }, { key: 'company', label: 'Company', dot: 'company' }]}
          value={typeFilter}
          onChange={setTypeFilter}
        />
        <Input className="hub-toolbar" placeholder="제목·계정 검색…" icon="search" value={search} onChange={setSearch} />
        <div style={{ width: 8 }} />
        <SegmentedControl
          className="hub-toolbar"
          style={{ marginRight: 8 }}
          options={[{ key: 'all', label: 'All' },{ key: 'Open', label: 'Open' },{ key: 'Waiting', label: 'Waiting' },{ key: 'Resolved', label: 'Resolved' }].map(t => ({
            ...t,
            count: t.key === 'all' ? cases.length : cases.filter(c => c.status === t.key).length,
          }))}
          value={statusFilter}
          onChange={setStatusFilter}
        />
        <Button variant="primary" size="sm" icon="plus" onClick={createCase}>Case</Button>
      </div>
      <Card pad={false} className="hub-table-card">
        <div style={{ display: 'grid', gridTemplateColumns: CASES_GRID, gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--line-soft)', fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          <span>ID</span><span>Title</span><span>Account</span><span>Type</span><span>Priority</span><span>Status</span><span>Opened</span><span style={{ textAlign: 'right' }}>Owner</span>
        </div>
        {visibleCases.length === 0 && (
          <EmptyState
            icon="cases"
            title={statusFilter !== 'all' && cases.length > 0 ? `${statusFilter} 상태의 케이스가 없습니다` : '운영 케이스가 없습니다'}
            description={statusFilter !== 'all' && cases.length > 0
              ? '상태 필터를 All로 되돌리면 전체 케이스가 표시됩니다.'
              : syncState === 'live' ? 'Supabase operation_cases 원장에 표시할 케이스가 없습니다.' : '지원/운영 이슈가 생기면 계정과 함께 표시됩니다.'}
          />
        )}
        {visibleCases.map((c, i) => (
          <div key={c.id} style={{
            display: 'grid', gridTemplateColumns: CASES_GRID, gap: 12,
            padding: '12px 16px', alignItems: 'center', cursor: 'pointer',
            borderBottom: i < visibleCases.length - 1 ? '1px solid var(--line-soft)' : 'none',
          }}
            onClick={() => setEditCaseId(c.id)}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{c.id}</span>
            <span style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</span>
            <span
              onClick={(e) => {
                if (!c.account || c.account === '—') return;
                e.stopPropagation();
                onNavigate?.('dashboard/revenue/accounts?acct=' + encodeURIComponent(c.account));
              }}
              onMouseEnter={e => { if (c.account && c.account !== '—') e.currentTarget.style.color = 'var(--moon-300)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-muted)'; }}
              style={{
                fontSize: 12, color: 'var(--fg-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                cursor: c.account && c.account !== '—' ? 'pointer' : 'default',
              }}
            >
              {c.account}
            </span>
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

const ACT_ICON = {
  call: 'signal', meeting: 'calendar', info_session: 'brief', demo: 'play',
  visit: 'flag', email: 'email', update: 'bell', note: 'edit', deal: 'deals',
};
const ACT_TONE = {
  call: 'warning', meeting: 'moon', info_session: 'info', demo: 'success',
  visit: 'personal', email: 'info', update: 'neutral', note: 'neutral', deal: 'success',
};
const ACT_LABEL = {
  call: '통화', meeting: '미팅', info_session: '설명회', demo: '데모',
  visit: '방문', email: '이메일', update: '소식', note: '노트', deal: '딜',
};
// Kinds offered in the Activity composer. Notes live in their own tab, so 'note' is excluded here.
const ACTIVITY_KIND_OPTIONS = ['call', 'meeting', 'info_session', 'demo', 'visit', 'email', 'update', 'deal'];

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
    { key: 'email',   icon: 'email',    label: '이메일 보내기' },
    { key: 'meeting', icon: 'calendar', label: '미팅 잡기' },
    { key: 'chat',    icon: 'chat',     label: '채팅 스레드' },
    { key: 'call',    icon: 'signal',   label: '통화 기록' },
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
                display: 'flex', alignItems: 'center', gap: 7, width: '100%',
                padding: '7px 10px', fontSize: 12, color: 'var(--fg)',
                background: 'transparent', border: 'none', borderRadius: 4,
                cursor: 'pointer', textAlign: 'left',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <Iconed name={it.icon} size={13} />
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LogComposer({ onLog }) {
  const [type, setType] = React.useState('call');
  const [text, setText] = React.useState('');
  const save = () => {
    const body = text.trim();
    if (!body) return;
    onLog({ type, msg: body });
    setText('');
    setType('call');
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
          {ACTIVITY_KIND_OPTIONS.map(k => <option key={k} value={k}>{ACT_LABEL[k]}</option>)}
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

function DetailPanel({ account, detail, onAction, onLog, onPinNote, onAddNote, onNavigate, onEdit }) {
  const [tab, setTab] = React.useState('activity');
  const [noteText, setNoteText] = React.useState('');
  const [activityKind, setActivityKind] = React.useState('all');
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
  const activityKindOptions = [
    { key: 'all', label: '전체' },
    { key: 'call', label: '통화' },
    { key: 'meeting', label: '미팅' },
    { key: 'info_session', label: '설명회' },
    { key: 'demo', label: '데모' },
    { key: 'visit', label: '방문' },
  ];
  const visibleActivity = d.activity.length > 15 && activityKind !== 'all'
    ? d.activity.filter(a => a.type === activityKind)
    : d.activity;
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
                <div style={{ fontSize: 13, marginTop: 3 }}>{account.deals}</div>
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
          {onEdit && (
            <Button variant="outline" size="xs" icon="edit" onClick={() => onEdit(account)}>편집</Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} active={tab} onChange={setTab} style={{ padding: '0 var(--card-pad)' }} />

      {/* Body */}
      <div className="scroll-y" style={{ flex: 1, minHeight: 0, padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tab === 'activity' && (
          <>
            <LogComposer onLog={onLog} />
            {d.activity.length > 15 && (
              <SegmentedControl
                options={activityKindOptions}
                value={activityKind}
                onChange={setActivityKind}
              />
            )}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {visibleActivity.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--fg-faint)', padding: '12px 0' }}>아직 기록이 없습니다.</div>
              )}
              {visibleActivity.map((a, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '18px 1fr auto',
                  gap: 10, padding: '10px 0',
                  borderBottom: i < visibleActivity.length - 1 ? '1px solid var(--line-soft)' : 'none',
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
                  {(c.email || c.phone) && (
                    <div className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {c.email && <span>{c.email}</span>}
                      {c.phone && <span>{c.phone}</span>}
                    </div>
                  )}
                  {c.lastContact && <div className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginTop: 3 }}>Last: {c.lastContact}</div>}
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

export function Accounts({ onNavigate }) {
  const { ledger, syncState } = useRevenueLedger();
  const searchParams = useSearchParams();
  const [localAccounts, setLocalAccounts] = React.useState([]);
  const [accountEdits, setAccountEdits] = React.useState({}); // { [stableKey]: patch } — overlays any row
  const [deletedAccountKeys, setDeletedAccountKeys] = React.useState(() => new Set());
  const [view, setView] = React.useState(() => {
    if (typeof window === 'undefined') return 'cards';
    try {
      const saved = window.localStorage.getItem('hub:accounts-view:v1');
      return saved === 'cards' || saved === 'list' || saved === 'detail' ? saved : 'cards';
    } catch {
      return 'cards';
    }
  }); // cards | list | detail
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState('all');
  const [selected, setSelected] = React.useState(null);
  const [details, setDetails] = React.useState({});
  const [editAccountKey, setEditAccountKey] = React.useState(null); // stable key of the row being edited
  const [editOrigName, setEditOrigName] = React.useState(null); // name at open-time, to keep name-keyed selection in sync on rename
  const [accountDraft, setAccountDraft] = React.useState(null); // decoupled draft so the list stays stable while typing
  const ledgerAccounts = ledger.source === 'supabase'
    ? (Array.isArray(ledger.accounts) ? ledger.accounts : [])
    : (Array.isArray(ledger.accounts) ? ledger.accounts : FALLBACK_ACCOUNTS);
  // Attach a stable key (Supabase id, a generated local key, or name for mock rows) so edits and
  // deletes survive renames — the name-keyed selection UI keeps working on top of it.
  const ACCOUNTS = [...localAccounts, ...ledgerAccounts]
    .map(a => ({ ...a, _key: a._key || a.id || a.name }))
    .filter(a => !deletedAccountKeys.has(a._key))
    .map(a => (accountEdits[a._key] ? { ...a, ...accountEdits[a._key] } : a));

  React.useEffect(() => {
    try {
      window.localStorage.setItem('hub:accounts-view:v1', view);
    } catch {
      // ignore storage failures; the visible view state still works for this session
    }
  }, [view]);

  const term = search.trim().toLowerCase();
  const filtered = ACCOUNTS.filter(a =>
    (filter === 'all' || a.type === filter) &&
    (!term || a.name.toLowerCase().includes(term))
  );

  // Deep-link: ?acct=<accountId-or-name> selects it and switches to detail. One-shot per param
  // value; silent if no account in the merged list matches. Runs before the validity effect so a
  // matched selection sticks.
  const acctParam = searchParams.get('acct');
  const consumedAcctRef = React.useRef(null);
  React.useEffect(() => {
    if (!acctParam || syncState === 'loading') return;
    if (consumedAcctRef.current === acctParam) return;
    const hit = ACCOUNTS.find(a => String(a.id) === String(acctParam) || a.name === acctParam);
    if (!hit) return;
    consumedAcctRef.current = acctParam;
    setSelected(hit.name);
    setView('detail');
  }, [acctParam, syncState, ACCOUNTS]);

  // Keep selection valid across filter changes
  React.useEffect(() => {
    if (view === 'detail' && !filtered.find(a => a.name === selected)) {
      setSelected(filtered[0]?.name ?? null);
    }
  }, [view, filtered, selected]);

  // Detail for the panel. Live mode: local `details[name]` (fetched activity/notes) wins; when it
  // carries no contacts, surface the ledger row's `account.contacts`. Mock mode keeps ACCOUNT_DETAIL.
  // Never mix live account + mock contacts — a live account with no contacts stays empty.
  const getDetail = (account) => {
    const name = typeof account === 'string' ? account : account?.name;
    const isLive = ledger.source === 'supabase';
    const base = details[name] || (isLive ? null : ACCOUNT_DETAIL[name]) || emptyDetail();
    if (isLive && typeof account === 'object' && account) {
      const hasLocalContacts = Array.isArray(base.contacts) && base.contacts.length > 0;
      if (!hasLocalContacts) {
        return { ...base, contacts: Array.isArray(account.contacts) ? account.contacts : [] };
      }
    }
    return base;
  };

  const tmpId = () => `tmp-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  // Optimistically prepend an activity entry, returning the full row (with temp id) for reconciliation.
  const pushActivity = (name, entry) => {
    const full = { id: entry.id || tmpId(), at: '방금', who: 'Me', ...entry };
    setDetails(prev => {
      const cur = prev[name] || emptyDetail();
      return { ...prev, [name]: { ...cur, activity: [full, ...cur.activity] } };
    });
    return full;
  };

  // Persist a logged activity to crm_activities (live accounts only) and swap the temp id for the real one.
  const persistActivityEntry = (name, full) => {
    const acc = ACCOUNTS.find(a => a.name === name);
    if (!acc?.id) return; // local/mock account — session-only, matches the preview pattern
    saveActivity('create', {
      accountId: acc.id, companyId: acc.companyId || null, entityType: 'account',
      kind: full.type, body: full.msg,
    }).then(r => {
      if (!r.ok || !r.activity) return;
      setDetails(prev => {
        const cur = prev[name];
        if (!cur) return prev;
        return {
          ...prev,
          [name]: {
            ...cur,
            activity: cur.activity.map(a => a.id === full.id
              ? { id: r.activity.id, type: r.activity.kind, msg: r.activity.body, who: r.activity.who, at: r.activity.at }
              : a),
          },
        };
      });
    });
  };

  // QuickActions 'New deal' — create a real deal named after the account, then deep-link to the
  // pipeline. Preview (DB down): log the intent as an activity so the click still leaves a trace.
  const createDealForAccount = async (name) => {
    const acc = ACCOUNTS.find(a => a.name === name);
    if (!acc) return;
    const r = await saveRevenueRecord('deal', 'create', {
      name: acc.name,
      type: acc.type,
      stage: 'qual',
    });
    if (r.ok && r.id) {
      onNavigate?.(`dashboard/revenue/deals?deal=${r.id}`);
    } else {
      const full = pushActivity(name, { type: 'deal', msg: '새 딜 초안 생성' });
      persistActivityEntry(name, full);
    }
  };

  const handleAction = (name) => (kind, contactName) => {
    if (kind === 'deal') { createDealForAccount(name); return; }
    const labels = {
      email:   contactName ? `${contactName}에게 이메일 발송 기록` : '이메일 발송 기록',
      meeting: contactName ? `${contactName}와 미팅 일정 등록` : '미팅 일정 등록',
      chat:    contactName ? `${contactName} 채팅 스레드 오픈` : '채팅 스레드 오픈',
      call:    contactName ? `${contactName} 통화 기록` : '통화 기록',
      note:    '노트 추가 (간단)',
    };
    const type = kind === 'chat' || kind === 'note' ? 'update' : kind;
    const full = pushActivity(name, { type, msg: labels[kind] || `${kind} 액션` });
    persistActivityEntry(name, full);
  };

  const handleLog = (name) => ({ type, msg }) => {
    const full = pushActivity(name, { type, msg });
    persistActivityEntry(name, full);
  };

  const handlePinNote = (name) => (note) => {
    const nextPinned = !note.pinned;
    setDetails(prev => {
      const cur = prev[name] || emptyDetail();
      return {
        ...prev,
        [name]: {
          ...cur,
          notes: cur.notes.map(n => ((note.id && n.id === note.id) || n === note) ? { ...n, pinned: nextPinned } : n),
        },
      };
    });
    if (note.id && !String(note.id).startsWith('tmp-')) {
      const acc = ACCOUNTS.find(a => a.name === name);
      if (acc?.id) saveActivity('pin', { id: note.id, pinned: nextPinned });
    }
  };

  const handleAddNote = (name) => (body) => {
    const localId = tmpId();
    setDetails(prev => {
      const cur = prev[name] || emptyDetail();
      return { ...prev, [name]: { ...cur, notes: [{ id: localId, at: '방금', pinned: false, body }, ...cur.notes] } };
    });
    const acc = ACCOUNTS.find(a => a.name === name);
    if (!acc?.id) return;
    saveActivity('create', {
      accountId: acc.id, companyId: acc.companyId || null, entityType: 'account', kind: 'note', body,
    }).then(r => {
      if (!r.ok || !r.activity) return;
      setDetails(prev => {
        const cur = prev[name];
        if (!cur) return prev;
        return {
          ...prev,
          [name]: { ...cur, notes: cur.notes.map(n => n.id === localId ? { id: r.activity.id, body: r.activity.body, pinned: r.activity.pinned, at: r.activity.at } : n) },
        };
      });
    });
  };

  const selectedAcc = filtered.find(a => a.name === selected) || null;
  // Health signal counts surfaced in the header (merged from origin/real_v1's Revenue redesign).
  const warnCount = ACCOUNTS.filter(a => a.health === 'warning').length;
  const riskCount = ACCOUNTS.filter(a => a.health === 'risk').length;

  // Load a live account's saved activity/notes the first time it's opened in detail view.
  // Guarded by a ref so re-renders don't refetch (which would clobber optimistic local entries).
  const loadedActivityRef = React.useRef(new Set());
  React.useEffect(() => {
    const acc = selectedAcc;
    if (view !== 'detail' || !acc || !acc.id || loadedActivityRef.current.has(acc.id)) return undefined;
    loadedActivityRef.current.add(acc.id);
    let cancelled = false;
    fetchActivities({ accountId: acc.id }).then(res => {
      if (cancelled || res.status !== 'live') return;
      const activity = res.activities.filter(a => a.kind !== 'note')
        .map(a => ({ id: a.id, type: a.kind, msg: a.body, who: a.who, at: a.at }));
      const notes = res.activities.filter(a => a.kind === 'note')
        .map(a => ({ id: a.id, body: a.body, pinned: a.pinned, at: a.at }));
      setDetails(prev => {
        const cur = prev[acc.name] || emptyDetail();
        // Merge, don't replace: the operator may have logged entries while this fetch
        // was in flight (optimistic tmp- rows, or already-reconciled real ids the server
        // response predates). Keep any local row whose id isn't in the fetched set.
        const fetchedActivityIds = new Set(activity.map(a => a.id));
        const fetchedNoteIds = new Set(notes.map(n => n.id));
        const localActivity = (cur.activity || []).filter(a => a.id && !fetchedActivityIds.has(a.id));
        const localNotes = (cur.notes || []).filter(n => n.id && !fetchedNoteIds.has(n.id));
        return {
          ...prev,
          [acc.name]: { ...cur, activity: [...localActivity, ...activity], notes: [...localNotes, ...notes] },
        };
      });
    });
    return () => { cancelled = true; };
  }, [view, selectedAcc?.id, selectedAcc?.name]);

  const openDetail = (name) => {
    setSelected(name);
    setView('detail');
  };
  const openEditAccount = (account) => {
    if (!account) return;
    setEditAccountKey(account._key || account.id || account.name);
    setEditOrigName(account.name);
    setAccountDraft({ ...account });
  };

  const createAccount = () => {
    const newAcc = {
      _key: `local-acct-${Date.now()}`,
      name: '새 계정',
      type: filter === 'personal' || filter === 'company' ? filter : 'company',
      health: 'ok',
      value: 0,
      deals: 0,
      last: '방금',
      owner: 'Me',
      lastAt: '방금',
    };
    setLocalAccounts(prev => [newAcc, ...prev]);
    setSelected(newAcc.name);
    setView('detail');
    openEditAccount(newAcc); // open the editor immediately so the new account can be named
  };

  // Persist an account edit. Ledger rows (Supabase id) update; local rows insert. The edit is
  // reflected locally via the stable-key overlay either way, so renames never desync.
  const persistAccount = async () => {
    if (!accountDraft) return { ok: false, status: 'error' };
    const key = editAccountKey;
    const isLocal = !accountDraft.id;
    const r = await saveRevenueRecord('account', isLocal ? 'create' : 'update', accountDraft);
    setAccountEdits(prev => ({ ...prev, [key]: { ...accountDraft } }));
    // Stamp the returned DB id onto the local row so a later edit takes the update path.
    if (isLocal && r.id) setLocalAccounts(prev => prev.map(a => (a._key === key ? { ...a, id: r.id } : a)));
    if (accountDraft.name !== editOrigName && selected === editOrigName) setSelected(accountDraft.name);
    return r;
  };

  const deleteAccount = async () => {
    if (!editAccountKey) return { ok: false };
    const key = editAccountKey;
    const draftId = accountDraft?.id;
    setLocalAccounts(prev => prev.filter(a => a._key !== key));
    setDeletedAccountKeys(prev => new Set(prev).add(key));
    if (selected === editOrigName) { setSelected(null); setView('cards'); }
    if (!draftId) return { ok: true, status: 'local' };
    return saveRevenueRecord('account', 'delete', { id: draftId });
  };

  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Accounts</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
            {ACCOUNTS.filter(a => a.type === 'company').length} companies · {ACCOUNTS.filter(a => a.type === 'personal').length} individuals
            {riskCount > 0 && <span style={{ color: 'var(--danger)', marginLeft: 8 }}>위험 {riskCount}</span>}
            {warnCount > 0 && <span style={{ color: 'var(--warning)', marginLeft: 8 }}>주의 {warnCount}</span>}
            <SyncBadge state={syncState} />
          </div>
        </div>
        <div style={{ flex: 1 }} />

        {/* View mode toggle */}
        <SegmentedControl
          options={[{ key: 'cards', label: 'Cards' }, { key: 'list', label: 'List' }, { key: 'detail', label: 'Detail' }]}
          value={view}
          onChange={(k) => {
            setView(k);
            if (k === 'detail' && !selected) setSelected(filtered[0]?.name ?? null);
          }}
        />

        {/* Type filter */}
        <SegmentedControl
          options={[{ key: 'all', label: 'All' }, { key: 'personal', label: 'Personal', dot: 'personal' }, { key: 'company', label: 'Company', dot: 'company' }]}
          value={filter}
          onChange={setFilter}
        />

        <Input className="hub-toolbar" placeholder="계정 검색…" icon="search" value={search} onChange={setSearch} />
        <Button variant="primary" size="sm" icon="plus" onClick={createAccount}>Account</Button>
      </div>

      {/* Content by view */}
      {view === 'cards' && (
        <div className="hub-card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--gap)' }}>
          {filtered.map(a => (
            <Card key={a._key} interactive style={{ cursor: 'pointer' }}>
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
                  <IconButton
                    icon="edit"
                    size={24}
                    iconSize={12}
                    tooltip="계정 편집"
                    onClick={(e) => { e.stopPropagation(); openEditAccount(a); }}
                  />
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
                description={syncState === 'live' ? 'Supabase customer_accounts 원장에 표시할 계정이 없습니다.' : '필터나 검색어를 조정하면 계정을 다시 찾을 수 있습니다.'}
                action={<Button variant="primary" size="sm" icon="plus" onClick={createAccount}>Account</Button>}
              />
            </Card>
          )}
        </div>
      )}

      {view === 'list' && (
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
            <div key={a._key}
              onClick={() => openDetail(a.name)}
              style={{
                display: 'grid',
                gridTemplateColumns: '32px 1.6fr 110px 70px 110px 70px 120px 100px 100px',
                gap: 12,
                padding: '10px 16px', alignItems: 'center',
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
              <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{a.deals}</span>
              <span className="mono" style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{a.last}</span>
              <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{a.owner}</span>
              <span className="mono" style={{ textAlign: 'right', fontSize: 11, color: 'var(--fg-faint)' }}>{a.lastAt}</span>
            </div>
          ))}
          {filtered.length === 0 && (
            <EmptyState
              icon="accounts"
              title="계정이 없습니다"
              description={syncState === 'live' ? 'Supabase customer_accounts 원장이 비어 있습니다.' : '필터나 검색어를 조정하면 계정을 다시 찾을 수 있습니다.'}
            />
          )}
        </Card>
      )}

      {view === 'detail' && (
        <Card pad={false} className="hub-detail-card" style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
          <div style={{ width: '30%', minWidth: 240, borderRight: '1px solid var(--line-soft)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line-soft)', fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {filtered.length} accounts
            </div>
            <div className="scroll-y" style={{ flex: 1, minHeight: 0 }}>
              {filtered.map(a => {
                const isSel = a.name === selected;
                return (
                  <div key={a._key}
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
              detail={selectedAcc ? getDetail(selectedAcc) : null}
              onAction={selectedAcc ? handleAction(selectedAcc.name) : () => {}}
              onLog={selectedAcc ? handleLog(selectedAcc.name) : () => {}}
              onPinNote={selectedAcc ? handlePinNote(selectedAcc.name) : () => {}}
              onAddNote={selectedAcc ? handleAddNote(selectedAcc.name) : () => {}}
              onNavigate={onNavigate}
              onEdit={openEditAccount}
            />
          </div>
        </Card>
      )}

      <EditDrawer
        title={accountDraft ? (accountDraft.name || '계정 편집') : ''}
        subtitle="계정 정보 편집"
        record={accountDraft}
        fields={[
          { key: 'name', label: '계정명' },
          { key: 'type', label: '타입', type: 'select', options: [{ value: 'company', label: 'Company' }, { value: 'personal', label: 'Personal' }] },
          { key: 'health', label: '헬스', type: 'select', options: [{ value: 'ok', label: '양호' }, { value: 'warning', label: '주의' }, { value: 'risk', label: '위험' }] },
          { key: 'owner', label: '담당' },
          { key: 'note', label: '메모', placeholder: '계정 메모·다음 액션' },
        ]}
        onChange={(key, val) => setAccountDraft(prev => (prev ? { ...prev, [key]: val } : prev))}
        onSave={persistAccount}
        onDelete={deleteAccount}
        onClose={() => { setEditAccountKey(null); setEditOrigName(null); setAccountDraft(null); }}
      />
    </div>
  );
}
