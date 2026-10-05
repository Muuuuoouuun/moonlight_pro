// UI projection only: all costs and contracts come from the personal finance ledger.
export const FINANCE_VIEWS = [{key:'flow',label:'흐름'},{key:'subscriptions',label:'구독·고정비'},{key:'claims',label:'회사 청구'}];
export const PURPOSE_OPTIONS = [{value:'unclassified',label:'미분류'},{value:'personal',label:'개인'},{value:'business',label:'개인 사업'},{value:'company',label:'회사 업무'}];
export const CLAIM_OPTIONS = [{value:'unknown',label:'미확인'},{value:'preparing',label:'준비'},{value:'submitted',label:'제출'},{value:'approved',label:'승인'},{value:'partial',label:'일부 승인'},{value:'rejected',label:'반려'},{value:'on_hold',label:'보류'}];
export const CYCLE_OPTIONS = [{value:'',label:'주기 미확인'},{value:'monthly',label:'매월'},{value:'quarterly',label:'분기'},{value:'annual',label:'매년'}];
export const SERVICE_OPTIONS = [{value:'unknown',label:'확인 필요'},{value:'active',label:'이용 중'},{value:'paused',label:'일시중지'},{value:'cancelled',label:'해지'}];
export function financeMoney(amount) {
  return typeof amount === 'number' && Number.isFinite(amount) ? `${amount.toLocaleString('ko-KR')}원` : '미확인';
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

export function financeSubscriptionDates(record,entries) {
  const payments=paymentEvidence(entries,record.group);
  const lastPaymentDate=payments.map(entry=>entry.date).sort().at(-1) || null;
  if(['paused','cancelled'].includes(record.serviceStatus)) return {...record,lastPaymentDate,nextScheduleDate:record.resumeDate||null,scheduleKind:record.resumeDate?'resume':'unknown'};
  const lastActivePayment=payments.filter(entry=>entry.netAmount>0).map(entry=>entry.date).sort().at(-1);
  const period=Number(record.statedCycle?.match(/(\d+)\s*개월(?:치|분)/)?.[1]);
  let renewalReviewDate=null;
  if (lastActivePayment && Number.isInteger(period) && period>0 && period<=24) {
    const [year,month,day]=lastActivePayment.split('-').map(Number);
    const first=new Date(Date.UTC(year,month-1+period,1));
    const finalDay=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
    first.setUTCDate(Math.min(day,finalDay));
    renewalReviewDate=first.toISOString().slice(0,10);
  }
  return {...record,lastPaymentDate,nextScheduleDate:record.nextDate || renewalReviewDate,scheduleKind:record.nextDate ? 'planned' : renewalReviewDate ? 'review' : 'unknown'};
}
