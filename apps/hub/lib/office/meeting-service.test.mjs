import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { OFFICE_DISCUSSION_VERSION, parseOfficeDeliberation } from '@com-moon/agent-contracts/office';
import { createOfficeMeetingService, buildMeetingRequest } from './meeting-service.js';
const identity = { workspaceId: randomUUID(), operatorId: 'operator' };
const meeting = () => ({ meetingId: randomUUID(), title: '검토', scope: 'personal', sourceTask: null, ownerId: 'eevee', reviewers: [], mode: 'chat', decisionContext: '새 약속을 추가하지 않음', revision: 1, state: 'open' });
const detail = (m = meeting(), turns = []) => ({ status: 'ready', persisted: true, meeting: m, turns, skillRequests: [] });
const request = () => ({ requestId: randomUUID(), expectedRevision: 1, message: '다음 행동을 검토해 줘' });

test('missing workspace stays explicit preview across reads and writes without reaching storage', async () => {
 const service = createOfficeMeetingService({ rpc: async () => assert.fail('preview reached storage') });
 const context = { operatorId: 'operator', workspaceId: null }, id = randomUUID();
 const input = { meetingId: id, title: '안건', scope: 'personal', ownerId: 'eevee', reviewers: [], mode: 'chat' };
 for (const result of await Promise.all([
  service.list({ scope: 'personal' }, context), service.get(id, context), service.create(input, context),
  service.update(id, { expectedRevision: 1, title: '안건 변경' }, context), service.turn(id, request(), context),
 ])) { assert.equal(result.status, 'preview'); assert.equal(result.persisted, false); }
 assert.equal((await service.create(input, { workspaceId: identity.workspaceId, operatorId: 'forged' })).status, 'invalid-input');
});

test('durable meeting rejects all scope and forged source snapshots before storage', async () => {
 const service = createOfficeMeetingService({ rpc: async () => assert.fail('invalid input reached storage') });
 for (const patch of [{ scope: 'all' }, { sourceTask: { id: randomUUID() } }, { workspaceId: randomUUID() }]) {
  const result = await service.create({ meetingId: randomUUID(), title: '안건', scope: 'personal', ownerId: 'eevee', reviewers: [], mode: 'chat', ...patch }, identity);
  assert.equal(result.status, 'invalid-input');
 }
});

test('stored decisions, source and dissent stay in history without consuming the user message', () => {
 const m = { ...meeting(), sourceTask: { id: randomUUID(), title: '할 일', description: '기존 설명', nextAction: '다음', updatedAt: '2026-10-01T00:00:00Z' } };
 const turns = [{ state: 'generated', request: { message: '이전 질문' }, result: { answer: '요약', dissent: ['비용은 미정'], discussion: { turns: [{ ownerId: 'umbreon', position: '반대', revisionCondition: '예산 확인 후' }] } } }];
 const input = { ...request(), message: '가'.repeat(6000) };
 const output = buildMeetingRequest(detail(m, turns), input);
 assert.equal(output.message.length, 6000);
 assert.match(JSON.stringify(output.history), /새 약속|기존 설명|비용은 미정|예산 확인 후/);
 assert.ok(output.history.length <= 8);
 assert.ok(JSON.stringify(output.history).length <= 20000);
});

test('next question retains open structured objections even when the synthesis dissent omits them', () => {
 const participants=['eevee','umbreon'];
 const deliberation=parseOfficeDeliberation({profile:'urgent'},participants);
 const priorRequest={ownerId:'eevee',mode:'council',scope:'personal',participants,deliberation,message:'이전 질문'};
 const turns=participants.map(ownerId=>({ownerId,round:'position',turnRef:`position:${ownerId}`,position:'조건부 판단',evidence:[],objection:`${ownerId}의 예산이 미확인`,revisionCondition:'금액이 제공되면 검토',changed:false,replyTo:[],changeReason:'',peerReviews:[],sourceCheck:'none',sourceCounts:{selected:0,traced:0,untraced:0}}));
 const result={...priorRequest,answer:'본문',dissent:[],discussion:{version:OFFICE_DISCUSSION_VERSION,settings:deliberation,modelCalls:3,turns,resolutions:turns.map(turn=>({turnRef:turn.turnRef,disposition:'open',rationale:'금액 자료 없음'}))}};
 const output=buildMeetingRequest(detail(meeting(),[{state:'generated',request:priorRequest,result}]),request());
 const prior=JSON.parse(output.history.find(item=>item.role==='assistant').text);
 assert.equal(prior.collaboration.kind,'structural-only');
 assert.equal(prior.collaboration.openObjections,2);
 assert.deepEqual(prior.openIssues.map(issue=>issue.objection),turns.map(turn=>turn.objection));
 assert.ok(prior.openIssues.every(issue=>issue.rationale==='금액 자료 없음'));
 assert.match(prior.collaboration.note,/이전 모델/);
 assert.equal(output.message,request().message);
 assert.ok(JSON.stringify(output.history).length<=20000);
 result.discussion.resolutions[0].turnRef='forged';
 const invalid=buildMeetingRequest(detail(meeting(),[{state:'generated',request:priorRequest,result}]),request());
 const invalidPrior=JSON.parse(invalid.history.find(item=>item.role==='assistant').text);
 assert.equal(invalidPrior.collaboration,undefined);
 assert.equal(invalidPrior.openIssues,undefined);
});

