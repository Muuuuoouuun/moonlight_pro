import test from 'node:test';
import assert from 'node:assert/strict';
import { forwardInquiryCommand, publicInquiryCommand } from './inquiry-engine-client.js';
test('browser cannot inject a Gmail identity or select another workspace', () => {
 const r=publicInquiryCommand({action:'ingest',workspaceId:'evil',source:'gmail',sourceAccountKey:'evil',externalEventId:'id',subject:'hi',body:'문의',contact:{email:'x@example.com'}},'trusted');
 assert.equal(r.workspaceId,'trusted'); assert.equal(r.source,'manual'); assert.equal(r.sourceAccountKey,'operator'); assert.equal(r.canonicalKey,undefined);
 assert.equal(publicInquiryCommand({action:'claim_sync'},'trusted'),null);
});
test('forwarding never treats HTTP 200 error envelopes as saved',async()=>{
 const r=await forwardInquiryCommand({action:'mark_read'},{env:{COM_MOON_ENGINE_URL:'http://localhost:3001',COM_MOON_SHARED_WEBHOOK_SECRET:'test'},fetchImpl:async()=>new Response(JSON.stringify({status:'error',error:'db-down'}))});
 assert.equal(r.ok,false); assert.equal(r.httpStatus,502);
});
test('missing Engine configuration is explicit preview',async()=>{
 const r=await forwardInquiryCommand({}, {env:{}}); assert.equal(r.data.status,'preview'); assert.equal(r.ok,false);
});
