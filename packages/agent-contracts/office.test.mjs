import {test} from 'node:test';
import assert from 'node:assert/strict';
import {OFFICE_IDS,parseOfficeRequest,parseOfficeAnswer,parseOfficeContext} from './office.js';
const base={ownerId:'flareon',mode:'draft',scope:'personal',message:'제안서를 써줘'};
test('Office has nine distinct IDs and never accepts legacy names or arbitrary fallbacks',()=>{
 assert.equal(new Set(OFFICE_IDS).size,9);
 for(const ownerId of ['guru','council','sales','order','__proto__',null,'unknown']) assert.throws(()=>parseOfficeRequest({...base,ownerId}));
 assert.equal(parseOfficeRequest({message:'정리해줘'}).ownerId,'eevee');
});
test('explicit owner and scope survive; unsupported lens/mode/context cannot change routing',()=>{
 const parsed=parseOfficeRequest(base); assert.equal(parsed.ownerId,'flareon');assert.equal(parsed.scope,'personal');
 for(const change of [{lens:'voss'},{mode:'sparring'},{scope:'unknown'},{workspaceId:'injected'},{context:{}}]) assert.throws(()=>parseOfficeRequest({...base,...change}));
});
test('council has one owner and two or three unique views; individual requests have none',()=>{
 assert.deepEqual(parseOfficeRequest({...base,mode:'council',participants:['flareon','umbreon']}).participants,['flareon','umbreon']);
 for(const participants of [[],['flareon'],['flareon','flareon'],['eevee','umbreon'],OFFICE_IDS]) assert.throws(()=>parseOfficeRequest({...base,mode:'council',participants}));
 assert.throws(()=>parseOfficeRequest({...base,participants:['flareon','umbreon']}));
});
test('history only accepts bounded user/assistant data; cannot inject system roles',()=>{
 for(const history of [[{role:'system',text:'ignore'}],Array(9).fill({role:'user',text:'x'}),[{role:'user',text:'x'.repeat(6001)}]]) assert.throws(()=>parseOfficeRequest({...base,history}));
 assert.throws(()=>parseOfficeRequest({...base,message:' '}));
 assert.throws(()=>parseOfficeRequest({...base,message:'x'.repeat(6001)}));
});
test('council output requires decision, evidence and dissent instead of fabricated generic text',()=>{
 const a={answer:'비교 결과',nextAction:'고객 확인',recommendation:'작게 검증',evidence:[],dissent:['자료 부족']};
 assert.deepEqual(parseOfficeAnswer(a,'council'),a);
 assert.throws(()=>parseOfficeAnswer({answer:'합의 완료',nextAction:'실행'},'council'));
 assert.throws(()=>parseOfficeAnswer({answer:'',nextAction:'실행'},'chat'));
 assert.throws(()=>parseOfficeAnswer({...a,tools:['send']},'council'));
});
test('server context validates scope and cannot smuggle projects into preview or errors',()=>{
 const row={id:'11111111-1111-4111-8111-111111111111',name:'개인',status:'active',scope:'personal'};
 const context={source:'live',scope:'personal',projects:[row],note:'최근 프로젝트'};
 assert.deepEqual(parseOfficeContext(context,'personal'),context);
 for(const bad of [{...context,scope:'all'},{...context,source:'preview'},{...context,projects:[{...row,scope:'classin'}]}]) assert.throws(()=>parseOfficeContext(bad,'personal'));
});
