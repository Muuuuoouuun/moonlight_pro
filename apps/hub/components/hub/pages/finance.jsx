'use client';
import React from 'react';
import {useRouter, useSearchParams} from 'next/navigation';
import {Button, CertaintyBadge, Drawer, EditDrawer, EmptyState, LifecycleBadge, SegmentedControl, SelectField, Skeleton, TextAreaField, TextField, TruthBadge, useToast} from '../hub-primitives';
import {FINANCE_VIEWS, PURPOSE_OPTIONS, CLAIM_OPTIONS, CYCLE_OPTIONS, SERVICE_OPTIONS, financeMoney, financeReadState, financeFilters, financeEntries, financePeriodTotals, financeSubscriptionDates, financeSubscriptionPayments, financeChanges, financeSaveResult, financeOptionLabel, financeClaimEntries, financeNextSort, financeSortRows, financeClaimRemaining} from './finance-view';
import {SortHead} from './revenue';
import './finance.css';

const GROUP_LABELS = {gpt:'GPT',claude:'Claude 공동 관측',grok:'Grok',naver_plus:'Naver Plus',youtube:'YouTube',gemini:'Gemini',gabia:'Gabia',telecom:'통신비'};
const REVIEW_LABELS = {purpose:"사용 목적",claimStatus:"신청 상태",approvedAmount:"승인액",recoveredAmount:"실제 회수액",note:"검토 메모",amount:"약정액",currency:"통화",cycle:"주기",nextDate:"다음 청구일",accountAlias:"계정 별칭",usageNote:"사용 근거",serviceStatus:"이용 상태",resumeDate:"재개 예정일"};
const compareValue = (key,value) => value === "" || value == null ? "미확인" : key === "purpose" ? financeOptionLabel(PURPOSE_OPTIONS,value) : key === "claimStatus" ? financeOptionLabel(CLAIM_OPTIONS,value) : key === "cycle" ? financeOptionLabel(CYCLE_OPTIONS,value) : key === "serviceStatus" ? financeOptionLabel(SERVICE_OPTIONS,value) : String(value);
const SOURCE_LABELS = {'shinhan-card-settled':'신한카드 확정 거래','naverpay-purchase':'네이버페이 결제','naverpay-money':'네이버 머니 이동'};
const sourceLabel = source => SOURCE_LABELS[source] || source;
const MOVEMENT_LABELS = {topup:'머니 충전',payment:'머니 지급',refund:'머니 환불'};
const reviewDraft = (entity,record) => entity === 'entry'
  ? {id:record.id,purpose:record.review?.purpose || 'unclassified',note:record.review?.note || '',...(record.type==='expense' && !record.duplicateOf ? {claimStatus:record.review?.claimStatus || 'unknown',approvedAmount:record.review?.approvedAmount ?? '',recoveredAmount:record.review?.recoveredAmount ?? ''}: {})}
  : {id:record.id,amount:record.amount ?? '',currency:record.currency || '',cycle:record.cycle || '',nextDate:record.nextDate || '',accountAlias:record.accountAlias || '',usageNote:record.usageNote || '',purpose:record.purpose || 'unclassified',serviceStatus:record.serviceStatus||'unknown',resumeDate:record.resumeDate||''};
const contractMoney = (record) => record.amount == null ? '미확인' : record.currency === 'KRW' ? financeMoney(record.amount) : `${record.amount.toLocaleString('ko-KR')} · 통화 미확인`;
const remainingClaim = financeClaimRemaining;
const scheduleLabel = record => record.scheduleKind==='resume' ? '재개 예정' : record.scheduleKind==='review' ? '재확인' : '예정';
const scheduleTitle = record => record.scheduleKind==='resume' ? '운영자가 입력한 재개 예정일입니다. 날짜가 지나도 이용 상태를 자동으로 바꾸지 않습니다.' : record.scheduleKind==='review' ? '최근 관측 결제일 + 자술 이용 기간으로 계산한 재결제 확인 기준입니다. 실제 정기 청구일·금액·주기는 미확인입니다.' : '검토에서 입력한 다음 청구 예정일입니다.';

function ServiceBadge({record}) {
  const state={active:'active',paused:'waiting',cancelled:'cancelled'}[record.serviceStatus];
  return state ? <LifecycleBadge state={state} label={financeOptionLabel(SERVICE_OPTIONS,record.serviceStatus)} /> : <CertaintyBadge state="unknown" label="확인 필요" />;
}

