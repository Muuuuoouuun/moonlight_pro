"use client";

import React from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Iconed } from "../hub-icons";
import { Badge, Dot, Card, Button, Avatar, Input, Tabs, IconButton, Divider, EmptyState, SyncBadge, Kbd, EditDrawer, SegmentedControl, ScrollShadowX, Checkbox, Progress } from "../hub-primitives";
import { requestGuruCoaching, guruChatPath } from "../guru-client";
import { useCrmKeyboard, useCrmSelection, usePageCreateHotkey } from "../use-crm-keyboard";
import { getWorkspace, filterLeadsByWorkspace, filterDealsByWorkspace, filterAccountsByWorkspace } from "../workspace-map";
import { buildLeadTagSummary } from "@/lib/sales-os/lead-view";
import { buildAccountRelationshipDetail } from "@/lib/crm-account-detail";
import { DEAL_STAGES, STAGE_FILL, STAGE_LINE } from "@/lib/deal-stages";
import { useUndoableAction, UNDO_WINDOW_MS } from "../use-undoable-action";
import { selectProjectAreaId } from "@/lib/pms-ui";
import { resolveCalendarCapabilities } from "@/lib/calendar-capabilities";
import { readRevenueCache, writeRevenueCache, clearRevenueCache } from "../revenue-shared-cache";
import { BulkBar } from "../crm-bulk-bar";

// HW/SW 딜은 100만원 미만 건도 흔해서 M 고정 포맷은 "₩0.1M" 같은 값을 만든다.
// revenue-ledger.js의 formatMoneyLabel과 같은 K/M 임계값으로 맞춘다.
const fmt = v => {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return '₩0';
  if (n >= 1000000) return '₩' + (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return '₩' + Math.round(n / 1000) + 'K';
  return '₩' + n;
};

// 다음 미팅은 방금 만든 직후(서버 왕복 전)에도 그려야 해서 클라이언트에서 포맷한다 —
// 다른 날짜 필드가 전부 repository에서 포맷돼 오는 것과 다른 이유다.
const formatMeetingTime = (iso) => {
  const d = new Date(iso || '');
  if (Number.isNaN(d.getTime())) return '미정';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
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
// position, everything else case-insensitively. With no active column (ledger/default order),
// falls back to the recency cascade below instead of the raw fetch order.
function sortLeads(list, sort) {
  if (!sort.key) return defaultSortLeads(list);
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

// Default order (no column header active): most recent contact -> most recently added ->
// order count, each newest/highest first. Rows without a parsable timestamp (missing/malformed
// data) sink to the bottom rather than breaking the sort.
function defaultSortLeads(list) {
  const timeOf = (v) => {
    const t = v ? new Date(v).getTime() : NaN;
    return Number.isFinite(t) ? t : -Infinity;
  };
  return [...list].sort((a, b) => (
    timeOf(b.lastContactAt) - timeOf(a.lastContactAt)
    || timeOf(b.createdAt) - timeOf(a.createdAt)
    || (Number(b.orderCount) || 0) - (Number(a.orderCount) || 0)
  ));
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
        tone: 'neutral',
        t: `${deal.name} — ${deal.age}d stalled`,
        s: 'follow-up 필요',
      });
    });

  const newLeads = leads.filter((lead) => lead.stage === 'New').length;
  if (newLeads > 0) {
    items.push({
      tone: 'neutral',
      t: `신규 리드 ${newLeads}건`,
      s: '분류·할당 필요',
    });
  }

  const wonDeals = deals.filter((deal) => deal.stage === 'closing');
  if (wonDeals.length > 0) {
    const wonTotal = wonDeals.reduce((sum, deal) => sum + deal.value, 0);
    items.push({
      tone: 'neutral',
      t: `Won ${wonDeals.length}건 · ${fmt(wonTotal)}`,
      s: '온보딩 킥오프',
    });
  }

  return items.slice(0, 4);
}

const EMPTY_REVENUE_LEDGER = {
  source: 'preview',
  leads: [],
  deals: [],
  stages: [],
  accounts: [],
  cases: [],
  contacts: [],
  companies: [],
  summary: null,
};

// 모듈 스코프 stale-while-revalidate 캐시 — Leads↔Deals↔Accounts↔Cases↔Customers 탭
// 전환은 훅을 리마운트하므로, 캐시 없이는 전환마다 동일한 6콜 원장을 다시 받고 스켈레톤을
// 보였다(re-audit 속도 #3). 캐시는 즉시 서빙하고 항상 배경 재검증하므로 신선도는 1 RTT다.
// 저장소는 revenue-shared-cache 공유 모듈 — ⌘K 레코드 검색이 같은 스냅샷을 재사용한다.

export function useRevenueLedger() {
  const servableCache = readRevenueCache();
  const [ledger, setLedger] = React.useState(servableCache ? servableCache.ledger : EMPTY_REVENUE_LEDGER);
  const [syncState, setSyncState] = React.useState(servableCache ? servableCache.syncState : 'preview');
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    let retryTimer = null;
    const hasServableCache = Boolean(readRevenueCache());
    // dev 리컴파일·순간 네트워크 실패로 첫 fetch가 죽으면 preview에 고착됐다 —
    // 실패 1회는 1.2초 뒤 재시도하고, 그래도 실패하면 error로 표시한다(preview는
    // "미구성"의 뜻 — 라이브 read 거부를 preview로 라벨하면 0건이 사실처럼 보인다).
    async function load(attempt = 0) {
      if (!hasServableCache) setSyncState('loading'); // 캐시 서빙 중엔 스켈레톤 없이 조용히 재검증
      try {
        const response = await fetch('/api/hub/revenue', { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (!active) return;
        if (!response.ok || !data || data.status === 'error') {
          if (attempt === 0) {
            retryTimer = setTimeout(() => { if (active) load(1); }, 1200);
          } else if (!hasServableCache) {
            setSyncState('error');
          } else {
            // 캐시를 계속 보여주되 live로 위장하지 않는다 — 재검증 실패는 partial(오래된 데이터).
            setSyncState('partial');
          }
          return;
        }
        const nextLedger = {
          source: data.source === 'supabase' ? 'supabase' : 'preview',
          leads: Array.isArray(data.leads) ? data.leads : [],
          deals: Array.isArray(data.deals) ? data.deals : [],
          stages: Array.isArray(data.stages) ? data.stages : [],
          accounts: Array.isArray(data.accounts) ? data.accounts : [],
          cases: Array.isArray(data.cases) ? data.cases : [],
          contacts: Array.isArray(data.contacts) ? data.contacts : [],
          companies: Array.isArray(data.companies) ? data.companies : [],
          summary: data.summary || null,
        };
        const nextState = data.source === 'supabase'
          ? data.status === 'partial' ? 'partial' : 'live'
          : 'preview';
        writeRevenueCache({ at: Date.now(), ledger: nextLedger, syncState: nextState });
        setLedger(nextLedger);
        setSyncState(nextState);
      } catch {
        if (!active) return;
        if (attempt === 0) {
          retryTimer = setTimeout(() => { if (active) load(1); }, 1200);
        } else if (!hasServableCache) {
          setSyncState('error');
        } else {
          setSyncState('partial');
        }
      }
    }
    load();
    return () => { active = false; clearTimeout(retryTimer); };
  }, [refreshKey]);

  const reload = React.useCallback(() => {
    // 모듈 캐시를 무효화하고 재조회 — 명함 스캔 승격 등 쓰기 직후 목록 갱신용.
    clearRevenueCache();
    setRefreshKey((k) => k + 1);
  }, []);

  return { ledger, syncState, reload };
}

// 원장 read 실패 공용 빈 상태 — Leads·Deals·Accounts의 wsEmpty 분기가 error에서도
// "N건 없음 + 생성 CTA"를 그려 read 실패가 빈 워크스페이스로 위장됐다(8차 잔여 M).
// 생성 유도는 실패 화면에서 금물: 운영자가 이미 있는 레코드를 중복 생성하게 된다.
function LedgerReadError({ noun, onRetry }) {
  return (
    <Card>
      <EmptyState
        icon="x"
        title={`${noun}을(를) 읽지 못했습니다`}
        description="지금 화면은 비어 보여도 실제 기록이 있을 수 있습니다. 새로 만들기 전에 다시 읽어 확인하세요."
        action={onRetry ? <Button variant="secondary" size="sm" icon="runs" onClick={onRetry}>다시 읽기</Button> : undefined}
        style={{ minHeight: 200, padding: '28px 12px' }}
      />
    </Card>
  );
}

