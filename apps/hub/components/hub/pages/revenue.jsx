"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import { Badge, Dot, Card, Button, Avatar, Input, Tabs, IconButton, Divider } from "../hub-primitives";
import { LEADS, DEAL_STAGES, DEALS, BRANDS, ACCOUNT_DETAIL } from "../hub-data";

const fmt = v => '₩' + (v / 1000000).toFixed(1) + 'M';

export function RevenueOverview() {
  const mrr = 8400000, mrrPrev = 7500000;
  const pipelineByStage = DEAL_STAGES.map(s => ({
    ...s,
    sum: DEALS.filter(d => d.stage === s.key).reduce((a, b) => a + b.value, 0),
    count: DEALS.filter(d => d.stage === s.key).length,
  }));
  const pipeline = pipelineByStage.reduce((a, b) => a + b.sum, 0);
  const openLeads = LEADS.length;
  const openDeals = DEALS.filter(d => d.stage !== 'won').length;
  const wonMTD = DEALS.filter(d => d.stage === 'won').reduce((a, b) => a + b.value, 0);
  const byBrand = BRANDS.filter(b => b.key !== 'all').slice(0, 6).map((b, i) => ({
    ...b, mrr: [2.4, 1.8, 0.6, 2.0, 0.9, 0.7][i] * 1000000,
  }));
  const totalBrandMRR = byBrand.reduce((a, b) => a + b.mrr, 0);

  return (
    <div style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)', maxWidth: 1280, margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Revenue overview</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>4월 · 이번 달 요약</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 2, background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', padding: 2 }}>
          {['MTD','QTD','YTD'].map(p => (
            <button key={p} style={{ padding: '4px 10px', fontSize: 11.5, borderRadius: 4, color: p === 'MTD' ? 'var(--fg)' : 'var(--fg-faint)', background: p === 'MTD' ? 'var(--surface-3)' : 'transparent' }}>{p}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--gap)' }}>
        {[
          { l: 'MRR', v: fmt(mrr), d: `+${Math.round((mrr - mrrPrev) / mrrPrev * 100)}%`, tone: 'success' },
          { l: 'Pipeline', v: fmt(pipeline), d: `${openDeals} deals`, tone: 'moon' },
          { l: 'Open leads', v: openLeads, d: '이번달 신규 12', tone: 'info' },
          { l: 'Won MTD', v: fmt(wonMTD), d: '1 deal', tone: 'success' },
        ].map((k, i) => (
          <Card key={i}>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)' }}>{k.l}</div>
            <div className="mono" style={{ fontSize: 26, marginTop: 10, fontWeight: 500 }}>{k.v}</div>
            <div style={{ fontSize: 11, color: `var(--${k.tone})`, marginTop: 4 }}>{k.d}</div>
          </Card>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 'var(--gap)' }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Pipeline by stage</div>
            <div style={{ flex: 1 }} />
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{fmt(pipeline)}</span>
          </div>
          <div style={{ display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--line-soft)' }}>
            {pipelineByStage.map(s => (
              <div key={s.key} title={`${s.label} · ${fmt(s.sum)}`} style={{
                flex: s.sum || 0.1,
                background: `var(--${s.color === 'neutral' ? 'fg-faint' : s.color === 'moon' ? 'moon-500' : s.color})`,
                opacity: 0.9,
              }} />
            ))}
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
            {byBrand.map(b => (
              <div key={b.key} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 72px', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 14 }}>{b.glyph}</span>
                <div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>{b.name}</div>
                  <div style={{ height: 5, background: 'var(--surface-3)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${(b.mrr / totalBrandMRR) * 100}%`, height: '100%', background: 'var(--moon-400)' }} />
                  </div>
                </div>
                <span className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)', textAlign: 'right' }}>{fmt(b.mrr)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--gap)' }}>
        <Card>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Top deals</div>
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
          {[
            { tone: 'danger', t: '클래스인 — 계약서 응답 2일째', s: '리마인드 메일 추천' },
            { tone: 'warning', t: 'Studio Park — 제안서 14일 정체', s: 'follow-up 필요' },
            { tone: 'info', t: '이번 주 신규 리드 +12', s: '분류·할당 필요' },
            { tone: 'success', t: 'Won: 베어브릭 콜라보 ₩7.8M', s: '온보딩 킥오프' },
          ].map((x, i, arr) => (
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
    </div>
  );
}

// Shared grid template for Leads rows — gap between columns so badges never butt the next cell
const LEADS_GRID = '26px 1fr 112px 112px 124px 100px 90px 92px';

export function Leads() {
  const [filter, setFilter] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const term = search.trim().toLowerCase();
  const filtered = LEADS.filter(l =>
    (filter === 'all' || l.type === filter) &&
    (!term || l.name.toLowerCase().includes(term) || l.source.toLowerCase().includes(term) || l.stage.toLowerCase().includes(term))
  );
  const stageTone = { New: 'info', Contact: 'moon', Qualified: 'success', Lost: 'danger' };

  return (
    <div style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Leads</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>{LEADS.length} leads · {LEADS.filter(l => l.type === 'personal').length} personal · {LEADS.filter(l => l.type === 'company').length} company</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 2, background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', padding: 2, marginRight: 8 }}>
          {[{ k: 'all', l: 'All' },{ k: 'personal', l: 'Personal' },{ k: 'company', l: 'Company' }].map(t => (
            <button key={t.k} onClick={() => setFilter(t.k)} style={{
              padding: '4px 10px', fontSize: 11.5, borderRadius: 4,
              color: filter === t.k ? 'var(--fg)' : 'var(--fg-faint)',
              background: filter === t.k ? 'var(--surface-3)' : 'transparent',
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>
              {t.k === 'personal' && <Dot tone="personal" />}
              {t.k === 'company' && <Dot tone="company" />}
              {t.l}
            </button>
          ))}
        </div>
        <Input placeholder="이름·소스·단계 검색…" icon="search" value={search} onChange={setSearch} />
        <div style={{ width: 8 }} />
        <Button variant="primary" size="sm" icon="plus">Lead</Button>
      </div>

      <Card pad={false}>
        <div style={{ display: 'grid', gridTemplateColumns: LEADS_GRID, gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--line-soft)', fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          <span /><span>Name</span><span>Type</span><span>Source</span><span>Stage</span><span>Value</span><span>Owner</span><span style={{ textAlign: 'right' }}>Last</span>
        </div>
        {filtered.length === 0 && (
          <div style={{ padding: '36px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Iconed name="search" size={20} style={{ color: 'var(--fg-faint)' }} />
            <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>일치하는 리드가 없습니다.</div>
            <div style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>
              {term ? <>"<span className="mono">{search}</span>" 검색 결과 0건 · 필터: {filter}</> : <>필터: {filter} · {LEADS.length}건 중 0건</>}
            </div>
          </div>
        )}
        {filtered.map((l, i) => (
          <div key={l.id} style={{
            display: 'grid', gridTemplateColumns: LEADS_GRID, gap: 12,
            padding: '12px 16px', alignItems: 'center',
            borderBottom: i < filtered.length - 1 ? '1px solid var(--line-soft)' : 'none',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ paddingRight: 4, display: 'flex' }}>
              <Avatar name={l.name.replace(/^.*—\s*/, '')} size={22} tone={l.type === 'personal' ? 'personal' : 'company'} />
            </span>
            <span style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</span>
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
            <span className="mono" style={{ fontSize: 12 }}>{l.value}</span>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.owner}</span>
            <span className="mono" style={{ textAlign: 'right', fontSize: 11.5, color: 'var(--fg-faint)' }}>{l.last}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

export function Deals() {
  const [deals, setDeals] = React.useState(DEALS);
  const [drag, setDrag] = React.useState(null);
  const [filter, setFilter] = React.useState('all');

  const totals = DEAL_STAGES.reduce((acc, s) => {
    const items = deals.filter(d => d.stage === s.key && (filter === 'all' || d.type === filter));
    acc[s.key] = { count: items.length, sum: items.reduce((a, b) => a + b.value, 0) };
    return acc;
  }, {});
  const grandTotal = deals.filter(d => filter === 'all' || d.type === filter).reduce((a, b) => a + b.value, 0);
  const move = (id, to) => setDeals(ds => ds.map(d => d.id === id ? { ...d, stage: to } : d));

  return (
    <div style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Deals</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
            Pipeline <span className="mono" style={{ color: 'var(--fg)' }}>{fmt(grandTotal)}</span> across {DEAL_STAGES.length} stages
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 2, background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', padding: 2, marginRight: 8 }}>
          {[{k:'all',l:'All'},{k:'personal',l:'Personal'},{k:'company',l:'Company'}].map(t => (
            <button key={t.k} onClick={() => setFilter(t.k)} style={{
              padding: '4px 10px', fontSize: 11.5, borderRadius: 4,
              color: filter === t.k ? 'var(--fg)' : 'var(--fg-faint)',
              background: filter === t.k ? 'var(--surface-3)' : 'transparent',
            }}>{t.l}</button>
          ))}
        </div>
        <Button variant="primary" size="sm" icon="plus">Deal</Button>
      </div>

      <div style={{ display: 'flex', gap: 'var(--gap)', overflowX: 'auto', flex: 1, paddingBottom: 4 }}>
        {DEAL_STAGES.map(s => {
          const items = deals.filter(d => d.stage === s.key && (filter === 'all' || d.type === filter));
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
                    onDragStart={() => setDrag(d.id)}
                    onDragEnd={() => setDrag(null)}
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
                      <Badge tone={d.type === 'personal' ? 'personal' : 'company'} size="xs">
                        {d.type === 'personal' ? 'P' : 'C'}
                      </Badge>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.4, marginBottom: 8 }}>{d.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span className="mono" style={{ fontSize: 12, color: 'var(--moon-200)' }}>{fmt(d.value)}</span>
                      <span style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{d.close}</span>
                    </div>
                    {d.age > 10 && s.key === 'neg' && (
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
    </div>
  );
}

// Shared grid template for Cases — gap added so Type/Priority/Status chips never butt the next column
const CASES_GRID = '80px 1fr 160px 112px 100px 100px 110px 90px';

export function Cases() {
  const cases = [
    { id: 'CS-104', title: 'Spring Cohort 계약 검토', account: '클래스인', type: 'company', status: 'Open', priority: 'high', opened: '3일 전', owner: 'Me' },
    { id: 'CS-103', title: '결제 영수증 재발행', account: '이재민', type: 'personal', status: 'Waiting', priority: 'low', opened: '어제', owner: 'Automation' },
    { id: 'CS-102', title: '뉴스레터 구독 취소 이슈', account: 'Studio Park', type: 'company', status: 'Open', priority: 'med', opened: '2일 전', owner: 'Me' },
    { id: 'CS-101', title: '도메인 인증 재설정', account: 'Moonlight', type: 'company', status: 'Resolved', priority: 'med', opened: '5일 전', owner: 'Me' },
    { id: 'CS-099', title: '코칭 일정 재조정', account: 'Jihoon', type: 'personal', status: 'Resolved', priority: 'low', opened: '지난 주', owner: 'Me' },
  ];
  const sTone = { Open: 'warning', Waiting: 'info', Resolved: 'success' };
  const pTone = { high: 'danger', med: 'warning', low: 'neutral' };

  return (
    <div style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Cases</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>Support & account issues · {cases.filter(c => c.status !== 'Resolved').length} open</div>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="primary" size="sm" icon="plus">Case</Button>
      </div>
      <Card pad={false}>
        <div style={{ display: 'grid', gridTemplateColumns: CASES_GRID, gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--line-soft)', fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          <span>ID</span><span>Title</span><span>Account</span><span>Type</span><span>Priority</span><span>Status</span><span>Opened</span><span style={{ textAlign: 'right' }}>Owner</span>
        </div>
        {cases.map((c, i) => (
          <div key={c.id} style={{
            display: 'grid', gridTemplateColumns: CASES_GRID, gap: 12,
            padding: '12px 16px', alignItems: 'center',
            borderBottom: i < cases.length - 1 ? '1px solid var(--line-soft)' : 'none',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{c.id}</span>
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
    </div>
  );
}

// ---------- ACCOUNTS (lightweight CRM) ----------

const ACCOUNTS = [
  { name: '클래스인',        type: 'company',  deals: 2, value: 18000000, last: '오늘',    lastAt: '11:02', health: 'warning', owner: 'Me' },
  { name: 'Studio Park',     type: 'company',  deals: 1, value: 6000000,  last: '3일 전',  lastAt: '3d',    health: 'ok',      owner: 'Me' },
  { name: 'Beanly Coffee',   type: 'company',  deals: 1, value: 4200000,  last: '오늘',    lastAt: '14:15', health: 'ok',      owner: 'Council' },
  { name: 'Han 스튜디오',    type: 'company',  deals: 1, value: 3500000,  last: '5일 전',  lastAt: '5d',    health: 'warning', owner: 'Me' },
  { name: '베어브릭',         type: 'company',  deals: 1, value: 7800000,  last: '2주 전',  lastAt: '14d',   health: 'ok',      owner: 'Me' },
  { name: '이재민',           type: 'personal', deals: 1, value: 1200000,  last: '오늘',    lastAt: '08:45', health: 'ok',      owner: 'Me' },
  { name: '정하윤',           type: 'personal', deals: 1, value: 900000,   last: '어제',    lastAt: '1d',    health: 'ok',      owner: 'Me' },
  { name: 'Jihoon (코칭)',    type: 'personal', deals: 1, value: 600000,   last: '오늘',    lastAt: '16:00', health: 'ok',      owner: 'Me' },
];
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

function DetailPanel({ account, detail, onAction, onLog, onPinNote, onAddNote }) {
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
        <div style={{ marginTop: 14 }}>
          <QuickActions onAction={onAction} />
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

export function Accounts() {
  const [view, setView] = React.useState('cards'); // cards | list | detail
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState('all');
  const [selected, setSelected] = React.useState(null);
  const [details, setDetails] = React.useState(() => ({ ...ACCOUNT_DETAIL }));

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

  return (
    <div style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Accounts</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
            {ACCOUNTS.filter(a => a.type === 'company').length} companies · {ACCOUNTS.filter(a => a.type === 'personal').length} individuals
          </div>
        </div>
        <div style={{ flex: 1 }} />

        {/* View mode toggle */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', padding: 2 }}>
          {[{ k: 'cards', l: 'Cards' },{ k: 'list', l: 'List' },{ k: 'detail', l: 'Detail' }].map(t => (
            <button key={t.k} onClick={() => {
              setView(t.k);
              if (t.k === 'detail' && !selected) setSelected(filtered[0]?.name ?? null);
            }} style={{
              padding: '4px 10px', fontSize: 11.5, borderRadius: 4,
              color: view === t.k ? 'var(--fg)' : 'var(--fg-faint)',
              background: view === t.k ? 'var(--surface-3)' : 'transparent',
            }}>{t.l}</button>
          ))}
        </div>

        {/* Type filter */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', padding: 2 }}>
          {[{ k: 'all', l: 'All' },{ k: 'personal', l: 'Personal' },{ k: 'company', l: 'Company' }].map(t => (
            <button key={t.k} onClick={() => setFilter(t.k)} style={{
              padding: '4px 10px', fontSize: 11.5, borderRadius: 4,
              color: filter === t.k ? 'var(--fg)' : 'var(--fg-faint)',
              background: filter === t.k ? 'var(--surface-3)' : 'transparent',
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>
              {t.k === 'personal' && <Dot tone="personal" />}
              {t.k === 'company' && <Dot tone="company" />}
              {t.l}
            </button>
          ))}
        </div>

        <Input placeholder="계정 검색…" icon="search" value={search} onChange={setSearch} />
        <Button variant="primary" size="sm" icon="plus">Account</Button>
      </div>

      {/* Content by view */}
      {view === 'cards' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--gap)' }}>
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
            <div style={{ fontSize: 12, color: 'var(--fg-faint)', padding: '20px 0' }}>일치하는 계정이 없습니다.</div>
          )}
        </div>
      )}

      {view === 'list' && (
        <Card pad={false}>
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
            <div style={{ fontSize: 12, color: 'var(--fg-faint)', padding: '20px 16px' }}>일치하는 계정이 없습니다.</div>
          )}
        </Card>
      )}

      {view === 'detail' && (
        <Card pad={false} style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
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
                <div style={{ fontSize: 12, color: 'var(--fg-faint)', padding: '16px' }}>일치하는 계정이 없습니다.</div>
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
            />
          </div>
        </Card>
      )}
    </div>
  );
}
