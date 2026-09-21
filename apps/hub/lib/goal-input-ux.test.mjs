import test from 'node:test';
import assert from 'node:assert/strict';
import { goalPeriodPreset, goalCheckRows } from './goal-input-ux.js';

test('period shortcuts handle Korean midnight, Monday weeks and year/leap boundaries', () => {
  assert.deepEqual(goalPeriodPreset('week', new Date('2026-09-20T15:01:00Z')), {periodStart:'2026-09-21',periodEnd:'2026-09-27'});
  assert.deepEqual(goalPeriodPreset('week', new Date('2026-01-01T00:00:00Z')), {periodStart:'2025-12-29',periodEnd:'2026-01-04'});
  assert.deepEqual(goalPeriodPreset('month', new Date('2028-02-15T00:00:00Z')), {periodStart:'2028-02-01',periodEnd:'2028-02-29'});
  assert.deepEqual(goalPeriodPreset('quarter', new Date('2026-12-31T00:00:00Z')), {periodStart:'2026-10-01',periodEnd:'2026-12-31'});
});

test('fast checking keeps measured zero distinct from unknown and searches metric names', () => {
  const model = {objectives:[{id:'o',title:'목표',status:'active'},{id:'old',title:'이전',status:'archived'}],metrics:[
    {id:'zero',objectiveId:'o',name:'확인된 문의',sourceKey:'manual',measurement:{value:0,coverage:'complete'}},
    {id:'missing',objectiveId:'o',name:'문의 미확인',sourceKey:'manual',measurement:{value:null,coverage:'unmeasured'}},
    {id:'auto',objectiveId:'o',name:'완료',sourceKey:'tasks_completed',measurement:{value:3,coverage:'partial'}},
    {id:'archived',objectiveId:'o',name:'보관',sourceKey:'manual',status:'archived'},
    {id:'old',objectiveId:'old',name:'이전 지표',sourceKey:'manual'},
  ]};
  assert.deepEqual(goalCheckRows(model,{filter:'unmeasured'}).map(row=>row.metric.id),['missing','auto']);
  assert.deepEqual(goalCheckRows(model,{filter:'manual',search:'문의'}).map(row=>row.metric.id),['zero','missing']);
  assert.equal(goalCheckRows(model,{status:'archived'})[0].objective.status,'archived');
});
