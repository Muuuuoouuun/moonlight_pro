"use client";
import { GoalLinks } from '../goal-links';

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Iconed } from "../hub-icons";
import { Badge, Dot, Card, Button, Progress, Tabs, Kbd, SectionTitle, EmptyState, Avatar, SyncBadge, TextField, TextAreaField, SelectField } from "../hub-primitives";
import { usePageCreateHotkey } from "../use-crm-keyboard";
import { getWorkspace, filterContentByWorkspace, filterBrandsByWorkspace } from "../workspace-map";
import { ContentStudio } from "./content-studio";
import { businessTruthCompleteness, buildWeeklyScorecard, normalizeCampaignBusinessTruth } from "@/lib/campaign-business-truth";
import { ContentIdeaCapture } from "./content-idea-capture";
import { contentQueueScope, contentQueueTabs } from "@/lib/content-workflow";
import "./content-workflow.css";

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

// 모듈 스코프 stale-while-revalidate — Studio↔Queue↔Campaigns 탭 전환마다 기록을 다시
// 기다리며 스켈레톤을 보이던 것을 제거(8차 잔여 M). 재검증 실패는 partial(위장 금지).
const CONTENT_CACHE_SERVABLE_MS = 5 * 60 * 1000;
let catalogCache = null;
let contentLedgerCache = null; // { at, state }

export function useContentLedger({ catalogOnly = false } = {}) {
  const cache = catalogOnly ? catalogCache : contentLedgerCache;
  const servable = cache && Date.now() - cache.at < CONTENT_CACHE_SERVABLE_MS;
  const [state, setState] = React.useState(servable ? cache.state : EMPTY_CONTENT_LEDGER);

  React.useEffect(() => {
    let active = true, sequence = 0, controller;
    const existing = catalogOnly ? catalogCache : contentLedgerCache;
    const hasServableCache = Boolean(
      existing && Date.now() - existing.at < CONTENT_CACHE_SERVABLE_MS
    );

    async function loadLedger() {
      const request = ++sequence;
      controller?.abort();
      controller = new AbortController();
      if (!hasServableCache) setState((s) => ({ ...s, syncState: "loading" })); // 캐시 서빙 중엔 조용히 재검증
      try {
        const response = await fetch(catalogOnly ? "/api/hub/content/catalog" : "/api/hub/content", { cache: "no-store", signal: controller.signal });
        const data = await response.json().catch(() => null);

        if (!active || request !== sequence) return;
        if (!response.ok || !data || data.status === "error") {
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
          if (catalogOnly) catalogCache = { at: Date.now(), state: nextState };
          else contentLedgerCache = { at: Date.now(), state: nextState };
          setState(nextState);
        } else {
          setState((s) => ({ ...s, source: "preview", syncState: "preview", campaigns: [], queue: [] }));
        }
      } catch {
        if (active && request === sequence) setState((s) => ({ ...s, syncState: hasServableCache ? "partial" : "error" }));
      }
    }

    loadLedger();
    const invalidate = () => { contentLedgerCache = null; if (!catalogOnly) loadLedger(); };
    const events = ["moonlight:content-saved", "moonlight:content-ledger-changed", "hub:brand-updated"];
    events.forEach(name => window.addEventListener(name, invalidate));
    return () => {
      active = false; controller?.abort();
      events.forEach(name => window.removeEventListener(name, invalidate));
    };
  }, [catalogOnly]);

  return state;
}

export function Studio({ workspace }) {
  const ledger = useContentLedger({ catalogOnly: true });
  return <ContentStudio workspace={workspace} ledger={ledger} />;
}