function FinanceRows({entries,claims=false,onReview,onClear}) {
  const [sort,setSort]=React.useState({key:'',dir:''});
  const toggle=key=>setSort(current=>financeNextSort(current,key));
  if (!entries.length) return <EmptyState icon="search" title={claims?'표시할 청구 후보가 없습니다':'표시할 거래가 없습니다'} description="월·검색 조건과 수집 범위를 확인해 주세요." action={<Button variant="outline" onClick={onClear}>필터 지우기</Button>} />;
  return <div className={`finance-entries ${claims?'finance-claims':''}`}>
    <div className="finance-list-head finance-entry-grid">
      <SortHead k="date" sort={sort} onToggle={toggle}>날짜</SortHead><SortHead k="merchant" sort={sort} onToggle={toggle}>거래</SortHead>
      {!claims && <span>출처</span>}<span>목적</span>{claims && <span>신청</span>}
      <SortHead k="net" sort={sort} onToggle={toggle} align="right">{claims?'순소비':'금액'}</SortHead>
      {claims && <><SortHead k="approved" sort={sort} onToggle={toggle} align="right">승인</SortHead><SortHead k="recovered" sort={sort} onToggle={toggle} align="right">회수</SortHead><SortHead k="remaining" sort={sort} onToggle={toggle} align="right">남은 회수</SortHead></>}
    </div>
    {financeSortRows(entries,sort).map(entry=><button type="button" className="hub-row finance-entry finance-entry-grid" key={entry.id} onClick={()=>onReview('entry',entry)}>
      <span className="finance-entry-date mono">{entry.date}</span>
      <strong className="finance-entry-name" title={entry.merchant}>{entry.merchant || '거래명 미확인'}{entry.duplicateOf && <span className="finance-muted"> · 중복 제외</span>}</strong>
      {!claims && <span className="finance-entry-source finance-muted">{entry.type==='movement'?MOVEMENT_LABELS[entry.walletKind]||'자금 이동':sourceLabel(entry.source)}</span>}
      <span className="finance-entry-purpose finance-muted">{financeOptionLabel(PURPOSE_OPTIONS,entry.review?.purpose)}</span>
      {claims && <span className="finance-entry-status finance-muted">{financeOptionLabel(CLAIM_OPTIONS,entry.review?.claimStatus)}</span>}
      <span className="finance-entry-value mono"><span className="finance-cell-label">{claims?'소비':'금액'} </span>{entry.type==='movement'?financeMoney(entry.movementAmount):financeMoney(entry.netAmount)}</span>
      {claims && <><span className="finance-entry-approved mono"><span className="finance-cell-label">승인 </span>{financeMoney(entry.review?.approvedAmount)}</span><span className="finance-entry-recovered mono"><span className="finance-cell-label">회수 </span>{financeMoney(entry.review?.recoveredAmount)}</span><span className="finance-entry-remaining mono" title={remainingClaim(entry)<0?'과다 회수 확인':undefined}><span className="finance-cell-label">남음 </span>{financeMoney(remainingClaim(entry))}{remainingClaim(entry)<0?' · 확인':''}</span></>}
    </button>)}
  </div>;
}

