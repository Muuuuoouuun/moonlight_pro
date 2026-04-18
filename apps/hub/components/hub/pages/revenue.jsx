"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import { Badge, Dot, Card, Button, Avatar, Input } from "../hub-primitives";
import { LEADS, DEAL_STAGES, DEALS, BRANDS } from "../hub-data";

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
            <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 80px', padding: '9px 0', alignItems: 'center', borderBottom: i < arr.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
              <div>
                <div style={{ fontSize: 12.5 }}>{d.name}</div>
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

export function Leads() {
  const [filter, setFilter] = React.useState('all');
  const filtered = LEADS.filter(l => filter === 'all' || l.type === filter);
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
        <Input placeholder="Search leads" icon="search" />
        <div style={{ width: 8 }} />
        <Button variant="primary" size="sm" icon="plus">Lead</Button>
      </div>

      <Card pad={false}>
        <div style={{ display: 'grid', gridTemplateColumns: '26px 1fr 100px 110px 110px 100px 80px 80px', padding: '10px 16px', borderBottom: '1px solid var(--line-soft)', fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          <span /><span>Name</span><span>Type</span><span>Source</span><span>Stage</span><span>Value</span><span>Owner</span><span style={{ textAlign: 'right' }}>Last</span>
        </div>
        {filtered.map((l, i) => (
          <div key={l.id} style={{
            display: 'grid', gridTemplateColumns: '26px 1fr 100px 110px 110px 100px 80px 80px',
            padding: '12px 16px', alignItems: 'center',
            borderBottom: i < filtered.length - 1 ? '1px solid var(--line-soft)' : 'none',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <Avatar name={l.name.replace(/^.*—\s*/, '')} size={22} tone={l.type === 'personal' ? 'personal' : 'company'} />
            <span style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</span>
            <Badge tone={l.type === 'personal' ? 'personal' : 'company'} size="xs">
              <Iconed name={l.type === 'personal' ? 'user' : 'building'} size={9} />
              {l.type === 'personal' ? 'Personal' : 'Company'}
            </Badge>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{l.source}</span>
            <Badge tone={stageTone[l.stage]} size="xs" variant="outline">{l.stage}</Badge>
            <span className="mono" style={{ fontSize: 12 }}>{l.value}</span>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{l.owner}</span>
            <span style={{ textAlign: 'right', fontSize: 11.5, color: 'var(--fg-faint)' }}>{l.last}</span>
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
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 160px 100px 100px 90px 110px 80px', padding: '10px 16px', borderBottom: '1px solid var(--line-soft)', fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          <span>ID</span><span>Title</span><span>Account</span><span>Type</span><span>Priority</span><span>Status</span><span>Opened</span><span style={{ textAlign: 'right' }}>Owner</span>
        </div>
        {cases.map((c, i) => (
          <div key={c.id} style={{
            display: 'grid', gridTemplateColumns: '80px 1fr 160px 100px 100px 90px 110px 80px',
            padding: '12px 16px', alignItems: 'center',
            borderBottom: i < cases.length - 1 ? '1px solid var(--line-soft)' : 'none',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{c.id}</span>
            <span style={{ fontSize: 13 }}>{c.title}</span>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{c.account}</span>
            <Badge tone={c.type === 'personal' ? 'personal' : 'company'} size="xs">{c.type === 'personal' ? 'Personal' : 'Company'}</Badge>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: pTone[c.priority] === 'danger' ? 'var(--danger)' : 'var(--fg-muted)' }}>
              <Dot tone={pTone[c.priority]} />{c.priority}
            </span>
            <Badge tone={sTone[c.status]} size="xs">{c.status}</Badge>
            <span style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>{c.opened}</span>
            <span style={{ textAlign: 'right', fontSize: 12, color: 'var(--fg-muted)' }}>{c.owner}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

export function Accounts() {
  const accounts = [
    { name: '클래스인', type: 'company', deals: 2, value: 18000000, last: '오늘', health: 'warning' },
    { name: 'Studio Park', type: 'company', deals: 1, value: 6000000, last: '3일 전', health: 'ok' },
    { name: 'Beanly Coffee', type: 'company', deals: 1, value: 4200000, last: '오늘', health: 'ok' },
    { name: 'Han 스튜디오', type: 'company', deals: 1, value: 3500000, last: '5일 전', health: 'warning' },
    { name: '베어브릭', type: 'company', deals: 1, value: 7800000, last: '2주 전', health: 'ok' },
    { name: '이재민', type: 'personal', deals: 1, value: 1200000, last: '오늘', health: 'ok' },
    { name: '정하윤', type: 'personal', deals: 1, value: 900000, last: '어제', health: 'ok' },
    { name: 'Jihoon (코칭)', type: 'personal', deals: 1, value: 600000, last: '오늘', health: 'ok' },
  ];
  const hTone = { ok: 'success', warning: 'warning', risk: 'danger' };

  return (
    <div style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Accounts</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>{accounts.filter(a => a.type === 'company').length} companies · {accounts.filter(a => a.type === 'personal').length} individuals</div>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="primary" size="sm" icon="plus">Account</Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--gap)' }}>
        {accounts.map(a => (
          <Card key={a.name} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Avatar name={a.name} size={36} tone={a.type === 'personal' ? 'personal' : 'company'} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                  <Badge tone={a.type === 'personal' ? 'personal' : 'company'} size="xs">{a.type === 'personal' ? 'Personal' : 'Company'}</Badge>
                  <Dot tone={hTone[a.health]} />
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingTop: 10, borderTop: '1px solid var(--line-soft)' }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Value</div>
                <div className="mono" style={{ fontSize: 13, color: 'var(--fg)', marginTop: 3 }}>{fmt(a.value)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Deals · Contact</div>
                <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 3 }}>{a.deals} · {a.last}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
