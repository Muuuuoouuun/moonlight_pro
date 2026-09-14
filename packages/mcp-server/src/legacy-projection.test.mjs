import assert from 'node:assert/strict';
import {test} from 'node:test';
let project;
try { ({projectLegacyPayload:project}=await import('./legacy-projection.js')); } catch {}
const rows=Array.from({length:100},(_,i)=>({id:String(i),title:'고객 후속 '+i,status:'todo',body:'한글 상세 '.repeat(1000)}));
test('legacy explicit page size is honored even for small payloads',()=>{
 const result=project({status:'live',tasks:Array.from({length:25},(_,i)=>({id:String(i)}))},{detail:'rows',limit:1});
 assert.equal(result.data.tasks.length,1);assert.equal(result.collections.tasks.nextOffset,1);
});
test('legacy summaries shrink full ledgers without hiding truncation or source failures',()=>{
  assert.equal(typeof project,'function');
  const raw={status:'partial',source:'supabase',failedSources:['calendar'],leads:rows};
  const result=project(raw,{detail:'summary'});
  assert.equal(result.status,'partial');assert.deepEqual(result.failedSources,['calendar']);
  assert.equal(result.truncated,true);assert.equal(result.collections.leads.totalCount,100);
  assert.ok(Buffer.byteLength(JSON.stringify(result))<=2048);
  assert.ok(Buffer.byteLength(JSON.stringify(result))<Buffer.byteLength(JSON.stringify(raw))*.2);
});
test('legacy page metadata permits retrieval of remaining rows and never splits JSON',()=>{
  assert.equal(typeof project,'function');
  const result=project({status:'live',tasks:rows},{detail:'rows',limit:5,offset:5});
  assert.equal(result.data.tasks[0].id,'5');assert.equal(result.collections.tasks.nextOffset,10);
  assert.equal(result.collections.tasks.returnedCount,5);
  assert.ok(Buffer.byteLength(JSON.stringify(result))<=16384);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),result);
});
