"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Iconed } from "../hub-icons";
import { Badge, Dot, Card, Button, Progress, Tabs, Kbd, SectionTitle, EmptyState, Avatar, SyncBadge } from "../hub-primitives";
import { usePageCreateHotkey } from "../use-crm-keyboard";
import { getWorkspace, filterContentByWorkspace, filterBrandsByWorkspace } from "../workspace-map";
import { ContentStudio } from "./content-studio";

function statusKeyOf(item) {
  if (item?.statusKey) return item.statusKey;
  return String(item?.status || "").toLowerCase();
}

const EMPTY_CONTENT_LEDGER = {
  source: "preview",
  syncState: "preview",
  brands: [],
  items: [],
  variants: [],
  assets: [],
  publishLogs: [],
  campaigns: [],
  queue: [],
  pipeline: [],
  attention: [],
  summary: null,
  ideaQueue: [],
  cadence: null,
};

// 모듈 스코프 stale-while-revalidate — Studio↔Queue↔Campaigns 탭 전환마다 원장을 다시
// 기다리며 스켈레톤을 보이던 것을 제거(8차 잔여 M). 재검증 실패는 partial(위장 금지).
const CONTENT_CACHE_SERVABLE_MS = 5 * 60 * 1000;
let contentLedgerCache = null; // { at, state }

export function useContentLedger() {
  const servable = contentLedgerCache
    && Date.now() - contentLedgerCache.at < CONTENT_CACHE_SERVABLE_MS;
  const [state, setState] = React.useState(servable ? contentLedgerCache.state : EMPTY_CONTENT_LEDGER);

  React.useEffect(() => {
    let active = true;
    const hasServableCache = Boolean(
      contentLedgerCache && Date.now() - contentLedgerCache.at < CONTENT_CACHE_SERVABLE_MS
    );

    async function loadLedger() {
      if (!hasServableCache) setState((s) => ({ ...s, syncState: "loading" })); // 캐시 서빙 중엔 조용히 재검증
      try {
        const response = await fetch("/api/hub/content", { cache: "no-store" });
        const data = await response.json().catch(() => null);

        if (!active || !response.ok || !data || data.status === "error") {
          // 라이브 read 실패는 error — preview("미구성")로 뭉개면 큐가 0건이 사실처럼 보인다.
          if (active) setState((s) => ({ ...s, syncState: hasServableCache ? "partial" : "error" }));
          return;
        }

        if (data.source === "supabase") {
          const nextState = {
            source: data.source,
            syncState: data.status === "partial" ? "partial" : "live",
            brands: Array.isArray(data.brands) ? data.brands : [],
            items: Array.isArray(data.items) ? data.items : [],
            variants: Array.isArray(data.variants) ? data.variants : [],
            assets: Array.isArray(data.assets) ? data.assets : [],
            publishLogs: Array.isArray(data.publishLogs) ? data.publishLogs : [],
            campaigns: Array.isArray(data.campaigns) ? data.campaigns : [],
            queue: Array.isArray(data.queue) ? data.queue : [],
            pipeline: Array.isArray(data.pipeline) ? data.pipeline : [],
            attention: Array.isArray(data.attention) ? data.attention : [],
            summary: data.summary || null,
            ideaQueue: Array.isArray(data.ideaQueue) ? data.ideaQueue : [],
            cadence: data.cadence || null,
          };
          contentLedgerCache = { at: Date.now(), state: nextState };
          setState(nextState);
        } else {
          setState((s) => ({ ...s, source: "preview", syncState: "preview", campaigns: [], queue: [] }));
        }
      } catch {
        if (active) setState((s) => ({ ...s, syncState: hasServableCache ? "partial" : "error" }));
      }
    }

    loadLedger();
    const invalidate = () => { contentLedgerCache = null; loadLedger(); };
    window.addEventListener("moonlight:content-saved", invalidate);
    return () => {
      active = false;
      window.removeEventListener("moonlight:content-saved", invalidate);
    };
  }, []);

  return state;
}

export function Studio({ workspace }) {
  const ledger = useContentLedger();
  return <ContentStudio workspace={workspace} ledger={ledger} />;
}

