'use client';
// Bar gauges for 개인 현금 흐름 (Claude Design handoff "Cashflow Gauges" 3a–3e).
// Track end is always a named reference (6-month max · previous month · billing cycle); solid tick = average,
// dashed tick = previous month, dotted box = not observed or unconfirmed. Labels are told apart by shape, not color.
import React from 'react';
import {FINANCE_LABELS, FINANCE_QUICK_PURPOSES, financeMoney} from './finance-view';

const pct = value => `${(value*100).toFixed(1)}%`;
const share = value => `${Math.round(value*100)}%`;
const monthLabel = month => `${Number(month.slice(5,7))}월`;
const LABEL_NAME = Object.fromEntries(FINANCE_LABELS.map(label=>[label.key,label.label]));
const WEEKDAYS = ['일','월','화','수','목','금','토'];
const dayLabel = date => `${date.slice(5).replace('-','.')} ${WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]}`;

export function LabelSwatch({label}) {
  return <i className="finance-swatch" data-label={label} aria-hidden="true" />;
}

function RangeTrack({gauge,month,observed,maxNote}) {
  const range=observed.partial ? `${monthLabel(month)} · 1–${observed.observed}일` : monthLabel(month);
  return <div className="finance-range">
    <div className="finance-range-track" role="img" aria-label={`${range} ${financeMoney(gauge.value)} · 트랙 끝 ${financeMoney(gauge.max)}`}>
      {gauge.prevAt!=null && <span className="finance-range-label finance-range-label--top" style={{left:pct(gauge.prevAt)}}>{monthLabel(gauge.prev.month)} <span className="mono">{financeMoney(gauge.prev.value)}</span></span>}
      <i className="finance-range-fill" style={{width:pct(gauge.fill)}} />
      {gauge.prevAt!=null && <i className="finance-tick finance-tick--prev" style={{left:pct(gauge.prevAt)}} />}
      {gauge.avgAt!=null && <i className="finance-tick finance-tick--avg" style={{left:pct(gauge.avgAt)}} />}
      <span className="finance-range-label finance-range-label--current">{range}</span>
      {gauge.avgAt!=null && <span className="finance-range-label finance-range-label--avg" style={{left:pct(gauge.avgAt)}}>{gauge.columns.length-1}개월 평균 <span className="mono">{financeMoney(gauge.avg)}</span></span>}
    </div>
    <p className="finance-muted">트랙 끝 = {maxNote} <span className="mono">{financeMoney(gauge.max)}</span> ({monthLabel(gauge.maxMonth)})</p>
  </div>;
}

function MonthColumns({gauge}) {
  return <div className="finance-columns-wrap">
    <div className="finance-columns" role="img" aria-label={gauge.columns.map(col=>`${monthLabel(col.month)} ${financeMoney(col.value)}`).join(' · ')}>
      {gauge.columns.map(col=><span key={col.month}><i className={col.current?'is-current':''} style={{height:pct(col.height)}} /></span>)}
      {gauge.avgAt!=null && <i className="finance-columns-avg" style={{bottom:pct(gauge.avgAt)}} />}
    </div>
    <div className="finance-columns-axis">{gauge.columns.map(col=><span key={col.month} className="mono">{col.month.slice(5)}월</span>)}</div>
  </div>;
}

