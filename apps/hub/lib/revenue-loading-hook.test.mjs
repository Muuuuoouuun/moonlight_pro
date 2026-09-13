import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const file=fs.readFileSync(new URL('../components/hub/pages/revenue.jsx',import.meta.url),'utf8');
const start=file.indexOf('export function useRevenueLedger()');
const source=file.slice(start,file.indexOf('\n}\n',start)+3).replace('export ','');
const load=new Function('React','readRevenueCache','EMPTY_REVENUE_LEDGER',source+'\nreturn useRevenueLedger();');
const React={useState:value=>[value,()=>{}],useEffect:()=>{},useCallback:fn=>fn};
test('cold revenue read is loading before effects, so customer deep links wait for the ledger',()=>{
 const result=load(React,()=>null,{leads:[],accounts:[]});
 assert.equal(result.syncState,'loading');
});
test('a servable revenue cache retains its known state on first render',()=>{
 const ledger={leads:[{id:'saved'}]};assert.deepEqual(load(React,()=>({ledger,syncState:'live'}),{}).ledger,ledger);
 assert.equal(load(React,()=>({ledger,syncState:'live'}),{}).syncState,'live');
});
