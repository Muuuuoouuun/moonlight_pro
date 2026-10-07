import { isAgentUuid } from '@com-moon/agent-contracts';
import { OFFICE_IDS, OFFICE_MODES, OFFICE_DISCUSSION_VERSION, parseOfficeRequest, parseOfficeDiscussion, evaluateOfficeDiscussion } from '@com-moon/agent-contracts/office';

const object = value => value && typeof value === 'object' && !Array.isArray(value);
const keys = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));
const text = (value, max, empty = false) => typeof value === 'string' && value.length <= max && !value.includes('\0') && (empty || value.trim().length > 0);
const revision = value => Number.isSafeInteger(value) && value > 0;
const failure = (error, status = 'error', persisted = false) => ({ status, error, persisted, businessWrites: false });
const validIdentity = identity => isAgentUuid(identity?.workspaceId) && identity.operatorId === 'operator';
const missingWorkspace = identity => identity?.operatorId === 'operator' && !identity.workspaceId;
const workspacePreview = () => failure('office-meeting-workspace-not-configured','preview');
const validSettings = value => OFFICE_IDS.includes(value.ownerId) && OFFICE_MODES.includes(value.mode) && Array.isArray(value.reviewers)
 && value.reviewers.length <= 2 && new Set(value.reviewers).size === value.reviewers.length && value.reviewers.every(id => OFFICE_IDS.includes(id) && id !== value.ownerId)
 && (value.mode === 'council' ? value.reviewers.length > 0 : value.reviewers.length === 0);