function SubscriptionRows({records,onReview,onClear}) {
  const [sort,setSort]=React.useState({key:'',dir:''});
  const toggle=key=>setSort(current=>financeNextSort(current,key));
  if (!records.length) return <EmptyState icon="search" title="표시할 계약이 없습니다" description="수집 범위와 검색 조건을 확인해 주세요." action={<Button variant="outline" onClick={onClear}>필터 지우기</Button>} />;
  return <div className="finance-subscriptions">
    <div className="finance-list-head finance-subscription-grid"><SortHead k="name" sort={sort} onToggle={toggle}>계약</SortHead><SortHead k="statedAmount" sort={sort} onToggle={toggle} align="right">자술</SortHead><SortHead k="amount" sort={sort} onToggle={toggle} align="right">약정</SortHead><SortHead k="lastPaymentDate" sort={sort} onToggle={toggle}>최근 결제일</SortHead><SortHead k="nextScheduleDate" sort={sort} onToggle={toggle}>다음 일정</SortHead><span>목적·사용 근거</span></div>
    {financeSortRows(records,sort).map(record=><button type="button" className="hub-row finance-subscription finance-subscription-grid" key={record.id} onClick={()=>onReview('subscription',record)}>
      <span className="finance-subscription-title"><span className="finance-subscription-label"><strong title={record.name}>{record.name}</strong><ServiceBadge record={record} /></span>{record.accountAlias && <span className="finance-muted" title={record.accountAlias}>{record.accountAlias}</span>}</span>
      <span className="finance-subscription-stated" title={`${financeMoney(record.statedAmount)} · ${record.statedCycle||'주기 미확인'}`}><span className="finance-cell-label">자술 </span><span className="mono">{financeMoney(record.statedAmount)}</span> <span className="finance-muted">· 주기 확인</span></span>
      <span className="finance-subscription-contract"><span className="finance-cell-label">약정 </span><span className="mono">{contractMoney(record)}</span>{record.cycle && <span className="finance-muted"> · {financeOptionLabel(CYCLE_OPTIONS,record.cycle)}</span>}</span>
      <span className="finance-subscription-paid mono" title="수집한 전체 기간에서 마지막으로 관측한 결제일입니다. 플랜을 특정하지 못한 공동 관측일 수 있습니다."><span className="finance-cell-label">결제 </span>{record.lastPaymentDate||'미관측'}</span>
      <span className={`finance-subscription-next ${record.nextScheduleDate?'':'finance-subscription-next-unknown'}`} title={record.nextScheduleDate?scheduleTitle(record):undefined}><span className="finance-cell-label">다음 </span><span className="mono">{record.nextScheduleDate||'미확인'}</span>{record.nextScheduleDate && <span className="finance-muted"> · {scheduleLabel(record)}</span>}</span>
      <span className="finance-subscription-usage finance-muted" title={record.usageNote||undefined}><span>{financeOptionLabel(PURPOSE_OPTIONS,record.purpose)} · </span>{record.usageNote||'사용 미확인'}</span>
    </button>)}
  </div>;
}

function SubscriptionPaymentTable({table,onReview}) {
  if (!table.rows.length || !table.months.length) return <p className="finance-muted">이 조건의 결제 관측이 없습니다.</p>;
  return <div className="finance-table-scroll" tabIndex={0} role="region" aria-label="결제일 기준 월별 구독 결제"><table className="finance-table finance-payments">
    <thead><tr><th scope="col">계약 그룹</th>{table.months.map(month=><th scope="col" className="mono" key={month}>{month}</th>)}</tr></thead>
    <tbody>{table.rows.map(row=><tr key={row.group}>
      <th scope="row" title={row.names.join(' · ')}>{GROUP_LABELS[row.group]||row.names.join(' · ')}</th>
      {row.cells.map(cell=><td key={cell.month}>{cell.entries.length?<button type="button" className="hub-row finance-payment-cell" onClick={()=>onReview(cell,row)} aria-label={`${row.names.join(' · ')} ${cell.month} 결제 ${cell.dates.join(', ')} 순소비 ${financeMoney(cell.net)} 보기`}><span className="finance-payment-dates mono">{cell.dates.map(date=>date.slice(5)).join(' · ')}</span><span className="mono">{financeMoney(cell.net)}</span></button>:<span className="finance-muted">미관측</span>}</td>)}
    </tr>)}</tbody>
    <tfoot><tr><th scope="row">관측 합계</th>{table.totals.map(total=><td key={total.month} className="mono" title={`${total.observedGroups}개 그룹 관측 · ${total.missingGroups}개 그룹 미관측`}>{financeMoney(total.net)}</td>)}</tr></tfoot>
  </table></div>;
}

function MonthlyTable({rows,wallet=false}) {
  const columns=wallet?[['topup','충전'],['payment','지급'],['refund','환불'],['delta','관측 증감']]:[['gross','원구매'],['refund','환불'],['duplicate','중복 제외'],['net','순소비']];
  if (!rows.length) return <p className="finance-muted">이 기간의 {wallet?'머니 이동':'월별 소비'} 관측이 없습니다.</p>;
  return <div className="finance-table-scroll" tabIndex={0} role="region" aria-label={wallet?'월별 머니 이동':'월별 소비'}><table className="finance-table"><thead><tr><th scope="col">월</th>{columns.map(([key,label])=><th key={key} scope="col">{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.month}><th className="mono" scope="row">{row.month}</th>{columns.map(([key])=><td key={key} className="mono">{financeMoney(row[key])}</td>)}</tr>)}</tbody></table></div>;
}

