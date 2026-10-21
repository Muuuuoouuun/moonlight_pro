// UI projection only: all costs and contracts come from the personal finance ledger.
import { formatWon } from '@/lib/won-format';
export const FINANCE_VIEWS = [{key:'flow',label:'소비 내역'},{key:'personal',label:'개인 소비'},{key:'subscriptions',label:'구독·고정비'},{key:'claims',label:'회사 청구'}];
export const PURPOSE_OPTIONS = [{value:'unclassified',label:'미분류'},{value:'personal',label:'개인'},{value:'business',label:'개인 사업'},{value:'company',label:'회사 업무'}];
export const CLAIM_OPTIONS = [{value:'unknown',label:'미확인'},{value:'preparing',label:'준비'},{value:'submitted',label:'제출'},{value:'approved',label:'승인'},{value:'partial',label:'일부 승인'},{value:'rejected',label:'반려'},{value:'on_hold',label:'보류'}];
export const CYCLE_OPTIONS = [{value:'',label:'주기 미확인'},{value:'monthly',label:'매월'},{value:'quarterly',label:'분기'},{value:'annual',label:'매년'}];
export const SERVICE_OPTIONS = [{value:'unknown',label:'확인 필요'},{value:'active',label:'이용 중'},{value:'paused',label:'일시중지'},{value:'cancelled',label:'해지'}];
export function financeMoney(amount) {
  return typeof amount === 'number' && Number.isFinite(amount) ? formatWon(amount) : '미확인';
}
export function financeReadState(data) {
  const status = data?.source === 'error' ? 'error' : ['private_preview','privatepreview'].includes(data?.status) ? 'preview' : data?.status;
  return ['live','partial'].includes(status)
    ? {...data,status,entries: Array.isArray(data.entries)?data.entries:[],subscriptions:Array.isArray(data.subscriptions)?data.subscriptions:[],monthly:Array.isArray(data.monthly)?data.monthly:[],groups:Array.isArray(data.groups)?data.groups:[],wallet:Array.isArray(data.wallet)?data.wallet:[],imports:Array.isArray(data.imports)?data.imports:[]}
    : {status:status === 'preview' ? 'preview':'error'};
}
export function financeFilters(params) {
  const month=params.get('month') || '';
  return {view:FINANCE_VIEWS.some(v=>v.key===params.get('view'))?params.get('view'):'flow',month:/^\d{4}-(0[1-9]|1[0-2])$/.test(month)?month:'',q:params.get('q')||''};
}
export function financeEntries(entries, {month,q}) {
  const query=q.trim().toLocaleLowerCase();
  return entries.filter(e=>(!month || e.date?.startsWith(month)) && (!query || [e.merchant,e.source,e.group,e.review?.note].filter(Boolean).join(' ').toLocaleLowerCase().includes(query))).sort((a,b)=>(b.date||'').localeCompare(a.date||'') || (a.sourceKey||'').localeCompare(b.sourceKey||''));
}
export function financePeriodTotals(data, month) {
  const unknown={gross:null,refund:null,duplicate:null,net:null,count:null};
  return (month ? data.monthly?.find(row=>row.month===month) : data.totals) || unknown;
}
export function financeObservedGroups(groups, subscriptions, month) {
  const wanted=new Set(subscriptions.map(s=>s.group).filter(Boolean));
  return groups.filter(g=>wanted.has(g.group)).map(g=>{
    const row=month?g.monthly?.find(m=>m.month===month):g;
    return {...g,net:row?.net ?? null,count:row?.count ?? null};
  });
}
export function financeChanges(entity, draft) {
  const fields=entity==='entry'?['purpose','claimStatus','approvedAmount','recoveredAmount','note']:['amount','currency','cycle','nextDate','accountAlias','usageNote','purpose','serviceStatus','resumeDate'];
  const numeric=new Set(['amount','approvedAmount','recoveredAmount']);
  const changes={};
  for (const key of fields) {
    if (!(key in draft)) continue;
    const value=draft[key];
    if (numeric.has(key)) {
      if (value === '' || value === null || value === undefined) changes[key]=null;
      else if (/^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value))) changes[key]=Number(value);
      else return {ok:false,field:key,message:'금액은 0 이상의 정수로 입력해 주세요. 모르는 금액은 비워 두세요.'};
    } else changes[key]=entity==='subscription' && value==='' ? null:value;
  }
  return {ok:true,changes};
}
export function financeSaveResult(httpOk, data) {
  if (httpOk && data?.status === 'saved' && data.record) return {ok:true,status:'saved'};
  if (data?.status === 'conflict') return {ok:false,status:'conflict',message:'다른 변경이 먼저 저장됐습니다. 입력을 유지했습니다. 최신 기록과 비교한 뒤 다시 저장해 주세요.'};
  return {ok:false,status:'failed',message:data?.status==='preview'?'연결이 필요해 저장하지 못했습니다. 입력은 유지했습니다.':'저장하지 못했습니다. 입력을 유지했으니 다시 시도해 주세요.'};
}
export function financeOptionLabel(options,value) { return options.find(o=>o.value===value)?.label || '미확인'; }
export function financeClaimEntries(entries) {
 return entries.filter(entry=>entry.type==='expense' && !entry.duplicateOf && (entry.claimCandidate || entry.review?.purpose==='company'));
}

