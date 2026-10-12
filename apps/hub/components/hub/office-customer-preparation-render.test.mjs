import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OFFICE_CUSTOMER_PREPARATION_VERSION } from '@com-moon/agent-contracts/office-workflow';

// Node SSR has no CSS-module runtime. Keep the production component intact;
// stub only CSS class names, as the repository already does for CSS side effects.
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,next){if(s.endsWith('.module.css'))return {url:'data:text/javascript,export default new Proxy({}, {get:(_,key)=>String(key)})',shortCircuit:true};return next(s,c);}`),import.meta.url);
const {OfficeCustomerContext,OfficeCustomerPreparationReview,OfficeCustomerProgress}=await import('./office-customer-preparation.jsx');
const state=()=>({draft:'',pending:false,receipt:{status:'generated',requestId:'request',persistence:{persisted:true},result:{status:'generated',requestId:'request',ownerId:'flareon',resultRevision:1,context:{asOf:'2026-10-02T00:00:00Z',contextHash:'a'.repeat(64)},customerPreparation:{version:OFFICE_CUSTOMER_PREPARATION_VERSION,purpose:'사용 목적을 확인',materials:[{title:'소개 자료',reason:'존재와 범위를 확인한 뒤 준비',availability:'unverified'}],questions:['어떤 수업을 준비하고 있나요?']}}},context:{status:'ready',contextHash:'a'.repeat(64)},reviewedSources:false,reviewedQuestions:false});
const render=(component,props)=>renderToStaticMarkup(React.createElement(component,props));

test('the real review component makes source/material review required and describes an unverified asset',()=>{
  const html=render(OfficeCustomerPreparationReview,{state:state(),onChange(){},onApprove(){},onCancel(){}});
  assert.match(html,/존재·내용 미확인/);assert.match(html,/고객 원문·출처·답장에 담긴 약속을 확인/);assert.match(html,/확인 질문을 검토/);
  assert.match(html,/<button[^>]*disabled=""[^>]*>이 초안 승인/);assert.match(html,/AI 대조는 같은 모델/);assert.doesNotMatch(html,/첨부 완료|발송 완료/);
  const reviewed=state();reviewed.reviewedSources=true;reviewed.reviewedQuestions=true;
  assert.match(render(OfficeCustomerPreparationReview,{state:reviewed}),/<button(?![^>]*disabled)[^>]*>이 초안 승인/);
  for(const change of [{context:{status:'error'}},{ownerId:'umbreon'}])assert.match(render(OfficeCustomerPreparationReview,{state:{...reviewed,...change}}),/<button[^>]*disabled=""[^>]*>이 초안 승인/);
});
test('cancellation removes the approval control and explains the result is not used',()=>{
  const s=state();s.cancelledRequestId='request';
  const html=render(OfficeCustomerPreparationReview,{state:s,onChange(){},onApprove(){},onCancel(){}});
  assert.doesNotMatch(html,/>이 초안 승인</);assert.match(html,/이 결과를 승인하거나 할 일로 연결하지 않습니다/);
});
test('source originals are readable text, scoped refs and dates, never executable injected markup',()=>{
  const html=render(OfficeCustomerContext,{context:{asOf:'2026-10-02T00:00:00Z',facts:{customer:{name:'검증 고객',nextAction:'사용 목적 확인'},activities:[{id:'activity',kind:'contact',body:'<script>run()</script>',occurredAt:'2026-10-01'}]},sourceRefs:[{id:'crm_activities:activity',type:'crm_activities',label:'연락 기록'}]}});
  assert.match(html,/현재 확인한 고객 원문/);assert.match(html,/직접 연결된 최근 기록 최대 5건/);assert.match(html,/crm_activities:activity/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
});
test('a saved task with unconfirmed entity renders waiting, never done or contact completed',()=>{
  const s=state();s.receipt.application={state:'saved',entityConfirmed:false};
  const html=render(OfficeCustomerProgress,{state:s});assert.match(html,/실재 확인 필요/);assert.match(html,/data-lifecycle="waiting"/);assert.doesNotMatch(html,/연락 완료|업무 완료|data-lifecycle="done"/);
});

test('human review rejection renders revision guidance and removes the old approve control',()=>{
  const s=state();s.rejectedRequestId='request';
  const html=render(OfficeCustomerPreparationReview,{state:s,onChange(){},onApprove(){},onCancel(){},onReject(){}});
  assert.match(html,/반려한 초안입니다/);assert.match(html,/새 결과는 다시 원문 검토·승인/);assert.doesNotMatch(html,/>이 초안 승인</);
});