export function Queue({ workspace }) {
  const ws = getWorkspace(workspace);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = React.useState('all');
  const [brandFilter, setBrandFilter] = React.useState(() => searchParams.get('brand') || 'all');
  const ledger = useContentLedger();
  const brands = ws ? filterBrandsByWorkspace(ledger.brands || [], workspace) : (ledger.brands || []);
  const queue = filterContentByWorkspace(ledger.queue || [], workspace);
  const filteredByBrand = contentQueueScope(queue, brandFilter);
  const tabs = contentQueueTabs(filteredByBrand);
  const visibleQueue = tab === 'all' ? filteredByBrand : filteredByBrand.filter((item) => statusKeyOf(item) === tab);
  const activeLabel = tabs.find((entry) => entry.key === tab)?.label || '전체';
  const selectedBrand = brands.find((brand) => brand.id === brandFilter || brand.key === brandFilter);
  const openStudio = React.useCallback((id) => {
    const brandParam = brandFilter !== 'all' ? `&brand=${encodeURIComponent(brandFilter)}` : '';
    router.push(`/dashboard/content/studio${id ? `?item=${encodeURIComponent(id)}` : '?new=draft'}${id ? '' : brandParam}`);
  }, [brandFilter, router]);
  const createDraft = React.useCallback(() => openStudio(), [openStudio]);
  usePageCreateHotkey(createDraft);
  React.useEffect(() => { setBrandFilter(searchParams.get('brand') || 'all'); }, [searchParams]);
  return (
    <div className="hub-page content-queue" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>콘텐츠</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>소재를 담고, 원고를 이어 쓰고, 발행 기록을 남깁니다. <SyncBadge state={ledger.syncState} /></div>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="outline" size="sm" icon="plus" onClick={createDraft}>바로 원고 쓰기 <Kbd>N</Kbd></Button>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--fg-muted)' }}>
          브랜드
          <select aria-label="콘텐츠 브랜드 필터" value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)} style={{ minHeight: 40, maxWidth: '100%', background: 'var(--surface-2)', color: 'var(--fg)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', padding: '6px 10px' }}>
            <option value="all">전체 브랜드 · 미지정 포함</option>
            {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </select>
        </label>
        <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{selectedBrand?.name || '현재 범위'} · {filteredByBrand.length}건 중 {visibleQueue.length}건</span>
      </div>
      <Tabs className="hub-toolbar" tabs={tabs} active={tab} onChange={setTab} ariaLabel="콘텐츠 단계" />
      {(tab === 'all' || tab === 'idea') && <ContentIdeaCapture brands={brands} initialBrand={selectedBrand?.id || ''} orgScope={workspace === 'classin' ? 'company' : 'personal'} fixedScope={Boolean(ws)} onSaved={() => setTab('idea')} />}
      <Card pad={false}>
        {visibleQueue.length === 0 && <EmptyState icon="queue" title={`${activeLabel}에 표시할 콘텐츠가 없습니다`} description={ledger.syncState === 'error' || ledger.syncState === 'partial' ? '기록 읽기가 완료되지 않았습니다. 실제 콘텐츠가 비어 있다는 뜻은 아닙니다.' : ledger.syncState === 'preview' ? '저장소가 연결되면 저장한 소재와 원고가 여기에 표시됩니다.' : '떠오른 문장이나 링크를 소재함에 담아보세요.'} />}
        {visibleQueue.map((item, index) => <div key={item.id} className="hub-row hub-content-queue-row" role="button" tabIndex={0} onClick={() => openStudio(item.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openStudio(item.id); } }} style={{ display: 'grid', padding: '16px', alignItems: 'center', gap: 12, cursor: 'pointer', borderBottom: index < visibleQueue.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div><div style={{ marginTop: 5, fontSize: 12, color: 'var(--fg-muted)' }}>{item.channel} · {item.brandName === 'No brand' ? '브랜드 미지정' : item.brandName || '브랜드 미지정'}</div></div>
          <Badge tone="neutral" size="xs">{tabs.find((entry) => entry.key === statusKeyOf(item))?.label || item.status}</Badge>
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{item.when}</span>
          <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{statusKeyOf(item) === 'idea' ? '원고 시작 →' : '열기 →'}</span>
        </div>)}
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
      <span style={{ fontSize: 13, color: tone === 'moon' ? 'var(--fg)' : 'var(--fg-muted)', lineHeight: 1.55 }}>{value || '미설정'}</span>
    </div>
  );
}