test('a replayed completed request never calls model and returns the stable turn', async () => {
 const m = meeting(), input = request();
 const turn = { id: input.requestId, state: 'generated', request: { message: input.message }, result: { status: 'generated', answer: '결과' } };
 const service = createOfficeMeetingService({ rpc: async name => name === 'office_meeting_get_v1' ? detail(m, [turn]) : { ...detail(m, [turn]), claimed: false, turn }, generate: async () => assert.fail('replay called model') });
 const result = await service.turn(m.meetingId, input, identity);
 assert.equal(result.status, 'generated'); assert.equal(result.turn.id, input.requestId);
});

test('claim happens before model; ambiguous finish rereads completed stable ID without another generation', async () => {
 const m = meeting(), input = request(); let calls = 0, reads = 0; const events = [];
 const turn = { id: input.requestId, state: 'generated', request: { message: input.message }, result: { status: 'generated', answer: '답', nextAction: '확인' } };
 const service = createOfficeMeetingService({
  rpc: async name => { events.push(name); if (name === 'office_meeting_get_v1') return detail(m, reads++ ? [turn] : []); if (name === 'office_meeting_turn_claim_v1') return { ...detail(m), claimed: true, attemptToken: randomUUID(), turn: { ...turn, state: 'running' } }; throw new Error('response lost'); },
  readContext: async () => ({ source: 'provided', scope: 'personal', projects: [], note: '입력' }),
  generate: async () => { calls++; events.push('model'); return turn.result; }, recordRun: async () => ({ persisted: true }),
 });
 const result = await service.turn(m.meetingId, input, identity);
 assert.equal(result.status, 'generated'); assert.equal(result.turn.id, input.requestId); assert.equal(calls, 1);
 assert.ok(events.indexOf('office_meeting_turn_claim_v1') < events.indexOf('model'));
});

test('unconfirmed finish retains generated output visibly but never claims durable success', async () => {
 const m = meeting(), input = request();
 const service = createOfficeMeetingService({ rpc: async name => {
  if (name === 'office_meeting_get_v1') return detail(m);
  if (name === 'office_meeting_turn_claim_v1') return { ...detail(m), claimed: true, attemptToken: randomUUID(), turn: { id: input.requestId, state: 'running' } };
  throw new Error('lost');
 }, readContext: async () => ({}), generate: async () => ({ status: 'generated', answer: '보존할 결과' }) });
 const result = await service.turn(m.meetingId, input, identity);
 assert.equal(result.status, 'unknown'); assert.equal(result.persisted, null); assert.equal(result.turn.result.answer, '보존할 결과');
});

test('turn rejects injected history/result and mutation validates optimistic revision', async () => {
 const service = createOfficeMeetingService({ rpc: async () => assert.fail('invalid input reached storage') });
 for (const extra of [{ history: [] }, { result: {} }, { scope: 'classin' }]) assert.equal((await service.turn(randomUUID(), { ...request(), ...extra }, identity)).status, 'invalid-input');
 assert.equal((await service.update(randomUUID(), { decisionContext: '변경' }, identity)).status, 'invalid-input');
});

test('bounded history retains each role and revision condition as complete JSON', () => {
 const m=meeting();const result={answer:'답'.repeat(2000),recommendation:'추천'.repeat(500),nextAction:'다음'.repeat(400),dissent:Array.from({length:5},()=> '이견'.repeat(300)),discussion:{turns:['eevee','umbreon','flareon'].map(ownerId=>({ownerId,position:'입장'.repeat(300),objection:'반론'.repeat(200),revisionCondition:`${ownerId} 조건 `+'조건'.repeat(150),changed:false}))}};
 const output=buildMeetingRequest(detail(m,[{state:'generated',request:{message:'질문'},result}]),request());
 const prior=JSON.parse(output.history.find(item=>item.role==='assistant').text);
 assert.deepEqual(prior.positions.map(item=>item.ownerId),['eevee','umbreon','flareon']);
 for(const item of prior.positions)assert.match(item.revisionCondition,new RegExp(item.ownerId));
 assert.equal(prior.dissent.length,5);
});
