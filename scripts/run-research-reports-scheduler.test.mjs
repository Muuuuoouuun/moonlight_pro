import test from 'node:test';
import assert from 'node:assert/strict';
let runScheduler;try{({runScheduler}=await import('./run-research-reports-scheduler.mjs'));}catch{}
test('scheduler calls authenticated report/research sweeps concurrently and projects only safe counts',async()=>{
  assert.equal(typeof runScheduler,'function');let started=0;let release;const barrier=new Promise(resolve=>{release=resolve;});
  const result=await runScheduler({COM_MOON_HUB_URL:'https://hub.example.test',CRON_SECRET:'private-test-secret'},async(url,options)=>{
    started++;if(started===2)release();await barrier;assert.equal(options.headers.authorization,'Bearer private-test-secret');assert.equal(options.redirect,'error');
    return Response.json({status:'partial',results:[{}],runs:[{run:{preparedCount:2},privateText:'no print'}],privateInput:'hidden'});
  });
  assert.equal(started,2);assert.deepEqual(result.map(row=>row.status),['partial','partial']);assert.equal(JSON.stringify(result).includes('private'),false);assert.equal(result[0].preparedCount,2);
});
test('scheduler refuses unsafe endpoints and exposes no transport error text',async()=>{
  assert.equal(typeof runScheduler,'function');let calls=0;
  assert.deepEqual(await runScheduler({COM_MOON_HUB_URL:'http://hub.test',CRON_SECRET:'secret'},async()=>{calls++;}),[{status:'error',reason:'scheduler-not-configured'}]);assert.equal(calls,0);
  const result=await runScheduler({COM_MOON_HUB_URL:'https://hub.test',CRON_SECRET:'secret'},async()=>{throw Error('private header secret');});
  assert.equal(result.length,2);assert.equal(result[0].reason,'sweep-outcome-unknown');assert.equal(JSON.stringify(result).includes('secret'),false);
});