function CampaignStrategyPanel({ campaign, detail, onSave }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(() => normalizeCampaignBusinessTruth(campaign.businessTruth || detail.strategy));
  const [saveState, setSaveState] = React.useState('idle');
  const [feedback, setFeedback] = React.useState('');

  React.useEffect(() => {
    setDraft(normalizeCampaignBusinessTruth(campaign.businessTruth || detail.strategy));
    setEditing(false);
    setSaveState('idle');
    setFeedback('');
  }, [campaign.id]);

  const truth = normalizeCampaignBusinessTruth(campaign.businessTruth || detail.strategy);
  const completeness = businessTruthCompleteness(truth);
  const scorecard = buildWeeklyScorecard(truth);
  const change = (key, value) => setDraft((current) => ({ ...current, [key]: value }));

  const save = async (event) => {
    event.preventDefault();
    if (saveState === 'saving') return;
    setSaveState('saving');
    setFeedback('');
    const result = await onSave?.(draft);
    if (result?.ok) {
      setSaveState('saved');
      setFeedback('Business truth가 저장되었습니다.');
      setEditing(false);
      return;
    }
    setSaveState('error');
    setFeedback(result?.message || '저장하지 못했습니다. 다시 시도하세요.');
  };

  if (editing) {
    return (
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
        <Card>
          <SectionTitle subtitle="고객·문제·제안을 먼저 고정합니다. 추상적인 브랜드 문장보다 실제 구매 판단에 쓰일 표현을 적으세요.">Customer and Offer Truth</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
            <TextAreaField required rows={3} label="ICP" value={draft.icp} onChange={(e) => change('icp', e.target.value)} placeholder="누가 가장 절박하게 이 문제를 겪고 있나요?" />
            <TextAreaField required rows={3} label="Painful problem" value={draft.problem} onChange={(e) => change('problem', e.target.value)} placeholder="지금 어떤 손실·지연·불안을 겪고 있나요?" />
            <TextAreaField required rows={3} label="Promise" value={draft.promise} onChange={(e) => change('promise', e.target.value)} placeholder="구매 후 어떤 측정 가능한 변화가 생기나요?" />
            <TextAreaField required rows={3} label="Offer" value={draft.offer} onChange={(e) => change('offer', e.target.value)} placeholder="무엇을 어떤 범위로 제공하나요?" />
          </div>
        </Card>

        <div className="hub-grid--split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 0.8fr)', gap: 'var(--gap)' }}>
          <Card>
            <SectionTitle subtitle="이번 주 의사결정은 하나의 선행 KPI로 닫습니다.">Weekly Scorecard</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
              <TextField required label="Price" value={draft.priceLabel} onChange={(e) => change('priceLabel', e.target.value)} placeholder="예: 월 49만원" />
              <TextField required label="Primary metric" value={draft.primaryMetric} onChange={(e) => change('primaryMetric', e.target.value)} placeholder="예: 유료 진단 예약" />
              <TextField required type="number" min="0.01" step="any" label="Weekly target" value={draft.weeklyTarget ?? ''} onChange={(e) => change('weeklyTarget', e.target.value)} />
              <TextField type="number" min="0" step="any" label="Weekly actual" hint="아직 집계 전이면 비워두세요. 0과 미기록을 구분합니다." value={draft.weeklyActual ?? ''} onChange={(e) => change('weeklyActual', e.target.value)} />
            </div>
          </Card>
          <Card>
            <SectionTitle subtitle="선택 이유를 짧게 유지합니다. 아직 모르면 비워도 됩니다.">Differentiation</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <TextAreaField rows={3} label="Wedge" value={draft.wedge} onChange={(e) => change('wedge', e.target.value)} placeholder="왜 지금 당신에게서 사야 하나요?" />
              <TextAreaField rows={3} label="Enemy" value={draft.enemy} onChange={(e) => change('enemy', e.target.value)} placeholder="고객이 버려야 할 기존 방식은 무엇인가요?" />
            </div>
          </Card>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {feedback && <span role={saveState === 'error' ? 'alert' : 'status'} style={{ marginRight: 'auto', fontSize: 12, color: saveState === 'error' ? 'var(--danger)' : 'var(--fg-muted)' }}>{feedback}</span>}
          <Button type="button" variant="ghost" size="sm" onClick={() => { setEditing(false); setFeedback(''); }}>취소</Button>
          <Button type="submit" variant="primary" size="sm" disabled={saveState === 'saving'}>{saveState === 'saving' ? '저장 중…' : 'Business truth 저장'}</Button>
        </div>
      </form>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <SectionTitle style={{ margin: 0, flex: 1 }} subtitle="사업의 고객·문제·약속·제안을 캠페인의 단일 정본으로 유지합니다.">Business Truth</SectionTitle>
          <Button variant="outline" size="sm" icon="edit" onClick={() => { setDraft(truth); setEditing(true); setFeedback(''); }}>Edit</Button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}><Progress value={completeness.percent} tone="moon" /></div>
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{completeness.completed}/{completeness.total}</span>
        </div>
        <CampaignLine label="ICP" value={truth.icp} />
        <CampaignLine label="Problem" value={truth.problem} />
        <CampaignLine label="Promise" value={truth.promise} />
        <CampaignLine label="Offer" value={truth.offer} />
        <CampaignLine label="Price" value={truth.priceLabel} />
      </Card>

      <div className="hub-grid--split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 0.8fr)', gap: 'var(--gap)' }}>
        <Card>
          <SectionTitle subtitle="월요일 개인 주간 리포트도 이 수치를 그대로 사용합니다.">Target vs Actual</SectionTitle>
          {scorecard ? (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                <span className="stat" style={{ fontSize: 30 }}>{scorecard.actual ?? '—'}</span>
                <span style={{ fontSize: 13, color: 'var(--fg-muted)', paddingBottom: 3 }}>/ {scorecard.target} · {scorecard.metric}</span>
              </div>
              <div style={{ marginTop: 12 }}><Progress value={scorecard.progress} tone="moon" /></div>
              <div style={{ marginTop: 9, fontSize: 12, color: 'var(--fg-muted)' }}>
                {scorecard.actual === null
                  ? '이번 주 actual이 아직 기록되지 않았습니다.'
                  : scorecard.gap >= 0 ? `목표보다 ${scorecard.gap} 앞서 있습니다.` : `목표까지 ${Math.abs(scorecard.gap)} 남았습니다.`}
              </div>
            </>
          ) : (
            <EmptyState icon="signal" title="주간 KPI가 없습니다" description="Primary metric과 weekly target을 입력하면 실행 점검이 시작됩니다." />
          )}
        </Card>
        <Card>
          <SectionTitle>Positioning Edge</SectionTitle>
          <CampaignLine label="Wedge" value={truth.wedge} />
          <CampaignLine label="Enemy" value={truth.enemy} />
          {feedback && <div role="status" style={{ marginTop: 10, fontSize: 12, color: 'var(--fg-muted)' }}>{feedback}</div>}
        </Card>
      </div>
    </div>
  );
}

