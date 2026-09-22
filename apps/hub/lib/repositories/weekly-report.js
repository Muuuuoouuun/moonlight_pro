// Weekly review uses the same measurement definitions as Objectives, with seven
// completed local calendar days. Values without complete evidence remain null.
//
// 세 축·Action KPI 기획(2026-09-20 §6.2·§6.3·§7.3)의 주간 필드도 같은 원칙으로 싣는다 —
// 개인: 오늘 3개(tasks.meta.focus_dates + completed_at)·메모·하루 리뷰 일수, 회사: 딜 단계 이동
// (crm_activities kind='deal' + meta.from/to). 완료 할 일은 completed_at, 연락은 crm_activities
// 접촉 kind로 센다(metrics/source-adapters.js tasks_completed·contacts_recorded 정의).
import { createMetricReader, metricPeriodWindow } from '../metrics/source-adapters.js';
import { shiftDateKey, toZonedDateKey } from '../rhythm-calendar.js';
import { DEAL_STAGES, STAGE_ALIASES } from '../deal-stages.js';
import { resolveDefaultWorkspaceId } from '../server-write.js';
import { dateKeyInZone, focusDatesOf, TASK_TIME_ZONE } from '../task-today.js';
import { CONTACT_ACTIVITY_KINDS } from '../contact-activity.js';

export { CONTACT_ACTIVITY_KINDS };

const STAGES = new Set(DEAL_STAGES.map(stage => stage.key));
const OPEN_STAGES = new Set([...STAGES].filter(stage => stage !== 'closing'));
const normalizeStage = deal => {
  const detail = String(deal.meta?.stage_detail || '').toLowerCase();
  if (STAGES.has(detail) || detail === 'lost') return detail;
  const raw = String(deal.stage || '').toLowerCase();
  return STAGE_ALIASES[raw] || (STAGES.has(raw) ? raw : 'potential');
};
// 오늘 3개 — 창 안의 날짜에 고른 할 일과 그 날짜(KST)에 끝낸 할 일을 센다. 분모는 선택 수,
// 분자는 같은 날 완료 수. 재오픈(done→todo)은 completed_at을 비우므로 소급해 내려간다(§6.2 규칙).
export function summarizeFocusWindow(tasks = [], { since, until, timeZone = TASK_TIME_ZONE } = {}) {
  const sinceKey = dateKeyInZone(since, timeZone);
  const untilKey = dateKeyInZone(until, timeZone);
  let picked = 0;
  let done = 0;
  const days = new Set();
  (Array.isArray(tasks) ? tasks : []).forEach((task) => {
    const completedKey = dateKeyInZone(task.completed_at ?? task.completedAt, timeZone);
    focusDatesOf(task).forEach((day) => {
      if (sinceKey && day < sinceKey) return;
      if (untilKey && day > untilKey) return;
      picked += 1;
      days.add(day);
      if (completedKey && completedKey === day) done += 1;
    });
  });
  return {
    picked,
    done,
    days: days.size,
    rate: picked > 0 ? Math.round((done / picked) * 100) : null,
  };
}

