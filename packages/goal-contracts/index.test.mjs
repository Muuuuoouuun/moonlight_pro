import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateGoalCommand, calculateGoalProgress, isGoalDate, isGoalTimestamp, isGoalUuid, isGoalEntityUuid, projectObjective } from './index.js';
const id = '11111111-1111-4111-8111-111111111111';
const command = (action, input, extra = {}) => ({ commandId: id, action, input, ...extra });
const metric = { name:'납기 누락', unit:'건', role:'guardrail', direction:'decrease', baseline:5, target:0, sourceKey:'manual', objectiveId:id };
test('validates dates, strict command fields and immutable metric definitions', () => {
  assert.equal(isGoalDate('2026-02-30'), false);
  assert.equal(isGoalDate('2024-02-29'), true);
  assert.equal(validateGoalCommand(command('create_metric', metric)).ok, true);
  assert.equal(validateGoalCommand(command('create_metric', {...metric, target:NaN})).ok, false);
  assert.equal(validateGoalCommand({...command('create_metric', metric), workspaceId:id}).ok, false);
  assert.equal(validateGoalCommand(command('update_objective', {id, scope:'company'}, {expectedRevision:1})).ok, false);
  assert.equal(validateGoalCommand(command('update_objective', {id, title:'변경'})).ok, false);
});
test('legacy linked entity UUIDs are supported without relaxing goal-owned IDs or link fields', () => {
  const legacy = '44444444-4444-4444-4444-444444444441';
  assert.equal(isGoalEntityUuid(legacy), true);
  assert.equal(isGoalUuid(legacy), false);
  for (const action of ['link_entity', 'unlink_entity']) {
    const input = { objectiveId: id, entityType: 'tasks', entityId: legacy };
    const payload = command(action, input, { expectedRevision: 1 });
    assert.equal(validateGoalCommand(payload).ok, true);
    assert.equal(validateGoalCommand({ ...payload, commandId: legacy }).error, 'invalid-command');
    assert.equal(validateGoalCommand({ ...payload, input: { ...input, objectiveId: legacy } }).error, 'invalid-link');
    for (const entityId of ['not-a-uuid', legacy.replaceAll('-', ''), `${legacy},id.eq.anything`, null]) {
      assert.equal(validateGoalCommand({ ...payload, input: { ...input, entityId } }).error, 'invalid-link');
    }
    assert.equal(validateGoalCommand({ ...payload, input: { ...input, workspaceId: id } }).error, 'invalid-link');
    assert.equal(validateGoalCommand({ ...payload, input: { ...input, entityType: 'workspaces' } }).error, 'invalid-link');
  }
  assert.equal(validateGoalCommand(command('archive_metric', { id: legacy }, { expectedRevision: 1 })).error, 'invalid-metric-id');
});
test('manual observations require finite numbers and dated safe evidence', () => {
  const input = { metricId:id, value:0, observedAt:'2026-09-21T01:00:00Z', periodStart:'2026-09-01',periodEnd:'2026-09-30',coverage:'complete',evidence:[{label:'원장 확인',href:'/dashboard/work',occurredAt:'2026-09-21T01:00:00Z'}] };
  assert.equal(validateGoalCommand(command('record_observation', input)).ok, true);
  for (const patch of [{sourceKey:'tasks_completed'}, {value:Infinity}, {value:null}, {evidence:[]}, {evidence:[{label:'자료',href:'javascript:alert(1)',occurredAt:input.observedAt}]}]) {
    assert.equal(validateGoalCommand(command('record_observation', {...input,...patch})).ok, false);
  }
});
test('timestamps stay inside the PostgreSQL UTC offset range (±15:59)', () => {
  for (const value of ['2026-09-21T01:00:00Z', '2026-09-21T01:00:00.123456+09:00', '2026-09-21T01:00:00+15:59', '2026-09-21T01:00:00-15:59', '2026-09-21T01:00:00-00:00']) {
    assert.equal(isGoalTimestamp(value), true, value);
  }
  // Date.parse accepts the first three (up to ±23:59); PostgreSQL raises 22009 for them.
  for (const value of ['2026-09-21T01:00:00+16:00', '2026-09-21T01:00:00-16:00', '2026-09-21T01:00:00+23:59', '2026-09-21T01:00:00+15:60', '2026-09-21T01:00:00+24:00', '2026-02-30T01:00:00Z', '2026-09-21 01:00:00Z', 1789866000000, null]) {
    assert.equal(isGoalTimestamp(value), false, String(value));
  }
  const input = { metricId:id, value:0, observedAt:'2026-09-21T01:00:00+16:00', periodStart:'2026-09-01',periodEnd:'2026-09-30',coverage:'complete',evidence:[{label:'확인',href:'/dashboard/work',occurredAt:'2026-09-21T01:00:00Z'}] };
  assert.equal(validateGoalCommand(command('record_observation', input)).error, 'invalid-observation');
  assert.equal(validateGoalCommand(command('record_observation', {...input, observedAt:'2026-09-21T01:00:00Z', evidence:[{...input.evidence[0], occurredAt:'2026-09-21T01:00:00-16:00'}]})).error, 'invalid-evidence');
});
test('progress handles decreasing zero target, negative values, ranges and missing data', () => {
  const complete = value => ({value,coverage:'complete'});
  assert.deepEqual(calculateGoalProgress(metric,complete(0)), {value:100,achieved:true,state:'achieved'});
  assert.equal(calculateGoalProgress(metric,complete(2)).value,60);
  assert.equal(calculateGoalProgress({direction:'increase',baseline:-10,target:0},complete(-5)).value,50);
  assert.equal(calculateGoalProgress({direction:'range',targetMin:0,targetMax:5},complete(3)).achieved,true);
  assert.equal(calculateGoalProgress(metric,{value:0,coverage:'partial'}).achieved,null);
  assert.equal(calculateGoalProgress(metric,{value:null,coverage:'partial'}).state,'partial');
  assert.equal(calculateGoalProgress(metric,{value:null,coverage:'unmeasured'}).value,null);
  assert.equal(calculateGoalProgress({...metric,target:null},complete(0)).state,'target_unset');
  assert.equal(calculateGoalProgress({...metric,baseline:null},complete(1)).value,null);
});
test('projections expose camelcase contract only', () => {
  assert.deepEqual(projectObjective({id,workspace_id:id,title:'결과',description:'',scope:'personal',period_start:'2026-09-01',period_end:'2026-09-30',timezone:'Asia/Seoul',status:'active',revision:1}), {id,title:'결과',description:'',scope:'personal',periodStart:'2026-09-01',periodEnd:'2026-09-30',timezone:'Asia/Seoul',status:'active',revision:1});
});
