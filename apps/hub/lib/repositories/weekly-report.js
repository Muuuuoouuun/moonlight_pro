// Weekly review uses the same measurement definitions as Objectives, with seven
// completed local calendar days. Values without complete evidence remain null.
import { createMetricReader, metricPeriodWindow } from '../metrics/source-adapters.js';
import { shiftDateKey, toZonedDateKey } from '../rhythm-calendar.js';
import { DEAL_STAGES, STAGE_ALIASES } from '../deal-stages.js';
import { resolveDefaultWorkspaceId } from '../server-write.js';

const STAGES = new Set(DEAL_STAGES.map(stage => stage.key));
const OPEN_STAGES = new Set([...STAGES].filter(stage => stage !== 'closing'));
const normalizeStage = deal => {
  const detail = String(deal.meta?.stage_detail || '').toLowerCase();
  if (STAGES.has(detail) || detail === 'lost') return detail;
  const raw = String(deal.stage || '').toLowerCase();
  return STAGE_ALIASES[raw] || (STAGES.has(raw) ? raw : 'potential');
};
const defaultGoals = async options => {
  try { return await (await import('./goals-ledger.js')).getGoalsLedger({scope:options.scope},{workspaceId:options.workspaceId}); }
  catch { return {status:'error',error:'goals-read-failed',objectives:[],metrics:[]}; }
};

export async function getWeeklyReport({scope='personal',windowDays=7,timezone='Asia/Seoul',periodStart:requestedStart,periodEnd:requestedEnd,now=new Date(),workspaceId=resolveDefaultWorkspaceId(),reader=createMetricReader({workspaceId,now}),getGoals=defaultGoals}={}) {
  if (!['personal','company'].includes(scope) || !Number.isInteger(windowDays) || windowDays<1 || windowDays>31) throw new Error('invalid-weekly-period');
  const explicit = requestedStart !== undefined || requestedEnd !== undefined;
  if (explicit && (typeof requestedStart !== 'string' || typeof requestedEnd !== 'string')) throw new Error('invalid-weekly-period');
  const periodEnd=explicit ? requestedEnd : shiftDateKey(toZonedDateKey(now,timezone),-1);
  const periodStart=explicit ? requestedStart : shiftDateKey(periodEnd,1-windowDays);
  const window=metricPeriodWindow({periodStart,periodEnd,timezone});
  if (!window) throw new Error('invalid-weekly-timezone');
  if (explicit) {
    windowDays=(Date.parse(periodEnd)-Date.parse(periodStart))/86400000+1;
    if (windowDays<1 || windowDays>31 || periodEnd>=toZonedDateKey(now,timezone)) throw new Error('invalid-weekly-period');
  }
  const period={scope,periodStart,periodEnd,timezone};
  const sourceKeys=scope==='company'?['contacts_recorded']:['tasks_completed','content_published','contacts_recorded'];
  const [measurements,dealsResult,goals] = await Promise.all([
    Promise.all(sourceKeys.map(sourceKey=>reader.measure({...period,sourceKey}))),
    reader.scopedRows('deals',[],scope),
    getGoals({scope,workspaceId}),
  ]);
  const failedSources=measurements.filter(m=>m.coverage!=='complete').map(m=>m.sourceKey);
  if(dealsResult.coverage!=='complete')failedSources.push('deals');
  if(!['live','empty'].includes(goals.status))failedSources.push('goals');
  const deals=dealsResult.rows;
  const inPeriod=value=>typeof value==='string'&&Date.parse(value)>=Date.parse(window.start)&&Date.parse(value)<Date.parse(window.end);
  const newDeals=deals.filter(d=>inPeriod(d.created_at));
  const modified=deals.filter(d=>inPeriod(d.updated_at));
  const openDeals=modified.filter(d=>OPEN_STAGES.has(normalizeStage(d)));
  const won=deals.filter(d=>normalizeStage(d)==='closing');
  const undatedWins=won.some(d=>!d.won_at||!Number.isFinite(Date.parse(d.won_at)));
  const wonDeals=won.filter(d=>inPeriod(d.won_at));
  if(scope==='company'&&undatedWins)failedSources.push('deal-win-timestamps');
  const knownDeals=dealsResult.coverage==='complete';
  const winsMeasured=knownDeals&&!undatedWins;
  const krwOnly=wonDeals.every(d=>(d.currency||'KRW')==='KRW'&&d.amount!==null&&d.amount!==''&&Number.isFinite(Number(d.amount)));
  const values=Object.fromEntries(measurements.map(m=>[m.sourceKey,m.coverage==='complete'?m.value:null]));
  const stats=scope==='company'?{
    contacts:values.contacts_recorded,newDeals:knownDeals?newDeals.length:null,
    modifiedOpenDeals:knownDeals?openDeals.length:null,
    wonDeals:winsMeasured?wonDeals.length:null,
    wonAmount:winsMeasured&&krwOnly?wonDeals.reduce((sum,d)=>sum+Number(d.amount),0):null,
  }:{doneTasks:values.tasks_completed,publishes:values.content_published,contacts:values.contacts_recorded,personalDeals:knownDeals?modified.length:null};
  const unavailable=measurements.every(m=>m.coverage==='unmeasured')&&dealsResult.coverage==='unmeasured'&&goals.status==='error';
  return {
    source:unavailable?'error':'supabase',configured:Boolean(workspaceId),scope,windowDays,timezone,periodStart,periodEnd,since:window.start,until:window.end,asOf:now.toISOString(),
    partial:failedSources.length>0,failedSources,stats:unavailable?null:stats,scorecard:null,goals,measurements,
    definitions:{contacts:'CRM에 기록된 실제 연락 활동. 노트·AI 기록·상태 수정은 제외합니다.',doneTasks:'현재 완료 상태인 작업을 completed_at으로 집계합니다. 재오픈 시 과거 값도 바뀝니다.',publishes:'발행한 원고 단위로 실제 발행 시각에 집계합니다. 같은 원고를 다시 기록해도 1건입니다.',modifiedOpenDeals:'기간 중 수정된 현재 진행 딜. 단계 전이 횟수가 아닙니다.',wonDeals:'실제 won_at이 기간 안인 현재 성사 딜. 성사일 미상 딜이 있으면 미측정입니다.',wonAmount:'위 성사 딜의 KRW 계약 금액 합계이며 실제 입금이 아닙니다.',scorecard:'이전 캠페인 수동 현재값은 기간 증거가 없어 주간 실적으로 표시하지 않습니다.'},
    highlights:scope==='company'&&winsMeasured?wonDeals.slice(0,3).map(d=>({kind:'won',label:d.title||'딜'})):[],
    ...(unavailable?{error:'weekly-report-read-failed'}:{}),
  };
}