// 3단 정렬 헤더(§8.1) — 컴포넌트 안에서 정의하면 렌더마다 함수 identity가 바뀌어
// React가 헤더 버튼을 매번 unmount/remount한다(re-audit 속도 #5). 모듈 스코프 1개를
// Leads·Cases·Accounts가 공유한다. 캐럿은 비활성일 때도 폭 예약.
export function SortHead({ k, sort, onToggle, children, align, className }) {
  // aria-sort는 columnheader 롤 전용이라 버튼엔 무효 — 동적 aria-label로 현재 방향을 AT에 노출.
  const dirLabel = sort.key === k ? (sort.dir === 'desc' ? '내림차순' : '오름차순') : '정렬 안 함';
  return (
    <button type="button" className={className} onClick={() => onToggle(k)} title={`${children} 기준 정렬`}
      aria-label={`${children} 기준 정렬 — 현재 ${dirLabel}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3, width: '100%',
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em',
        color: sort.key === k ? 'var(--fg-muted)' : 'var(--fg-faint)',
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
      }}>
      {children}
      <span style={{ fontSize: 10.5, opacity: sort.key === k ? 1 : 0 }}>{sort.dir === 'desc' && sort.key === k ? '▼' : '▲'}</span>
    </button>
  );
}

// Persist a Revenue drawer edit to the Supabase-backed write route. `kind` is
// 'lead' | 'deal' | 'case', `op` is 'create' | 'update' | 'delete'. Returns
// { ok, status, id } — `ok` is true only when the row actually saved; 'preview' means the
// backend isn't configured (or the DB refused the write) and the optimistic local row stands.
export async function saveRevenueRecord(kind, op, record) {
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
            <Badge tone="neutral" size="xs">영업 멘토</Badge>
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
          {/* glow 그림자 제거(§4 — 장식 광원 금지, 펄스만 live 신호) */}
          <div style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--moon-300)', animation: 'mlMoonPulse 1.4s ease-in-out infinite' }} />
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
        {/* MTD/QTD/YTD 토글 제거(2026-08-05 재감사): period를 소비하는 데이터가 없어
            클릭해도 숫자가 안 바뀌는 죽은 컨트롤이었다. 분기/연간 뷰는 서버 요약이
            생길 때 실데이터와 함께 복귀한다. */}
      </div>

      <div className="hub-grid--metrics stagger-up" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--gap)' }}>
        {[
          { l: 'MRR', v: fmt(mrr), d: formatPercentDelta(mrr, mrrPrev), tone: 'neutral' },
          { l: 'Pipeline', v: fmt(pipeline), d: `${openDeals} deals`, tone: 'neutral' },
          { l: 'Open leads', v: openLeads, d: `이번달 신규 ${newThisMonth}`, tone: 'neutral' },
          { l: 'Won MTD', v: fmt(wonMTD), d: `${wonDealsCount} deals`, tone: 'neutral' },
        ].map((k, i) => (
          <Card key={i}>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)' }}>{k.l}</div>
            <div className="stat" style={{ fontSize: 28, marginTop: 10, fontWeight: 600, lineHeight: 1.1 }}>{k.v}</div>
            <div style={{ fontSize: 11, color: k.tone === 'moon' ? 'var(--moon-300)' : k.tone === 'danger' ? 'var(--danger)' : 'var(--fg-faint)', marginTop: 6 }}>{k.d}</div>
          </Card>
        ))}
      </div>

      <div className="hub-grid--split" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 'var(--gap)' }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Pipeline by stage</div>
            <div style={{ flex: 1 }} />
            <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{fmt(pipeline)}</span>
          </div>
          <div style={{ display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--line-soft)' }}>
            {hasPipelineValue ? pipelineByStage.map(s => (
              <div key={s.key} title={`${s.label} · ${fmt(s.sum)}`} style={{
                flex: s.sum,
                background: STAGE_FILL[s.ramp],
                opacity: 0.9,
              }} />
            )) : (
              <div title="No pipeline value" style={{ flex: 1, background: 'var(--surface-3)' }} />
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
            {pipelineByStage.map(s => (
              <div key={s.key} style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: STAGE_FILL[s.ramp], flexShrink: 0 }} />
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
                <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)', textAlign: 'right' }}>{fmt(b.mrr)}</span>
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
// Leads 그리드는 무변별 컬럼 자동 숨김 때문에 컴포넌트 안 leadsGrid memo로 계산한다(28차).

export function LeadEnrichmentPanel({ lead }) {
  if (!lead) return null;
  const summary = buildLeadTagSummary(lead.enrichmentTags || []);
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
  const hasRelationship = Boolean(lead.companyName || lead.contactName || lead.contactEmail || lead.contactPhone);
  const hasEnrichment = rows.length > 0 || lead.engagementState === 'present' || lead.publicEvidenceCount > 0;

  if (!hasRelationship && !hasEnrichment && !lead.nextAction) return null;

  return (
    <div style={{ padding: 12, border: '1px solid var(--line-soft)', borderRadius: 'var(--r)', background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 9 }}>
      {hasRelationship && (
        <div style={{ display: 'grid', gridTemplateColumns: '68px 1fr', gap: 8, alignItems: 'start' }}>
          <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>고객 문맥</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--fg)' }}>
              {[lead.companyName, lead.contactName, lead.contactTitle].filter(Boolean).join(' · ')}
            </div>
            {(lead.contactPhone || lead.contactEmail) && (
              <div className="mono" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 3, fontSize: 10.5, color: 'var(--fg-muted)' }}>
                {lead.contactPhone && <span>{lead.contactPhone}</span>}
                {lead.contactEmail && <span>{lead.contactEmail}</span>}
              </div>
            )}
          </div>
        </div>
      )}
      {lead.nextAction && (
        <div style={{ display: 'grid', gridTemplateColumns: '68px 1fr', gap: 8, alignItems: 'start' }}>
          <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>다음 행동</span>
          <div style={{ fontSize: 12, color: 'var(--moon-200)', lineHeight: 1.45 }}>
            {lead.nextAction}
            {lead.nextActionAt && <span className="mono" style={{ marginLeft: 7, fontSize: 10.5, color: 'var(--fg-muted)' }}>{String(lead.nextActionAt).slice(0, 10)}</span>}
          </div>
        </div>
      )}
      {hasEnrichment && (
        <>
          <Divider />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-dim)' }}>분류 · 증거</span>
            <Badge tone="neutral" size="xs">
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
        </>
      )}
    </div>
  );
}

export function Leads({ workspace }) {
  const { ledger, syncState, reload: reloadLedger } = useRevenueLedger();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [localLeads, setLocalLeads] = React.useState([]);
  const [leadEdits, setLeadEdits] = React.useState({}); // { [id]: patch } — overlays any lead (local or ledger)
  const [deletedLeadIds, setDeletedLeadIds] = React.useState(() => new Set()); // hide removed ledger rows
  const [editLeadId, setEditLeadId] = React.useState(null);
  // 기록 탭 배지 건수 — 패널이 원장을 읽고 올려준다. 리드가 바뀌면 다시 미확정(null).
  const [leadActivityCount, setLeadActivityCount] = React.useState(null);
  React.useEffect(() => { setLeadActivityCount(null); }, [editLeadId]);
  // 리드 삭제 지연-undo(7차 편의) — 창 종료 후 실제 DELETE, 실패 시 복원 알림.
  const { schedule: scheduleUndoable, cancel: cancelUndoable } = useUndoableAction();
  const [deleteNotice, setDeleteNotice] = React.useState(null); // { key, tone, label, undo }
  React.useEffect(() => {
    if (!deleteNotice || deleteNotice.undo) return undefined; // undo 창 알림은 창 종료 콜백이 걷는다
    const t = setTimeout(() => setDeleteNotice(null), 8000);
    return () => clearTimeout(t);
  }, [deleteNotice]);
  // Scope the merged ledger to the active workspace (pass-through when unscoped). The
  // The ledger hook only exposes API-backed rows — scoping never mixes sources. Drawer
  // edits overlay onto whichever row (local or ledger) they key to; deletes drop the row.
  const ws = getWorkspace(workspace);
  const [filter, setFilter] = React.useState(() => {
    // 사이드바 personal 스코프 경로(?scope=personal)를 실소비 — 착지 시 개인 필터로 시작
    // (기존: 스코프 토글이 데이터에 아무 영향 없는 과약속, 4차 재감사 M).
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('scope') === 'personal') return 'personal';
    return 'all';
  });
  const [search, setSearch] = React.useState('');
  const [sort, setSort] = React.useState({ key: null, dir: 'asc' });
  // 파생 목록 memo(re-audit 속도 #4) — 이전에는 드로어·검색 키스트로크마다 120행
  // merge + 10필드 searchText 조립 + sort가 전부 재실행됐다.
  const mergedLeads = React.useMemo(
    () => [...localLeads, ...ledger.leads]
      .filter(l => !deletedLeadIds.has(l.id))
      .map(l => (leadEdits[l.id] ? { ...l, ...leadEdits[l.id] } : l)),
    [localLeads, ledger.leads, deletedLeadIds, leadEdits],
  );
  const LEADS = React.useMemo(() => filterLeadsByWorkspace(mergedLeads, workspace), [mergedLeads, workspace]);
  const wsEmpty = Boolean(ws) && LEADS.length === 0;
  const editingLead = editLeadId ? mergedLeads.find(l => l.id === editLeadId) : null;
  const term = search.trim().toLowerCase();
  const filtered = React.useMemo(() => LEADS.filter(l => {
    const searchText = [l.name, l.companyName, l.contactName, l.contactPhone, l.contactEmail, l.source, l.stage, l.region, l.nextAction, ...(l.enrichmentTags || [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return (filter === 'all' || l.type === filter) && (!term || searchText.includes(term));
  }), [LEADS, filter, term]);
  // 무변별 컬럼 자동 숨김(28차 사용성) — 전 행이 같은 값인 컬럼은 신호가 0이라 표에서 뺀다.
  // eeocrm 이관 직후처럼 Type=Company·Source=eeocrm·Score=25가 117행 반복되던 화면이 대상.
  // 판정은 워크스페이스 전체 목록(LEADS) 기준 — 검색·필터로 시야가 좁아져도 컬럼이 출렁이지 않는다.
  const leadCols = React.useMemo(() => {
    const varied = (get) => {
      const seen = new Set();
      for (const l of LEADS) { seen.add(get(l) ?? ''); if (seen.size > 1) return true; }
      return false;
    };
    // 다음 행동의 최빈 문구가 과반(60%↑)이면 이관 템플릿이다 — 그 행들은 숨기고
    // 템플릿과 다른 고유 액션만 남긴다(반복 문구 117줄은 신호가 아니라 소음).
    const freq = new Map();
    for (const l of LEADS) {
      const v = (l.nextAction || '').trim();
      if (v) freq.set(v, (freq.get(v) || 0) + 1);
    }
    let modal = null; let modalCount = 0;
    for (const [v, n] of freq) if (n > modalCount) { modal = v; modalCount = n; }
    return {
      type: varied(l => l.type),
      source: varied(l => l.source),
      score: varied(l => l.score) || LEADS.some(l => l.priorityLane === 'customer_success'),
      nextActionTemplate: LEADS.length > 3 && modalCount >= LEADS.length * 0.6 ? modal : null,
    };
  }, [LEADS]);
  const leadsGrid = React.useMemo(() => [
    '26px', 'minmax(0, 1fr)',
    leadCols.type && '112px', leadCols.source && '112px',
    '124px', leadCols.score && '100px', '92px',
  ].filter(Boolean).join(' '), [leadCols]);
  const sortedLeads = React.useMemo(() => sortLeads(filtered, sort), [filtered, sort]);
  // Toggle a column: first click sorts asc, second flips to desc, third clears back to ledger order.
  const toggleSort = (key) => setSort(s =>
    s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : { key: null, dir: 'asc' }
  );
  // Clickable column header. Reserves the caret's width even when inactive so sorting never
  // shifts the header layout; active column brightens and shows the direction.
  const createLead = () => {
    const id = `local-lead-${Date.now()}`;
    const now = new Date().toISOString();
    setLocalLeads(prev => [{
      id,
      name: '새 리드',
      type: filter === 'personal' || filter === 'company' ? filter : 'company',
      source: 'Manual',
      stage: 'New',
      value: '₩0',
      last: '방금',
      // Stamped so the default sort cascade (last contact -> added -> orders) still floats a
      // brand-new row to the top instead of sinking it for lacking server timestamps.
      lastContactAt: now,
      createdAt: now,
      orderCount: 0,
      owner: 'Me',
      // Tag in-workspace creates so the scoped view doesn't silently drop them.
      ...(ws ? { workspace } : {}),
    }, ...prev]);
    setEditLeadId(id); // open the editor immediately so the new lead can be filled in
  };

  // ?new=lead — TopBar New·⌘K 생성 딥링크를 1회 소비하고 쿼리 소거(§8.1 생성·연계).
  // 셸의 New가 팔레트만 열던 것을 "지금 보는 표면에 만든다"로 잇는 착지 지점.
  const createdLeadFromQueryRef = React.useRef(false);
  React.useEffect(() => {
    if (searchParams.get('new') !== 'lead') { createdLeadFromQueryRef.current = false; return; }
    if (createdLeadFromQueryRef.current) return;
    createdLeadFromQueryRef.current = true;
    createLead();
    router.replace(pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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

  // Delete: 낙관 tombstone → 3.5초 되돌리기 창 → 창이 닫힌 뒤에만 실제 DELETE.
  // hard delete의 안전장치가 confirm 하나뿐이던 격차를 완료·기록과 같은 지연-undo
  // 계약으로 메운다(7차 편의 — 고빈도 엔티티부터). 미저장 로컬 행은 네트워크 생략.
  const deleteLead = async () => {
    if (!editLeadId) return { ok: false };
    const id = editLeadId;
    const isLocal = String(id).startsWith('local-lead-');
    setLocalLeads(prev => prev.filter(l => l.id !== id));
    setDeletedLeadIds(prev => new Set(prev).add(id));
    if (isLocal) return { ok: true, status: 'local' };
    const key = `delete-lead-${id}`;
    setDeleteNotice({
      key,
      tone: 'ok',
      label: '리드 삭제됨',
      undo: () => {
        if (cancelUndoable(key)) setDeletedLeadIds(prev => { const n = new Set(prev); n.delete(id); return n; });
        setDeleteNotice(null);
      },
    });
    scheduleUndoable(key, () => {
      setDeleteNotice(cur => (cur?.key === key ? null : cur)); // 창 종료 시 전체 소거(7차 UIUX 통일)
      saveRevenueRecord('lead', 'delete', { id }).then(r => {
        if (!r.ok) {
          // 늦은 실패·preview: 행 복원 + 원인 명명(무언 소실 금지).
          setDeletedLeadIds(prev => { const n = new Set(prev); n.delete(id); return n; });
          setDeleteNotice({
            key: `${key}-fail`,
            tone: 'err',
            label: r.status === 'preview'
              ? 'Supabase 미설정 — 삭제가 저장되지 않아 리드를 되살렸습니다.'
              : `삭제 실패 (${r.status}) — 리드를 되살렸습니다.`,
            undo: null,
          });
        }
      });
    });
    return { ok: true, status: 'deferred' };
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

  // 키보드 계층(2026-08-05 배선): j/k 행 이동 · e 편집 · n 생성 · / 검색 포커스 · x 다중 선택 ·
  // Esc 해제. useCrmKeyboard가 입력 포커스/드로어(role=dialog)/치트시트에서 스스로 양보하므로
  // 기존 수제 N 리스너는 이 훅으로 흡수한다(중복 구현 6곳 문제의 첫 정리).
  const searchRef = React.useRef(null);
  const selection = useCrmSelection(sortedLeads);
  useCrmKeyboard({
    selection,
    onNew: createLead,
    onEditSelected: (id) => setEditLeadId(id),
    onSearchFocus: () => searchRef.current?.focus(),
    onToggleSelect: selection.toggleSelected,
  });
  React.useEffect(() => {
    if (!selection.selectedId) return;
    document.querySelector(`[data-lead-row="${selection.selectedId}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selection.selectedId]);

  // 벌크 바(25차) — 기준선 §2.8부터 미배선이던 BulkBar의 첫 실채택. "1인 운영 후순위" 보류는
  // 운영자의 94 목표 지시(2026-08-08)로 해제됐고, 118행 리드 목록(eeocrm 이관분)에서 단계
  // 일괄 정리는 실제 반복 작업이다. 행 클릭 다중 선택이 아니라 x 키·행 체크 두 경로 모두
  // selection.selectedIds 하나를 쓴다. 일괄 변경은 건별 영속 + 실패 건수 명명(무언 부분 실패 금지).
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const applyBulkStage = async (stage) => {
    const ids = [...selection.selectedIds];
    if (!ids.length || bulkBusy) return;
    setBulkBusy(true);
    const results = await Promise.all(ids.map((id) => saveRevenueRecord('lead', 'update', { id, stage })));
    const okIds = ids.filter((_, i) => results[i].ok);
    if (okIds.length) {
      setLeadEdits(prev => {
        const next = { ...prev };
        okIds.forEach((id) => { next[id] = { ...(next[id] || {}), stage }; });
        return next;
      });
    }
    const failed = ids.length - okIds.length;
    setDeleteNotice(failed
      ? { key: 'bulk-stage', tone: 'err', label: `단계 일괄 변경 — ${okIds.length}건 저장, ${failed}건 실패 (다시 시도하세요)` }
      : { key: 'bulk-stage', tone: 'ok', label: `${okIds.length}건 단계 → ${stage} 변경됨` });
    selection.clearSelected();
    setBulkBusy(false);
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
          {deleteNotice && (
            <div role={deleteNotice.tone === 'err' ? 'alert' : 'status'} aria-live="polite" style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: deleteNotice.tone === 'err' ? 'var(--danger)' : 'var(--fg-muted)' }}>
              <span>{deleteNotice.label}</span>
              {deleteNotice.undo && <Button variant="ghost" size="xs" onClick={deleteNotice.undo}>되돌리기</Button>}
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
            {LEADS.length} leads · {LEADS.filter(l => l.type === 'personal').length} personal · {LEADS.filter(l => l.type === 'company').length} company
            <SyncBadge state={syncState} />
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <SegmentedControl className="hub-toolbar" style={{ marginRight: 8 }} options={SCOPE_OPTIONS} value={filter} onChange={setFilter} />
        <Input ref={searchRef} className="hub-toolbar" placeholder="이름·소스·단계 검색…" icon="search" value={search} onChange={setSearch} />
        <div style={{ width: 8 }} />
        <Button variant="secondary" size="sm" icon="plus" onClick={() => cardFileRef.current?.click()}>명함</Button>
        <input ref={cardFileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onCardFile} />
        <div style={{ width: 6 }} />
        <Button variant="primary" size="sm" icon="plus" onClick={createLead}>Lead <Kbd>N</Kbd></Button>
      </div>

      {cardState && (() => {
        const reading = cardState.phase === 'reading';
        const s = cardState.status;
        const tone = reading ? 'neutral' : s === 'rejected' || s === 'error' ? 'danger' : 'neutral';
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
              <Button variant="ghost" size="xs" onClick={reloadLedger}>목록 새로고침</Button>
            )}
            {!reading && (
              <Button variant="ghost" size="xs" onClick={() => setCardState(null)}>닫기</Button>
            )}
          </div>
        );
      })()}

      {wsEmpty && (
        syncState === 'error' ? (
          <LedgerReadError noun="리드 목록" onRetry={reloadLedger} />
        ) : (
        <Card>
          <EmptyState
            icon="leads"
            title={`${ws.label} — 해당하는 리드가 없습니다`}
            description={`이 워크스페이스에 매칭되는 리드가 없습니다. 다른 워크스페이스로 태그된 리드는 여기에 표시되지 않습니다. 리드를 등록하거나 기록에 ${ws.label} 태그가 연결되면 나타납니다.`}
            action={<Button variant="primary" size="sm" icon="plus" onClick={createLead}>{ws.label}에 리드 추가</Button>}
            style={{ minHeight: 200, padding: '28px 12px' }}
          />
        </Card>
        )
      )}

      {!wsEmpty && (
      <Card pad={false} className="hub-table-card hub-leads-table">
        <div className="hub-leads-grid" style={{ display: 'grid', gridTemplateColumns: leadsGrid, gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--line-soft)', fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {/* Owner 컬럼 없음 — 1인 운영이라 항상 Me이고 buildLeadWrite가 owner를 저장한 적이 없다(드로어와 동일 결정). */}
          <span /><SortHead k="name" sort={sort} onToggle={toggleSort}>Name</SortHead>{leadCols.type && <span className="hub-lc-m">Type</span>}{leadCols.source && <SortHead k="source" sort={sort} onToggle={toggleSort} className="hub-lc-m">Source</SortHead>}<SortHead k="stage" sort={sort} onToggle={toggleSort}>Stage</SortHead>{leadCols.score && <SortHead k="score" sort={sort} onToggle={toggleSort} className="hub-lc-m">Score</SortHead>}<span className="hub-lc-m" style={{ textAlign: 'right' }}>Last</span>
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
            data-lead-row={l.id}
            data-multi-selected={selection.selectedIds.has(l.id) ? 'true' : undefined}
            onClick={() => setEditLeadId(l.id)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditLeadId(l.id); } }}
            style={{
              display: 'grid', gridTemplateColumns: leadsGrid, gap: 12,
              padding: 'var(--pad-y) var(--pad-x)', alignItems: 'center', cursor: 'pointer',
              borderBottom: i < sortedLeads.length - 1 ? '1px solid var(--line-soft)' : 'none',
              // j/k 키보드 선택 — §5.3 충돌 우선순위상 선택은 Moonstone 외곽 outline.
              outline: selection.selectedId === l.id ? '1px solid var(--moon-300)' : undefined,
              outlineOffset: -1,
              // x 다중 선택 — 커서(outline)와 구분되는 조용한 배경 표시(벌크 바가 주 신호).
              background: selection.selectedIds.has(l.id) ? 'var(--surface-2)' : undefined,
            }}
          >
            <span style={{ paddingRight: 4, display: 'flex' }}>
              <Avatar name={l.name.replace(/^.*—\s*/, '')} size={22} tone={l.type === 'personal' ? 'personal' : 'company'} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</span>
              {l.nextAction && l.nextAction.trim() !== leadCols.nextActionTemplate && <span className="hub-lead-next-action" style={{ display: 'block', marginTop: 2, fontSize: 10.5, color: 'var(--fg-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.nextAction}</span>}
              <span className="hub-lead-mobile-meta">
                {l.type === 'personal' ? 'Personal' : 'Company'} · score {l.score ?? '—'}{l.priorityLane === 'customer_success' ? ' · CS' : ''}
              </span>
            </span>
            {leadCols.type && (
            <span className="hub-lc-m" style={{ paddingRight: 8, minWidth: 0 }}>
              <Badge tone={l.type === 'personal' ? 'personal' : 'company'} size="xs">
                <Iconed name={l.type === 'personal' ? 'user' : 'building'} size={9} />
                {l.type === 'personal' ? 'Personal' : 'Company'}
              </Badge>
            </span>
            )}
            {leadCols.source && <span className="hub-lc-m" style={{ fontSize: 12, color: 'var(--fg-muted)', paddingRight: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.source}</span>}
            <span style={{ paddingRight: 8, minWidth: 0 }}>
              <Badge tone="neutral" size="xs" variant="outline">{l.stage}</Badge>
            </span>
            {leadCols.score && (
            <span className="hub-lc-m" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)' /* §13 high-score 강조 금지 — 순서·정렬이 우선순위 전달 */ }}>{l.score ?? '—'}</span>
              {l.priorityLane === 'customer_success' && <Badge tone="neutral" size="xs">CS</Badge>}
            </span>
            )}
            {/* Owner 셀 제거 — 드로어와 같은 결정(1인 운영·미영속 필드). */}
            <span className="mono hub-lc-m" style={{ textAlign: 'right', fontSize: 11.5, color: 'var(--fg-faint)' }}>{l.last}</span>
          </div>
        ))}
      </Card>
      )}

      <EditDrawer
        title={editingLead ? (editingLead.name || '리드 편집') : ''}
        subtitle="정보 편집 · 접촉 기록"
        record={editingLead}
        width="min(460px, 96vw)"
        infoLabel="정보"
        panels={editingLead ? [{
          key: 'activity',
          label: '기록',
          count: leadActivityCount,
          content: <LeadActivityPanel lead={editingLead} onCountChange={setLeadActivityCount} />,
        }] : undefined}
        fields={[
          { key: 'name', label: '이름' },
          // 타입+단계 — 이 리드를 어떻게 다룰지 정하는 두 값. 담당은 뺐다: 1인 운영
          // 시스템에서 항상 Me뿐이고 buildLeadWrite가 애초에 owner를 저장한 적이 없다.
          { key: 'type', row: 'r1', label: '타입', type: 'select', options: [{ value: 'company', label: 'Company' }, { value: 'personal', label: 'Personal' }] },
          { key: 'stage', row: 'r1', label: '단계', type: 'select', options: [{ value: 'New', label: 'New' }, { value: 'Contact', label: 'Contact' }, { value: 'Qualified', label: 'Qualified' }, { value: 'Customer', label: 'Customer' }, { value: 'Lost', label: 'Lost' }] },
          { key: 'source', row: 'r2', label: '유입경로', placeholder: 'Referral · Website · Meta…' },
          { key: 'region', row: 'r2', label: '지역', placeholder: '서울 · 경기 · 부산…' },
          { key: 'scale', row: 'r3', label: '규모', placeholder: '학생수 · 직원수' },
          { key: 'units', row: 'r3', label: '도입 댓수', inputType: 'number', placeholder: '0' },
          { key: 'situation', label: '현재 상황', placeholder: '검토중 · 경쟁사 사용 · 예산확보…' },
          // 딜과 달리 텍스트 입력이 의도: 리드 value는 "₩1.2M" 표시 문자열로 읽혀 오고
          // parseMoneyLabel이 축약형(₩1.2M · 1.2M · 1200000)을 그대로 받는다.
          { key: 'value', label: '금액', placeholder: '₩1.2M · 1200000' },
        ]}
        onChange={(key, val) => setLeadEdits(prev => ({ ...prev, [editLeadId]: { ...prev[editLeadId], [key]: val } }))}
        onSave={persistLead}
        onDelete={deleteLead}
        onClose={() => setEditLeadId(null)}
      >
        <LeadEnrichmentPanel lead={editingLead} />
      </EditDrawer>

      {/* 벌크 바 — x로 담은 선택이 있을 때만 뜨는 하단 플로팅 바(§2.8 첫 실채택). */}
      <BulkBar count={selection.selectedIds.size} onClear={selection.clearSelected}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg-muted)' }}>
          단계 일괄 변경
          <select
            aria-label="선택한 리드 단계 일괄 변경"
            disabled={bulkBusy}
            value=""
            onChange={(e) => { if (e.target.value) applyBulkStage(e.target.value); }}
            style={{
              height: 26, padding: '0 8px', fontSize: 12, borderRadius: 'var(--r-sm)',
              background: 'var(--surface-2)', color: 'var(--fg)', border: '1px solid var(--line)',
            }}
          >
            <option value="">{bulkBusy ? '저장 중…' : '단계 선택'}</option>
            {['New', 'Contact', 'Qualified', 'Customer', 'Lost'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      </BulkBar>
    </div>
  );
}

