export const FINANCE_PURPOSES = ['unclassified', 'personal', 'business', 'company'];
export const FINANCE_CLAIM_STATES = ['unknown', 'preparing', 'submitted', 'approved', 'partial', 'rejected', 'on_hold'];
export const FINANCE_CYCLES = ['monthly', 'quarterly', 'annual'];
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const money = v => Number.isSafeInteger(v) && Math.abs(v) <= 1e12;
const key = v => typeof v === 'string' && /^[a-zA-Z0-9_:-]{1,120}$/.test(v);
export const financeDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
const text = (v, max) => typeof v === 'string' && v.length <= max;

export function validateFinanceImport(p) {
 const bad = reason => ({ok:false,reason});
 if (!object(p) || p.version !== 1 || !key(p.importKey) || !financeDate(p.from) || !financeDate(p.through) || p.from > p.through || !object(p.coverage)) return bad('invalid-period');
 if (!Array.isArray(p.entries) || !p.entries.length || p.entries.length>5000 || !Array.isArray(p.subscriptions) || p.subscriptions.length>100) return bad('invalid-size');
 const rows=new Map();
 for (const r of p.entries) {
  if (!object(r) || !key(r.sourceKey) || rows.has(r.sourceKey) || !text(r.source,80) || !r.source || !financeDate(r.date) || r.date<p.from || r.date>p.through || !text(r.merchant,300) || !r.merchant || r.currency!=='KRW') return bad('invalid-observation');
  if (!['expense','movement'].includes(r.type) || ![r.grossAmount,r.refundAmount,r.netAmount,r.movementAmount].every(money) || r.grossAmount<0 || r.refundAmount<0) return bad('invalid-amount');
  if (r.type==='expense' && (r.netAmount!==r.grossAmount-r.refundAmount || r.movementAmount!==0)) return bad('invalid-expense');
  if (r.type==='movement' && (r.netAmount!==0 || r.grossAmount!==0 || r.refundAmount!==0 || !['topup','payment','refund'].includes(r.walletKind) || (r.walletKind==='payment' ? r.movementAmount>0 : r.movementAmount<0))) return bad('invalid-movement');
  if (r.duplicateOf!=null && !key(r.duplicateOf)) return bad('invalid-duplicate');
  if (r.group!=null && !key(r.group)) return bad('invalid-group');
  if (r.review!=null && !validateFinanceChanges('entry',r.review).ok) return bad('invalid-review');
  rows.set(r.sourceKey,r);
 }
 for (const r of rows.values()) if(r.duplicateOf) {
  const target=rows.get(r.duplicateOf);
  if(!target || target===r || target.duplicateOf || r.type!=='expense' || target.type!=='expense' || r.netAmount!==target.netAmount || r.date!==target.date || r.source===target.source) return bad('unverified-duplicate');
 }
 const subs=new Set();
 for(const s of p.subscriptions) {
  if(!object(s)||!key(s.sourceKey)||subs.has(s.sourceKey)||!text(s.name,120)||!s.name||s.amount!=null||s.currency!=null||s.cycle!=null||s.nextDate!=null) return bad('invalid-contract');
  if(s.statedAmount!=null&&(!money(s.statedAmount)||s.statedAmount<0))return bad('invalid-contract');
  subs.add(s.sourceKey);
 }
 return {ok:true};
}

export function validateFinanceChanges(entity,changes) {
 if(!object(changes)||!Object.keys(changes).length) return {ok:false,reason:'empty-review'};
 const allowed=entity==='entry' ? ['purpose','claimStatus','approvedAmount','recoveredAmount','note'] : entity==='subscription' ? ['amount','currency','cycle','nextDate','accountAlias','usageNote','purpose'] : [];
 for(const [k,v] of Object.entries(changes)) {
  if(!allowed.includes(k)) return {ok:false,reason:'immutable-observation'};
  if(k==='purpose'&&!FINANCE_PURPOSES.includes(v))return {ok:false,reason:'invalid-purpose'};
  if(k==='claimStatus'&&!FINANCE_CLAIM_STATES.includes(v))return {ok:false,reason:'invalid-claim-state'};
  if(['amount','approvedAmount','recoveredAmount'].includes(k)&&v!==null&&(!money(v)||v<0))return {ok:false,reason:'invalid-amount'};
  if(k==='currency'&&v!==null&&v!=='KRW')return {ok:false,reason:'unsupported-currency'};
  if(k==='cycle'&&v!==null&&!FINANCE_CYCLES.includes(v))return {ok:false,reason:'invalid-cycle'};
  if(k==='nextDate'&&v!==null&&!financeDate(v))return {ok:false,reason:'invalid-date'};
  if(['accountAlias','usageNote','note'].includes(k)&&v!==null&&!text(v,k==='accountAlias'?120:4000))return {ok:false,reason:'invalid-note'};
 }
 return {ok:true};
}

export function projectFinance(entries,subscriptions,imports) {
 const months=new Map(),wallets=new Map(),grouped=new Map();
 const totals={gross:0,refund:0,duplicate:0,net:0,count:0,claimCandidates:0,approved:null,recovered:null,approvalUnknownCount:0,recoveryUnknownCount:0};
 for(const r of entries) {
  const month=r.date.slice(0,7);
  if(r.type==='movement') {
   const w=wallets.get(month)||{month,topup:0,payment:0,refund:0,delta:0,count:0};
   w[r.walletKind]+=(r.walletKind==='payment'?-1:1)*r.movementAmount;w.delta+=r.movementAmount;w.count++;wallets.set(month,w);continue;
  }
  const m=months.get(month)||{month,gross:0,refund:0,duplicate:0,net:0,count:0};
  m.gross+=r.grossAmount;m.refund+=r.refundAmount;
  totals.gross+=r.grossAmount;totals.refund+=r.refundAmount;
  if(r.duplicateOf) {m.duplicate+=r.netAmount;totals.duplicate+=r.netAmount;}
  else {
   m.net+=r.netAmount;m.count++;totals.net+=r.netAmount;totals.count++;
   if(r.claimCandidate || r.review?.purpose==='company') {totals.claimCandidates++;if(r.review?.approvedAmount==null)totals.approvalUnknownCount++;if(r.review?.recoveredAmount==null)totals.recoveryUnknownCount++;}
   if(r.review?.approvedAmount!=null)totals.approved=(totals.approved??0)+r.review.approvedAmount;
   if(r.review?.recoveredAmount!=null)totals.recovered=(totals.recovered??0)+r.review.recoveredAmount;
   if(r.group) {
    const g=grouped.get(r.group)||{group:r.group,net:0,count:0,monthly:[]};
    g.net+=r.netAmount;g.count++;
    let gm=g.monthly.find(x=>x.month===month);if(!gm){gm={month,net:0,count:0};g.monthly.push(gm);}gm.net+=r.netAmount;gm.count++;grouped.set(r.group,g);
   }
  }
  months.set(month,m);
 }
 const ordered = map=>[...map.values()].sort((a,b)=>a.month.localeCompare(b.month));
 const last=[...imports].sort((a,b)=>(a.createdAt||'').localeCompare(b.createdAt||'')).at(-1);
 return {entries,subscriptions,imports,monthly:ordered(months),totals,groups:[...grouped.values()],wallet:ordered(wallets),coverage:last ? {...last.coverage,from:imports.map(r=>r.from).sort()[0],through:imports.map(r=>r.through).sort().at(-1),bankAccountCollected:imports.every(r=>r.coverage?.bankAccountCollected===true),periods:imports.map(r=>({from:r.from,through:r.through,coverage:r.coverage}))}:null};
}
