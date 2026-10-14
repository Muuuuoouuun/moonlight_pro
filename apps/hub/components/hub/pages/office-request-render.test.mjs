import assert from 'node:assert/strict';
import {test} from 'node:test';
import {register} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,next){if(s.endsWith('.module.css'))return {url:'data:text/javascript,export default new Proxy({}, {get:(_,key)=>String(key)})',shortCircuit:true};return next(s,c);}`),import.meta.url);
const {OfficeRequestReadState}=await import('./office-request.jsx');
const render=status=>renderToStaticMarkup(React.createElement(OfficeRequestReadState,{state:{status},onRetry(){},onNavigate(){},onLogin(){}}));

test('the exact-request page reserves loading space and keeps errors and preview out of its skeleton',()=>{
  assert.match(render('loading'),/지정한 오피스 요청 확인 중/);
  assert.equal(render('ready'),'');
  for(const status of ['error','preview','invalid','unauthorized'])assert.doesNotMatch(render(status),/hub-skeleton/);
  assert.match(render('preview'),/오피스 저장 연결이 필요해요/);
  assert.match(render('error'),/오피스 요청을 읽지 못했어요/);
  assert.match(render('invalid'),/오피스 열기/);
});
test('an expired operator session offers login instead of endlessly repeating an unauthorized read',()=>{
  const html=render('unauthorized');
  assert.match(html,/>로그인</);assert.doesNotMatch(html,/>다시 불러오기</);
});
