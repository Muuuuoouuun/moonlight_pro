import { isCanonicalUuid } from './uuid.js';
import { isDailyReviewDate } from './daily-review.js';

export const DISCOVERY_NUDGE_RULES = {
  review: {field:'reviewDate',label:'지금 판단하기',title:'다시 보기로 한 날짜가 됐어요',reason:'계속 확인할지, 다음 날짜를 정할지 지금 판단해 보세요.'},
  result: {field:'findings',label:'결과 남기기',title:'연결한 할 일이 완료됐어요',reason:'실제 반응과 배운 점을 남기면 다음 판단을 이어갈 수 있어요.'},
  evidence: {field:'evidence',label:'근거 남기기',title:'이 가능성을 발견한 장면은 무엇인가요?',reason:'대화·관찰·원문 중 하나만 남겨도 다음에 생각을 이어가기 쉬워요.'},
  hypothesis: {field:'hypothesis',label:'가설 정리하기',title:'누구의 어떤 문제를 풀 수 있을까요?',reason:'지금 가진 근거에서 확인해 볼 가치 가설 하나를 정해 보세요.'},
  experiment: {field:'experiment',label:'작은 검증 정하기',title:'가장 먼저 무엇을 확인할까요?',reason:'질문 하나와 작게 해볼 행동을 정해 보세요.'},
  decision: {field:'status',label:'다음 판단 정하기',title:'배운 점을 다음 판단으로 이어가세요',reason:'계속 검증할지, 실행으로 연결할지, 보류하거나 종료할지 정할 수 있어요.'},
};
const validKey = key => typeof key==='string' && key.length>0 && key.length<=128 && !/[^a-zA-Z0-9:_-]/.test(key);
export function validNudgeContext(c,recordId) {
  return Boolean(c && c.recordId===recordId && isCanonicalUuid(c.recordId) && Number.isSafeInteger(c.recordRevision) && c.recordRevision>0
    && Number.isSafeInteger(c.stateRevision) && c.stateRevision>=0 && isDailyReviewDate(c.today) && typeof c.visible==='boolean'
    && (c.candidate===null || (c.candidate && typeof c.candidate==='object' && Object.hasOwn(DISCOVERY_NUDGE_RULES,c.candidate.ruleId) && DISCOVERY_NUDGE_RULES[c.candidate.ruleId].field===c.candidate.field && validKey(c.candidate.triggerKey)))
    && (c.suppression===null || (c.suppression && typeof c.suppression==='object' && ['snoozed','dismissed'].includes(c.suppression.kind) && (c.suppression.kind==='snoozed' ? isDailyReviewDate(c.suppression.until) : c.suppression.until===null)))
    && (c.visible === (c.candidate!==null && c.suppression===null)));
}
export function validateNudgeCommand(p) {
  const keys=['recordId','requestId','expectedRevision','triggerKey','action','until'];
  if(!p || typeof p!=='object' || Array.isArray(p) || Object.keys(p).length!==keys.length || keys.some(k=>!Object.hasOwn(p,k))) return false;
  return isCanonicalUuid(p.recordId) && isCanonicalUuid(p.requestId) && Number.isSafeInteger(p.expectedRevision) && p.expectedRevision>=0 && p.expectedRevision<Number.MAX_SAFE_INTEGER
    && ['snooze','dismiss','resume'].includes(p.action) && (p.action==='resume' ? p.triggerKey===null : validKey(p.triggerKey))
    && (p.action==='snooze' ? isDailyReviewDate(p.until) : p.until===null);
}
export function nextNudgeDate(today,days=1) {
  return new Date(Date.parse(`${today}T00:00:00Z`)+days*86400000).toISOString().slice(0,10);
}
export function prepareNudgeCommand(context,action,until,previous,uuid=()=>crypto.randomUUID()) {
  const command={recordId:context.recordId,expectedRevision:context.stateRevision,triggerKey:action==='resume'?null:context.candidate?.triggerKey,action,until:action==='snooze'?until:null};
  const fingerprint=JSON.stringify(command);
  return previous?.fingerprint===fingerprint ? previous : {fingerprint,payload:{...command,requestId:uuid()}};
}