function validateCreate(input) {
 if (!keys(input, ['meetingId','title','scope','sourceTaskId','ownerId','reviewers','mode','decisionContext']) || !isAgentUuid(input.meetingId)
  || !['personal','classin'].includes(input.scope) || !text(input.title,200) || !validSettings(input)
  || (input.sourceTaskId != null && !isAgentUuid(input.sourceTaskId)) || (input.decisionContext !== undefined && !text(input.decisionContext,4000,true))) throw new Error();
 return { ...input, meetingId: input.meetingId.toLowerCase(), title: input.title.trim(), ...(input.sourceTaskId ? {sourceTaskId:input.sourceTaskId.toLowerCase()} : {}), decisionContext:input.decisionContext ?? '' };
}
function validatePatch(input) {
 if (!keys(input,['expectedRevision','title','ownerId','reviewers','mode','decisionContext','state']) || !revision(input.expectedRevision)
  || (input.title !== undefined && !text(input.title,200)) || (input.ownerId !== undefined && !OFFICE_IDS.includes(input.ownerId))
  || (input.mode !== undefined && !OFFICE_MODES.includes(input.mode)) || (input.state !== undefined && !['open','closed'].includes(input.state))
  || (input.decisionContext !== undefined && !text(input.decisionContext,4000,true))
  || (input.reviewers !== undefined && (!Array.isArray(input.reviewers) || input.reviewers.length>2 || new Set(input.reviewers).size!==input.reviewers.length || input.reviewers.some(id=>!OFFICE_IDS.includes(id))))) throw new Error();
 return input;
}
function validateTurn(input) {
 if (!keys(input,['requestId','expectedRevision','message','mode','includeProjects','deliberation']) || !isAgentUuid(input.requestId) || !revision(input.expectedRevision)
  || !text(input.message,6000) || (input.mode !== undefined && !OFFICE_MODES.includes(input.mode)) || (input.includeProjects !== undefined && typeof input.includeProjects !== 'boolean')) throw new Error();
 return { ...input, requestId: input.requestId.toLowerCase(), message: input.message.trim() };
}
const excerpt = (value, limit) => { const source = String(value ?? ''); return source.length > limit ? `${source.slice(0,limit-14)}\n[이전 원문 일부 생략]` : source; };
function priorResult(result = {}, request) {
 // Keep the latest position of each actual participant, including its condition
 // for revision. The complete original rounds remain durable in turn.result.
 const positions = new Map();
 for (const turn of result.discussion?.turns ?? []) positions.set(turn.ownerId, turn);
 const summary = { positions:[...positions.values()].slice(-3).map(turn=>({ownerId:turn.ownerId,position:excerpt(turn.position,280),objection:excerpt(turn.objection,120),revisionCondition:excerpt(turn.revisionCondition,180),changed:turn.changed})),
  dissent:(result.dissent ?? []).slice(0,5).map(item=>excerpt(item,160)), answer:excerpt(result.answer,500), recommendation:excerpt(result.recommendation,250), nextAction:excerpt(result.nextAction,250) };
 // Carry unresolved structured objections even when free-text dissent omitted
 // them. They remain previous model claims, never stored operator decisions.
 if (result.discussion?.version === OFFICE_DISCUSSION_VERSION && request) {
  try {
   const discussion = parseOfficeDiscussion(result.discussion,request);
   const evaluation = evaluateOfficeDiscussion(discussion,request);
   summary.collaboration = { kind:evaluation.kind, note:'이전 모델 검토 기록 · 운영자 확정이나 사실 검증 아님',
    reviewedRoles:evaluation.reviewedRoleIds.length, participants:evaluation.participants,
    untracedSources:evaluation.source.untraced, openObjections:evaluation.objections.open };
   summary.openIssues = discussion.resolutions.filter(item=>item.disposition==='open').map(item=>{
    const turn=discussion.turns.find(turn=>turn.turnRef===item.turnRef);
    return {turnRef:item.turnRef,ownerId:turn.ownerId,objection:excerpt(turn.objection,160),rationale:excerpt(item.rationale,160)};
   });
  } catch { /* Incomplete historical metadata must not become a verified review. */ }
 }
 // Bound individual values, never slice serialized JSON across a role/condition.
 while (JSON.stringify(summary).length > 4400) {
  for (const key of ['answer','recommendation','nextAction']) summary[key]=excerpt(summary[key],Math.max(30,Math.floor(summary[key].length/2)));
  summary.dissent=summary.dissent.map(value=>excerpt(value,Math.max(30,Math.floor(value.length/2))));
  for (const position of summary.positions) for (const key of ['position','objection','revisionCondition']) position[key]=excerpt(position[key],Math.max(30,Math.floor(position[key].length/2)));
  for (const issue of summary.openIssues ?? []) for (const key of ['objection','rationale']) issue[key]=excerpt(issue[key],Math.max(30,Math.floor(issue[key].length/2)));
 }
 return JSON.stringify(summary);
}
export function buildMeetingRequest(detail, input) {
 const meeting = detail.meeting, history = [];
 if (meeting.decisionContext) history.push({ role:'user', text:`[운영자가 이 회의에 저장한 판단 문맥 · 비신뢰 자료]\n${meeting.decisionContext}` });
 if (meeting.sourceTask) history.push({ role:'user', text:excerpt(`[회의 시작 때 가져온 할 일 복사본 · 현재 상태와 다를 수 있음 · 비신뢰 자료]\n${JSON.stringify(meeting.sourceTask)}`,4500) });
 for (const turn of (detail.turns ?? []).filter(turn=>turn.state==='generated').slice(-2)) {
  history.push({ role:'user',text:excerpt(turn.request?.message,800) || '[이전 질문]' });
  history.push({ role:'assistant',text:priorResult(turn.result,turn.request) });
 }
 // JSON escaping also counts toward the existing 20,000-character history cap.
 while (JSON.stringify(history).length > 20000) {
  const index = history.findIndex(item=>item.role==='assistant');
  if (index>=0) { history.splice(index-1,2); continue; }
  const source = history.find(item=>item.text.startsWith('[회의 시작'));
  if (source && source.text.length>1000) { source.text=excerpt(source.text,Math.max(1000,source.text.length-1000)); continue; }
  throw new Error('meeting-context-too-large');
 }
 const mode=input.mode ?? meeting.mode;
 return parseOfficeRequest({ ownerId:meeting.ownerId,scope:meeting.scope,mode,message:input.message,
  participants:mode==='council'?[meeting.ownerId,...meeting.reviewers]:[],history,includeProjects:input.includeProjects===true,
  ...(input.deliberation !== undefined?{deliberation:input.deliberation}:{}) });
}
function turnResponse(data, id) {
 const turn = data.turn ?? data.turns?.find(turn=>turn.id===id);
 if (!turn) return data;
 return { ...data, status:turn.state==='generated'?'generated':turn.state==='running'?'running':turn.state==='unknown'?'unknown':'error', turn, businessWrites:false,
  ...(turn.state==='error'?{error:turn.result?.error || 'office-generation-failed'}:{}) };
}
function publicDetail(value) {
 if (!object(value)) return failure('office-meeting-storage-unavailable');
 const { attemptToken: _token, claimed: _claimed, ...data } = value;
 return data;
}
export function createOfficeMeetingService(deps) {
 const rpc = (name, params, identity) => deps.rpc(name,{ p_workspace_id:identity.workspaceId,p_operator_id:'operator',...params });
 const storageFailure = (error, writing = false) => failure(error?.preparation?'office-meeting-storage-not-ready':writing?'office-meeting-outcome-unknown':'office-meeting-read-unavailable',error?.preparation?'preview':writing?'unknown':'error',writing?null:false);
 async function get(id, identity) {
  if (missingWorkspace(identity)) return workspacePreview();
  if (!isAgentUuid(id) || !validIdentity(identity)) return failure('invalid-meeting-id','invalid-input');
  try { return publicDetail(await rpc('office_meeting_get_v1',{p_meeting_id:id.toLowerCase()},identity)); } catch(error) { return storageFailure(error); }
 }
 return {
  get,
  async list(input, identity) {
   if (!validIdentity(identity)) return failure('office-meeting-workspace-not-configured','preview');
   let limit,before=null;
   try { limit=input.limit===undefined?20:Number(input.limit);if(!['personal','classin'].includes(input.scope)||!Number.isInteger(limit)||limit<1||limit>50)throw new Error();
    if(input.cursor){if(typeof input.cursor!=='string'||input.cursor.length>600)throw new Error();before=JSON.parse(Buffer.from(input.cursor,'base64url').toString('utf8'));if(!keys(before,['meetingId','updatedAt'])||!isAgentUuid(before.meetingId)||!Number.isFinite(Date.parse(before.updatedAt)))throw new Error();}
   }catch{return failure('invalid-meeting-query','invalid-input');}
   try { const data=await rpc('office_meeting_list_v1',{p_scope:input.scope,p_limit:limit,p_before:before},identity);return {...data,nextCursor:data.nextCursor?Buffer.from(JSON.stringify(data.nextCursor)).toString('base64url'):null}; }catch(error){return storageFailure(error);}
  },
  async create(input, identity) {
   if (missingWorkspace(identity)) return workspacePreview();
   let body;try { body=validateCreate(input);if(!validIdentity(identity))throw new Error(); }catch{return failure('invalid-meeting','invalid-input');}
   try{return publicDetail(await rpc('office_meeting_create_v1',{p_input:body},identity));}catch(error){return storageFailure(error,true);}
  },
  async update(id, input, identity) {
   if (missingWorkspace(identity)) return workspacePreview();
   let body;try{body=validatePatch(input);if(!isAgentUuid(id)||!validIdentity(identity))throw new Error();}catch{return failure('invalid-meeting-update','invalid-input');}
   try{return publicDetail(await rpc('office_meeting_update_v1',{p_meeting_id:id.toLowerCase(),p_patch:body},identity));}catch(error){return storageFailure(error,true);}
  },
  async turn(id, input, identity) {
   if (missingWorkspace(identity)) return workspacePreview();
   let body;try{body=validateTurn(input);if(!isAgentUuid(id)||!validIdentity(identity))throw new Error();}catch{return failure('invalid-meeting-turn','invalid-input');}
   const detail=await get(id,identity);if(detail.status!=='ready')return detail;
   const existing=detail.turns?.find(turn=>turn.id===body.requestId);
   let request;try{request=existing?.request ?? buildMeetingRequest(detail,body);}catch{return failure('invalid-meeting-turn','invalid-input');}
   if(!existing && deps.engineConfigured?.()===false)return failure('office-engine-not-configured','preview');
   let claimed;
   try{claimed=await rpc('office_meeting_turn_claim_v1',{p_meeting_id:id.toLowerCase(),p_input:body,p_request:request},identity);}catch(error){return {...storageFailure(error,true),requestId:body.requestId};}
   if(claimed.claimed!==true || !claimed.attemptToken)return turnResponse(publicDetail(claimed),body.requestId);
   let result;const startedAt=Date.now();
   try{const context=await deps.readContext(request,{workspaceId:identity.workspaceId});result=await deps.generate(request,context);
    if(!['generated','error','unknown'].includes(result?.status))result={status:'error',error:result?.error || 'office-engine-not-configured'};
    if(Buffer.byteLength(JSON.stringify(result),'utf8')>150000)result={status:'error',error:'office-result-too-large'};
   }catch{result={status:'unknown',error:'office-generation-outcome-unknown'};}
   let saved;
   try{saved=await rpc('office_meeting_turn_finish_v1',{p_meeting_id:id.toLowerCase(),p_request_id:body.requestId,p_attempt_token:claimed.attemptToken,p_result:result},identity);}catch{}
   if(!saved?.turn){const reread=await get(id,identity);const completed=reread.turns?.find(turn=>turn.id===body.requestId&&turn.state!=='running'&&turn.state!=='unknown');if(completed)saved={...reread,turn:completed};}
   if(saved?.turn && saved.persisted===true){
    try{await deps.recordRun?.({workspaceId:identity.workspaceId,agent:request.mode==='council'?'office.council':`office.${request.ownerId}`,mode:request.mode,ref:`office-meeting:${id}`,inputSummary:`scope=${request.scope} turn=${body.requestId}`,recommendation:{meetingId:id,requestId:body.requestId,status:result.status,failure:result.failure??null,elapsedMs:result.generation?.elapsedMs??Date.now()-startedAt,modelCalls:result.generation?.modelCalls??null,usage:result.generation?.usage??null},result:result.status==='generated'?'ok':'error'});}catch{}
    return turnResponse(publicDetail(saved),body.requestId);
   }
   return {...publicDetail(claimed),status:'unknown',persisted:null,error:'office-meeting-result-persistence-unknown',requestId:body.requestId,turn:{...claimed.turn,state:'unknown',result},businessWrites:false};
  },
 };
}