export function Queue({ workspace }) {
  const ws = getWorkspace(workspace);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = React.useState('all');
  const [brandFilter, setBrandFilter] = React.useState(() => searchParams.get('brand') || 'all');
  const ledger = useContentLedger();
  // Scope the brand filter pills + queue items to this workspace (pass-through when unscoped).
  const brands = ws ? filterBrandsByWorkspace(ledger.brands || [], workspace) : (ledger.brands || []);
  const queueSource = Array.isArray(ledger.queue) ? ledger.queue : [];
  const queue = filterContentByWorkspace(queueSource, workspace);
  // 큐 lifecycle은 카테고리 — semantic 색 금지(§5.2/§5.3). 현재 단계(Ready/Review)만
  // Moonstone으로 살짝 밝히고 나머지는 라벨이 전달한다.
  const statusTone = {
    Inbox: 'neutral',
    Drafting: 'neutral',
    Ready: 'moon',
    'Handed off': 'neutral',
    Watch: 'neutral',
    Archived: 'neutral',
    Draft: 'neutral',
    Scheduled: 'neutral',
    Review: 'neutral',
    Idea: 'neutral',
    Outline: 'neutral',
    Published: 'neutral',
  };
  const tabs = [
    { key: 'all', label: 'All', count: queue.length },
    { key: 'idea', label: 'Inbox', count: queue.filter(c => statusKeyOf(c) === 'idea').length },
    { key: 'draft', label: 'Drafting', count: queue.filter(c => statusKeyOf(c) === 'draft').length },
    { key: 'review', label: 'Ready', count: queue.filter(c => statusKeyOf(c) === 'review').length },
    { key: 'scheduled', label: 'Handed off', count: queue.filter(c => statusKeyOf(c) === 'scheduled').length },
    { key: 'published', label: 'Watch', count: queue.filter(c => statusKeyOf(c) === 'published').length },
  ];
  const filteredByBrand = brandFilter === 'all'
    ? queue
    : queue.filter(c => c.brandId === brandFilter || c.brandKey === brandFilter);
  const cadence = ledger.cadence;
  const visibleQueueBase = tab === 'all'
    ? filteredByBrand
    : filteredByBrand.filter(c => statusKeyOf(c) === tab);
  const visibleQueue = tab === 'idea'
    ? [...visibleQueueBase].sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
    : visibleQueueBase;
  const activeLabel = tabs.find(t => t.key === tab)?.label || 'All';
  const openStudio = React.useCallback((id) => {
    const brandParam = brandFilter !== 'all' ? `&brand=${encodeURIComponent(brandFilter)}` : '';
    router.push(`/dashboard/content/studio${id ? `?item=${encodeURIComponent(id)}` : '?new=draft'}${id ? '' : brandParam}`);
  }, [brandFilter, router]);
  const createDraft = React.useCallback(() => openStudio(), [openStudio]);
  usePageCreateHotkey(createDraft);
  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Publishing queue</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
            {visibleQueue.length}{tab !== 'all' ? ` of ${queue.length}` : ''} items in pipeline
            <SyncBadge state={ledger.syncState} />
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Tabs className="hub-toolbar" tabs={tabs} active={tab} onChange={setTab} ariaLabel="Publishing queue filters" style={{ borderBottom: 'none' }} />
        <Button variant="primary" size="sm" icon="plus" onClick={createDraft}>Draft <Kbd>N</Kbd></Button>
      </div>

      {cadence && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          padding: '12px 16px', border: '1px solid var(--line-soft)',
          borderRadius: 'var(--r-lg)', background: 'var(--surface)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)' }}>이번 주 발행</span>
            <span className="stat" style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg)' }}>
              {cadence.published}<span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>/{cadence.goal}</span>
            </span>
            {!cadence.behind && cadence.goal > 0 ? (
              <span className="hub-celebration-badge hub-celebration-badge--sparkle">
                ✦ 목표 달성
              </span>
            ) : (
              <Badge tone="neutral" size="xs">
                {cadence.behind ? `${cadence.remaining}건 남음` : '목표 달성'}
              </Badge>
            )}
          </div>
          <div style={{ width: 1, height: 24, background: 'var(--line-soft)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)' }}>아이디어 큐</span>
            <span className="mono" style={{ fontSize: 15, color: 'var(--fg)' }}>{cadence.queueDepth}</span>
            {cadence.queueDepth < 10 && <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>· 10개 이상 권장</span>}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 28 }} aria-hidden="true">
            {(cadence.recentWeeks || []).map((w) => (
              <div
                key={w.week}
                title={`${w.week} · ${w.count}건`}
                style={{
                  width: 18,
                  height: Math.max(3, Math.min(28, (w.count / Math.max(cadence.goal, 1)) * 28)),
                  borderRadius: 3,
                  background: w.current ? 'var(--moon-300)' : 'var(--surface-3)',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {brands.length > 0 && (
        <div className="hub-toolbar" style={{ display: 'flex', gap: 6, alignItems: 'center', overflowX: 'auto', paddingBottom: 2 }}>
          {[{ id: 'all', key: 'all', name: 'All brands', glyph: '◐', tone: 'moon' }, ...brands].map((brand) => {
            const active = brandFilter === brand.id || brandFilter === brand.key;
            const count = brand.id === 'all'
              ? queue.length
              : queue.filter((item) => item.brandId === brand.id || item.brandKey === brand.key).length;
            return (
              <button
                key={brand.id}
                onClick={() => setBrandFilter(brand.id)}
                style={{
                  height: 32,
                  padding: '0 10px',
                  borderRadius: 'var(--r-sm)',
                  border: active ? '1px solid var(--line-strong)' : '1px solid var(--line-soft)',
                  background: active ? 'var(--surface-3)' : 'var(--surface)',
                  color: active ? 'var(--fg)' : 'var(--fg-muted)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                <span className="mono" style={{ color: active ? 'var(--moon-200)' : 'var(--fg-faint)' }}>{brand.glyph}</span>
                {brand.name}
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <Card pad={false} className="hub-table-card">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 100px 120px 130px 80px', padding: '10px 16px', borderBottom: '1px solid var(--line-soft)', fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          <span>Title</span><span>Kind</span><span>Channel</span><span>Brand</span><span>Lane</span><span>When</span><span style={{ textAlign: 'right' }}>Author</span>
        </div>
        {visibleQueue.length === 0 && ws && (
          <EmptyState
            icon="queue"
            title={`${ws.label} — 아직 연결된 콘텐츠가 없습니다.`}
            description="콘텐츠에 워크스페이스 태그가 붙으면 여기에 모입니다."
            action={<Button variant="primary" size="sm" icon="plus" onClick={createDraft}>Draft <Kbd>N</Kbd></Button>}
          />
        )}
        {visibleQueue.length === 0 && !ws && (
          <EmptyState
            icon="queue"
            title={tab === 'all' ? '발행 큐가 비어 있습니다' : `${activeLabel} 항목이 없습니다`}
            description={tab === 'all'
              ? (ledger.syncState === 'error'
                  ? '콘텐츠 원장을 읽지 못했습니다 — 비어 보여도 실제 콘텐츠가 있을 수 있습니다. 새로고침으로 재시도하세요.'
                  : ledger.syncState === 'live' ? 'Supabase content_items/content_variants 기록에 표시할 콘텐츠가 없습니다.' : '초안을 만들면 큐와 파이프라인에 표시됩니다.')
              : `${activeLabel} 상태의 콘텐츠가 생기면 이 필터에 표시됩니다.`}
            action={<Button variant="primary" size="sm" icon="plus" onClick={createDraft}>Draft <Kbd>N</Kbd></Button>}
          />
        )}
        {visibleQueue.map((c, i) => (
          <div key={c.id} className="hub-row" style={{
            display: 'grid', gridTemplateColumns: '1fr 110px 110px 100px 120px 130px 80px',
            padding: '12px 16px', alignItems: 'center',
            borderBottom: i < visibleQueue.length - 1 ? '1px solid var(--line-soft)' : 'none',
            cursor: 'pointer',
          }}
            role="button"
            tabIndex={0}
            onClick={() => openStudio(c.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openStudio(c.id);
              }
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Iconed name={c.kind === 'Newsletter' ? 'email' : c.kind === 'Blog' ? 'content' : c.kind === 'Reel' ? 'play' : 'send'} size={13} style={{ color: 'var(--fg-faint)' }} />
              {c.rank != null && (
                <span className="mono" title="아이디어 랭크" style={{ fontSize: 10.5, color: 'var(--moon-300)', flexShrink: 0 }}>{Math.round(c.rank)}</span>
              )}
              <span style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{c.kind}</span>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{c.channel}</span>
            <span>
              <Badge tone={c.brandTone || 'neutral'} variant="outline" size="xs">{c.brandGlyph || '•'} {c.brandName || '—'}</Badge>
            </span>
            <span><Badge tone={statusTone[c.statusLabel || c.status] || 'neutral'} size="xs">{c.statusLabel || c.status}</Badge></span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{c.when}</span>
            <span style={{ textAlign: 'right', fontSize: 12, color: 'var(--fg-muted)' }}>{c.author}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

const CAMPAIGN_WAR_ROOMS = {};

const CAMPAIGN_TABS = [
  { key: 'pulse', label: 'Pulse' },
  { key: 'strategy', label: 'Strategy' },
  { key: 'surfaces', label: 'Surfaces' },
  { key: 'content', label: 'Content' },
  { key: 'audience', label: 'Audience' },
  { key: 'attribution', label: 'Attribution' },
  { key: 'automation', label: 'Automation' },
];

function CampaignMetric({ item }) {
  return (
    <div style={{
      padding: 12,
      background: 'var(--surface-2)',
      border: '1px solid var(--line-soft)',
      borderRadius: 'var(--r-sm)',
      minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
        <Dot tone={item.tone || 'moon'} size={6} />
        <span style={{ fontSize: 10.5, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{item.label}</span>
      </div>
      <div className="stat" style={{ fontSize: 18, color: 'var(--fg)', lineHeight: 1 }}>{item.value}</div>
      <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.detail}</div>
    </div>
  );
}

function CampaignLine({ label, value, tone = 'moon' }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '112px 1fr', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--line-soft)' }}>
      <span style={{ fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <span style={{ fontSize: 13, color: tone === 'moon' ? 'var(--fg)' : 'var(--fg-muted)', lineHeight: 1.55 }}>{value}</span>
    </div>
  );
}

function CampaignTabPanel({ tab, campaign, detail }) {
  const router = useRouter();
  // 콘텐츠 lifecycle은 카테고리 — semantic 색 금지(§5.2/§5.3), 라벨이 상태를 전달한다.
  const sTone = { Active: 'neutral', Planning: 'neutral', Draft: 'neutral', Live: 'neutral', Scheduled: 'neutral', Review: 'neutral', Idea: 'neutral' };

  if (tab === 'strategy') {
    return (
      <div className="hub-grid--split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(280px, 0.85fr)', gap: 'var(--gap)' }}>
        <Card>
          <SectionTitle subtitle="브랜드 주장, ICP, offer, proof를 캠페인 기준으로 고정합니다.">Positioning Stack</SectionTitle>
          <CampaignLine label="ICP" value={detail.strategy.icp} />
          <CampaignLine label="Promise" value={detail.strategy.promise} />
          <CampaignLine label="Wedge" value={detail.strategy.wedge} />
          <CampaignLine label="Enemy" value={detail.strategy.enemy} />
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
          <Card>
            <SectionTitle>Proof Assets</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {detail.strategy.proof.map((item) => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--fg-muted)' }}>
                  <Iconed name="check" size={12} style={{ color: 'var(--moon-300)' }} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <SectionTitle subtitle="Master log는 Work > Decisions가 소유하고, 여기는 캠페인 관련 결정만 표시합니다.">Decision Bets</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {detail.strategy.decisions.map((item, i) => (
                <div key={item.label} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: '10px 0', borderBottom: i < detail.strategy.decisions.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
                  <div style={{ fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.45 }}>{item.label}</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Badge tone="neutral" size="xs">{item.status}</Badge>
                    <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{item.owner}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (tab === 'surfaces') {
    return (
      <Card pad={false} className="hub-table-card">
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-soft)' }}>
          <SectionTitle style={{ marginBottom: 0 }} subtitle="랜딩, 홍보, 광고, referral, 공개 콘텐츠를 이 캠페인 기준으로 묶습니다.">Connected Surfaces</SectionTitle>
        </div>
        {detail.surfaces.map((item, i) => (
          <div key={`${item.type}-${item.name}`} style={{
            display: 'grid',
            gridTemplateColumns: '96px minmax(180px, 1.2fr) minmax(150px, 0.9fr) minmax(130px, 0.8fr) minmax(130px, 0.7fr)',
            gap: 12,
            padding: '13px 18px',
            alignItems: 'center',
            borderBottom: i < detail.surfaces.length - 1 ? '1px solid var(--line-soft)' : 'none',
          }}>
            <Badge tone={sTone[item.status] || 'neutral'} size="xs">{item.type}</Badge>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.url}</div>
            </div>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{item.role}</span>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{item.cta}</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{item.signal}</span>
          </div>
        ))}
      </Card>
    );
  }

  if (tab === 'content') {
    return (
      <div className="hub-grid--split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: 'var(--gap)' }}>
        <Card pad={false} className="hub-table-card">
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-soft)' }}>
            <SectionTitle style={{ marginBottom: 0 }} subtitle="Studio와 Queue를 대체하지 않고, 캠페인에 묶인 소재만 보여줍니다.">Campaign Content</SectionTitle>
          </div>
          {detail.content.map((item, i) => (
            <div key={item.title} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 100px minmax(150px, 0.8fr)', gap: 12, padding: '13px 18px', alignItems: 'center', borderBottom: i < detail.content.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <Iconed name={item.channel === 'Email' || item.channel === 'Newsletter' ? 'email' : item.channel === 'Web' ? 'globe' : 'content'} size={13} style={{ color: 'var(--fg-faint)' }} />
                <span style={{ fontSize: 13, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</span>
              </div>
              <Badge tone={sTone[item.stage] || 'neutral'} size="xs">{item.stage}</Badge>
              <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{item.channel}</span>
              <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{item.action}</span>
            </div>
          ))}
        </Card>
        <Card>
          <SectionTitle subtitle="AI가 한 소재를 여러 표면으로 바꾸는 큐입니다.">Repurpose Queue</SectionTitle>
          {['Newsletter → X thread', 'Landing proof → ad hook', 'Case note → email intro'].map((item) => (
            <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderBottom: '1px solid var(--line-soft)' }}>
              <Iconed name="sparkle" size={12} style={{ color: 'var(--moon-300)' }} />
              <span style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>{item}</span>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            icon="studio"
            style={{ marginTop: 12, width: '100%' }}
            onClick={() => router.push(`/dashboard/content/studio?new=draft&campaign=${encodeURIComponent(campaign.id)}`)}
          >
            Open Studio
          </Button>
        </Card>
      </div>
    );
  }

  if (tab === 'audience') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 'var(--gap)' }}>
        {detail.audience.map((item) => (
          <Card key={item.segment}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar name={item.segment} size={30} tone="neutral" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.segment}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 2 }}>{item.source}</div>
              </div>
              <span className="mono" style={{ fontSize: 16, color: 'var(--fg)' }}>{item.count}</span>
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>ICP fit</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{item.fit}%</span>
              </div>
              <Progress value={item.fit} tone="moon" />
            </div>
            <div style={{ marginTop: 12, padding: '9px 10px', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', border: '1px solid var(--line-soft)', fontSize: 12, color: 'var(--fg-muted)' }}>
              Next: {item.next}
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (tab === 'attribution') {
    return (
      <Card pad={false} className="hub-table-card">
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-soft)' }}>
          <SectionTitle style={{ marginBottom: 0 }} subtitle="Revenue 전체가 아니라 이 캠페인이 만든 리드와 pipeline만 봅니다.">Campaign Attribution</SectionTitle>
        </div>
        {detail.attribution.map((item, i) => (
          <div key={item.channel} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 110px minmax(160px, 1fr)', gap: 12, padding: '13px 18px', alignItems: 'center', borderBottom: i < detail.attribution.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
            <span style={{ fontSize: 13, color: 'var(--fg)' }}>{item.channel}</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{item.spend}</span>
            <span className="mono" style={{ fontSize: 12, color: 'var(--fg)' }}>{item.leads} leads</span>
            <span className="mono" style={{ fontSize: 12, color: 'var(--moon-200)' }}>{item.pipeline}</span>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{item.note}</span>
          </div>
        ))}
      </Card>
    );
  }

  if (tab === 'automation') {
    return (
      <div className="hub-grid--split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 'var(--gap)' }}>
        <Card pad={false} className="hub-table-card">
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-soft)' }}>
            <SectionTitle style={{ marginBottom: 0 }} subtitle="전체 flow builder는 Automations가 소유하고, 여기는 캠페인 관련 runtime만 표시합니다.">AI and Automation Runtime</SectionTitle>
          </div>
          {detail.automations.map((item, i) => (
            <div key={item.name} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 150px 100px 90px', gap: 12, padding: '13px 18px', alignItems: 'center', borderBottom: i < detail.automations.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <Iconed name={item.ai === 'None' ? 'zap' : 'sparkle'} size={13} style={{ color: item.ai === 'None' ? 'var(--fg-faint)' : 'var(--moon-300)' }} />
                <span style={{ fontSize: 13, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
              </div>
              <Badge tone="neutral" size="xs">{item.status}</Badge>
              <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{item.ai}</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{item.last}</span>
              <span className="mono" style={{ fontSize: 11, color: item.health.includes('needs') ? 'var(--fg)' : 'var(--fg-muted)' }}>{item.health}</span>
            </div>
          ))}
        </Card>
        <Card>
          <SectionTitle subtitle="approval이 필요한 자동 실행만 여기에 떠야 합니다.">Guardrails</SectionTitle>
          {['광고비 지출 전 수동 승인', '새 lead email 발송 전 dry-run', 'CTA 변경 시 decision 기록'].map((item) => (
            <div key={item} style={{ display: 'flex', gap: 8, padding: '9px 0', borderBottom: '1px solid var(--line-soft)', fontSize: 12.5, color: 'var(--fg-muted)' }}>
              <Iconed name="lock" size={12} style={{ color: 'var(--fg-faint)', marginTop: 2 }} />
              <span>{item}</span>
            </div>
          ))}
        </Card>
      </div>
    );
  }

  return (
    <div className="hub-grid--split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 'var(--gap)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
        <Card>
          <SectionTitle subtitle="오늘 이 캠페인에서 움직여야 할 판단입니다.">Operator Pulse</SectionTitle>
          <div style={{ fontSize: 14, color: 'var(--fg)', lineHeight: 1.55, marginBottom: 14 }}>{detail.pulse.positioning}</div>
          <CampaignLine label="Next move" value={detail.pulse.nextMove} />
          <CampaignLine label="Risk" value={detail.pulse.risk} tone="muted" />
        </Card>
        <Card>
          <SectionTitle subtitle="AI는 실행자가 아니라 campaign operator를 보조하는 판단 레이어입니다.">AI Recommendations</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            {detail.pulse.ai.map((item) => (
              <div key={item.label} style={{ padding: 12, border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)' }}>
                <Badge tone={item.tone} size="xs">{item.label}</Badge>
                <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.5, marginTop: 8 }}>{item.detail}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card>
        <SectionTitle subtitle="캠페인 단위 실행 기록입니다. 전체 로그는 Evolution/Automations가 소유합니다.">Recent Activity</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {detail.activity.map((item, i) => (
            <div key={item} style={{ display: 'grid', gridTemplateColumns: '18px 1fr', gap: 8, padding: '10px 0', borderBottom: i < detail.activity.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
              <Dot tone={i === 0 ? 'moon' : 'neutral'} size={7} style={{ marginTop: 6 }} />
              <span style={{ fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.5 }}>{item}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// Live campaigns (real Supabase rows) don't have curated war-room content yet —
// the deep strategy/surfaces/audience/attribution breakdown is a separate,
// larger data-model decision (see docs/personal-os audit, 2026-07-10). Rather
// so a real campaign gets an honest placeholder until that model is built.
function buildPreviewCampaignDetail(campaign) {
  return {
    pulse: {
      positioning: '아직 전략이 작성되지 않았습니다.',
      nextMove: 'Strategy 탭에서 ICP·promise·wedge를 정의하면 다음 행동이 표시됩니다.',
      risk: '',
      ai: [],
      metrics: [
        { label: 'Goal', value: `${campaign?.current ?? 0} / ${campaign?.goal || '—'}`, detail: campaign?.status || '', tone: 'neutral' },
      ],
    },
    strategy: { icp: '', promise: '', wedge: '', enemy: '', proof: [], decisions: [] },
    surfaces: [],
    content: [],
    audience: [],
    attribution: [],
    automations: [],
    activity: [],
  };
}

export function Campaigns() {
  const router = useRouter();
  // 캠페인 lifecycle도 중립 — done/paused는 라벨·아이콘 몫(§5.3).
  const sTone = { Active: 'neutral', Planning: 'neutral', Draft: 'neutral', Paused: 'neutral', Completed: 'neutral' };
  const ledger = useContentLedger();
  const [campaigns, setCampaigns] = React.useState([]);
  const [selectedId, setSelectedId] = React.useState(null);
  const [tab, setTab] = React.useState('pulse');
  const [focusMode, setFocusMode] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState(null);

  React.useEffect(() => {
    const nextCampaigns = Array.isArray(ledger.campaigns) ? ledger.campaigns : [];
    setCampaigns(nextCampaigns);
    setSelectedId((prev) => (nextCampaigns.some((c) => c.id === prev) ? prev : nextCampaigns[0]?.id || null));
  }, [ledger.syncState, ledger.campaigns]);

  const selected = campaigns.find(c => c.id === selectedId) || campaigns[0] || null;
  // Campaign rows without an attached war-room ledger use an honest empty detail.
  const detail = selected
    ? (CAMPAIGN_WAR_ROOMS[selected.id] || buildPreviewCampaignDetail(selected))
    : null;
  const activeTabLabel = CAMPAIGN_TABS.find(t => t.key === tab)?.label || 'Pulse';
  const createCampaign = async () => {
    if (creating) return;
    setCreating(true);
    const localId = `local-campaign-${Date.now()}`;
    const next = {
      id: localId,
      name: '새 캠페인',
      status: 'Draft',
      channels: ['Email'],
      progress: 0,
      end: '미정',
      goal: '목표 설정',
      current: 0,
    };
    setCampaigns(prev => [next, ...prev]);
    setSelectedId(localId);
    setTab('pulse');
    setFocusMode(true);
    try {
      const res = await fetch('/api/hub/content', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'campaign', name: next.name }),
      });
      const data = await res.json().catch(() => null);
      if (data?.status === 'saved' && data?.campaign?.id) {
        const savedId = data.campaign.id;
        setCampaigns(prev => prev.map(c => (c.id === localId ? { ...c, id: savedId } : c)));
        setSelectedId(savedId);
      } else {
        setCampaigns(prev => prev.filter(c => c.id !== localId));
        setSelectedId(null);
        setFocusMode(false);
        setCreateError(`캠페인 생성 실패 (${data?.status || res.status}) — 다시 시도하세요.`);
      }
    } catch {
      setCampaigns(prev => prev.filter(c => c.id !== localId));
      setSelectedId(null);
      setFocusMode(false);
      setCreateError('캠페인 생성 실패 — 네트워크를 확인하고 다시 시도하세요.');
    } finally {
      setCreating(false);
    }
  };
  const createCampaignRef = React.useRef(createCampaign);
  createCampaignRef.current = createCampaign;
  const creatingRef = React.useRef(creating);
  creatingRef.current = creating;
  const createCampaignHotkey = React.useCallback(() => {
    if (!creatingRef.current) createCampaignRef.current();
  }, []);
  usePageCreateHotkey(createCampaignHotkey);

  React.useEffect(() => {
    if (!focusMode) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setFocusMode(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusMode]);

  const toggleFocusMode = React.useCallback(() => {
    setFocusMode(v => !v);
  }, []);
  const selectCampaign = React.useCallback((id) => {
    setSelectedId(id);
    setTab('pulse');
    setFocusMode(false);
  }, []);
  const focusCampaign = React.useCallback((id) => {
    setSelectedId(id);
    setTab('pulse');
    setFocusMode(true);
  }, []);

  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Campaigns</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
            Content 안에서 Revenue, Automations, Decisions를 캠페인 기준으로 묶는 war room
            <SyncBadge state={ledger.syncState} />
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="primary" size="sm" icon="plus" onClick={() => { setCreateError(null); createCampaign(); }} disabled={creating}>Campaign <Kbd>N</Kbd></Button>
      </div>

      {createError && (
        <div role="alert" style={{ fontSize: 12, color: 'var(--danger)', padding: '0 2px' }}>{createError}</div>
      )}

      {!selected && (
        <EmptyState
          icon="campaigns"
          title="캠페인이 없습니다"
          description={ledger.syncState === 'live' ? 'Supabase campaigns 기록이 비어 있습니다.' : '캠페인을 만들면 war room에 표시됩니다.'}
          action={<Button variant="primary" size="sm" icon="plus" onClick={createCampaign} disabled={creating}>Campaign</Button>}
        />
      )}

      {selected && (
      <div
        className="campaign-war-room"
        data-focus={focusMode ? 'true' : 'false'}
        style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: 'var(--gap)', alignItems: 'start' }}
      >
        <aside className="campaign-war-room__list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {campaigns.map(c => {
            const active = c.id === selected.id;
            const cDetail = CAMPAIGN_WAR_ROOMS[c.id] || buildPreviewCampaignDetail(c);
            return (
              <div key={c.id} role="button" tabIndex={0} onClick={() => selectCampaign(c.id)} onDoubleClick={() => focusCampaign(c.id)} onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  selectCampaign(c.id);
                }
              }} style={{
                width: '100%',
                textAlign: 'left',
                padding: 0,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                borderRadius: 'var(--r-lg)',
              }}>
                <Card style={{
                  borderColor: active ? 'var(--line-strong)' : 'var(--line-soft)',
                  background: active ? 'var(--surface-2)' : 'var(--surface)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                        <Badge tone={sTone[c.status]} size="xs">{c.status}</Badge>
                        <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>ends {c.end}</span>
                      </div>
                      <div style={{ fontSize: 14.5, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                    </div>
                    <button type="button" aria-label={`${c.name} 상세 확대`} title="Focus campaign" onClick={(e) => { e.stopPropagation(); focusCampaign(c.id); }} style={{
                      width: 28,
                      height: 28,
                      borderRadius: 'var(--r-sm)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: active ? 'var(--moon-300)' : 'var(--fg-faint)',
                      background: active ? 'var(--surface-3)' : 'transparent',
                      border: '1px solid transparent',
                      cursor: 'pointer',
                      flexShrink: 0,
                      marginTop: -4,
                    }}>
                      <Iconed name="chevronR" size={13} />
                    </button>
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>Goal · {c.goal}</span>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--fg)' }}>{c.current} <span style={{ color: 'var(--fg-faint)' }}>/ {c.goal.match(/\d+/)?.[0] || '—'}</span></span>
                    </div>
                    <Progress value={c.progress} tone="moon" />
                  </div>
                  <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--fg-muted)', lineHeight: 1.45 }}>
                    {cDetail.pulse.nextMove}
                  </div>
                  <div style={{ marginTop: 12, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {c.channels.map(ch => <Badge key={ch} tone="neutral" variant="outline" size="xs">{ch}</Badge>)}
                  </div>
                </Card>
              </div>
            );
          })}
        </aside>

        <section
          className="campaign-war-room__detail"
          onDoubleClick={(e) => {
            if (e.target.closest('button, a, input, textarea, select')) return;
            toggleFocusMode();
          }}
          title={`${activeTabLabel} focus`}
          style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}
        >
          <Card pad={false} className="campaign-detail-frame">
            <div style={{ padding: 'var(--card-pad)', borderBottom: '1px solid var(--line-soft)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: 'var(--r-sm)',
                  background: 'var(--surface-3)',
                  border: '1px solid var(--line-soft)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--moon-300)',
                  flexShrink: 0,
                }}>
                  <Iconed name="campaigns" size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <Badge tone={sTone[selected.status]} size="xs">{selected.status}</Badge>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{selected.id.toUpperCase()}</span>
                    <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>scoped across Content · Revenue · Automations</span>
                  </div>
                  <h3 style={{ margin: 0, fontSize: 20, fontWeight: 550, letterSpacing: '-0.01em' }}>{selected.name}</h3>
                  <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.5, maxWidth: 760 }}>{detail.pulse.positioning}</div>
                </div>
                <Button
                  variant={focusMode ? 'secondary' : 'outline'}
                  size="sm"
                  icon={focusMode ? 'x' : 'arrowUp'}
                  onClick={toggleFocusMode}
                >
                  {focusMode ? 'Exit focus' : 'Focus'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  icon="decisions"
                  onClick={() => router.push(`/dashboard/work/decisions?new=decision&campaign=${encodeURIComponent(selected.id)}`)}
                >
                  Decision
                </Button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 18 }}>
                {detail.pulse.metrics.map((item) => <CampaignMetric key={item.label} item={item} />)}
              </div>
            </div>

            <div className="hub-scroll-x" style={{ padding: '0 var(--card-pad)', overflowX: 'auto' }}>
              <Tabs
                tabs={CAMPAIGN_TABS}
                active={tab}
                onChange={setTab}
                ariaLabel={`${selected.name} campaign detail tabs`}
                style={{ minWidth: 720 }}
              />
            </div>
          </Card>

          <div className="campaign-tab-stage" data-focus={focusMode ? 'true' : 'false'} key={`${selected.id}-${tab}-${focusMode ? 'focus' : 'normal'}`}>
            <CampaignTabPanel tab={tab} campaign={selected} detail={detail} />
          </div>
        </section>
      </div>
      )}
    </div>
  );
}