export function financeNextSort(sort,key) {
  return sort.key !== key ? {key,dir:'asc'} : sort.dir === 'asc' ? {key,dir:'desc'} : {key:'',dir:''};
}
export function financeClaimRemaining(record) {
  const {approvedAmount,recoveredAmount}=record.review||{};
  return typeof approvedAmount==='number' && typeof recoveredAmount==='number' ? approvedAmount-recoveredAmount : null;
}
export function financeSortRows(rows,sort) {
  if (!sort.key) return rows;
  const value = row => {
    if (sort.key==='net') return row.type==='movement' ? row.movementAmount : row.netAmount;
    if (sort.key==='approved' || sort.key==='recovered') return row.review?.[`${sort.key}Amount`];
    if (sort.key==='remaining') return financeClaimRemaining(row);
    return row[sort.key];
  };
  return [...rows].sort((a,b)=>{
    const left=value(a),right=value(b),leftUnknown=left==null||left==='',rightUnknown=right==null||right==='';
    if (leftUnknown || rightUnknown) return leftUnknown===rightUnknown ? 0 : leftUnknown ? 1 : -1;
    const order=typeof left==='number' && typeof right==='number' ? left-right : String(left).localeCompare(String(right),'ko',{numeric:true});
    return sort.dir==='desc' ? -order : order;
  });
}

const paymentEvidence = (entries,group) => group ? entries.filter(entry=>entry.group===group && entry.type==='expense' && !entry.duplicateOf && entry.grossAmount>0) : [];

export function financeSubscriptionPayments(entries,subscriptions,months,selectedMonth='') {
  const periods=selectedMonth ? [selectedMonth] : [...new Set(months)].sort();
  const groups=new Map();
  for (const record of subscriptions) {
    const group=record.group || record.id || record.sourceKey || record.name;
    const row=groups.get(group) || {group,names:[],contracts:[],cells:[]};
    row.names.push(record.name);row.contracts.push(record);groups.set(group,row);
  }
  const rows=[...groups.values()].map(row=>{
    const evidence=paymentEvidence(entries,row.contracts[0].group);
    return {...row,cells:periods.map(month=>{
      const payments=evidence.filter(entry=>entry.date?.startsWith(month));
      return {month,net:payments.length ? payments.reduce((sum,entry)=>sum+entry.netAmount,0) : null,dates:[...new Set(payments.map(entry=>entry.date))].sort(),entries:payments};
    })};
  });
  const totals=periods.map((month,index)=>{
    const known=rows.map(row=>row.cells[index]).filter(cell=>cell.net!=null);
    return {month,net:known.length ? known.reduce((sum,cell)=>sum+cell.net,0) : null,observedGroups:known.length,missingGroups:rows.length-known.length};
  });
  return {months:periods,rows,totals};
}

