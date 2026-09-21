export const GOAL_SOURCE_KEYS = ['manual', 'tasks_completed', 'contacts_recorded', 'content_published', 'reviews_completed'];
export const GOAL_ENTITY_TYPES = ['projects', 'tasks', 'campaigns', 'brands', 'content_items', 'deals', 'leads', 'customer_accounts', 'memos', 'journal_entries'];
export const GOAL_ACTIONS = ['create_objective', 'update_objective', 'create_metric', 'archive_metric', 'record_observation', 'link_entity', 'unlink_entity'];
export const GOAL_SOURCE_CATALOG = {
  manual: { label: '근거와 함께 직접 기록', description: '기간 전체의 현재값을 기록합니다. 이전 기록과 합산하지 않습니다.' },
  tasks_completed: { label: '완료 작업 수', description: '현재 완료 상태인 작업의 완료 시각 기준입니다. 재오픈하면 과거 집계도 바뀝니다.' },
  contacts_recorded: { label: '실제 연락 기록 수', description: '실제 연락 활동을 발생 시각과 소속으로 집계합니다.' },
  content_published: { label: '발행 완료 수', description: '성공한 발행 기록만 실제 발행 시각으로 집계합니다.' },
  reviews_completed: { label: '하루 리뷰 수', description: '기간 안에 저장된 하루 리뷰를 집계합니다.' },
};
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const isGoalUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function isGoalDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function isGoalTimestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(value) && isGoalDate(value.slice(0,10)) && Number.isFinite(Date.parse(value));
}
const boundedText = (value, max, required = false) => typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0);
const optionalNumber = value => value === undefined || value === null || (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e15);
const only = (value, fields) => object(value) && Object.keys(value).every(key => fields.includes(key));
const period = value => isGoalDate(value.periodStart) && isGoalDate(value.periodEnd) && value.periodStart <= value.periodEnd;
const revision = value => Number.isSafeInteger(value) && value >= 1;
function safeHref(value) {
  if (!boundedText(value, 2048, true)) return false;
  if (/^\/dashboard(?:[/?#]|$)/.test(value) && !/[\u0000-\u0020\\]/.test(value)) return true;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
export function validateGoalCommand(input) {
  const bad = error => ({ok:false,error});
  if (!only(input, ['commandId','action','expectedRevision','input']) || !isGoalUuid(input.commandId) || !GOAL_ACTIONS.includes(input.action) || !object(input.input)) return bad('invalid-command');
  const value = input.input;
  const mutable = ['update_objective','archive_metric','link_entity','unlink_entity'].includes(input.action);
  if (mutable ? !revision(input.expectedRevision) : input.expectedRevision !== undefined) return bad('invalid-revision');
  switch (input.action) {
    case 'create_objective': {
      if (!only(value,['title','description','scope','periodStart','periodEnd','timezone']) || !boundedText(value.title,300,true) || (value.description !== undefined && !boundedText(value.description,4000)) || !['personal','company'].includes(value.scope) || !period(value)) return bad('invalid-objective');
      try { if (typeof value.timezone !== 'string' || value.timezone.length > 80) return bad('invalid-timezone'); new Intl.DateTimeFormat('en',{timeZone:value.timezone}); } catch { return bad('invalid-timezone'); }
      break;
    }
    case 'update_objective':
      if (!only(value,['id','title','description','status']) || !isGoalUuid(value.id) || Object.keys(value).length < 2 || (value.title !== undefined && !boundedText(value.title,300,true)) || (value.description !== undefined && !boundedText(value.description,4000)) || (value.status !== undefined && !['active','archived'].includes(value.status))) return bad('invalid-objective-update');
      break;
    case 'create_metric':
      if (!only(value,['objectiveId','name','unit','role','direction','baseline','target','targetMin','targetMax','sourceKey']) || !isGoalUuid(value.objectiveId) || !boundedText(value.name,300,true) || !boundedText(value.unit,40,true) || !['outcome','driver','guardrail'].includes(value.role) || !['increase','decrease','range'].includes(value.direction) || !GOAL_SOURCE_KEYS.includes(value.sourceKey) || !['baseline','target','targetMin','targetMax'].every(key => optionalNumber(value[key]))) return bad('invalid-metric');
      if (value.direction === 'range') {
        if (value.target != null || (value.targetMin == null) !== (value.targetMax == null) || (value.targetMin != null && value.targetMin > value.targetMax)) return bad('invalid-target');
      } else if (value.targetMin != null || value.targetMax != null || (value.baseline != null && value.target != null && (value.direction === 'increase' ? value.target < value.baseline : value.target > value.baseline))) return bad('invalid-target');
      break;
    case 'archive_metric':
      if (!only(value,['id']) || !isGoalUuid(value.id)) return bad('invalid-metric-id');
      break;
    case 'record_observation':
      if (!only(value,['metricId','value','observedAt','periodStart','periodEnd','coverage','evidence','note','sourceKey']) || !isGoalUuid(value.metricId) || !period(value) || !isGoalTimestamp(value.observedAt) || !['complete','partial','unmeasured'].includes(value.coverage) || !optionalNumber(value.value) || value.value === undefined || (value.coverage === 'complete' && value.value === null) || (value.coverage === 'unmeasured' && value.value !== null) || (value.sourceKey !== undefined && value.sourceKey !== 'manual') || (value.note !== undefined && !boundedText(value.note,4000))) return bad('invalid-observation');
      if (!Array.isArray(value.evidence) || value.evidence.length > 20 || (value.coverage === 'complete' && value.evidence.length === 0) || value.evidence.some(entry => !only(entry,['type','label','href','occurredAt']) || (entry.type !== undefined && entry.type !== 'manual') || !boundedText(entry.label,300,true) || !safeHref(entry.href) || !isGoalTimestamp(entry.occurredAt))) return bad('invalid-evidence');
      break;
    default:
      if (!only(value,['objectiveId','entityType','entityId']) || !isGoalUuid(value.objectiveId) || !GOAL_ENTITY_TYPES.includes(value.entityType) || !isGoalUuid(value.entityId)) return bad('invalid-link');
  }
  return {ok:true,value:{...input,commandId:input.commandId.toLowerCase()}};
}

export function calculateGoalProgress(metric, measurement) {
  const empty = state => ({value:null,achieved:null,state});
  if (measurement?.coverage === 'partial') return empty('partial');
  if (!measurement || measurement.coverage !== 'complete' || !Number.isFinite(measurement.value)) return empty('unmeasured');
  const actual = measurement.value;
  if (metric.direction === 'range') {
    if (!Number.isFinite(metric.targetMin) || !Number.isFinite(metric.targetMax)) return empty('target_unset');
    const achieved = actual >= metric.targetMin && actual <= metric.targetMax;
    return {value:achieved ? 100 : null,achieved,state:achieved?'achieved':'in_progress'};
  }
  if (!Number.isFinite(metric.target)) return empty('target_unset');
  const achieved = metric.direction === 'decrease' ? actual <= metric.target : actual >= metric.target;
  let value = achieved ? 100 : null;
  if (Number.isFinite(metric.baseline) && metric.target !== metric.baseline) value = Math.round(Math.max(0,Math.min(100,100*(actual-metric.baseline)/(metric.target-metric.baseline))));
  return {value,achieved,state:achieved?'achieved':'in_progress'};
}
export const projectObjective = row => ({id:row.id,title:row.title,description:row.description,scope:row.scope,periodStart:row.period_start,periodEnd:row.period_end,timezone:row.timezone,status:row.status,revision:Number(row.revision)});
export const projectMetric = row => ({id:row.id,objectiveId:row.objective_id,name:row.name,unit:row.unit,role:row.role,direction:row.direction,baseline:row.baseline,target:row.target,targetMin:row.target_min,targetMax:row.target_max,sourceKey:row.source_key,status:row.status,revision:Number(row.revision)});
export const projectObservation = row => ({id:row.id,metricId:row.metric_id,value:row.value,observedAt:row.observed_at,periodStart:row.period_start,periodEnd:row.period_end,coverage:row.coverage,evidence:row.evidence,note:row.note,sourceKey:row.source_key,createdAt:row.created_at});
export const projectGoalLink = row => ({objectiveId:row.objective_id,entityType:row.entity_type,entityId:row.entity_id});