// 3a — 순소비 범위 게이지 · 기간 대비 속도
export function FlowGauge({month,gauge,observed,breakdown,row}) {
  if (!gauge) return null;
  const prev=gauge.prev?.value;
  return <section className="finance-gauge-card" aria-label="순소비 게이지">
    <div className="finance-gauge-head">
      <span className="finance-eyebrow">순소비 · {month}</span>
      <strong className="stat finance-gauge-value">{financeMoney(gauge.value)}</strong>
      <p className="finance-muted">{observed.partial?`1–${observed.observed}일 관측 · `:''}순소비는 은행 출금과 다릅니다.</p>
    </div>
    <RangeTrack gauge={gauge} month={month} observed={observed} maxNote={`${gauge.columns.length}개월 최대`} />
    {observed.partial && typeof prev==='number' && prev>0 && <div className="finance-pace">
      <div className="finance-pace-head"><span className="finance-eyebrow">속도 · {monthLabel(gauge.prev.month)} 한 달 = 100%</span><span className="finance-muted">쓴 돈 막대가 기간 막대보다 길면 {monthLabel(gauge.prev.month)}보다 빠른 속도</span></div>
      <div className="finance-pace-grid">
        <span className="finance-muted">지난 기간</span><span className="finance-bar"><i className="finance-bar-fill finance-bar-fill--soft" style={{width:pct(observed.observed/observed.days)}} /></span><span className="mono">{observed.observed} / {observed.days}일 · {share(observed.observed/observed.days)}</span>
        <span className="finance-muted">쓴 돈</span><span className="finance-bar"><i className="finance-bar-fill" style={{width:pct(Math.min(1,gauge.value/prev))}} /></span><span className="mono">{monthLabel(gauge.prev.month)}의 {share(gauge.value/prev)}</span>
      </div>
    </div>}
    <div className="finance-gauge-split">
      {breakdown && <div className="finance-gauge-panel">
        <div className="finance-pace-head"><span className="finance-eyebrow">원구매 → 순소비</span><span className="mono finance-muted">원구매 {financeMoney(row.gross)}</span></div>
        <div className="finance-stack" role="img" aria-label={breakdown.map(part=>`${{net:'순소비',refund:'환불',duplicate:'중복 제외'}[part.key]} ${financeMoney(part.value)}`).join(' · ')}>{breakdown.filter(part=>part.value>0).map(part=><i key={part.key} data-part={part.key} style={{flexGrow:part.value}} />)}</div>
        <dl className="finance-stack-legend">{breakdown.map(part=><div key={part.key}><dt><i className="finance-swatch" data-part={part.key} aria-hidden="true" />{{net:'순소비',refund:'환불',duplicate:'중복 제외'}[part.key]} · {pct(part.share)}</dt><dd className="mono">{financeMoney(part.value)}</dd></div>)}</dl>
      </div>}
      <div className="finance-gauge-panel">
        <span className="finance-eyebrow">{gauge.columns.length}개월 순소비</span>
        <MonthColumns gauge={gauge} />
        <p className="finance-muted">가로선 = 이전 {gauge.columns.length-1}개월 평균{observed.partial?` · ${monthLabel(month)}은 일부 기간`:''}</p>
      </div>
    </div>
  </section>;
}

// 3b — 하루 막대를 라벨로 쌓기 · 고른 날까지 누적
export function DailyGauge({month,daily,total,selected,onSelect,cumulative,observed}) {
  const day=daily.days.find(row=>row.date===selected);
  const parts=day?FINANCE_LABELS.map(label=>({key:label.key,value:day.parts[label.key]})).filter(part=>part.value>0):[];
  return <section className="finance-gauge-card" aria-label="하루 소비">
    <div className="finance-gauge-head finance-gauge-head--row">
      <div><span className="finance-eyebrow">하루 소비 · {month}</span><strong className="stat finance-gauge-value finance-gauge-value--sm">{financeMoney(total)}</strong></div>
      <ul className="finance-legend">{['subscription','personal','company','unclassified'].map(key=><li key={key}><LabelSwatch label={key} />{LABEL_NAME[key]}{key==='subscription'?' (바닥)':''}</li>)}</ul>
    </div>
    <div className="finance-days-scroll">
      <div className="finance-days">
        {daily.days.map(row=>row.observed ? <button key={row.date} type="button" className="finance-day" aria-pressed={row.date===selected} aria-label={`${dayLabel(row.date)} ${financeMoney(row.total)}`} onClick={()=>onSelect(row.date)}>
          {['subscription','personal','company','unclassified'].map(key=>row.heights[key]>0 && <i key={key} data-label={key} style={{height:pct(row.heights[key])}} />)}
        </button> : <span key={row.date} className="finance-day finance-day--future" aria-hidden="true" />)}
      </div>
      <div className="finance-days-axis">{daily.days.map(row=><span key={row.date} className={`mono ${row.date===selected?'is-selected':''}`}>{row.day}</span>)}</div>
    </div>
    <p className="finance-muted">막대를 눌러 날짜 고르기{observed.partial?` · ${observed.observed+1}일부터 점선 = 아직 관측 전`:''}</p>
    {day && <div className="finance-gauge-split finance-gauge-split--even">
      <div className="finance-gauge-panel">
        <div className="finance-pace-head"><span className="finance-eyebrow">고른 날 · {dayLabel(day.date)}</span><span className="mono">{financeMoney(day.total)}</span></div>
        {parts.length ? <><div className="finance-stack">{parts.map(part=><i key={part.key} data-label={part.key} style={{flexGrow:part.value}} />)}</div>
        <dl className="finance-leaders">{parts.map(part=><div key={part.key}><dt>{LABEL_NAME[part.key]} <span className="finance-muted">{share(part.value/day.total)}</span></dt><dd className="mono">{financeMoney(part.value)}</dd></div>)}</dl></> : <p className="finance-muted">이 날 관측한 소비가 없습니다.</p>}
      </div>
      <div className="finance-gauge-panel">
        <div className="finance-pace-head"><span className="finance-eyebrow">누적 · 1–{cumulative.day}일</span><span className="mono">{financeMoney(cumulative.value)}</span></div>
        {cumulative.prevNet ? <><div className="finance-range-track finance-range-track--sm" role="img" aria-label={`누적 ${financeMoney(cumulative.value)} · 지난달 같은 날 ${financeMoney(cumulative.paceValue)}`}>
          <span className="finance-range-label finance-range-label--top finance-range-label--center" style={{left:pct(cumulative.paceAt)}}>일수 비례 <span className="mono">{financeMoney(cumulative.paceValue)}</span></span>
          <i className="finance-range-fill" style={{width:pct(cumulative.fill)}} />
          <i className="finance-tick finance-tick--prev" style={{left:pct(cumulative.paceAt)}} />
          <span className="finance-range-label finance-range-label--current">지난달의 {share(cumulative.value/cumulative.prevNet)}</span>
        </div>
        <p className="finance-muted">트랙 끝 = 지난달 순소비 <span className="mono">{financeMoney(cumulative.prevNet)}</span> · 점선 = 지난달을 일수로 나눠 같은 날까지 쌓은 값</p></> : <p className="finance-muted">지난달 순소비를 관측하지 못해 비교 기준이 없습니다.</p>}
      </div>
    </div>}
  </section>;
}

