import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createNativeMeetingVectors } from './office_meeting_page_vectors.mjs';
const require=createRequire(import.meta.url);
const {createPageAssembly,LIMITS}=require('../../../apps/desktop/pet/shared/office-meeting-pages.js');
const vectors=createNativeMeetingVectors();
globalThis.fetch=async()=>assert.fail('No external network in protocol fixtures');
for(const item of vectors.cases) test(`native fixture shared JS contract: ${item.name}`,async()=>{
 const assembly=createPageAssembly({id:vectors.id,scope:vectors.scope,now:()=>item.now,digest:value=>createHash('sha256').update(value).digest('hex')});
 let result;
 const run=async()=>{for(const wire of item.pages){const envelope=JSON.parse(Buffer.from(wire,'base64').toString('utf8'));result=await assembly.accept(envelope);}assert.ok(result,'must terminate');};
 if(!item.valid){await assert.rejects(run);return;}
 await run();const expected=JSON.parse(Buffer.from(item.payload,'base64').toString('utf8'));
 for(const key of Object.keys(expected))assert.deepEqual(result[key],expected[key]);
 assert.equal(result.historyComplete,true);
 assert.ok(item.pages.every(wire=>Buffer.from(wire,'base64').length<=LIMITS.pageBytes));
});
test('native production store chooses scoped APIs; direct Swift runners include paging source',()=>{
 const root=new URL('../',import.meta.url);
 const store=readFileSync(new URL('Sources/MoonlightPetPreview/Models/OfficeChatStore.swift',root),'utf8');
 assert.match(store,/officeMeeting\(id: id, scope: requestedScope\)/);
 assert.match(store,/sendOfficeMeeting\(id: saved.meetingId, scope: saved.scope/);
 for(const name of ['test_office_chat_api.sh','test_office_chat_store.sh','test_office_meeting_api.sh','test_office_meeting_store.sh','test_office_meeting_pages.sh'])assert.match(readFileSync(new URL(`script/${name}`,root),'utf8'),/Support\/OfficeMeetingPages.swift/);
});
