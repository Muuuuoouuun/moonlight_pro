import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getFinance} from './finance.js';
test('read failure returns an error envelope, never a successful empty ledger',async()=>{
 const r=await getFinance({}, {configured:true,workspaceId:'operator',readRows:async()=>({rows:null,error:{reason:'offline'}})});
 assert.equal(r.status,'error');assert.deepEqual(r.entries,[]);
});
test('finance remains personal and unconnected storage is preview',async()=>{
 assert.equal((await getFinance({scope:'classin'})).status,'error');
 assert.equal((await getFinance({}, {configured:false})).status,'preview');
});
test('read walks full pages before calculating totals',async()=>{
 const row={data:{sourceKey:'observation',type:'expense',date:'2026-07-01',grossAmount:1,refundAmount:0,netAmount:1,movementAmount:0}};
 const calls=[];const readRows=async(table,opt)=>{calls.push([table,opt.offset]);return {rows:table==='finance_entries'?(opt.offset===0?Array.from({length:1000},(_,i)=>({...row,id:String(i)})):[{...row,id:'next'}]):[],error:null};};
 const r=await getFinance({}, {configured:true,workspaceId:'operator',readRows});
 assert.equal(r.totals.net,1001);assert.ok(calls.some(([t,o])=>t==='finance_entries'&&o===1000));
});