// 3c — 라벨 진행 게이지 · 금액 줄과 건수 칸. 라벨 버튼은 사용 목적만 저장한다(구독은 계약 그룹에서 나온다).
export function LabelGauge({month,progress,rows,busyId,onLabel}) {
  const segments=FINANCE_LABELS.filter(label=>progress.groups[label.key].amount>0);
  return <section className="finance-gauge-card" aria-label="라벨 진행">
    <div className="finance-gauge-head finance-gauge-head--row">
      <div><span className="finance-eyebrow">라벨 진행 · {month}</span><div className="finance-label-count"><strong className="stat">{progress.done}</strong><span>/ {progress.count}건 분류</span></div></div>
      <div className="finance-label-share"><span className="finance-muted">금액 기준</span><strong className="stat">{share(progress.amountShare)}</strong></div>
    </div>
    <div className="finance-label-grid">
      <span className="finance-muted">금액</span>
      <div className="finance-stack" role="img" aria-label={segments.map(label=>`${label.label} ${financeMoney(progress.groups[label.key].amount)}`).join(' · ')}>{segments.map(label=><i key={label.key} data-label={label.key} style={{flexGrow:progress.groups[label.key].amount}} />)}</div>
      <span className="finance-muted">건수</span>
      <div className="finance-cells" role="img" aria-label={`${progress.count}건 중 미분류 ${progress.groups.unclassified.count}건`}>{progress.cells.map((label,index)=><i key={index} data-label={label} />)}</div>
    </div>
    <dl className="finance-label-totals">{FINANCE_LABELS.map(label=><div key={label.key}><dt><LabelSwatch label={label.key} />{label.label} · {progress.groups[label.key].count}건</dt><dd className="stat">{financeMoney(progress.groups[label.key].amount)}</dd></div>)}</dl>
    <div className="finance-gauge-panel finance-gauge-panel--list">
      <div className="finance-pace-head"><span className="finance-eyebrow">남은 미분류 · {progress.groups.unclassified.count}건</span><span className="finance-muted">목적을 누르면 점선 칸이 하나씩 채워집니다</span></div>
      {rows.length ? rows.map(entry=><div key={entry.id} className="finance-label-row">
        <span className="mono finance-muted">{entry.date?.slice(5)}</span>
        <strong title={entry.merchant}>{entry.merchant || '거래명 미확인'}</strong>
        <div className="finance-label-picks" role="group" aria-label={`${entry.merchant||'거래'} 사용 목적`}>{FINANCE_QUICK_PURPOSES.map(option=><button key={option.value} type="button" className="finance-label-pick" disabled={busyId===entry.id} onClick={()=>onLabel(entry,option.value)}>{option.label}</button>)}</div>
        <span className="mono finance-label-amount">{financeMoney(entry.netAmount)}</span>
      </div>) : <p className="finance-muted">{month} 거래에 모두 라벨이 붙었습니다.</p>}
    </div>
  </section>;
}

