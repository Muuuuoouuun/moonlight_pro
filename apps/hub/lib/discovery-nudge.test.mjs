import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validNudgeContext,validateNudgeCommand,prepareNudgeCommand,nextNudgeDate} from './discovery-nudge.js';
const id='11111111-1111-4111-8111-111111111111';
const context={recordId:id,recordRevision:1,stateRevision:0,today:'2026-09-13',candidate:{ruleId:'evidence',triggerKey:'evidence:abc',field:'evidence'},suppression:null,visible:true};
test('read context fails closed for unknown rules, inconsistent visibility and dates',()=>{
 assert.equal(validNudgeContext(context,id),true);
 for(const c of [{...context,recordId:'foreign'},{...context,candidate:undefined},{...context,suppression:undefined},{...context,candidate:{...context.candidate,triggerKey:'key\n'}},{...context,candidate:{ruleId:'toString',triggerKey:'abc'}},{...context,visible:false},{...context,suppression:{kind:'snoozed',until:'2026-02-30'}}])assert.equal(validNudgeContext(c,id),false);
});
test('commands are exact and retries preserve receipt but new choices change it',()=>{
 const a=prepareNudgeCommand(context,'snooze','2026-09-14',null,()=>id);
 assert.equal(validateNudgeCommand(a.payload),true);assert.equal(prepareNudgeCommand(context,'snooze','2026-09-14',a),a);
 assert.notEqual(prepareNudgeCommand(context,'dismiss',null,a,()=>id).fingerprint,a.fingerprint);
 assert.equal(validateNudgeCommand({...a.payload,workspaceId:id}),false);
 assert.equal(validateNudgeCommand({...a.payload,action:'resume'}),false);
 assert.equal(validateNudgeCommand({...a.payload,until:'2026-02-30'}),false);
 for(const triggerKey of ['key\n','bad key','x'.repeat(129)])assert.equal(validateNudgeCommand({...a.payload,triggerKey}),false);
 assert.equal(nextNudgeDate('2026-12-31'),'2027-01-01');
});