const isStageMove = row => row?.kind === 'deal' && row.meta && typeof row.meta === 'object' && Boolean(row.meta.from || row.meta.to);

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
  const personal=scope==='personal';
  const sourceKeys=scope==='company'?['contacts_recorded']:['tasks_completed','content_published','contacts_recorded','reviews_completed'];
  const inWindow=field=>[[field,`gte.${window.start}`],[field,`lt.${window.end}`]];
  const unmeasured=Promise.resolve({rows:[],coverage:'unmeasured'});
  // 오늘 3개·메모는 운영자 한 사람의 하루 단위 행동이라 조직 스코프로 가르지 않는다 — 첫 화면·
  // 저녁 리뷰의 오늘 3개 요약(summarizeFocusDay)과 같은 모수(워크스페이스 전체)를 센다.
  const [measurements,dealsResult,goals,focusResult,memoResult,moveResult] = await Promise.all([
    Promise.all(sourceKeys.map(sourceKey=>reader.measure({...period,sourceKey}))),
    reader.scopedRows('deals',[],scope),
    getGoals({scope,workspaceId}),
    personal?reader.read('tasks',[['meta->>focus_dates','not.is.null']]):unmeasured,
    personal?reader.read('journal_entries',[['entry_kind','eq.note'],...inWindow('created_at')]):unmeasured,
    personal?null:reader.scopedRows('crm_activities',[['kind','eq.deal'],...inWindow('occurred_at')],scope),
  ]);
  const failedSources=measurements.filter(m=>m.coverage!=='complete').map(m=>m.sourceKey);
  if(dealsResult.coverage!=='complete')failedSources.push('deals');
  if(!['live','empty'].includes(goals.status))failedSources.push('goals');
  if(personal&&focusResult.coverage!=='complete')failedSources.push('tasks:focus');
  if(personal&&memoResult.coverage!=='complete')failedSources.push('journal_entries:note');
  if(!personal&&moveResult.coverage!=='complete')failedSources.push('crm_activities:deal');
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
    movedDeals:moveResult?.coverage==='complete'?moveResult.rows.filter(isStageMove).length:null,
  }:{doneTasks:values.tasks_completed,publishes:values.content_published,contacts:values.contacts_recorded,personalDeals:knownDeals?modified.length:null,
    ...(()=>{
      // periodEnd는 완료된 마지막 날이므로 창의 끝(다음 날 00:00)이 아니라 periodEnd 자체까지 센다.
      const focus=focusResult.coverage==='complete'?summarizeFocusWindow(focusResult.rows,{since:periodStart,until:periodEnd,timeZone:timezone}):null;
      return {focusPicked:focus?focus.picked:null,focusDone:focus?focus.done:null,focusRate:focus?focus.rate:null,focusDays:focus?focus.days:null};
    })(),
    memos:memoResult.coverage==='complete'?memoResult.rows.length:null,
    reviewDays:values.reviews_completed,
  };
  const extraReads=personal?[focusResult,memoResult]:[moveResult];
  const unavailable=measurements.every(m=>m.coverage==='unmeasured')&&dealsResult.coverage==='unmeasured'&&extraReads.every(r=>r.coverage==='unmeasured')&&goals.status==='error';
  return {
    source:unavailable?'error':'supabase',configured:Boolean(workspaceId),scope,windowDays,timezone,periodStart,periodEnd,since:window.start,until:window.end,asOf:now.toISOString(),
    partial:failedSources.length>0,failedSources,stats:unavailable?null:stats,scorecard:null,goals,measurements,
    definitions:{contacts:'CRM에 기록된 실제 연락 활동. 노트·AI 기록·상태 수정은 제외합니다.',doneTasks:'현재 완료 상태인 작업을 completed_at으로 집계합니다. 재오픈 시 과거 값도 바뀝니다.',publishes:'발행한 원고 단위로 실제 발행 시각에 집계합니다. 같은 원고를 다시 기록해도 1건입니다.',modifiedOpenDeals:'기간 중 수정된 현재 진행 딜. 단계 전이 횟수가 아닙니다.',movedDeals:'기간 중 기록된 딜 단계 이동 횟수(crm_activities kind=deal의 이전→이후 단계). 한 딜이 두 번 옮기면 2건입니다.',focusRate:'기간 안의 날짜에 고른 오늘 3개 중 같은 날(KST) 완료한 비율. 재오픈하면 과거 값도 내려갑니다.',memos:'기간 중 새로 남긴 메모(journal_entries note) 수.',reviewDays:'하루 리뷰를 남긴 날 수.',wonDeals:'실제 won_at이 기간 안인 현재 성사 딜. 성사일 미상 딜이 있으면 미측정입니다.',wonAmount:'위 성사 딜의 KRW 계약 금액 합계이며 실제 입금이 아닙니다.',scorecard:'이전 캠페인 수동 현재값은 기간 증거가 없어 주간 실적으로 표시하지 않습니다.'},
    highlights:scope==='company'&&winsMeasured?wonDeals.slice(0,3).map(d=>({kind:'won',label:d.title||'딜'})):[],
    ...(unavailable?{error:'weekly-report-read-failed'}:{}),
  };
}