function CampaignTabPanel({ tab, campaign, detail, onStrategySave }) {
  const router = useRouter();
  // 콘텐츠 lifecycle은 카테고리 — semantic 색 금지(§5.2/§5.3), 라벨이 상태를 전달한다.
  const sTone = { Active: 'neutral', Planning: 'neutral', Draft: 'neutral', Live: 'neutral', Scheduled: 'neutral', Review: 'neutral', Idea: 'neutral' };

  if (tab === 'strategy') {
    return <CampaignStrategyPanel campaign={campaign} detail={detail} onSave={onStrategySave} />;
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
  const strategy = normalizeCampaignBusinessTruth(campaign?.businessTruth);
  const completeness = businessTruthCompleteness(strategy);
  const scorecard = buildWeeklyScorecard(strategy);
  const positioning = strategy.offer || strategy.promise || '아직 사업 핵심 전략이 작성되지 않았습니다.';
  const nextMove = completeness.percent < 100
    ? `Strategy 탭에서 business truth ${completeness.total - completeness.completed}개를 더 정의하세요.`
    : scorecard?.actual === null
      ? `이번 주 ${scorecard.metric} actual을 기록하세요.`
      : scorecard?.gap < 0
        ? `${scorecard.metric} 목표까지 ${Math.abs(scorecard.gap)} 남았습니다.`
        : `${scorecard.metric} 주간 목표를 달성했습니다.`;
  return {
    pulse: {
      positioning,
      nextMove,
      risk: scorecard?.actual === null ? '주간 actual 미기록' : scorecard?.gap < 0 ? `목표 대비 ${scorecard.gap}` : '',
      ai: [],
      metrics: [
        {
          label: 'Weekly KPI',
          value: scorecard ? `${scorecard.actual ?? '—'} / ${scorecard.target}` : '미설정',
          detail: scorecard?.metric || 'Primary metric과 target을 입력하세요',
          tone: 'moon',
        },
        { label: 'Offer', value: strategy.priceLabel || '미설정', detail: strategy.offer || 'Offer를 입력하세요', tone: 'neutral' },
        { label: 'Strategy', value: `${completeness.completed} / ${completeness.total}`, detail: 'Business truth completeness', tone: 'neutral' },
      ],
    },
    strategy: { ...strategy, proof: [], decisions: [] },
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
  const campaignParams = useSearchParams();
  const campaignParam = campaignParams.get('campaign');
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

  React.useEffect(() => {
    if (campaignParam && campaigns.some(item => item.id === campaignParam)) setSelectedId(campaignParam);
  }, [campaignParam, campaigns]);

  const selected = campaigns.find(c => c.id === selectedId) || campaigns[0] || null;
  // Campaign rows without an attached war-room ledger use an honest empty detail.
  const detail = selected
    ? (CAMPAIGN_WAR_ROOMS[selected.id] || buildPreviewCampaignDetail(selected))
    : null;
  const activeTabLabel = CAMPAIGN_TABS.find(t => t.key === tab)?.label || 'Pulse';
  const saveBusinessTruth = React.useCallback(async (businessTruth) => {
    const campaignId = selected?.id;
    if (!campaignId || campaignId.startsWith('local-campaign-')) {
      return { ok: false, message: '캠페인 생성이 완료된 뒤 전략을 저장할 수 있습니다.' };
    }

    try {
      const response = await fetch('/api/hub/campaigns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'update', id: campaignId, businessTruth }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.status !== 'saved') {
        const reason = data?.status === 'preview'
          ? 'Supabase 미설정 — 전략이 저장되지 않았습니다.'
          : `전략 저장 실패 (${data?.status || response.status}) — 다시 시도하세요.`;
        return { ok: false, message: reason };
      }

      const persistedTruth = normalizeCampaignBusinessTruth(data?.campaign?.businessTruth || businessTruth);
      setCampaigns((current) => current.map((campaign) => (
        campaign.id === campaignId
          ? { ...campaign, businessTruth: persistedTruth, updatedAt: data?.campaign?.updatedAt || campaign.updatedAt }
          : campaign
      )));
      return { ok: true };
    } catch {
      return { ok: false, message: '전략 저장 실패 — 네트워크를 확인하고 다시 시도하세요.' };
    }
  }, [selected?.id]);

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
      const res = await fetch('/api/hub/campaigns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'create', name: next.name, channels: next.channels }),
      });
      const data = await res.json().catch(() => null);
      if (data?.status === 'saved' && data?.campaign?.id) {
        const savedId = data.campaign.id;
        setCampaigns(prev => prev.map(c => (c.id === localId ? { ...c, ...data.campaign, id: savedId } : c)));
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
            const cScorecard = buildWeeklyScorecard(c.businessTruth);
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
                      <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{cScorecard ? `Weekly · ${cScorecard.metric}` : `Goal · ${c.goal || '미설정'}`}</span>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--fg)' }}>
                        {cScorecard ? (cScorecard.actual ?? '—') : c.current}
                        <span style={{ color: 'var(--fg-faint)' }}> / {cScorecard?.target ?? String(c.goal || '').match(/\d+/)?.[0] ?? '—'}</span>
                      </span>
                    </div>
                    <Progress value={cScorecard?.progress ?? c.progress} tone="moon" />
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
            <div style={{ padding: '0 var(--card-pad) var(--card-pad)' }}><GoalLinks entityType="campaigns" entityId={selected.id} /></div>
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
            <CampaignTabPanel tab={tab} campaign={selected} detail={detail} onStrategySave={saveBusinessTruth} />
          </div>
        </section>
      </div>
      )}
    </div>
  );
}