export function Finance({onNavigate}) {
  const router=useRouter(), params=useSearchParams(), toast=useToast();
  const filters=financeFilters(params);
  const [data,setData]=React.useState({status:'loading'}),[paymentDetail,setPaymentDetail]=React.useState(null),[moreOpen,setMoreOpen]=React.useState(false),[edit,setEdit]=React.useState(null),[fieldError,setFieldError]=React.useState(null),[conflict,setConflict]=React.useState(false),[latest,setLatest]=React.useState(null),[comparisonError,setComparisonError]=React.useState(''),[writeBusy,setWriteBusy]=React.useState(false);
  const life=React.useRef({active:false,controller:null,version:0});
  const reload=React.useCallback(async()=>{
    const currentLife=life.current;
    if (!currentLife.active) return null;
    currentLife.controller?.abort();
    const controller=new AbortController(), version=++currentLife.version;
    currentLife.controller=controller;
    setData({status:'loading'});
    try {
      const response=await fetch('/api/hub/finance?scope=personal',{cache:'no-store',credentials:'same-origin',signal:controller.signal});
      const envelope=await response.json();
      const next=financeReadState(response.ok?envelope:null);
      if (currentLife.active && currentLife.version===version) {setData(next);return next;}
    } catch {if (currentLife.active && currentLife.version===version) setData({status:'error'});}
    return null;
  },[]);
  React.useEffect(()=>{life.current.active=true;reload();return ()=>{life.current.active=false;life.current.version++;life.current.controller?.abort();};},[reload]);
  const changeFilter=(key,value)=>{
    const next=new URLSearchParams(params.toString());next.set('scope','personal');
    if (value) next.set(key,value);else next.delete(key);
    router.replace(`/dashboard/revenue/cashflow?${next.toString()}`,{scroll:false});
  };
  const clearFilters=()=>{const next=new URLSearchParams(params.toString());next.delete('month');next.delete('q');next.set('scope','personal');router.replace(`/dashboard/revenue/cashflow?${next.toString()}`,{scroll:false});};
  const openReview=React.useCallback((entity,record)=>{setEdit({entity,original:record,draft:reviewDraft(entity,record),expectedRevision:record.revision});setFieldError(null);setConflict(false);setLatest(null);setComparisonError('');},[]);
  React.useEffect(()=>{
    const id=params.get('entry') || params.get('subscription');
    if (!id || !['live','partial'].includes(data.status)) return;
    const entity=params.has('entry')?'entry':'subscription';
    const record=(entity==='entry'?data.entries:data.subscriptions).find(row=>row.id===id);
    if (record) openReview(entity,record);
    const next=new URLSearchParams(params.toString());next.delete('entry');next.delete('subscription');
    router.replace(`/dashboard/revenue/cashflow?${next.toString()}`,{scroll:false});
  },[data,params,router,openReview]);
  const changeDraft=(key,value)=>{setEdit(previous=>({...previous,draft:{...previous.draft,[key]:value,...(key==='serviceStatus'&&!['paused','cancelled'].includes(value)?{resumeDate:''}:{})}}));setFieldError(null);};
  const save=async()=>{
    const parsed=financeChanges(edit.entity,edit.draft);
    if (!parsed.ok) {setFieldError(parsed);return {ok:false,status:'failed',message:parsed.message};}
    if (conflict) return {ok:false,status:'conflict',message:'최신 기록을 읽고 입력을 비교한 뒤 저장 기준을 선택해 주세요.'};
    setWriteBusy(true);
    try {
      const response=await fetch('/api/hub/finance',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'review',entity:edit.entity,id:edit.original.id,expectedRevision:edit.expectedRevision,changes:parsed.changes})});
      const result=financeSaveResult(response.ok,await response.json());
      if (result.ok) {toast('변경사항을 저장했습니다.');await reload();}
      else if(result.status==='conflict') {setConflict(true);setLatest(null);}
      return result;
    } catch {return {ok:false,status:'failed',message:'저장하지 못했습니다. 입력을 유지했으니 다시 시도해 주세요.'};}
    finally {setWriteBusy(false);}
  };
  const readLatest=async()=>{
    setComparisonError('');
    const next=await reload();
    const record=(edit.entity==='entry'?next?.entries:next?.subscriptions)?.find(row=>row.id===edit.original.id);
    if (record) setLatest(record);else setComparisonError('최신 기록을 읽지 못했습니다. 입력은 유지했습니다. 다시 읽어 주세요.');
  };
  const visibleEntries=financeEntries(data.entries||[],filters);
  const subscriptions=(data.subscriptions||[]).map(record=>financeSubscriptionDates(record,data.entries||[])).filter(record=>!filters.q.trim() || [record.name,record.accountAlias,record.usageNote,financeOptionLabel(SERVICE_OPTIONS,record.serviceStatus||'unknown')].filter(Boolean).join(' ').toLocaleLowerCase().includes(filters.q.trim().toLocaleLowerCase()));
  const totals=financePeriodTotals(data,filters.month);
  const monthly=(data.monthly||[]).filter(row=>!filters.month||row.month===filters.month);
  const wallet=(data.wallet||[]).filter(row=>!filters.month||row.month===filters.month);
  const months=[...new Set([...(data.monthly||[]).map(row=>row.month),...(data.wallet||[]).map(row=>row.month),...(data.entries||[]).map(row=>row.date?.slice(0,7)).filter(Boolean),...(filters.month?[filters.month]:[])])].sort().reverse();
  const payments=financeSubscriptionPayments(data.entries||[],subscriptions,months,filters.month);
  const available=['live','partial'].includes(data.status);
  const coverage=data.coverage||{};
  const observationImports=(data.imports||[]).filter(record=>record.coverage?.contractsOnly!==true);
  const from=coverage.from||coverage.lastFrom||coverage.lastfrom||observationImports.map(row=>row.from).filter(Boolean).sort()[0];
  const through=coverage.through||coverage.lastThrough||coverage.lastthrough||observationImports.map(row=>row.through).filter(Boolean).sort().at(-1);
  const period=from&&through?`${from} — ${through}`:'수집 기간 미확인';
  const draft=edit?.draft;
  const errorFor=key=>fieldError?.field===key?fieldError.message:undefined;
  return <div className="finance-page fade-up">
    <header className="finance-header"><div className="finance-heading"><h2>개인 현금 흐름</h2><p>수집한 소비와 구독·회사 청구를 검토해요.</p></div><Button variant="ghost" onClick={()=>setMoreOpen(true)}>더보기</Button></header>
    <div className="finance-toolbar"><SegmentedControl label="금융 보기" options={FINANCE_VIEWS} value={filters.view} onChange={value=>changeFilter('view',value)} />
    <div className="finance-filters"><SelectField label="관측 월" value={filters.month} onChange={event=>changeFilter('month',event.target.value)} options={[{value:'',label:'수집한 전체 기간'},...months.map(month=>({value:month,label:month}))]} /><TextField label="검색" type="search" value={filters.q} placeholder="거래·계약 이름" onChange={event=>changeFilter('q',event.target.value)} /></div></div>
    <div className="finance-read-notice"><TruthBadge state={data.status} />{available && <><span className="mono">{period}</span><span>은행 원장 미조회 · 은행 잔액 미확인</span>{data.status==='partial' && <Button variant="ghost" size="sm" onClick={reload}>다시 읽기</Button>}</>}</div>
    {data.status==='loading' && <Skeleton lines={6} height={24} label="개인 금융 장부 불러오는 중" />}
    {data.status==='error' && <EmptyState icon="x" title="금융 장부를 읽지 못했어요" description="읽기 실패를 빈 장부로 표시하지 않습니다. 연결 상태를 확인하고 다시 읽어 주세요." action={<Button variant="outline" onClick={reload}>다시 읽기</Button>} />}
    {data.status==='preview' && <EmptyState icon="link" title="개인 금융 장부 연결 필요" description="연결 후 가져온 내역과 계약을 볼 수 있습니다." action={<Button variant="outline" onClick={reload}>연결 다시 확인</Button>} />}
    {available && filters.view==='flow' && <>
      <section className="finance-summary" aria-label="수집한 소비 합계"><div><span>수집한 순소비</span><strong className="stat">{financeMoney(totals.net)}</strong></div><div><span>원구매</span><strong className="mono">{financeMoney(totals.gross)}</strong></div><div><span>환불</span><strong className="mono">{financeMoney(totals.refund)}</strong></div><div><span>중복 제외</span><strong className="mono">{financeMoney(totals.duplicate)}</strong></div></section>
      <p className="finance-muted">합계는 선택 월 기준 · 검색은 목록에만 적용 · 순소비는 은행 출금과 다릅니다.</p>
      <div className="finance-monthly-grid"><section className="finance-section"><div className="finance-section-head"><h3>월별 소비</h3><span className="finance-muted">원구매 − 환불 − 중복</span></div><MonthlyTable rows={monthly} /></section>
      <section className="finance-section"><div className="finance-section-head"><h3>머니 이동</h3><span className="finance-muted">소비 합계에서 제외 · 잔액 아님</span></div><MonthlyTable rows={wallet} wallet /></section></div>
      <section className="finance-section"><div className="finance-section-head"><h3>거래 검토</h3><span className="finance-muted num">{visibleEntries.length}건 · 행을 눌러 검토</span></div><FinanceRows entries={visibleEntries} onReview={openReview} onClear={clearFilters} /></section>
    </>}
    {available && filters.view==='subscriptions' && <>
      <p className="finance-muted">결제일 기준 월별 · 환불·중복 차감 · 같은 Claude 공동 결제는 한 번만 합산</p>
      <section className="finance-section"><div className="finance-section-head"><h3>월별 구독 결제</h3><span className="finance-muted">날짜 · 순소비 / 눌러서 내역 확인</span></div><SubscriptionPaymentTable table={payments} onReview={(cell,row)=>setPaymentDetail({...cell,label:GROUP_LABELS[row.group]||row.names.join(' · ')})} /></section>
      <section className="finance-section"><div className="finance-section-head"><h3>구독·고정비 계약</h3><span className="finance-muted num">{subscriptions.length}개 · 최근 결제일은 수집 전체 기간 기준</span></div><SubscriptionRows records={subscriptions} onReview={openReview} onClear={clearFilters} /></section>
      <p className="finance-muted">이용 상태는 운영자 입력 기준 · 행에서 수정 · 중단·해지는 과거 결제 유지 · 재개 예정은 직접 입력</p>
    </>}
    {available && filters.view==='claims' && <>
      <p className="finance-muted">목적·신청·승인·실제 회수를 따로 확인합니다. 미확인 금액은 0원으로 계산하지 않습니다.</p>
      <div className="finance-section-head"><h3>회사 청구 후보</h3><span className="finance-muted num">{financeClaimEntries(visibleEntries).length}건 · 행을 눌러 검토</span></div><FinanceRows key="claims" entries={financeClaimEntries(visibleEntries)} claims onReview={openReview} onClear={clearFilters} />
    </>}
    {paymentDetail && <Drawer title="월별 구독 결제 내역" subtitle={`${paymentDetail.label} · ${paymentDetail.month}`} onClose={()=>setPaymentDetail(null)} width="min(800px, 96vw)"><p className="finance-muted">원본의 결제일 기준입니다. 같은 결제의 중복과 머니 이동은 제외했습니다.</p><FinanceRows entries={financeEntries(paymentDetail.entries,{month:'',q:''})} onReview={(entity,entry)=>{setPaymentDetail(null);openReview(entity,entry);}} onClear={()=>setPaymentDetail(null)} /></Drawer>}
    {edit && <EditDrawer title={edit.entity==='entry'?'거래 검토':'구독·고정비 검토'} subtitle={edit.original.merchant||edit.original.name} record={draft} fields={[]} onChange={changeDraft} onClose={()=>setEdit(null)} onSave={save} width="min(480px, 96vw)">
      <fieldset className="finance-review-fields" disabled={writeBusy} aria-label="금융 기록 검토">
        {edit.entity==='entry'?<>
          <dl className="finance-review-facts"><div><dt>원구매</dt><dd className="mono">{financeMoney(edit.original.grossAmount)}</dd></div><div><dt>환불</dt><dd className="mono">{financeMoney(edit.original.refundAmount)}</dd></div><div><dt>순소비</dt><dd className="mono">{financeMoney(edit.original.netAmount)}</dd></div><div><dt>출처·날짜</dt><dd>{sourceLabel(edit.original.source)} · <span className="mono">{edit.original.date}</span></dd></div></dl>
          {edit.original.duplicateOf && <p className="finance-muted">중복 연결로 소비 합계에서 제외한 거래입니다. 회사 청구는 대표 거래에서 검토합니다.</p>}
          {edit.original.duplicateOf && data.entries?.some(row=>row.sourceKey===edit.original.duplicateOf) && <Button variant="outline" onClick={()=>openReview('entry',data.entries.find(row=>row.sourceKey===edit.original.duplicateOf))}>대표 거래 검토</Button>}{edit.original.type==='movement' && <p className="finance-muted">{MOVEMENT_LABELS[edit.original.walletKind]||'자금 이동'} <span className="mono">{financeMoney(edit.original.movementAmount)}</span> · 소비와 별개입니다.</p>}
          <SelectField label="사용 목적" options={PURPOSE_OPTIONS} value={draft.purpose} onChange={event=>changeDraft('purpose',event.target.value)} />
          {edit.original.type==='expense' && !edit.original.duplicateOf && <><SelectField label="신청 상태" options={CLAIM_OPTIONS} value={draft.claimStatus} onChange={event=>changeDraft('claimStatus',event.target.value)} />
          <TextField label="승인액 (원)" inputMode="numeric" value={draft.approvedAmount} hint="미확인은 빈칸, 확인한 0원은 0" error={errorFor('approvedAmount')} onChange={event=>changeDraft('approvedAmount',event.target.value)} />
          <TextField label="실제 회수액 (원)" inputMode="numeric" value={draft.recoveredAmount} hint="입금·정산 근거로 확인한 금액" error={errorFor('recoveredAmount')} onChange={event=>changeDraft('recoveredAmount',event.target.value)} /></>}
          <TextAreaField label="검토 메모" value={draft.note} maxLength={4000} onChange={event=>changeDraft('note',event.target.value)} />
        </>:<>
          <SelectField label="이용 상태" options={SERVICE_OPTIONS} value={draft.serviceStatus} hint="운영자 입력 기준입니다. 결제 기록만으로 자동 판단하지 않습니다." onChange={event=>changeDraft('serviceStatus',event.target.value)} />
          {['paused','cancelled'].includes(draft.serviceStatus) && <TextField label="재개 예정일" type="date" value={draft.resumeDate} hint="미정이면 빈칸. 실제 재개 후 이용 상태를 바꿔 주세요." onChange={event=>changeDraft('resumeDate',event.target.value)} />}
          {edit.original.lastPaymentDate && <dl className="finance-review-facts"><div><dt>최근 관측 결제일</dt><dd className="mono">{edit.original.lastPaymentDate}</dd></div>{edit.original.scheduleKind==='review' && <div><dt>이용 기간 뒤 재확인</dt><dd className="mono">{edit.original.nextScheduleDate}</dd></div>}</dl>}{edit.original.scheduleKind==='review' && <p className="finance-muted">{scheduleTitle(edit.original)} 다음 청구일로 자동 저장하지 않습니다.</p>}
          <p className="finance-muted">자술 {financeMoney(edit.original.statedAmount)} · {edit.original.statedCycle||'주기 미확인'}. 결제 관측과 사용 근거를 약정으로 자동 복제하지 않습니다.</p>
          <TextField label="약정액" inputMode="numeric" value={draft.amount} hint="미확인은 빈칸, 확인한 0은 0" error={errorFor('amount')} onChange={event=>changeDraft('amount',event.target.value)} />
          <SelectField label="약정 통화" options={[{value:'',label:'통화 미확인'},{value:'KRW',label:'원 (KRW)'}]} value={draft.currency} onChange={event=>changeDraft('currency',event.target.value)} />
          <SelectField label="약정 주기" options={CYCLE_OPTIONS} value={draft.cycle} onChange={event=>changeDraft('cycle',event.target.value)} />
          <TextField label="다음 청구일" type="date" value={draft.nextDate} onChange={event=>changeDraft('nextDate',event.target.value)} />
          <TextField label="계정 별칭" value={draft.accountAlias} hint="비밀번호·계좌번호 대신 구분할 이름" maxLength={120} onChange={event=>changeDraft('accountAlias',event.target.value)} />
          <SelectField label="사용 목적" options={PURPOSE_OPTIONS} value={draft.purpose} onChange={event=>changeDraft('purpose',event.target.value)} />
          <TextAreaField label="사용 근거" value={draft.usageNote} hint="최근 기간·사용한 일·계속 쓸 이유. 빈칸은 사용 미확인입니다." maxLength={4000} onChange={event=>changeDraft('usageNote',event.target.value)} />
        </>}
        {conflict && <section className="finance-conflict" aria-label="저장 충돌 비교"><p>입력을 유지했습니다. 최신 저장값을 읽고 비교해 주세요.</p><Button variant="outline" onClick={readLatest}>최신 기록 읽기</Button>{comparisonError && <p role="alert">{comparisonError}</p>}{latest && <><dl>{Object.entries(reviewDraft(edit.entity,latest)).filter(([key])=>key!=='id').map(([key,value])=><div key={key}><dt>{REVIEW_LABELS[key]}</dt><dd>최신: {compareValue(key,value)}<br />내 입력: {compareValue(key,draft[key])}</dd></div>)}</dl><Button variant="outline" onClick={()=>{setEdit(previous=>({...previous,original:latest,draft:reviewDraft(previous.entity,latest),expectedRevision:latest.revision}));setConflict(false);setLatest(null);}}>최신값으로 바꾸기</Button><Button variant="outline" onClick={()=>{setEdit(previous=>({...previous,original:latest,expectedRevision:latest.revision}));setConflict(false);setLatest(null);}}>내 입력을 유지하고 다시 저장 준비</Button></>}</section>}
      </fieldset>
    </EditDrawer>}
    {moreOpen && <Drawer title="금융 더보기" onClose={()=>setMoreOpen(false)} width="min(480px, 96vw)">
      <div className="finance-more"><section><h3>수집 범위</h3><TruthBadge state={data.status} /><p className="mono">{period}</p><p>은행 원장 미조회 · 은행 잔액 미확인</p><p>조회 기간 밖 결제·현금·회사 정산은 전체 합계에 포함됐다고 말할 수 없습니다. 최신 월도 확인한 날짜까지만 관측한 일부 기간입니다.</p>{coverage.note && <p>{coverage.note}</p>}{Array.isArray(coverage.notes)?coverage.notes.map((note,index)=><p key={index}>{note}</p>):typeof coverage.notes==='string'?<p>{coverage.notes}</p>:null}{(data.imports||[]).map(record=><p key={record.id}><span className="mono">{record.from} — {record.through}</span> · {typeof record.coverage==='string'?record.coverage:record.coverage?.contractsOnly===true?'계약만 등록 · 결제 수집 아님':'가져온 범위'} · <span className="mono">{record.createdAt?.slice(0,10)||'시각 미확인'}</span></p>)}<Button variant="outline" onClick={reload}>수집 자료 다시 읽기</Button></section>
      <section><h3>CFO 리피아 검토 자료</h3>{available && <dl className="finance-review-facts"><div><dt>선택 기간 순소비</dt><dd className="mono">{financeMoney(totals.net)}</dd></div><div><dt>수집 전체 기간 확인된 승인액</dt><dd className="mono">{financeMoney(data.totals?.approved)}</dd></div><div><dt>수집 전체 기간 확인된 회수액</dt><dd className="mono">{financeMoney(data.totals?.recovered)}</dd></div><div><dt>이용 상태</dt><dd>{SERVICE_OPTIONS.map(option=>`${option.label} ${data.subscriptions.filter(record=>(record.serviceStatus||'unknown')===option.value).length}`).join(' · ')}</dd></div><div><dt>사용 근거</dt><dd>{data.subscriptions.length ? `${data.subscriptions.filter(record=>!record.usageNote).length}개 계약 미확인` : '계약 미관측'}</dd></div></dl>}<p>승인 미확인 후보 {data.totals?.approvalUnknownCount ?? 0}건 · 회수 미확인 후보 {data.totals?.recoveryUnknownCount ?? 0}건</p><p>같은 기간의 소비·약정·사용 근거·승인·실제 회수와 빠진 출처를 함께 검토해 주세요. 자료가 없는 비용과 사용은 0으로 채우지 않습니다.</p><p>예상 시간 절감을 현금 이익으로 바꾸지 않습니다. 유지·축소 검토·해지 검토·추가 확인은 운영자 판단 전까지 검토 의견입니다.</p><Button variant="outline" onClick={()=>onNavigate?.('dashboard/agents/office-council')}>기존 Office로 이동</Button></section></div>
    </Drawer>}
  </div>;
}