function addCalendarMonths(date,months) {
  const target=new Date(`${date}T00:00:00Z`),day=target.getUTCDate();
  target.setUTCDate(1);target.setUTCMonth(target.getUTCMonth()+months);
  const end=new Date(target);end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);
  target.setUTCDate(Math.min(day,end.getUTCDate()));
  return target.getUTCFullYear()>9999 ? null : target.toISOString().slice(0,10);
}
export function financeSubscriptionDates(record,entries) {
  const payments=paymentEvidence(entries,record.group);
  const lastPaymentDate=payments.map(entry=>entry.date).sort().at(-1) || null;
  if(['paused','cancelled'].includes(record.serviceStatus)) return {...record,lastPaymentDate,nextScheduleDate:record.resumeDate||null,scheduleKind:record.resumeDate?'resume':'unknown'};
  if(record.nextDate) return {...record,lastPaymentDate,nextScheduleDate:record.nextDate,scheduleKind:'planned'};
  const paidDates=payments.filter(entry=>entry.netAmount>0).map(entry=>entry.date).sort();
  const lastActivePayment=paidDates.at(-1),firstActivePayment=paidDates[0];
  const period=Number(record.statedCycle?.match(/(\d+)\s*개월(?:치|분)/)?.[1]);
  const initialTerm=Number.isInteger(period) && period>0 && period<=24;
  const statedAnnual=/(?:\d+\s*년|매년|연간)/.test(record.statedCycle||'');
  const cycleMonths={monthly:1,quarterly:3,annual:12};
  if(lastActivePayment && record.serviceStatus==='active' && (record.cycle || statedAnnual || !initialTerm || firstActivePayment!==lastActivePayment)) {
    const estimatedCycle=record.cycle || (statedAnnual?'annual':'monthly');
    const nextScheduleDate=addCalendarMonths(lastActivePayment,cycleMonths[estimatedCycle]);
    return {...record,lastPaymentDate,nextScheduleDate,scheduleKind:nextScheduleDate?'estimate':'unknown',estimatedCycle};
  }
  const renewalReviewDate=lastActivePayment && initialTerm ? addCalendarMonths(lastActivePayment,period) : null;
  return {...record,lastPaymentDate,nextScheduleDate:renewalReviewDate,scheduleKind:renewalReviewDate?'review':'unknown'};
}

// ── Bar gauges (2026-10 Claude Design handoff "Cashflow Gauges" 3a–3e) ──
// Labels are a display projection over the ledger: company purpose → 회사 청구, an entry in a contract group → 구독,
// personal/business purpose → 개인, everything else → 미분류. Nothing here is persisted.
export const FINANCE_LABELS = [{key:'personal',label:'개인'},{key:'subscription',label:'구독'},{key:'company',label:'회사 청구'},{key:'unclassified',label:'미분류'}];
export const FINANCE_QUICK_PURPOSES = PURPOSE_OPTIONS.filter(option=>option.value!=='unclassified');
const LABEL_KEYS = FINANCE_LABELS.map(label=>label.key);
const ratio = (value,base) => typeof value==='number' && typeof base==='number' && base>0 ? Math.max(0,Math.min(1,value/base)) : 0;
const dayCount = month => new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();
const dayDiff = (from,to) => Math.round((Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/86400000);
const previousMonth = month => { const d=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7))-2,1)); return d.toISOString().slice(0,7); };
const emptyParts = () => Object.fromEntries(LABEL_KEYS.map(key=>[key,0]));