// 3d — 개인 소비 범위 게이지 · 결제를 마디로
export function PersonalGauge({month,gauge,observed,count,top}) {
  return <>
    <section className="finance-gauge-card" aria-label="개인 소비 게이지">
      <div className="finance-gauge-head">
        <span className="finance-eyebrow">개인 소비 · {month}</span>
        <strong className="stat finance-gauge-value">{financeMoney(gauge?.value ?? 0)}</strong>
        <p className="finance-muted">개인 라벨 {count}건{observed.partial?` · 1–${observed.observed}일 관측`:''} · 구독은 구독·고정비 탭에 따로 있습니다</p>
      </div>
      {gauge && gauge.max>0 && <RangeTrack gauge={gauge} month={month} observed={observed} maxNote={`${gauge.columns.length}개월 개인 소비 최대`} />}
    </section>
    <section className="finance-gauge-card" aria-label="많이 쓴 곳">
      <div className="finance-pace-head"><h3>많이 쓴 곳</h3><span className="finance-muted">마디 하나 = 결제 한 번 · 마디 길이 = 금액 · 상위 5</span></div>
      {top.length ? <div className="finance-top">{top.map(row=><div key={row.name} className="finance-top-row">
        <span className="finance-top-name" title={row.name}>{row.name}</span>
        <span className="finance-bar finance-bar--lg"><span className="finance-top-segs" style={{width:pct(row.width)}}>{row.payments.map((amount,index)=><i key={index} style={{flexGrow:amount}} />)}</span></span>
        <span className="finance-muted finance-top-total">{row.payments.length}회 · <span className="mono">{financeMoney(row.total)}</span></span>
      </div>)}</div> : <p className="finance-muted">이 달 개인 라벨 거래가 없습니다.</p>}
    </section>
  </>;
}

// 3e — 고정비 구성 막대
export function FixedCostGauge({fixed}) {
  if (!fixed.count) return null;
  return <section className="finance-gauge-card" aria-label="매달 나가는 구독·고정비">
    <div className="finance-gauge-head">
      <span className="finance-eyebrow">매달 나가는 구독·고정비 · 약정 기준</span>
      <div className="finance-label-count"><strong className="stat">{financeMoney(fixed.total)}</strong><span>/ 월</span></div>
    </div>
    <div className="finance-fixed" role="img" aria-label={fixed.segments.map(seg=>`${seg.index} ${seg.name} ${financeMoney(seg.amount)}`).join(' · ')}>{fixed.segments.map(seg=><i key={seg.id} data-label={seg.claim?'company':'personal'} style={{flexGrow:seg.amount}}><span className="mono">{seg.index}</span></i>)}</div>
    <ol className="finance-fixed-legend">{fixed.segments.map(seg=><li key={seg.id}><span><span className="mono finance-muted">{seg.index}</span> {seg.name}</span><span className="mono finance-muted">{financeMoney(seg.amount)} · {share(seg.share)}</span></li>)}</ol>
    <p className="finance-muted">이용 중 · 매월 약정만 · 점선 마디 = 회사 업무 목적 · 연·분기 결제와 약정 미확인은 제외</p>
  </section>;
}

// 3e — 결제 주기 진행 막대 (계약 행 안)
export function CycleBar({gauge}) {
  if (!gauge) return <span className="finance-bar finance-bar--unknown" aria-hidden="true" />;
  return <span className="finance-bar" role="img" aria-label={`결제 주기 ${gauge.span}일 중 ${share(gauge.elapsed)} 지남`}><i className={`finance-bar-fill ${gauge.soon?'':'finance-bar-fill--soft'}`} style={{width:pct(gauge.elapsed)}} /></span>;
}
export const cycleLeftLabel = gauge => !gauge ? '' : gauge.left<0 ? `${-gauge.left}일 지남` : gauge.left===0 ? '오늘' : `${gauge.left}일 후`;