// 딜 체크리스트 — 공유 실행 척추의 딜 쪽 절반. 판매 과정의 하위 항목(견적서 발송·데모
// 준비·재미팅 잡기)이 딜 안에 산다. 저장은 tasks 원장(meta.deal_id)이라 '내 작업'의
// 할 일 레인에도 그대로 흐른다. 클로징 딜에는 판매 후 실행(A/S)을 낮은 우선순위 후속
// 프로젝트로 분리하는 버튼이 붙는다 — 딜은 돈을 추적하고 닫히는 레코드, 실행은 계속되는
// 프로젝트의 몫이라는 경계.
function DealTaskPanel({ deal, onSaved }) {
  const dealId = deal?.id || null;
  const isLocal = String(dealId || '').toLowerCase().startsWith('local-');
  const [tasks, setTasks] = React.useState(null); // null = loading
  const [title, setTitle] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [listError, setListError] = React.useState(null);
  const [asState, setAsState] = React.useState('idle'); // idle | saving | done | error

  const load = React.useCallback(async () => {
    if (!dealId || isLocal) { setTasks([]); return; }
    try {
      // ?dealId= 서버 필터 — 전체 태스크를 받아 클라이언트에서 거르던 페이로드 낭비 제거.
      const res = await fetch(`/api/hub/tasks?dealId=${encodeURIComponent(dealId)}`, { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.status === 'error') {
        // 읽기 실패를 빈 체크리스트(0건이 사실인 것처럼)로 뭉개지 않는다.
        setListError('체크리스트를 읽지 못했습니다 — 다시 열면 재시도합니다.');
        return;
      }
      const all = Array.isArray(data.tasks) ? data.tasks : [];
      setTasks(all.filter(t => t.dealId === dealId));
    } catch { setListError('체크리스트를 읽지 못했습니다 — 다시 열면 재시도합니다.'); }
  }, [dealId, isLocal]);
  React.useEffect(() => { setAsState('idle'); setTitle(''); setListError(null); load(); }, [load]);

  const addTask = async () => {
    const t = title.trim();
    if (!t || busy || isLocal) return;
    setBusy(true);
    setListError(null);
    try {
      const res = await fetch('/api/hub/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: t, dealId, source: 'hub-deal-checklist' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.status === 'saved') { setTitle(''); await load(); onSaved?.(); }
      else setListError('항목 저장에 실패했습니다. 다시 시도하세요.');
    } finally { setBusy(false); }
  };

  const togglingRef = React.useRef(new Set());
  const toggleTask = async (task) => {
    if (togglingRef.current.has(task.id)) return; // 연타 가드 — 이전 PATCH가 끝나기 전 재발화 금지
    togglingRef.current.add(task.id);
    setListError(null);
    // 낙관 flip — 체크박스가 Hub→Engine→Supabase 왕복+재조회를 직렬로 기다리지 않는다
    // (4차 재감사 속도 M). 실패 시 원상복구 + 원인 표시.
    const nextDone = !task.done;
    setTasks(ts => ts.map(t => (t.id === task.id ? { ...t, done: nextDone } : t)));
    let saved = false;
    try {
      const res = await fetch('/api/hub/tasks', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: task.id, status: nextDone ? 'done' : 'todo' }),
      });
      const data = await res.json().catch(() => ({}));
      saved = res.ok && data.status === 'saved';
      if (!saved) {
        setTasks(ts => ts.map(t => (t.id === task.id ? { ...t, done: task.done } : t)));
        setListError('완료 상태 저장에 실패했습니다. 다시 시도하세요.');
      }
    } catch {
      setTasks(ts => ts.map(t => (t.id === task.id ? { ...t, done: task.done } : t)));
      setListError('완료 상태 저장에 실패했습니다. 다시 시도하세요.');
    } finally {
      togglingRef.current.delete(task.id);
    }
    if (saved) {
      load(); // 배경 재검증 — 체크 반영을 붙잡지 않는다
      onSaved?.();
    }
  };

  // A/S 후속 프로젝트 — 자동 생성이 아니라 운영자 버튼(후보 확인 UI 원칙). 우선순위 low.
  const createFollowupProject = async () => {
    if (asState === 'saving' || isLocal) return;
    setAsState('saving');
    try {
      // areaId·orgScope는 create_project 필수 계약(2026-07-17 create-drawer spec).
      // A/S는 영업(sales) 분야, 매출 레인 딜은 클래스인 소속으로 귀속한다.
      const ledgerRes = await fetch('/api/hub/projects');
      const ledger = await ledgerRes.json().catch(() => ({}));
      const areaId = selectProjectAreaId(ledger.areas || [], 'sales');
      if (!areaId) { setAsState('error'); return; }
      const res = await fetch('/api/hub/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: `${deal.name} · A/S`,
          summary: '클로징 딜의 판매 후 실행 (설치·교육·운영)',
          priority: 'low',
          dealId,
          areaId,
          orgScope: 'classin',
          source: 'deal-followup',
        }),
      });
      const data = await res.json().catch(() => ({}));
      setAsState(res.ok && ['saved', 'duplicate'].includes(data.status) ? 'done' : 'error');
    } catch { setAsState('error'); }
  };

  const open = (tasks || []).filter(t => !t.done);
  const done = (tasks || []).filter(t => t.done);
  const total = (tasks || []).length;

  return (
    <div style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-dim)' }}>체크리스트</span>
        {total > 0 && <span className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)', marginLeft: 'auto' }}>{done.length}/{total}</span>}
      </div>
      {total > 0 && <Progress value={Math.round((done.length / total) * 100)} tone="moon" />}

      {isLocal ? (
        <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', lineHeight: 1.5 }}>딜을 먼저 저장하면 하위 항목을 추가할 수 있습니다.</div>
      ) : (
        <>
          {tasks === null && <div style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>불러오는 중…</div>}
          {[...open, ...done].map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 24 }}>
              <Checkbox checked={t.done} onChange={() => toggleTask(t)} label={`${t.title} 완료`} />
              <span style={{
                fontSize: 12.5, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                color: t.done ? 'var(--fg-faint)' : 'var(--fg)',
                textDecoration: t.done ? 'line-through' : 'none',
              }}>{t.title}</span>
              {t.dueAt && <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', flexShrink: 0 }}>{t.due}</span>}
            </div>
          ))}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); addTask(); } }}
            placeholder="하위 항목 추가 — Enter로 저장"
            style={{
              height: 30, padding: '0 10px', fontSize: 12,
              background: 'var(--surface-2)', border: '1px solid var(--line-soft)',
              borderRadius: 'var(--r-sm)', color: 'var(--fg)',
            }}
          />
          {listError && <span role="alert" style={{ fontSize: 11, color: 'var(--danger)' }}>{listError}</span>}
        </>
      )}

      {deal?.stage === 'closing' && !isLocal && (
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          {asState === 'done' ? (
            <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>A/S 프로젝트 생성됨 — 프로젝트·기획에서 확인</span>
          ) : (
            <>
              <Button variant="outline" size="xs" icon="projects" onClick={createFollowupProject} disabled={asState === 'saving'}>
                {asState === 'saving' ? '생성 중…' : 'A/S 프로젝트 만들기'}
              </Button>
              {asState === 'error' && <span role="alert" style={{ fontSize: 11, color: 'var(--danger)' }}>생성 실패 — 다시 시도</span>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// 딜 → 프로젝트 backlink. create_project가 A/S 후속 프로젝트에 심어둔
// meta.origin_deal_id를 되읽어 보여준다 — 지금까지 쓰기만 하고 읽지 않아 DB에만
// 있던 연결이다. 자동 연동·생성 드로어 딜 필드는 범위 밖(07-17 스펙).
function DealLinkedProjectsPanel({ deal, onNavigate }) {
  const dealId = deal?.id || null;
  const isLocal = String(dealId || '').toLowerCase().startsWith('local-');
  const [projects, setProjects] = React.useState(null); // null = loading
  const [loadError, setLoadError] = React.useState(null);

  React.useEffect(() => {
    let active = true;
    setLoadError(null);
    if (!dealId || isLocal) { setProjects([]); return undefined; }
    setProjects(null);
    (async () => {
      try {
        const res = await fetch('/api/hub/projects', { cache: 'no-store' });
        const data = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok || !data || data.status === 'error') {
          // 읽기 실패를 "연결된 프로젝트 0건"으로 뭉개지 않는다 (체크리스트와 동일 계약).
          setLoadError('연결된 프로젝트를 읽지 못했습니다 — 다시 열면 재시도합니다.');
          return;
        }
        setProjects((data.projects || []).filter(p => p.originDealId === dealId));
      } catch {
        if (active) setLoadError('연결된 프로젝트를 읽지 못했습니다 — 다시 열면 재시도합니다.');
      }
    })();
    return () => { active = false; };
  }, [dealId, isLocal]);

  if (isLocal || (!loadError && projects !== null && projects.length === 0)) return null;

  return (
    <div style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-dim)' }}>연결된 프로젝트</span>
        {projects?.length > 0 && (
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)', marginLeft: 'auto' }}>{projects.length}</span>
        )}
      </div>
      {projects === null && !loadError && <div style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>불러오는 중…</div>}
      {(projects || []).map((p) => (
        <div
          key={p.id}
          className="hub-row"
          role="button"
          tabIndex={0}
          onClick={() => onNavigate?.(`dashboard/work/projects?project=${encodeURIComponent(p.id)}`)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onNavigate?.(`dashboard/work/projects?project=${encodeURIComponent(p.id)}`);
            }
          }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 32, padding: '0 6px', borderRadius: 'var(--r-sm)', cursor: 'pointer' }}
        >
          <Iconed name="projects" size={12} style={{ color: 'var(--fg-faint)', flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
          <span style={{ fontSize: 10.5, color: 'var(--fg-faint)', flexShrink: 0 }}>{p.status}</span>
        </div>
      ))}
      {loadError && <span role="alert" style={{ fontSize: 11, color: 'var(--danger)' }}>{loadError}</span>}
    </div>
  );
}

// 다음 미팅 — My Work 주간 캘린더가 쓰는 /api/calendar/google/event를 그대로 재사용한다.
// 일정 정본은 Google Calendar이고 딜에는 다시 찾아갈 breadcrumb만 meta에 남긴다.
// 상태를 deals에 병합하지 않는 이유: EditDrawer의 dirty 판정이 record의 JSON 비교라
// (hub-primitives), 저장 성공 후 editingDeal 모양이 바뀌면 이미 저장된 건에 대해
// "저장하지 않은 변경이 있습니다"가 뜬다. DealTaskPanel이 tasks를 로컬로 두는 것과 같은 이유.
function DealNextMeetingPanel({ deal, onNavigate }) {
  const dealId = deal?.id || null;
  const isLocal = String(dealId || '').toLowerCase().startsWith('local-');
  const [capability, setCapability] = React.useState(null); // null = 확인 중
  const [meeting, setMeeting] = React.useState(null);
  const [open, setOpen] = React.useState(false);
  const [startAt, setStartAt] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [orphan, setOrphan] = React.useState(null); // 캘린더엔 생겼는데 breadcrumb 저장 실패

  React.useEffect(() => {
    let active = true;
    setMeeting(deal?.nextMeeting || null);
    setOpen(false); setError(null); setOrphan(null); setStartAt('');
    setTitle(deal?.name ? `${deal.name} 미팅` : '미팅');
    if (!dealId || isLocal) return undefined;
    setCapability(null);
    fetch('/api/calendar/google/event', { cache: 'no-store' })
      .then(r => r.json())
      .catch(() => null)
      .then((d) => {
        if (!active) return;
        setCapability(resolveCalendarCapabilities({ status: d?.status || 'error', source: d?.source, readOnly: d?.readOnly }));
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId, isLocal]);

  // breadcrumb만 저장 — 캘린더에 다시 POST하지 않는다(중복 일정 방지).
  const saveBreadcrumb = async (breadcrumb) => {
    const r = await saveRevenueRecord('deal', 'update', { id: dealId, next_meeting: breadcrumb });
    if (r.ok) { setMeeting(breadcrumb); setOrphan(null); setOpen(false); return true; }
    setOrphan(breadcrumb);
    setError('일정은 캘린더에 만들어졌지만 딜에 연결하지 못했습니다. 다시 연결하세요.');
    return false;
  };

  const createMeeting = async () => {
    if (saving || !startAt) return;
    setSaving(true);
    setError(null);
    try {
      const start = new Date(startAt);
      if (Number.isNaN(start.getTime())) { setError('시작 시각을 확인하세요.'); return; }
      const end = new Date(start.getTime() + 60 * 60 * 1000); // 기본 1시간
      const res = await fetch('/api/calendar/google/event', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || '미팅',
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          timeZone: 'Asia/Seoul',
        }),
      });
      const data = await res.json().catch(() => null);
      if (data?.status !== 'saved' && data?.status !== 'updated') {
        // 무음 실패 금지 — 원인을 그대로 보여준다.
        setError(data?.message || data?.error
          ? `일정 생성 실패 — ${data.message || data.error}`
          : `일정 생성 실패 (${res.status}) — 캘린더 연결 상태를 확인하세요.`);
        return;
      }
      await saveBreadcrumb({
        eventId: data.event?.id || null,
        summary: data.event?.summary || title.trim() || '미팅',
        startAt: start.toISOString(),
        htmlLink: data.event?.htmlLink || null,
      });
    } catch {
      setError('일정 생성 실패 — 네트워크 오류. 다시 시도하세요.');
    } finally {
      setSaving(false);
    }
  };

  const blockedReason = capability === null
    ? '캘린더 연결 상태를 확인하는 중입니다.'
    : capability.badge === 'iCal · read only'
      ? 'iCal 연결은 읽기 전용입니다. 일정 생성에는 Google OAuth 연결이 필요합니다.'
      : 'Google Calendar 연결 후 일정을 만들 수 있습니다.';

  return (
    <div style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-dim)' }}>다음 미팅</span>

      {meeting && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Iconed name="calendar" size={12} style={{ color: 'var(--fg-faint)', flexShrink: 0 }} />
          <span className="mono" style={{ fontSize: 12, color: 'var(--fg)' }}>{formatMeetingTime(meeting.startAt)}</span>
          <span style={{ fontSize: 12, color: 'var(--fg-muted)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meeting.summary}</span>
          {meeting.htmlLink && (
            <a
              href={meeting.htmlLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 11.5, color: 'var(--moon-300)', minHeight: 44, display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}
            >
              캘린더에서 보기
            </a>
          )}
        </div>
      )}

      {isLocal ? (
        <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', lineHeight: 1.5 }}>딜을 먼저 저장하면 다음 미팅을 잡을 수 있습니다.</div>
      ) : orphan ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button variant="outline" size="xs" onClick={() => saveBreadcrumb(orphan)}>딜에 다시 연결</Button>
        </div>
      ) : !capability?.canCreate ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11.5, color: 'var(--fg-faint)', lineHeight: 1.5 }}>{blockedReason}</span>
          {capability && !capability.isLive && (
            <button
              type="button"
              onClick={() => onNavigate?.('dashboard/work/calendar')}
              style={{ fontSize: 11.5, color: 'var(--moon-300)', minHeight: 44, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              캘린더 연결하러 가기
            </button>
          )}
        </div>
      ) : open ? (
        <>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="일정 제목"
            style={{ height: 30, padding: '0 10px', fontSize: 12, background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', color: 'var(--fg)' }}
          />
          <input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            aria-label="미팅 시작 시각"
            style={{ height: 30, padding: '0 10px', fontSize: 12, background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', color: 'var(--fg)' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button variant="primary" size="xs" onClick={createMeeting} disabled={saving || !startAt}>
              {saving ? '만드는 중…' : '일정 만들기'}
            </Button>
            <Button variant="ghost" size="xs" onClick={() => { setOpen(false); setError(null); }}>취소</Button>
            <span style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>1시간 · Asia/Seoul</span>
          </div>
        </>
      ) : (
        <div>
          <Button variant="outline" size="xs" icon="calendar" onClick={() => setOpen(true)}>
            {meeting ? '다시 잡기' : '다음 미팅 잡기'}
          </Button>
        </div>
      )}

      {error && <span role="alert" style={{ fontSize: 11, color: 'var(--danger)' }}>{error}</span>}
    </div>
  );
}

export function Deals({ workspace, onNavigate }) {
  const { ledger, syncState, reload: reloadLedger } = useRevenueLedger();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const DEAL_STAGES = ledger.stages;
  const [deals, setDeals] = React.useState(ledger.deals);
  const [drag, setDrag] = React.useState(null);
  const [filter, setFilter] = React.useState(() => {
    // 사이드바 personal 스코프 경로(?scope=personal)를 실소비 — 착지 시 개인 필터로 시작
    // (기존: 스코프 토글이 데이터에 아무 영향 없는 과약속, 4차 재감사 M).
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('scope') === 'personal') return 'personal';
    return 'all';
  });
  const [showHidden, setShowHidden] = React.useState(false);
  const [editDealId, setEditDealId] = React.useState(null);
  const [boardNotice, setBoardNotice] = React.useState(null); // { key?, tone, label, undo? } — 이동 되돌리기·저장 실패 안내
  const { schedule: scheduleUndoable, cancel: cancelUndoable } = useUndoableAction();
  React.useEffect(() => {
    if (!boardNotice || boardNotice.undo) return undefined; // undo 창 알림은 창 종료 콜백이 걷는다
    const t = setTimeout(() => setBoardNotice(null), 8000);
    return () => clearTimeout(t);
  }, [boardNotice]);
  const dragMovedRef = React.useRef(false); // true from dragStart until just after dragEnd — suppresses the card click
  React.useEffect(() => {
    if (!boardNotice) return undefined;
    const id = setTimeout(() => setBoardNotice(null), 6000);
    return () => clearTimeout(id);
  }, [boardNotice]);

  // Sync local deals state when live data arrives
  React.useEffect(() => {
    setDeals(ledger.deals);
  }, [ledger.deals]);

  // 드로어 편집은 드래프트 오버레이로 격리 — 이전에는 키스트로크마다 setDeals(전체 배열
  // re-map)로 보드 전체가 재계산됐다(system-eval P-6, 이 파일 memo 0개). 보드는 저장
  // 성공 시점에만 갱신되고, 타이핑은 드래프트 객체 하나만 바꾼다.
  const [dealDrafts, setDealDrafts] = React.useState({});

  // Scope BEFORE grouping by stage so the kanban columns only ever show in-workspace
  // deals (pass-through when unscoped). setDeals still holds the full ledger set.
  const ws = getWorkspace(workspace);
  const scopedDeals = React.useMemo(() => filterDealsByWorkspace(deals, workspace), [deals, workspace]);
  // 초기화(숨기기)된 딜은 기본적으로 파이프라인에서 빠진다 — 되돌릴 수 있는 정리이지
  // 삭제가 아니다. showHidden이 켜지면 다시 전부 보인다(dashed 엣지 + 숨김 뱃지).
  const hiddenCount = React.useMemo(() => scopedDeals.filter(d => d.hidden).length, [scopedDeals]);
  const visibleDeals = React.useMemo(
    () => (showHidden ? scopedDeals : scopedDeals.filter(d => !d.hidden)),
    [scopedDeals, showHidden],
  );
  const wsEmpty = Boolean(ws) && visibleDeals.length === 0;
  const editingBase = editDealId ? deals.find(d => d.id === editDealId) : null;
  const editingDeal = editingBase
    ? (dealDrafts[editDealId] ? { ...editingBase, ...dealDrafts[editDealId] } : editingBase)
    : null;

  const toggleDealHidden = (id, nextHidden) => {
    setDeals(ds => ds.map(d => (d.id === id ? { ...d, hidden: nextHidden } : d)));
    if (!String(id).toLowerCase().startsWith('local-')) {
      saveRevenueRecord('deal', 'update', { id, hidden: nextHidden }).then((r) => {
        if (r.ok) return;
        // 실패한 낙관 토글은 되돌리고 명명한다 — 새로고침 때 말없이 스냅백하던 경로.
        setDeals(ds => ds.map(d => (d.id === id ? { ...d, hidden: !nextHidden } : d)));
        setBoardNotice({ tone: 'err', label: `숨김 상태 저장 실패 (${r.status})` });
      });
    }
  };

  // DEAL_STAGES를 deps에 반드시 포함 — 원장 도착으로 stages만 갱신된 렌더에서 totals가
  // stale 빈 객체로 남으면 컬럼 헤더의 totals[s.key].count가 크래시한다(24차 실측 발견).
  const totals = React.useMemo(() => DEAL_STAGES.reduce((acc, s) => {
    const items = visibleDeals.filter(d => d.stage === s.key && (filter === 'all' || d.type === filter));
    acc[s.key] = { count: items.length, sum: items.reduce((a, b) => a + b.value, 0) };
    return acc;
  }, {}), [DEAL_STAGES, visibleDeals, filter]);
  // Command-deck readout split: money in motion (open stages) vs money landed (closing).
  // The old single grandTotal blended won deals into "pipeline", overstating what's open.
  const openStages = DEAL_STAGES.filter(s => s.key !== 'closing' && s.key !== 'lost');
  const openTotal = openStages.reduce((a, s) => a + (totals[s.key]?.sum || 0), 0);
  const openCount = openStages.reduce((a, s) => a + (totals[s.key]?.count || 0), 0);
  const closingTotal = totals.closing?.sum || 0;
  // Drag-to-move: 낙관 이동 → 3.5초 되돌리기 창 → 창이 닫힌 뒤에만 PATCH(지연 쓰기 —
  // 삭제·완료와 같은 useUndoableAction 계약). 스테이지 변경은 최고 빈도 뮤테이션인데
  // 되돌리기가 없던 마지막 항목이었다(기준선 §2.8 — 24차). 창 안에서 같은 딜을 연속
  // 이동하면 예약이 대체되고 되돌리기는 최초 원위치로 복원한다. 실패 시 롤백 + 명명.
  const pendingStageRef = React.useRef(new Map()); // key → 최초 prevStage
  const move = (id, to) => {
    const prevStage = deals.find(d => d.id === id)?.stage;
    if (!prevStage || prevStage === to) return;
    setDeals(ds => ds.map(d => d.id === id ? { ...d, stage: to } : d));
    if (String(id).toLowerCase().startsWith('local-')) return;
    const key = `deal-stage-${id}`;
    const undoBase = pendingStageRef.current.get(key) ?? prevStage;
    pendingStageRef.current.set(key, undoBase);
    const stageLabel = DEAL_STAGES.find(s => s.key === to)?.label || to;
    scheduleUndoable(key, () => {
      pendingStageRef.current.delete(key);
      setBoardNotice(cur => (cur?.key === key ? null : cur)); // 창 종료 시 알림 소거(19차 수명 계약)
      saveRevenueRecord('deal', 'update', { id, stage: to }).then((r) => {
        if (r.ok) return;
        setDeals(ds => ds.map(d => (d.id === id ? { ...d, stage: undoBase } : d)));
        setBoardNotice({ tone: 'err', label: `스테이지 이동 저장 실패 (${r.status}) — 원위치로 되돌렸습니다` });
      });
    });
    setBoardNotice({
      key,
      tone: 'ok',
      label: `${stageLabel}(으)로 이동됨`,
      undo: () => {
        if (cancelUndoable(key)) {
          pendingStageRef.current.delete(key);
          setDeals(ds => ds.map(d => (d.id === id ? { ...d, stage: undoBase } : d)));
        }
        setBoardNotice(null);
      },
    });
  };
  // 딜별 체크리스트 카운트 (공유 실행 척추의 보드 표면) — tasks 원장에서 meta.deal_id로
  // 연결된 하위 항목을 집계해 카드에 ✓n/m으로 얹는다. 드로어가 닫힐 때 재집계해서
  // 방금 추가·완료한 항목이 보드에 바로 반영되게 한다.
  const [dealTaskStats, setDealTaskStats] = React.useState(new Map());
  const loadDealTaskStats = React.useCallback(async () => {
    try {
      const res = await fetch('/api/hub/tasks', { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      const stats = new Map();
      (Array.isArray(data?.tasks) ? data.tasks : []).forEach((t) => {
        if (!t.dealId) return;
        const s = stats.get(t.dealId) || { done: 0, total: 0 };
        s.total += 1;
        if (t.done) s.done += 1;
        stats.set(t.dealId, s);
      });
      setDealTaskStats(stats);
    } catch { /* board count is decorative — the drawer keeps its own live list */ }
  }, []);
  // 마운트 + 드로어 닫힘 재조회를 한 이펙트로 — 마운트 시 editDealId가 null이라 이펙트가
  // 둘이면 동일 요청이 2번 나간다(첫 진입 비용 2배).
  React.useEffect(() => { if (!editDealId) loadDealTaskStats(); }, [editDealId, loadDealTaskStats]);

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
      close: '미정', // card footer display — stays a formatted label until the next reload
      closeAt: '', // the drawer's real, writable date field (see buildDealWrite)
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
    if (r.ok) {
      // 저장 성공 시점에 드래프트를 보드에 커밋 — 타이핑 중에는 보드가 재계산되지 않는다.
      const draft = dealDrafts[editDealId];
      const realId = isNew && r.id ? r.id : editDealId;
      setDeals(ds => ds.map(d => (d.id === editDealId ? { ...d, ...(draft || {}), id: realId } : d)));
      setDealDrafts(prev => { if (!prev[editDealId]) return prev; const next = { ...prev }; delete next[editDealId]; return next; });
      if (isNew && r.id) setEditDealId(realId);
    }
    return r;
  };

  // Delete: optimistic drop + 실패 시 카드 복원 (드로어가 봉투를 소비해 원인 표시).
  const deleteDeal = async () => {
    if (!editDealId) return { ok: false };
    const id = editDealId;
    const removed = deals.find(d => d.id === id) || null;
    const isLocal = String(id).toLowerCase().startsWith('local-');
    setDeals(ds => ds.filter(d => d.id !== id));
    if (isLocal) return { ok: true, status: 'local' };
    const r = await saveRevenueRecord('deal', 'delete', { id });
    if (!r.ok && removed) {
      setDeals(ds => (ds.some(d => d.id === id) ? ds : [removed, ...ds])); // preview 포함 복원(7차)
    }
    return r;
  };

  // ?new=deal — TopBar New·⌘K 생성 딥링크 1회 소비(§8.1 생성·연계, Leads와 동일 계약).
  const createdDealFromQueryRef = React.useRef(false);
  React.useEffect(() => {
    if (searchParams.get('new') !== 'deal') { createdDealFromQueryRef.current = false; return; }
    if (createdDealFromQueryRef.current) return;
    createdDealFromQueryRef.current = true;
    createDeal();
    router.replace(pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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

  // 키보드 계층(2026-08-05 배선): j/k 카드 이동(컬럼 순서로 평탄화) · e 편집 · n 생성 ·
  // 1–5 선택 딜 스테이지 이동 · Esc 해제. 수제 n 리스너를 훅으로 흡수. 치트시트(?)의
  // "1–5 스테이지 이동"은 이 배선이 생기면서 다시 유효해졌다.
  const boardItems = React.useMemo(
    () => DEAL_STAGES.flatMap(s => visibleDeals.filter(d => d.stage === s.key && (filter === 'all' || d.type === filter))),
    [visibleDeals, filter],
  );
  const selection = useCrmSelection(boardItems);
  useCrmKeyboard({
    selection,
    onNew: () => createDeal(),
    onEditSelected: (id) => setEditDealId(id),
    onStageMove: (stageIndex) => {
      if (!selection.selectedId) return;
      const stage = DEAL_STAGES[stageIndex];
      if (stage) move(selection.selectedId, stage.key);
    },
  });
  React.useEffect(() => {
    if (!selection.selectedId) return;
    document.querySelector(`[data-deal-card="${CSS.escape(String(selection.selectedId))}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selection.selectedId]);

  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)', height: '100%' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Deals</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
            열린 파이프라인 <span className="mono" style={{ color: 'var(--fg)' }}>{fmt(openTotal)}</span> · <span className="mono">{openCount}</span>건
            {closingTotal > 0 && <> · 클로징 <span className="mono" style={{ color: 'var(--moon-200)' }}>{fmt(closingTotal)}</span></>}
            <SyncBadge state={syncState} />
            {boardNotice && (
              <span role={boardNotice.tone === 'err' ? 'alert' : 'status'} aria-live="polite" style={{ marginLeft: 8, fontSize: 11.5, color: boardNotice.tone === 'err' ? 'var(--danger)' : 'var(--fg-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {boardNotice.label}
                {boardNotice.undo && <Button variant="ghost" size="xs" onClick={boardNotice.undo}>되돌리기</Button>}
              </span>
            )}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {hiddenCount > 0 && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 10, fontSize: 11.5, color: 'var(--fg-muted)' }}>
            <Checkbox checked={showHidden} onChange={setShowHidden} size={16} label={`숨긴 딜 ${hiddenCount}건 보기`} />
            <span>숨긴 딜 {hiddenCount}건 보기</span>
          </div>
        )}
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
                  background: STAGE_FILL[s.ramp] || 'var(--fg-faint)',
                  opacity: sum ? 0.9 : 0.25,
                }}
              />
            );
          })}
        </div>
      )}

      {wsEmpty && (
        syncState === 'error' ? (
          <LedgerReadError noun="딜 파이프라인" onRetry={reloadLedger} />
        ) : (
        <Card>
          <EmptyState
            icon="deals"
            title={`${ws.label} — 해당하는 딜이 없습니다`}
            description={`이 워크스페이스에 매칭되는 딜이 없습니다. 다른 워크스페이스로 태그된 딜은 여기에 표시되지 않습니다. 딜을 등록하거나 기록에 ${ws.label} 태그가 연결되면 파이프라인이 채워집니다.`}
            action={<Button variant="primary" size="sm" icon="plus" onClick={() => createDeal()}>Deal <Kbd>N</Kbd></Button>}
            style={{ minHeight: 200, padding: '28px 12px' }}
          />
        </Card>
        )
      )}

      {!wsEmpty && (
      <ScrollShadowX>
        {DEAL_STAGES.map(s => {
          const items = visibleDeals.filter(d => d.stage === s.key && (filter === 'all' || d.type === filter));
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
                // Stage heat as a 1px top stripe (§5.2 inset-stripe idiom, rotated to the
                // column top) so the funnel's cold→hot gradient reads across the board and
                // ties each column to its masthead gauge segment.
                boxShadow: `inset 0 1px 0 0 ${STAGE_LINE[s.ramp] || 'var(--line-strong)'}`,
              }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-soft)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{s.label}</span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)', marginLeft: 'auto' }}>{totals[s.key]?.count ?? 0}</span>
                </div>
                <div className="mono" style={{ fontSize: 12, color: totals[s.key]?.sum ? 'var(--fg-muted)' : 'var(--fg-faint)', marginTop: 4 }}>{fmt(totals[s.key]?.sum ?? 0)}</div>
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
                    data-deal-card={d.id}
                    onClick={() => { if (dragMovedRef.current) return; setEditDealId(d.id); }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditDealId(d.id); } }}
                    onDragStart={() => { dragMovedRef.current = true; setDrag(d.id); }}
                    onDragEnd={() => { setDrag(null); setTimeout(() => { dragMovedRef.current = false; }, 0); }}
                    style={{
                      background: 'var(--surface-2)',
                      // 숨긴 딜은 전체 opacity 대신 dashed 엣지 + 숨김 뱃지(§5.3 — 상태를
                      // 흐림으로 인코딩하지 않는다). 드래그 중 0.4는 인터랙션 피드백이라 유지.
                      border: `1px ${d.hidden ? 'dashed' : 'solid'} var(--line-soft)`,
                      borderRadius: 'var(--r-sm)',
                      padding: '10px 11px', cursor: 'grab',
                      opacity: drag === d.id ? 0.4 : 1,
                      boxShadow: stalled ? 'inset 1px 0 0 var(--danger-line)' : undefined,
                      // j/k 키보드 선택 — §5.3 선택은 Moonstone 외곽 outline.
                      outline: selection.selectedId === d.id ? '1px solid var(--moon-300)' : undefined,
                      outlineOffset: 1,
                    }}>
                    {/* 이름이 첫 줄 — UUID는 판단 데이터가 아니라 드로어 부제로 충분한 계기
                        소음이었다. 카드에서 가장 좋은 자리는 고객이 갖는다. */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <div style={{
                        flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--fg)', lineHeight: 1.35,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>{d.name}</div>
                      <IconButton
                        icon="eye"
                        size={20}
                        iconSize={12}
                        tooltip={d.hidden ? '파이프라인에 다시 보이기' : '파이프라인에서 숨기기'}
                        onClick={(e) => { e.stopPropagation(); toggleDealHidden(d.id, !d.hidden); }}
                      />
                      <IconButton
                        icon="sparkle"
                        size={20}
                        iconSize={12}
                        tooltip="Guru에게 진단 요청"
                        onClick={(e) => { e.stopPropagation(); onNavigate?.(guruChatPath({ mode: 'deal-review', ref: d.id })); }}
                      />
                      {d.hidden && <Badge tone="neutral" size="xs" variant="outline">숨김</Badge>}
                      <Badge tone={d.type === 'personal' ? 'personal' : 'company'} size="xs">
                        {d.type === 'personal' ? 'P' : 'C'}
                      </Badge>
                    </div>
                    {/* 금액이 카드에서 가장 밝은 데이터 — 영업 보드의 두 번째 읽기 대상. */}
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span className="mono" style={{ fontSize: 12.5, color: d.value ? 'var(--moon-100)' : 'var(--fg-faint)' }}>{fmt(d.value)}</span>
                      <div style={{ flex: 1 }} />
                      {(() => {
                        const stat = dealTaskStats.get(d.id);
                        return stat?.total ? (
                          <span className="mono" style={{ fontSize: 10.5, color: stat.done === stat.total ? 'var(--fg-muted)' : 'var(--fg-faint)' }}>
                            ✓{stat.done}/{stat.total}
                          </span>
                        ) : null;
                      })()}
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
                  className="hub-kanban-add"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    width: '100%', padding: '7px 8px', marginTop: items.length ? 2 : 0,
                    fontSize: 11.5, borderRadius: 'var(--r-sm)', cursor: 'pointer',
                  }}>
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
          // 단계+금액 한 줄 — 결정에 실제로 쓰이는 두 값. 타입+마감은 그다음 줄, 부차적.
          // 담당은 뺐다: 1인 운영 시스템이라 항상 Me뿐이고, buildDealWrite가 애초에
          // owner를 저장한 적이 없어 편집 가능한 척만 하던 필드였다.
          { key: 'stage', row: 'primary', label: '단계', type: 'select', options: [
            ...DEAL_STAGES.map(s => ({ value: s.key, label: s.label })),
            ...(DEAL_STAGES.some(s => s.key === 'lost') ? [] : [{ value: 'lost', label: 'Lost' }]),
          ] },
          { key: 'value', row: 'primary', label: '금액 (₩)', inputType: 'number', placeholder: '0' },
          { key: 'closeAt', row: 'meta', label: '예상 마감', inputType: 'date' },
          { key: 'type', row: 'meta', label: '타입', type: 'select', options: [{ value: 'company', label: 'Company' }, { value: 'personal', label: 'Personal' }] },
        ]}
        onChange={(key, val) => setDealDrafts(prev => ({ ...prev, [editDealId]: { ...prev[editDealId], [key]: val } }))}
        onSave={persistDeal}
        onDelete={deleteDeal}
        onClose={() => {
          // 닫기 = 미저장 드래프트 폐기(EditDrawer의 dirty confirm이 이미 실수를 막는다).
          setDealDrafts(prev => { if (!editDealId || !prev[editDealId]) return prev; const next = { ...prev }; delete next[editDealId]; return next; });
          setEditDealId(null);
        }}
      >
        <DealTaskPanel deal={editingDeal} onSaved={loadDealTaskStats} />
        <DealNextMeetingPanel deal={editingDeal} onNavigate={onNavigate} />
        <DealLinkedProjectsPanel deal={editingDeal} onNavigate={onNavigate} />
      </EditDrawer>
    </div>
  );
}

// Shared grid template for Cases — gap added so Type/Priority/Status chips never butt the next column
const CASES_GRID = '80px 1fr 160px 112px 100px 100px 110px 90px';

// 우선순위·상태는 알파벳이 아니라 심각도/수명 순서로 정렬한다 (§8.1 — 단계는 퍼널 순).
const CASE_PRIORITY_RANK = { low: 0, med: 1, high: 2 };
const CASE_STATUS_RANK = { Open: 0, Waiting: 1, Resolved: 2 };

function sortCases(rows, sort) {
  if (!sort.key) return rows;
  const dir = sort.dir === 'desc' ? -1 : 1;
  const value = (c) => sort.key === 'priority' ? (CASE_PRIORITY_RANK[c.priority] ?? -1)
    : sort.key === 'status' ? (CASE_STATUS_RANK[c.status] ?? -1)
    : sort.key === 'opened' ? new Date(c.openedAt || 0).getTime()
    : String(c[sort.key] || '').toLowerCase();
  return [...rows].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    return av < bv ? -dir : av > bv ? dir : 0;
  });
}

export function Cases() {
  const { ledger, syncState } = useRevenueLedger();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [localCases, setLocalCases] = React.useState([]);
  const [caseEdits, setCaseEdits] = React.useState({}); // { [id]: patch } — overlays any case
  const [deletedCaseIds, setDeletedCaseIds] = React.useState(() => new Set());
  const [editCaseId, setEditCaseId] = React.useState(null);
  const [sort, setSort] = React.useState({ key: null, dir: 'asc' });
  const ledgerCases = Array.isArray(ledger.cases) ? ledger.cases : [];
  const mergedCases = [...localCases, ...ledgerCases]
    .filter(c => !deletedCaseIds.has(c.id))
    .map(c => (caseEdits[c.id] ? { ...c, ...caseEdits[c.id] } : c));
  const cases = sortCases(mergedCases, sort);
  const editingCase = editCaseId ? mergedCases.find(c => c.id === editCaseId) : null;
  // asc → desc → 해제(원장 순) 3단 토글 — Leads와 같은 계약.
  const toggleSort = (key) => setSort(s =>
    s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : { key: null, dir: 'asc' }
  );
  // lifecycle은 §5.3 중립 — 라벨/아이콘이 상태를 말한다.
  const sTone = { Open: 'neutral', Waiting: 'neutral', Resolved: 'neutral' };
  const pTone = { high: 'danger', med: 'neutral', low: 'neutral' };
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
      openedAt: new Date().toISOString(),
      owner: 'Me',
    }, ...prev]);
    setEditCaseId(id); // open the editor immediately so the new case can be filled in
  };

  // ?new=case — TopBar New·⌘K 생성 딥링크 1회 소비(§8.1 생성·연계, Leads와 동일 계약).
  const createdCaseFromQueryRef = React.useRef(false);
  React.useEffect(() => {
    if (searchParams.get('new') !== 'case') { createdCaseFromQueryRef.current = false; return; }
    if (createdCaseFromQueryRef.current) return;
    createdCaseFromQueryRef.current = true;
    createCase();
    router.replace(pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Deep-link: ?case=<id> opens that case's EditDrawer once the ledger has loaded — Leads의
  // ?lead=와 같은 one-shot 계약 (소비 후 쿼리 소거, 새로고침 시 재실행 없음).
  const caseParam = searchParams?.get('case') || null;
  const consumedCaseRef = React.useRef(null);
  React.useEffect(() => {
    if (!caseParam || syncState === 'loading') return;
    if (consumedCaseRef.current === caseParam) return;
    if (mergedCases.some(c => String(c.id) === String(caseParam))) {
      consumedCaseRef.current = caseParam;
      setEditCaseId(caseParam);
      if (pathname) router.replace(pathname);
    }
  }, [caseParam, syncState, mergedCases, pathname, router]);

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
    const id = editCaseId;
    const isLocal = String(id).startsWith('CASE-');
    setLocalCases(prev => prev.filter(c => c.id !== id));
    setDeletedCaseIds(prev => new Set(prev).add(id));
    if (isLocal) return { ok: true, status: 'local' };
    const r = await saveRevenueRecord('case', 'delete', { id });
    if (!r.ok) {
      setDeletedCaseIds(prev => { const n = new Set(prev); n.delete(id); return n; }); // 실패·preview 복원(7차)
    }
    return r;
  };

  // Page-level `n` — 공유 훅으로 흡수: 수제 리스너는 드로어/팔레트 열림 가드가 빠져
  // ⌘K 아래에서도 발화했다(2026-08-05 재감사 M).
  const createCaseHotkey = React.useCallback(() => { if (!editCaseId) createCase(); }, [editCaseId]);
  usePageCreateHotkey(createCaseHotkey);
  // j/k/e — 나머지 Revenue 테이블 3곳과 같은 키보드 문법(4차 재감사 S: Cases만 공백).
  const caseKbRows = React.useMemo(() => cases.map((c) => ({ id: c.id })), [cases]);
  const caseSelection = useCrmSelection(caseKbRows);
  useCrmKeyboard({
    selection: caseSelection,
    onEditSelected: (id) => setEditCaseId(id),
  });
  React.useEffect(() => {
    if (!caseSelection.selectedId) return;
    document.querySelector(`[data-case-row="${CSS.escape(String(caseSelection.selectedId))}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [caseSelection.selectedId]);

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
        <div className="hub-table-min" style={{ display: 'grid', gridTemplateColumns: CASES_GRID, gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--line-soft)', fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          <span>ID</span><SortHead k="title" sort={sort} onToggle={toggleSort}>Title</SortHead><SortHead k="account" sort={sort} onToggle={toggleSort}>Account</SortHead><span>Type</span><SortHead k="priority" sort={sort} onToggle={toggleSort}>Priority</SortHead><SortHead k="status" sort={sort} onToggle={toggleSort}>Status</SortHead><SortHead k="opened" sort={sort} onToggle={toggleSort}>Opened</SortHead><span style={{ textAlign: 'right' }}>Owner</span>
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
          <div key={c.id} className="hub-row hub-table-min"
            role="button" tabIndex={0}
            data-case-row={c.id}
            onClick={() => setEditCaseId(c.id)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditCaseId(c.id); } }}
            style={{
              display: 'grid', gridTemplateColumns: CASES_GRID, gap: 12,
              padding: 'var(--pad-y) var(--pad-x)', alignItems: 'center', cursor: 'pointer',
              outline: caseSelection.selectedId === c.id ? '1px solid var(--moon-300)' : undefined,
              outlineOffset: -1,
              borderBottom: i < cases.length - 1 ? '1px solid var(--line-soft)' : 'none',
              // High-priority open cases carry a danger left-accent (§5.2) — resolved ones stay quiet.
              boxShadow: c.priority === 'high' && c.status !== 'Resolved' ? 'inset 1px 0 0 var(--danger-line)' : undefined,
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
          // 오픈 시점·담당은 뺐다: opened는 opened_at에서 파생된 상대 라벨(수정 불가)이고,
          // owner는 리드/딜과 같은 이유(1인 운영, buildCaseWrite가 저장한 적 없음)로 죽은 필드였다.
          { key: 'type', row: 'class', label: '타입', type: 'select', options: [{ value: 'company', label: 'Company' }, { value: 'personal', label: 'Personal' }] },
          { key: 'priority', row: 'class', label: '우선순위', type: 'select', options: [{ value: 'low', label: 'Low' }, { value: 'med', label: 'Med' }, { value: 'high', label: 'High' }] },
          { key: 'status', label: '상태', type: 'select', options: [{ value: 'Open', label: 'Open' }, { value: 'Waiting', label: 'Waiting' }, { value: 'Resolved', label: 'Resolved' }] },
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

// health는 risk만 danger — ok/주의는 라벨이 말한다(§5.2 no-warning-by-default).
const H_TONE = { ok: 'neutral', warning: 'neutral', risk: 'danger' };

const ACT_ICON = { email: 'email', meeting: 'calendar', call: 'signal', note: 'edit', deal: 'deals', kakao: 'chat', quote: 'orders', ai: 'sparkle', info_session: 'brief', demo: 'play', visit: 'building', update: 'rhythm' };
// 활동 종류는 카테고리 — 아이콘(ACT_ICON)이 종류를 말하고 톤은 전부 중립(§5.2 동결).
const ACT_TONE = { email: 'neutral', meeting: 'neutral', call: 'neutral', note: 'neutral', deal: 'neutral', kakao: 'neutral', quote: 'neutral', ai: 'neutral', info_session: 'neutral', demo: 'neutral', visit: 'neutral', update: 'neutral' };
const ACT_LABEL = { email: 'Email', meeting: 'Meeting', call: 'Call', note: 'Note', deal: 'Deal', kakao: '카카오', quote: '견적', ai: 'AI', info_session: '설명회', demo: '데모', visit: '방문', update: 'Update' };
const REACTION_LABEL = { positive: '긍정', neutral: '중립', concern: '우려', rejected: '거절', no_response: '무응답' };
// 반응은 기록 데이터 — 색 증명 없이 라벨로 읽는다. 전부 중립.
const REACTION_TONE = { positive: 'neutral', neutral: 'neutral', concern: 'neutral', rejected: 'neutral', no_response: 'neutral' };

function emptyDetail() {
  return { mrr: 0, contacts: [], deals: [], activity: [], notes: [] };
}

function HealthDot({ health }) {
  const tone = H_TONE[health] || 'neutral';
  return (
    <span
      title={health}
      style={{
        width: 7, height: 7, borderRadius: 999,
        background: tone === 'danger' ? 'var(--danger)' : 'var(--moon-500)',
        display: 'inline-block',
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
    { key: 'call',    icon: 'signal',   label: '통화 기록' },
    { key: 'kakao',   icon: 'chat',     label: '카카오·문자 기록' },
    { key: 'meeting', icon: 'calendar', label: '일정 잡기' },
    { key: 'note',    icon: 'edit',     label: '메모 추가' },
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
            <button key={it.key} className="hub-row"
              onClick={() => { onAction(it.key); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', width: '100%',
                padding: '7px 10px', fontSize: 12, color: 'var(--fg)',
                border: 'none', borderRadius: 4,
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <Iconed name={it.icon} size={12} style={{ marginRight: 8, color: 'var(--fg-muted)' }} />
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// `preset` is set by a quick-action click (ContactMenu/QuickActions — "Schedule meeting" etc.):
// it seeds the type + a starting draft instead of the old behavior of silently writing a
// canned message with no way to enter real details. `preset.seq` is a bump counter so clicking
// the same quick action twice in a row (e.g. "Schedule meeting" again before saving) still
// re-applies the preset and re-focuses, even though type/text otherwise look unchanged.
function LogComposer({ onLog, preset }) {
  const [type, setType] = React.useState('note');
  const [text, setText] = React.useState('');
  const textRef = React.useRef(null);

  React.useEffect(() => {
    if (!preset) return;
    setType(preset.type || 'note');
    setText(preset.text || '');
    textRef.current?.focus();
  }, [preset?.seq]);

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
        ref={textRef}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="활동 기록… (통화, 카카오·문자, 미팅, 결정 요약 등)"
        rows={2}
        style={{
          width: '100%', resize: 'vertical',
          background: 'transparent', border: 'none',
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

// `primary`는 이 묶음에서 채워진 버튼을 하나만 고른다. 계정 상세 패널에서는 통화 기록이
// 그 화면의 유일한 primary라 기본값이지만, 저장 버튼을 가진 드로어 안에서는 null을 넘겨
// 전부 outline으로 낮춘다 — 한 화면에 지배적 primary는 하나뿐이다(§5.2).
function QuickActions({ onAction, primary = 'call' }) {
  const acts = [
    { k: 'call',    label: '통화 기록',        icon: 'signal' },
    { k: 'kakao',   label: '메시지 기록',      icon: 'chat' },
    { k: 'meeting', label: '일정 잡기',        icon: 'calendar' },
    { k: 'deal',    label: '딜 메모',           icon: 'deals' },
    { k: 'note',    label: '메모',              icon: 'edit' },
  ];
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {acts.map(a => (
        <Button key={a.k} variant={a.k === primary ? 'primary' : 'outline'} size="xs" icon={a.icon} onClick={() => onAction(a.k)}>{a.label}</Button>
      ))}
    </div>
  );
}

// 리드 상세의 "기록" 탭 — Accounts DetailPanel과 같은 crm_activities 원장을 읽고 쓴다.
// 리드 표면에는 편집 폼만 있었고 접촉 이력을 보려면 고객 DB/팔로업으로 나가야 했다.
//
// 조인 규칙은 Customer 360·팔로업 활동 패널과 동일하다: 라이브 crm_activities는 기록이
// 회사 기준으로 쌓여 왔고(110행 중 company_id 109 · lead_id 1) 리드 id로만 걸면 사실상
// 전 리드가 "기록 없음"으로 보인다. 회사가 붙은 리드는 companyId로 조회하고, 그 사실을
// 화면에 명시한다(§5.3 source truth — 무엇을 보고 있는지 숨기지 않는다).
// 쓰기는 leadId + companyId를 함께 실어 이후 회사 조회에도 걸리게 한다.
function LeadActivityPanel({ lead, onCountChange }) {
  const [activities, setActivities] = React.useState([]);
  const [syncState, setSyncState] = React.useState('loading'); // loading | live | preview | error
  const [error, setError] = React.useState(null); // { message, body? }
  const [deleteNotice, setDeleteNotice] = React.useState(null); // { key, label, undo }
  const [composerPreset, setComposerPreset] = React.useState({ type: 'note', text: '', seq: 0 });
  const { schedule: scheduleUndoable, cancel: cancelUndoable } = useUndoableAction();

  const leadId = lead?.id || null;
  const companyId = lead?.companyId || null;
  // 아직 저장 안 된 로컬 행 — 원장에 붙일 id가 없다.
  const unsaved = !leadId || String(leadId).startsWith('local-lead-');

  React.useEffect(() => {
    if (unsaved) { setActivities([]); setSyncState('preview'); return undefined; }
    let alive = true;
    setSyncState('loading');
    setError(null);
    const qs = companyId
      ? `companyId=${encodeURIComponent(companyId)}`
      : `leadId=${encodeURIComponent(leadId)}`;
    fetch(`/api/hub/revenue/activity?${qs}`, { cache: 'no-store' })
      .then(r => {
        // 5xx를 preview로 오독하면 "연락한 적 없음"으로 읽힌다 — 읽기 실패는 error(§5.3).
        if (!r.ok) throw new Error(`activity ${r.status}`);
        return r.json();
      })
      .then(d => {
        if (!alive) return;
        setActivities(Array.isArray(d.activities) ? d.activities : []);
        setSyncState(d.status === 'live' ? 'live' : 'preview');
      })
      .catch(() => { if (alive) setSyncState('error'); });
    return () => { alive = false; };
  }, [leadId, companyId, unsaved]);

  // 탭 배지 건수 — 읽기 전/실패는 null(0건이 사실인 것처럼 보이지 않게).
  const countRef = React.useRef(onCountChange);
  countRef.current = onCountChange;
  React.useEffect(() => {
    countRef.current?.(syncState === 'loading' || syncState === 'error' ? null : activities.length);
  }, [activities.length, syncState]);

  const logActivity = ({ type, msg }) => {
    const body = String(msg || '').trim();
    if (!body) return;
    const tempId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setError(null);
    setActivities(prev => [{ id: tempId, type, msg: body, at: '방금', who: 'Me' }, ...prev]);
    if (unsaved) {
      setError({ message: '리드를 먼저 저장해야 기록이 원장에 남습니다. 지금 기록은 이 화면에만 있습니다.' });
      return;
    }
    saveRevenueRecord('activity', 'create', {
      leadId,
      ...(companyId ? { companyId } : {}),
      type,
      body,
    }).then(r => {
      if (r.ok && r.id) {
        setActivities(prev => prev.map(a => (a.id === tempId ? { ...a, id: r.id } : a)));
        return;
      }
      // 무언 소실 금지: 실패한 낙관 행을 걷어내고 입력을 에러에 실어 복원 가능하게 둔다.
      setActivities(prev => prev.filter(a => a.id !== tempId));
      setError({
        body,
        message: r.status === 'preview'
          ? 'Supabase 미설정 — 기록이 저장되지 않았습니다.'
          : '기록 저장에 실패했습니다. 다시 시도하세요.',
      });
    });
  };

  // 삭제는 Accounts와 같은 지연-undo 계약: 낙관 제거 → 되돌리기 창 → 창이 지나면 실제 DELETE.
  const deleteActivity = (activity) => {
    const match = row => (activity.id ? row.id === activity.id : row === activity);
    const removed = activities.filter(match);
    setActivities(prev => prev.filter(row => !match(row)));
    if (!activity.id || String(activity.id).startsWith('local-')) return; // 미저장 행은 로컬 드롭으로 끝
    const key = `lead-activity-delete-${activity.id}`;
    const restore = () => setActivities(prev => [...removed, ...prev.filter(row => !match(row))]);
    scheduleUndoable(key, () => {
      setDeleteNotice(cur => (cur?.key === key ? null : cur));
      saveRevenueRecord('activity', 'delete', { id: activity.id }).then(r => {
        if (r.ok) return;
        restore();
        setError({ message: `기록 삭제 실패 (${r.status}) — 행을 복원했습니다.` });
      });
    });
    setDeleteNotice({
      key,
      label: '기록 삭제됨',
      undo: () => { if (cancelUndoable(key)) restore(); setDeleteNotice(null); },
    });
  };

  const handleQuickAction = (kind) => {
    const starters = { call: '통화: ', kakao: '카카오·문자: ', meeting: '미팅: ', deal: '', note: '' };
    setComposerPreset(p => ({ type: kind, text: starters[kind] ?? '', seq: p.seq + 1 }));
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        기록<SyncBadge state={syncState} />
      </div>

      {/* 회사 조인은 이 리드 한 건이 아니라 같은 회사의 접촉 이력 전체를 보여준다 — 명시한다. */}
      {!unsaved && companyId && (
        <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', lineHeight: 1.45 }}>
          {lead?.companyName ? `${lead.companyName} 기준` : '회사 기준'}으로 묶인 기록입니다 — 같은 회사의 다른 접촉도 함께 보입니다.
        </div>
      )}
      {unsaved && (
        <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', lineHeight: 1.45 }}>
          아직 저장되지 않은 리드입니다. 먼저 저장하면 기록이 원장에 남습니다.
        </div>
      )}

      {error && (
        <div role="alert" style={{ fontSize: 11.5, color: 'var(--danger)', lineHeight: 1.5 }}>
          {error.message}
          {error.body && <span style={{ color: 'var(--fg-muted)' }}> · 입력: “{error.body}”</span>}
        </div>
      )}
      {deleteNotice && (
        <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--fg-muted)' }}>
          <span>{deleteNotice.label}</span>
          <Button variant="ghost" size="xs" onClick={deleteNotice.undo}>되돌리기</Button>
        </div>
      )}

      <QuickActions onAction={handleQuickAction} primary={null} />
      <LogComposer onLog={logActivity} preset={composerPreset} />

      {syncState === 'loading' ? (
        <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>불러오는 중…</div>
      ) : syncState === 'error' ? (
        <EmptyState
          icon="clock"
          title="활동 기록을 읽지 못했습니다"
          description="원장 연결 상태를 확인한 뒤 드로어를 다시 열어 주세요. 기록이 없다는 뜻이 아닙니다."
          style={{ minHeight: 140 }}
        />
      ) : activities.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--fg-faint)', padding: '12px 0' }}>아직 기록이 없습니다.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {activities.map((a, i) => (
            <div key={a.id ?? i} style={{
              display: 'grid', gridTemplateColumns: '18px 1fr auto auto',
              gap: 10, padding: '10px 0',
              borderBottom: i < activities.length - 1 ? '1px solid var(--line-soft)' : 'none',
              alignItems: 'flex-start',
            }}>
              <span style={{ color: 'var(--fg-muted)', marginTop: 1 }}>
                <Iconed name={ACT_ICON[a.type] || 'edit'} size={13} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{a.msg}</div>
                <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginTop: 3, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Badge tone={ACT_TONE[a.type] || 'neutral'} size="xs" variant="outline">{ACT_LABEL[a.type] || a.type}</Badge>
                  {a.reaction && <Badge tone={REACTION_TONE[a.reaction] || 'neutral'} size="xs" variant="outline">{REACTION_LABEL[a.reaction] || a.reaction}</Badge>}
                  <span>{a.who}</span>
                </div>
              </div>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', whiteSpace: 'nowrap', marginTop: 1 }}>{a.at}</span>
              <IconButton icon="x" size={20} iconSize={11} tooltip="기록 삭제" onClick={() => deleteActivity(a)} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function DetailPanel({ account, detail, onLog, onDeleteActivity, onPinNote, onAddNote, onNavigate, activityError, deleteNotice, onRename }) {
  const [renaming, setRenaming] = React.useState(false);
  const [tab, setTab] = React.useState('activity');
  const [noteText, setNoteText] = React.useState('');
  // Quick actions (ContactMenu/QuickActions — "Schedule meeting" etc.) used to write a
  // canned message straight to crm_activities with no way to enter real details. Now they
  // switch to Activity and seed LogComposer instead — the click chooses the type + a starter
  // draft, the operator still has to type and hit Save. `seq` forces LogComposer to re-apply
  // the preset even if type/text look unchanged from the last click.
  const [composerPreset, setComposerPreset] = React.useState({ type: 'note', text: '', seq: 0 });
  const handleQuickAction = (kind, contactName) => {
    const type = kind;
    const starters = {
      email: '이메일: ',
      meeting: '미팅: ',
      kakao: '카카오·문자: ',
      call: '통화: ',
      deal: '',
      note: '',
    };
    const text = contactName ? `${contactName} — ${starters[kind] || ''}` : (starters[kind] || '');
    setTab('activity');
    setComposerPreset((p) => ({ type, text, seq: p.seq + 1 }));
  };
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
    { key: 'deals',    label: 'Deals',    count: d.deals.length },
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
              {renaming ? (
                <input
                  autoFocus
                  defaultValue={account.name}
                  aria-label="계정 이름 변경"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { onRename?.(e.currentTarget.value); setRenaming(false); }
                    if (e.key === 'Escape') { e.stopPropagation(); setRenaming(false); }
                  }}
                  onBlur={(e) => { onRename?.(e.currentTarget.value); setRenaming(false); }}
                  style={{ fontSize: 17, fontWeight: 500, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', color: 'var(--fg)', padding: '2px 8px', minWidth: 160 }}
                />
              ) : (
                <div style={{ fontSize: 17, fontWeight: 500 }}>{account.name}</div>
              )}
              {onRename && !renaming && (
                <IconButton icon="edit" size={22} iconSize={12} tooltip="이름 변경" onClick={() => setRenaming(true)} />
              )}
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
                <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Deals</div>
                <div className="mono" style={{ fontSize: 13, marginTop: 3 }}>{account.deals}</div>
              </div>
              <div>
                <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Value</div>
                <div className="mono" style={{ fontSize: 13, marginTop: 3, color: 'var(--moon-200)' }}>{fmt(account.value)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>MRR</div>
                <div className="mono" style={{ fontSize: 13, marginTop: 3 }}>{d.mrr ? fmt(d.mrr) : '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Last contact</div>
                <div className="mono" style={{ fontSize: 12, marginTop: 3, color: 'var(--fg-muted)' }}>{account.last} · {account.lastAt}</div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <QuickActions onAction={handleQuickAction} />
          <Button
            variant="secondary"
            size="xs"
            icon="sparkle"
            onClick={() => onNavigate?.(guruChatPath({ mode: 'deal-review', ref: account.name }))}
          >
            Ask Guru
          </Button>
        </div>
        {(account.nextAction || account.dormant) && (
          <div style={{ marginTop: 12, padding: '9px 11px', display: 'flex', alignItems: 'flex-start', gap: 8, border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)' }}>
            <Iconed name="arrowRight" size={12} style={{ marginTop: 2, color: 'var(--moon-300)' }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-faint)' }}>다음 행동</div>
              <div style={{ marginTop: 2, fontSize: 12.5, lineHeight: 1.45, color: 'var(--moon-200)' }}>
                {account.dormant ? '기약 없음' : account.nextAction}
                {account.nextActionAt && <span className="mono" style={{ marginLeft: 7, fontSize: 10.5, color: 'var(--fg-muted)' }}>{String(account.nextActionAt).slice(0, 10)}</span>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} active={tab} onChange={setTab} style={{ padding: '0 var(--card-pad)' }} />

      {/* Body */}
      <div className="scroll-y" style={{ flex: 1, minHeight: 0, padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tab === 'activity' && (
          <>
            {activityError && (
              <div role="alert" style={{ fontSize: 11.5, color: 'var(--danger)', lineHeight: 1.5 }}>
                {activityError.message}
                {activityError.body && <span style={{ color: 'var(--fg-muted)' }}> · 입력: “{activityError.body}”</span>}
              </div>
            )}
            {deleteNotice && (
              <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--fg-muted)' }}>
                <span>{deleteNotice.label}</span>
                <Button variant="ghost" size="xs" onClick={deleteNotice.undo}>되돌리기</Button>
              </div>
            )}
            <LogComposer onLog={onLog} preset={composerPreset} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {d.activity.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--fg-faint)', padding: '12px 0' }}>아직 기록이 없습니다.</div>
              )}
              {d.activity.map((a, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '18px 1fr auto auto',
                  gap: 10, padding: '10px 0',
                  borderBottom: i < d.activity.length - 1 ? '1px solid var(--line-soft)' : 'none',
                  alignItems: 'flex-start',
                }}>
                  <span style={{ color: 'var(--fg-muted)', marginTop: 1 }}>
                    <Iconed name={ACT_ICON[a.type] || 'edit'} size={13} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{a.msg}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginTop: 3, display: 'flex', gap: 6, alignItems: 'center' }}>
                      <Badge tone={ACT_TONE[a.type]} size="xs" variant="outline">{ACT_LABEL[a.type]}</Badge>
                      {a.reaction && <Badge tone={REACTION_TONE[a.reaction] || 'neutral'} size="xs" variant="outline">{REACTION_LABEL[a.reaction] || a.reaction}</Badge>}
                      <span>{a.who}</span>
                    </div>
                  </div>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', whiteSpace: 'nowrap', marginTop: 1 }}>{a.at}</span>
                  <IconButton icon="x" size={20} iconSize={11} tooltip="기록 삭제" onClick={() => onDeleteActivity(a)} />
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
                    {c.phone && <span>{c.phone}</span>}
                    {c.email && <span>{c.email}</span>}
                    {!c.phone && !c.email && <span>연락처 미등록</span>}
                  </div>
                  {c.labels.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                      {c.labels.map((label) => <Badge key={label} tone="neutral" size="xs" variant="outline">{label}</Badge>)}
                    </div>
                  )}
                  <div className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginTop: 3 }}>Last: {c.lastContact}</div>
                </div>
                <ContactMenu onAction={(kind) => handleQuickAction(kind, c.name)} />
              </div>
            ))}
          </div>
        )}

        {tab === 'deals' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {d.deals.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--fg-faint)' }}>이 계정에 연결된 딜이 없습니다.</div>
            )}
            {d.deals.map((deal) => {
              const stage = DEAL_STAGES.find((item) => item.key === deal.stage);
              return (
                <button
                  key={deal.id}
                  type="button"
                  onClick={() => onNavigate?.(`dashboard/revenue/deals?deal=${encodeURIComponent(deal.id)}`)}
                  style={{
                    display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center',
                    width: '100%', padding: 12, textAlign: 'left', cursor: 'pointer',
                    color: 'var(--fg)', background: 'var(--surface-2)',
                    border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)',
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{deal.name}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4 }}>
                      <Badge tone="neutral" size="xs" variant="outline">{stage?.label || deal.stage}</Badge>
                      <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>마감 {deal.close || '미정'}</span>
                    </span>
                  </span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--moon-200)' }}>{fmt(deal.value)}</span>
                </button>
              );
            })}
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
                  background: 'transparent', border: 'none',
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
  const { ledger, syncState, reload: reloadLedger } = useRevenueLedger();
  const [localAccounts, setLocalAccounts] = React.useState([]);
  const ledgerAccounts = Array.isArray(ledger.accounts) ? ledger.accounts : [];
  // Scope the merged ledger to the active workspace (pass-through when unscoped). The
  // The ledger hook only exposes API-backed records; scoping never mixes sources.
  const ws = getWorkspace(workspace);
  const ACCOUNTS = filterAccountsByWorkspace([...localAccounts, ...ledgerAccounts], workspace);
  const wsEmpty = Boolean(ws) && ACCOUNTS.length === 0;
  const [view, setView] = React.useState('cards'); // cards | list | detail
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState(() => {
    // 사이드바 personal 스코프 경로(?scope=personal)를 실소비 — 착지 시 개인 필터로 시작
    // (기존: 스코프 토글이 데이터에 아무 영향 없는 과약속, 4차 재감사 M).
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('scope') === 'personal') return 'personal';
    return 'all';
  });
  const [selected, setSelected] = React.useState(null);
  const [details, setDetails] = React.useState({});
  const [sort, setSort] = React.useState({ key: null, dir: 'asc' });

  const term = search.trim().toLowerCase();
  // 검색 텍스트 인덱스를 원장 변경 시 1회만 조립(re-audit 속도 #4) — 이전에는 키스트로크마다
  // 계정×(contacts 200 + deals 120) 관계 조인을 다시 돌렸다(≈38k 비교/문자).
  const accountSearchText = React.useMemo(() => {
    const map = new Map();
    ACCOUNTS.forEach((a) => {
      const relationship = buildAccountRelationshipDetail(a, ledger);
      map.set(a.name, [
        a.name,
        a.nextAction,
        a.dormant ? '기약 없음 휴면' : null,
        ...relationship.contacts.flatMap((contact) => [contact.name, contact.role, contact.phone, contact.email, ...contact.labels]),
        ...relationship.deals.map((deal) => deal.name),
      ].filter(Boolean).join(' ').toLowerCase());
    });
    return map;
  }, [ACCOUNTS, ledger]);
  const searched = React.useMemo(
    () => ACCOUNTS.filter(a => (filter === 'all' || a.type === filter) && (!term || (accountSearchText.get(a.name) || '').includes(term))),
    [ACCOUNTS, accountSearchText, filter, term],
  );
  // asc → desc → 해제(원장 순) 3단 토글 — Leads·Cases와 같은 §8.1 계약. health는
  // 알파벳이 아니라 심각도 순(ok<warning<risk), value·deals는 숫자.
  const ACCOUNT_HEALTH_RANK = { ok: 0, warning: 1, risk: 2 };
  const filtered = React.useMemo(() => {
    if (!sort.key) return searched;
    const dir = sort.dir === 'desc' ? -1 : 1;
    const value = (a) => sort.key === 'health' ? (ACCOUNT_HEALTH_RANK[a.health] ?? -1)
      : sort.key === 'value' ? (Number(a.value) || 0)
      : sort.key === 'deals' ? (Number(a.deals) || 0)
      : String(a[sort.key] || '').toLowerCase();
    return [...searched].sort((x, y) => {
      const xv = value(x); const yv = value(y);
      return xv < yv ? -dir : xv > yv ? dir : 0;
    });
  }, [searched, sort]);
  const toggleSort = (key) => setSort(s =>
    s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : { key: null, dir: 'asc' }
  );

  // Keep selection valid across filter changes
  React.useEffect(() => {
    if (view === 'detail' && !filtered.find(a => a.name === selected)) {
      setSelected(filtered[0]?.name ?? null);
    }
  }, [view, filtered, selected]);

  const getDetail = (account) => {
    if (!account) return emptyDetail();
    const linked = buildAccountRelationshipDetail(account, ledger);
    const stored = details[account.name] || emptyDetail();
    return { ...stored, contacts: linked.contacts, deals: linked.deals };
  };
  const [activityError, setActivityError] = React.useState(null); // { name, message, body? }
  const [deleteNotice, setDeleteNotice] = React.useState(null); // { key, name, label, undo }
  const { schedule: scheduleUndoable, cancel: cancelUndoable } = useUndoableAction();

  // 활동·노트는 crm_activities 원장으로 영속화한다. 계정에 id가 없으면(로컬 생성 직후)
  // 낙관적 로컬 행만 유지 — preview 상태로 정직하게 남긴다.
  const persistActivity = (name, entry, { alsoNote = false } = {}) => {
    const acc = ACCOUNTS.find(a => a.name === name);
    const tempId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const localRow = { id: tempId, at: '방금', who: 'Me', pinned: false, ...entry };

    setDetails(prev => {
      const cur = prev[name] || emptyDetail();
      return {
        ...prev,
        [name]: {
          ...cur,
          activity: [localRow, ...cur.activity],
          ...(alsoNote
            ? { notes: [{ id: tempId, at: '방금', pinned: false, body: entry.msg }, ...cur.notes] }
            : {}),
        },
      };
    });

    if (!acc?.id) {
      // 아직 저장 안 된 로컬 계정 — 기록이 원장에 남지 않는다는 사실을 표시한다.
      setActivityError({ name, message: '계정을 먼저 저장해야 기록이 원장에 남습니다. 지금 기록은 이 화면에만 있습니다.' });
      return;
    }
    saveRevenueRecord('activity', 'create', {
      accountId: acc.id,
      companyId: acc.companyId,
      type: entry.type,
      body: entry.msg,
    }).then(r => {
      if (!r.ok || !r.id) {
        // 무음 소실 금지(re-audit S4): 실패한 낙관 행을 걷어내고 입력을 에러에 실어 복원한다.
        setDetails(prev => {
          const cur = prev[name];
          if (!cur) return prev;
          const drop = row => row.id !== tempId;
          return { ...prev, [name]: { ...cur, activity: cur.activity.filter(drop), notes: cur.notes.filter(drop) } };
        });
        setActivityError({
          name,
          message: r.status === 'preview' ? 'Supabase 미설정 — 기록이 저장되지 않았습니다.' : '기록 저장에 실패했습니다. 다시 시도하세요.',
          body: entry.msg,
        });
        return;
      }
      setActivityError(null);
      // 임시 id → 실제 id 치환 (pinned 토글이 서버 행을 가리키도록)
      setDetails(prev => {
        const cur = prev[name];
        if (!cur) return prev;
        const swap = row => (row.id === tempId ? { ...row, id: r.id } : row);
        return { ...prev, [name]: { ...cur, activity: cur.activity.map(swap), notes: cur.notes.map(swap) } };
      });
    });
  };

  const pushActivity = (name, entry) => persistActivity(name, entry);

  const handleLog = (name) => ({ type, msg }) => {
    pushActivity(name, { type, msg });
  };

  // 삭제는 3.5초 지연 쓰기 + 되돌리기(공유 undo 계약) — 이전엔 확인도 되돌리기도 없이
  // 즉시 hard delete였고 쓰기 결과도 확인하지 않았다(2026-08-05 재감사 L). 창 안에 되돌리면
  // 서버 왕복 없이 진짜 취소, 창이 지나면 실행하고 실패 시 행 복원 + 에러 명명.
  const handleDeleteActivity = (name) => (activity) => {
    const match = row => (activity.id ? row.id === activity.id : row === activity);
    let removedActivity = [];
    let removedNotes = [];
    setDetails(prev => {
      const cur = prev[name];
      if (!cur) return prev;
      removedActivity = cur.activity.filter(match);
      removedNotes = cur.notes.filter(match);
      return {
        ...prev,
        [name]: { ...cur, activity: cur.activity.filter(row => !match(row)), notes: cur.notes.filter(row => !match(row)) },
      };
    });
    const restoreRows = () => setDetails(prev => {
      const cur = prev[name] || emptyDetail();
      return {
        ...prev,
        [name]: {
          ...cur,
          activity: [...removedActivity, ...cur.activity],
          notes: [...removedNotes, ...cur.notes],
        },
      };
    });
    if (!activity.id || String(activity.id).startsWith('local-')) return; // 로컬 행은 클라이언트 드롭으로 끝
    const key = `activity-delete-${activity.id}`;
    scheduleUndoable(key, () => {
      setDeleteNotice(cur => (cur?.key === key ? null : cur));
      saveRevenueRecord('activity', 'delete', { id: activity.id }).then((r) => {
        if (r.ok) return;
        restoreRows();
        setActivityError({ name, message: `기록 삭제 실패 (${r.status}) — 행을 복원했습니다.` });
      });
    });
    setDeleteNotice({ key, name, label: '기록 삭제됨', undo: () => { if (cancelUndoable(key)) restoreRows(); setDeleteNotice(null); } });
  };

  const handlePinNote = (name) => (note) => {
    const nextPinned = !note.pinned;
    const flipTo = (pinned) => setDetails(prev => {
      const cur = prev[name] || emptyDetail();
      const flip = n => ((note.id ? n.id === note.id : n === note) ? { ...n, pinned } : n);
      return {
        ...prev,
        [name]: { ...cur, notes: cur.notes.map(flip), activity: cur.activity.map(flip) },
      };
    });
    flipTo(nextPinned);
    if (note.id && !String(note.id).startsWith('local-')) {
      saveRevenueRecord('activity', 'update', { id: note.id, pinned: nextPinned }).then((r) => {
        if (r.ok) return;
        flipTo(!nextPinned); // 실패한 핀 토글은 명시적으로 되돌린다 — 무언 리버트 금지
        setActivityError({ name, message: `핀 저장 실패 (${r.status})` });
      });
    }
  };

  const handleAddNote = (name) => (body) => {
    persistActivity(name, { type: 'note', msg: body }, { alsoNote: true });
  };

  const selectedAcc = filtered.find(a => a.name === selected) || null;

  // Detail 뷰 진입/계정 전환 시 crm_activities에서 활동·노트를 로드한다.
  React.useEffect(() => {
    if (view !== 'detail' || !selectedAcc?.id) return;
    const acc = selectedAcc;
    let alive = true;
    const query = acc.companyId
      ? `companyId=${encodeURIComponent(acc.companyId)}`
      : `accountId=${encodeURIComponent(acc.id)}`;
    fetch(`/api/hub/revenue/activity?${query}`, { cache: 'no-store' })
      .then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => null) }))
      .then(({ ok, data }) => {
        if (!alive) return;
        if (!ok || !data || data.status === 'error') {
          // 읽기 실패로 보이던 기록을 []로 갈아치우지 않는다 — 표시 유지 + 에러 명명.
          setActivityError({ name: acc.name, message: '활동 기록을 읽지 못했습니다 — 다시 열면 재시도합니다.' });
          return;
        }
        const rows = Array.isArray(data.activities) ? data.activities : [];
        setDetails(prev => {
          const cur = prev[acc.name] || emptyDetail();
          // 서버 행 + 아직 저장 안 된 로컬 행(local- 접두)만 병합 — 중복 없이 원장이 정본
          const localOnly = cur.activity.filter(a => String(a.id).startsWith('local-'));
          const activity = [...localOnly, ...rows];
          return {
            ...prev,
            [acc.name]: {
              ...cur,
              activity,
              notes: activity
                .filter(a => a.type === 'note')
                .map(a => ({ id: a.id, at: a.at, pinned: a.pinned, body: a.msg })),
            },
          };
        });
      })
      .catch(() => {
        if (alive) setActivityError({ name: acc.name, message: '활동 기록을 읽지 못했습니다 — 다시 열면 재시도합니다.' });
      });
    return () => { alive = false; };
  }, [view, selectedAcc?.id, selectedAcc?.companyId]);

  const openDetail = (name) => {
    setSelected(name);
    setView('detail');
  };

  // 딥링크: ?account=<name> — 원장 로드 후 1회만 열고 쿼리 소거(§8.1). Revenue 표면 중
  // 유일하게 딥링크가 없던 표면이었다(system-eval U-S3).
  const accountSearchParams = useSearchParams();
  const accountRouter = useRouter();
  const accountPathname = usePathname();
  const accountParam = accountSearchParams?.get('account') || null;
  const consumedAccountRef = React.useRef(null);
  React.useEffect(() => {
    if (!accountParam || consumedAccountRef.current === accountParam) return;
    if (!ACCOUNTS.some(a => a.name === accountParam)) return;
    consumedAccountRef.current = accountParam;
    setSelected(accountParam);
    setView('detail');
    if (accountPathname) accountRouter.replace(accountPathname);
  }, [accountParam, ACCOUNTS, accountPathname, accountRouter]);

  // 키보드 계층(§8.1 표준): j/k 이동 · e 상세 · n 생성 · / 검색 — 다른 Revenue 표면과 동일.
  const accountSearchRef = React.useRef(null);
  const [accountsNotice, setAccountsNotice] = React.useState(null);
  React.useEffect(() => {
    if (!accountsNotice) return undefined;
    const id = setTimeout(() => setAccountsNotice(null), 8000);
    return () => clearTimeout(id);
  }, [accountsNotice]);
  const accountKbRows = React.useMemo(() => filtered.map(a => ({ id: a.name })), [filtered]);
  const accountSelection = useCrmSelection(accountKbRows);
  useCrmKeyboard({
    selection: accountSelection,
    onNew: () => createAccount(),
    onEditSelected: (name) => openDetail(name),
    onSearchFocus: () => accountSearchRef.current?.focus(),
  });
  // j/k 커서를 화면 안에 유지 — cards 뷰는 그리드라 리스트식 scrollIntoView가 없다.
  React.useEffect(() => {
    if (!accountSelection.selectedId) return;
    document.querySelector('[data-kb-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [accountSelection.selectedId]);
  // 생성은 즉시 영속 — 이전에는 로컬 전용 '새 계정' 팬텀(저장 경로·이름 변경 없음,
  // 새로고침 시 증발, 기록 시도 시 "먼저 저장해야" 안내만)이었다(2026-08-05 재감사 L).
  const createAccount = async () => {
    const name = `새 계정 ${new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date())}`;
    const type = filter === 'personal' || filter === 'company' ? filter : 'company';
    setLocalAccounts(prev => [{
      name,
      type,
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
    const r = await saveRevenueRecord('account', 'create', { name, type, ...(ws ? { workspace } : {}) });
    if (r.ok && r.id) {
      setLocalAccounts(prev => prev.map(a => (a.name === name ? { ...a, id: r.id } : a)));
    } else if (r.status !== 'preview') {
      // 라이브 백엔드 거부 — 팬텀을 남기지 않고 제거 + 명명 (preview=미구성만 로컬 유지 정당).
      // activityError는 detail 패널 전용이라 목록 복귀 후엔 보이지 않는다 — 페이지 알림 사용
      // (5차 재감사: 무언 실패로 남던 유일한 생성 경로).
      setLocalAccounts(prev => prev.filter(a => a.name !== name));
      setView('list');
      setAccountsNotice(`계정 생성 실패 (${r.status}) — 다시 시도하세요.`);
    }
  };

  // ?new=account — TopBar New·⌘K 생성 딥링크 1회 소비(§8.1 생성·연계, Leads와 동일 계약).
  const createdAccountFromQueryRef = React.useRef(false);
  React.useEffect(() => {
    if (accountSearchParams.get('new') !== 'account') { createdAccountFromQueryRef.current = false; return; }
    if (createdAccountFromQueryRef.current) return;
    createdAccountFromQueryRef.current = true;
    createAccount();
    if (accountPathname) accountRouter.replace(accountPathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountSearchParams]);

  // 이름 변경 — 상세 헤더 연필 버튼. details/selected가 이름 키라 네 곳을 함께 옮긴다.
  const renameAccount = async (account, nextNameRaw) => {
    const nextName = String(nextNameRaw || '').trim();
    if (!nextName || nextName === account.name) return;
    const prevName = account.name;
    const applyName = (from, to) => {
      setLocalAccounts(prev => prev.map(a => (a.name === from ? { ...a, name: to } : a)));
      setDetails(prev => {
        if (!prev[from]) return prev;
        const next = { ...prev, [to]: prev[from] };
        delete next[from];
        return next;
      });
      setSelected(cur => (cur === from ? to : cur));
    };
    applyName(prevName, nextName);
    if (!account.id) return; // 미영속(preview) 행은 로컬 이름만
    const r = await saveRevenueRecord('account', 'update', { id: account.id, name: nextName });
    if (!r.ok) {
      applyName(nextName, prevName);
      setActivityError({ name: prevName, message: `이름 변경 실패 (${r.status})` });
    }
  };

  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Accounts</h2>
          {accountsNotice && <div role="alert" style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{accountsNotice}</div>}
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

        <Input ref={accountSearchRef} className="hub-toolbar" placeholder="계정·담당자·전화·딜 검색…" icon="search" value={search} onChange={setSearch} />
        <Button variant="primary" size="sm" icon="plus" onClick={createAccount}>Account <Kbd>N</Kbd></Button>
      </div>

      {wsEmpty && (
        syncState === 'error' ? (
          <LedgerReadError noun="계정 목록" onRetry={reloadLedger} />
        ) : (
        <Card>
          <EmptyState
            icon="accounts"
            title={`${ws.label} — 해당하는 계정이 없습니다`}
            description={`이 워크스페이스에 매칭되는 계정이 없습니다. 다른 워크스페이스로 태그된 계정은 여기에 표시되지 않습니다. 계정을 등록하거나 기록에 ${ws.label} 태그가 연결되면 나타납니다.`}
            action={<Button variant="primary" size="sm" icon="plus" onClick={createAccount}>Account 등록</Button>}
            style={{ minHeight: 200, padding: '28px 12px' }}
          />
        </Card>
        )
      )}

      {/* Content by view */}
      {!wsEmpty && view === 'cards' && (
        <div className="hub-card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--gap)' }}>
          {filtered.map(a => (
            <Card
              key={a.name}
              interactive
              data-kb-selected={accountSelection.selectedId === a.name ? 'true' : undefined}
              style={{
                cursor: 'pointer',
                // j/k 커서 — 기본 뷰(cards)에서도 선택 위치가 보이게 (§8.1; 재감사 M)
                ...(accountSelection.selectedId === a.name
                  ? { outline: '1px solid var(--moon-300)', outlineOffset: 2 }
                  : {}),
              }}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => openDetail(a.name)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(a.name); } }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <Avatar name={a.name} size={36} tone={a.type === 'personal' ? 'personal' : 'company'} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <Badge tone={a.type === 'personal' ? 'personal' : 'company'} size="xs">{a.type === 'personal' ? 'Personal' : 'Company'}</Badge>
                      <HealthDot health={a.health} />
                      {a.health === 'risk' && <span style={{ fontSize: 10.5, color: 'var(--danger)' }}>위험</span>}
                      {buildAccountRelationshipDetail(a, ledger).contacts.length > 0 && (
                        <span style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{buildAccountRelationshipDetail(a, ledger).contacts.length}명</span>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingTop: 10, borderTop: '1px solid var(--line-soft)' }}>
                  <div>
                    <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Value</div>
                    <div className="mono" style={{ fontSize: 13, color: 'var(--fg)', marginTop: 3 }}>{fmt(a.value)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Deals · Last</div>
                    <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 3 }}>
                      {a.deals} · <span className="mono">{a.last}</span>
                    </div>
                  </div>
                </div>
                {(a.nextAction || a.dormant) && (
                  <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--line-soft)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                    <Iconed name="arrowRight" size={11} style={{ marginTop: 2, color: 'var(--moon-300)' }} />
                    <span style={{ minWidth: 0, fontSize: 11.5, lineHeight: 1.4, color: 'var(--fg-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {a.dormant ? '기약 없음' : a.nextAction}{a.nextActionAt ? ` · ${String(a.nextActionAt).slice(0, 10)}` : ''}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          ))}
          {filtered.length === 0 && (
            <Card style={{ gridColumn: '1 / -1' }}>
              <EmptyState
                icon="accounts"
                title={search.trim() ? '검색 결과가 없습니다' : '계정이 없습니다'}
                description={search.trim() ? '다른 검색어를 시도하거나 검색을 지우세요.' : syncState === 'live' ? 'Supabase customer_accounts 기록에 표시할 계정이 없습니다.' : '필터를 조정하거나 첫 계정을 등록하세요.'}
                action={search.trim()
                  ? <Button variant="outline" size="sm" onClick={() => setSearch('')}>검색 지우기</Button>
                  : <Button variant="primary" size="sm" icon="plus" onClick={createAccount}>Account</Button>}
              />
            </Card>
          )}
        </div>
      )}

      {!wsEmpty && view === 'list' && (
        <Card pad={false} className="hub-table-card">
          <div className="hub-table-min" style={{
            display: 'grid',
            gridTemplateColumns: '32px 1.6fr 110px 70px 110px 70px 120px 100px 100px',
            gap: 12,
            padding: '10px 16px',
            borderBottom: '1px solid var(--line-soft)',
            fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em',
          }}>
            <span /><SortHead k="name" sort={sort} onToggle={toggleSort}>Name</SortHead><span>Type</span><SortHead k="health" sort={sort} onToggle={toggleSort}>Health</SortHead><SortHead k="value" sort={sort} onToggle={toggleSort}>Value</SortHead><SortHead k="deals" sort={sort} onToggle={toggleSort}>Deals</SortHead><span>Last contact</span><span>Owner</span><span style={{ textAlign: 'right' }}>마지막 접점 시간</span>
          </div>
          {filtered.map((a, i) => (
            <div key={a.name} className="hub-row hub-table-min"
              role="button"
              tabIndex={0}
              data-account-row={a.name}
              data-kb-selected={accountSelection.selectedId === a.name ? 'true' : undefined}
              onClick={() => openDetail(a.name)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(a.name); } }}
              style={{
                display: 'grid',
                gridTemplateColumns: '32px 1.6fr 110px 70px 110px 70px 120px 100px 100px',
                gap: 12,
                padding: 'var(--pad-y) var(--pad-x)', alignItems: 'center',
                borderBottom: i < filtered.length - 1 ? '1px solid var(--line-soft)' : 'none',
                cursor: 'pointer',
                outline: accountSelection.selectedId === a.name ? '1px solid var(--moon-300)' : undefined,
                outlineOffset: -1,
              }}
            >
              <span style={{ paddingRight: 4, display: 'flex' }}>
                <Avatar name={a.name} size={24} tone={a.type === 'personal' ? 'personal' : 'company'} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
                {(a.nextAction || a.dormant) && <span style={{ display: 'block', marginTop: 2, fontSize: 10.5, color: 'var(--fg-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.dormant ? '기약 없음' : a.nextAction}</span>}
              </span>
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
              title={search.trim() ? '검색 결과가 없습니다' : '계정이 없습니다'}
              description={search.trim() ? '다른 검색어를 시도하거나 검색을 지우세요.' : syncState === 'live' ? 'Supabase customer_accounts 기록이 비어 있습니다.' : '필터를 조정하거나 첫 계정을 등록하세요.'}
              action={search.trim()
                ? <Button variant="outline" size="sm" onClick={() => setSearch('')}>검색 지우기</Button>
                : <Button variant="primary" size="sm" icon="plus" onClick={createAccount}>Account</Button>}
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
                  <div key={a.name} className="hub-row"
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSel}
                    data-kb-selected={accountSelection.selectedId === a.name ? 'true' : undefined}
                    onClick={() => setSelected(a.name)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(a.name); } }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px', cursor: 'pointer',
                      outline: accountSelection.selectedId === a.name ? '1px solid var(--moon-300)' : undefined,
                      outlineOffset: -1,
                      borderLeft: `1px solid ${isSel ? 'var(--moon-300)' : 'transparent'}`,
                      // Selected row pins its fill inline; unselected rows leave background
                      // to .hub-row:hover (an inline 'transparent' would out-rank the class).
                      background: isSel ? 'var(--surface-2)' : undefined,
                      borderBottom: '1px solid var(--line-soft)',
                    }}
                  >
                    <Avatar name={a.name} size={28} tone={a.type === 'personal' ? 'personal' : 'company'} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
                        <HealthDot health={a.health} />
                        {a.health === 'risk' && <span style={{ fontSize: 10.5, color: 'var(--danger)', flexShrink: 0 }}>위험</span>}
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
                  title={search.trim() ? '검색 결과 없음' : '계정 없음'}
                  description={search.trim() ? '다른 검색어를 시도하거나 검색을 지우세요.' : '선택할 계정이 없습니다.'}
                  action={search.trim()
                    ? <Button variant="outline" size="sm" onClick={() => setSearch('')}>검색 지우기</Button>
                    : <Button variant="ghost" size="sm" icon="plus" onClick={createAccount}>Account 등록</Button>}
                  style={{ minHeight: 220, padding: '24px 12px' }}
                />
              )}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <DetailPanel
              account={selectedAcc}
              detail={selectedAcc ? getDetail(selectedAcc) : null}
              onLog={selectedAcc ? handleLog(selectedAcc.name) : () => {}}
              onDeleteActivity={selectedAcc ? handleDeleteActivity(selectedAcc.name) : () => {}}
              onPinNote={selectedAcc ? handlePinNote(selectedAcc.name) : () => {}}
              onAddNote={selectedAcc ? handleAddNote(selectedAcc.name) : () => {}}
              onNavigate={onNavigate}
              activityError={activityError && selectedAcc && activityError.name === selectedAcc.name ? activityError : null}
              deleteNotice={deleteNotice && selectedAcc && deleteNotice.name === selectedAcc.name ? deleteNotice : null}
              onRename={selectedAcc ? (next) => renameAccount(selectedAcc, next) : null}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