export function financeSpendEntries(entries) {
  return entries.filter(entry=>entry.type==='expense' && !entry.duplicateOf && typeof entry.netAmount==='number');
}
export function financeLabelOf(entry,subscriptionGroups) {
  const purpose=entry.review?.purpose;
  if (purpose==='company') return 'company';
  if (entry.group && subscriptionGroups.has(entry.group)) return 'subscription';
  if (purpose==='personal' || purpose==='business') return 'personal';
  return 'unclassified';
}
export function financeSubscriptionGroups(subscriptions) {
  return new Set(subscriptions.map(record=>record.group).filter(Boolean));
}
export function financeGaugeMonth(data,month) {
  return month || (data.monthly||[]).map(row=>row.month).sort().at(-1) || '';
}
// How much of the month the ledger has observed. A month the coverage ends inside is partial.
export function financeObservedDays(month,through) {
  const days=dayCount(month);
  if (through?.startsWith(month)) return {observed:Number(through.slice(8,10)),days,partial:true};
  if (through && through.slice(0,7)<month) return {observed:0,days,partial:true};
  return {observed:days,days,partial:false};
}
// Range gauge: the track ends at the series maximum; solid tick = average of the earlier months, dashed tick = previous month.
export function financeRangeGauge(series,month) {
  const known=series.filter(row=>typeof row.value==='number').sort((a,b)=>a.month.localeCompare(b.month));
  const current=known.find(row=>row.month===month);
  if (!current) return null;
  const past=known.filter(row=>row.month<month).slice(-5);
  const columns=[...past,current];
  const max=Math.max(...columns.map(row=>row.value));
  const avg=past.length ? Math.round(past.reduce((sum,row)=>sum+row.value,0)/past.length) : null;
  const prev=past.at(-1) || null;
  return {value:current.value,max,maxMonth:columns.find(row=>row.value===max).month,avg,prev,
    fill:ratio(current.value,max),avgAt:avg==null?null:ratio(avg,max),prevAt:prev?ratio(prev.value,max):null,
    columns:columns.map(row=>({month:row.month,value:row.value,height:ratio(row.value,max),current:row.month===month}))};
}
export function financeMonthlySeries(monthly) {
  return monthly.map(row=>({month:row.month,value:row.net}));
}
export function financeLabelSeries(spend,months,labelOf,label) {
  return months.map(month=>({month,value:spend.filter(entry=>entry.date?.startsWith(month) && labelOf(entry)===label).reduce((sum,entry)=>sum+entry.netAmount,0)}));
}
export function financeGrossBreakdown(row) {
  if (!row || !(row.gross>0)) return null;
  return [['net',row.net],['refund',row.refund],['duplicate',row.duplicate]].map(([key,value])=>({key,value,share:ratio(value,row.gross)}));
}
// Daily bars stacked by label, plus the running total up to the picked day against the previous month.
export function financeDailyStacks(spend,month,labelOf,observed) {
  const days=Array.from({length:dayCount(month)},(_,index)=>{
    const date=`${month}-${String(index+1).padStart(2,'0')}`, parts=emptyParts();
    for (const entry of spend) if (entry.date===date) parts[labelOf(entry)]+=entry.netAmount;
    return {day:index+1,date,observed:index<observed,parts,total:LABEL_KEYS.reduce((sum,key)=>sum+parts[key],0)};
  });
  const max=Math.max(0,...days.map(day=>day.total));
  return {days:days.map(day=>({...day,heights:Object.fromEntries(LABEL_KEYS.map(key=>[key,ratio(day.parts[key],max)]))})),max};
}
export function financeCumulative(spend,month,date,prevNet) {
  const value=spend.filter(entry=>entry.date?.startsWith(month) && entry.date<=date).reduce((sum,entry)=>sum+entry.netAmount,0);
  const day=Number(date.slice(8,10)), prevDays=dayCount(previousMonth(month));
  const paceValue=typeof prevNet==='number' ? Math.round(prevNet*Math.min(day,prevDays)/prevDays) : null;
  return {value,day,prevNet:typeof prevNet==='number'?prevNet:null,paceValue,fill:ratio(value,prevNet),paceAt:ratio(paceValue,prevNet)};
}
export function financeLabelProgress(spend,labelOf) {
  const groups=Object.fromEntries(LABEL_KEYS.map(key=>[key,{count:0,amount:0}]));
  for (const entry of spend) { const group=groups[labelOf(entry)]; group.count++; group.amount+=entry.netAmount; }
  const total=spend.reduce((sum,entry)=>sum+entry.netAmount,0);
  const cells=[...spend].sort((a,b)=>LABEL_KEYS.indexOf(labelOf(a))-LABEL_KEYS.indexOf(labelOf(b))).map(entry=>labelOf(entry));
  return {groups,count:spend.length,done:spend.length-groups.unclassified.count,total,amountShare:ratio(total-groups.unclassified.amount,total),cells};
}
// Top places: one segment per payment, segment length = amount, bar length relative to the top place.
export function financeTopMerchants(entries,limit=5) {
  const byName=new Map();
  for (const entry of entries) {
    if (!(entry.netAmount>0)) continue;
    const name=entry.merchant || '거래명 미확인', row=byName.get(name) || {name,payments:[],total:0};
    row.payments.push(entry.netAmount); row.total+=entry.netAmount; byName.set(name,row);
  }
  const rows=[...byName.values()].sort((a,b)=>b.total-a.total || a.name.localeCompare(b.name,'ko')).slice(0,limit);
  return rows.map(row=>({...row,width:ratio(row.total,rows[0].total)}));
}
// Monthly fixed cost: active, monthly, KRW contracts with a known amount. Annual contracts are excluded.
export function financeFixedCosts(subscriptions) {
  const rows=subscriptions.filter(record=>record.serviceStatus==='active' && record.cycle==='monthly' && record.currency==='KRW' && typeof record.amount==='number');
  const total=rows.reduce((sum,record)=>sum+record.amount,0);
  return {total,count:rows.length,segments:rows.sort((a,b)=>b.amount-a.amount).map((record,index)=>({index:index+1,id:record.id,name:record.name,amount:record.amount,share:ratio(record.amount,total),claim:record.purpose==='company'}))};
}
// Billing-cycle gauge: share of the time between the last payment and the next schedule that has passed by today.
export function financeCycleGauge(record,today,soonDays=21) {
  const last=record.lastPaymentDate, next=record.nextScheduleDate;
  if (record.serviceStatus!=='active' || !last || !next || next<last || ['resume','review'].includes(record.scheduleKind)) return null;
  const span=dayDiff(last,next), left=dayDiff(today,next);
  return {span,left,elapsed:span?ratio(dayDiff(last,today),span):1,soon:left<=soonDays};
}
