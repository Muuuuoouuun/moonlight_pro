import assert from 'node:assert/strict';
import test from 'node:test';
import { business, draft, save, customerRows, customerPayload, accountUi } from '../../../../../scripts/audits/revenue-business-fixture.mjs';
import { rememberRevenueDraft, pendingRevenueCreates } from './revenue-create-client.js';
import { newRevenueCreateId } from '../../../lib/sales-os/revenue-create-command.js';
import { getRevenueLedger, getCrmActivities } from '../../../lib/repositories/revenue-ledger.js';

test('S1: ClassIn-like prospect survives lost acknowledgement, one explicit retry, promise read-back and a linked note',async t=>{
 const io=business(t),record=draft();io.lose('lead',record.createId);
 assert.equal((await save('lead','create',record)).status,'unknown');assert.equal(io.rows('leads').size,1);
 assert.equal((await save('lead','create',record)).ok,true);assert.equal(io.rows('leads').size,1);
 const ledger=await getRevenueLedger(),customer=customerRows(ledger).find(r=>r.id===record.createId);
 assert.equal(customer.name,record.name);assert.equal(customer.nextAction,record.next_action);assert.equal(customer.nextActionAt,record.next_action_at);assert.equal(customer.workspace,'classin');
 assert.equal((await save('activity','create',{leadId:record.createId,type:'note',body:'Synthetic demo agenda requested'})).ok,true);
 const activities=await getCrmActivities({leadId:record.createId});assert.equal(activities.activities.length,1);assert.equal(activities.activities[0].leadId,record.createId);
 assert.deepEqual(io.calls.filter(c=>c.layer==='ui').map(c=>`${c.kind}:${c.op}`),['lead:create','lead:create','activity:create']);
});

test('S2: unknown customer edited, closed and reopened retains current input; read-only confirmation precedes explicit update',async t=>{
 const io=business(t),original=draft();io.lose('lead',original.createId);await save('lead','create',original);
 const edited={...original,name:'Synthetic Cedar Academy East',next_action:'Send revised demo outline'};rememberRevenueDraft('lead',edited);
 const restored=pendingRevenueCreates('lead').find(r=>r.createId===original.createId);assert.deepEqual(restored,edited);
 assert.equal((await save('lead','create',restored)).reason,'original-create-confirmed');assert.equal(io.rows('leads').get(original.createId).name,original.name);
 assert.equal((await save('lead','create',restored)).ok,true);assert.equal(io.rows('leads').size,1);assert.equal(io.rows('leads').get(original.createId).name,edited.name);
 assert.deepEqual(io.calls.filter(c=>c.layer==='ui').map(c=>c.op),['create','confirm-create','update']);
});

test('S3: Account unknown result remains separate during workspace switch and component remount',async t=>{
 const io=business(t),ui=accountUi(io);ui.loseNext();await ui.create('classin')();await ui.create('personal')();
 const original=ui.local().find(r=>r.workspace==='classin'),personal=ui.local().find(r=>r.workspace==='personal');assert.notEqual(original.createId,personal.createId);
 assert.equal((await ui.create('classin',true)()).ok,true);assert.equal(io.rows('customer_accounts').size,2);assert.equal(io.rows('customer_accounts').get(original.createId).meta.workspace,'classin');assert.equal(io.rows('customer_accounts').get(personal.createId).meta.workspace,'personal');
 assert.equal((await ui.create('personal',true)()).ok,true);assert.equal(io.rows('customer_accounts').size,2);
});

test('S4: rename during uncertain Account create cannot report renamed local input saved while DB retains old name',async t=>{
 const io=business(t),ui=accountUi(io);ui.loseNext();await ui.create()();const original=ui.local()[0];await ui.rename(original,'Synthetic Cedar Contract');
 const confirmation=await ui.create()();assert.equal(confirmation.ok,false,'changed current input must not be reported saved by replaying old command');assert.equal(confirmation.reason,'original-create-confirmed');
 assert.equal(ui.local()[0].name,'Synthetic Cedar Contract');assert.equal(pendingRevenueCreates('account').find(r=>r.createId===original.createId).name,'Synthetic Cedar Contract');
 assert.equal((await ui.create()()).ok,true);assert.equal(io.rows('customer_accounts').size,1);assert.equal(io.rows('customer_accounts').get(original.createId).name,ui.local()[0].name);
});

test('S5: clearing phone and promise after uncertain NewCustomer submit clears saved values on explicit follow-up save',async t=>{
 const io=business(t),createId=newRevenueCreateId();const fields={createId,name:'Synthetic Cedar Academy',stage:'New',phone:'000-0000-0102',nextAction:'Demo',nextActionAt:'2026-10-22',workspace:'classin',isImportant:false};
 const original=customerPayload(fields);io.lose('lead',createId);await save('lead','create',original);
 const edited=customerPayload({...fields,phone:'',nextAction:'',nextActionAt:''});assert.equal((await save('lead','create',edited)).reason,'original-create-confirmed');assert.equal((await save('lead','create',edited)).ok,true);
 const saved=io.rows('leads').get(createId);assert.equal(saved.phone,null,'cleared phone must not silently survive');assert.equal(saved.next_action,null);assert.equal(saved.meta.next_action_at,null);assert.equal(io.rows('leads').size,1);
});

test('S4 guard: in-flight rename, workspace switch and remount keep edits dirty until an explicit update of the original row',async t=>{
 const io=business(t),ui=accountUi(io),gate=io.hold('account');const pending=ui.create()();await gate.committed;
 await ui.rename(ui.local()[0],'Synthetic Cedar revised while saving');gate.release();const result=await pending;
 assert.equal(result.ok,false);assert.equal(result.reason,'original-create-confirmed');assert.equal(ui.local()[0].name,'Synthetic Cedar revised while saving');
 assert.equal((await ui.create('personal')()).ok,true);
 assert.equal((await ui.create('classin',true)()).ok,true);const row=ui.local().find(item=>item.workspace==='classin');assert.equal(io.rows('customer_accounts').get(row.id).name,row.name);assert.equal(io.rows('customer_accounts').size,2);
 const personal=ui.local().find(item=>item.workspace==='personal');assert.notEqual(row.id,personal.id);assert.equal(io.rows('customer_accounts').get(personal.id).name,personal.name);
 assert.deepEqual(io.calls.filter(c=>c.layer==='ui').map(c=>c.op),['create','create','update']);
});

test('S6: manually entered customer phone remains available after ledger reload with no linked contact',async t=>{
 business(t);const record=draft();assert.equal((await save('lead','create',record)).ok,true);const rows=customerRows(await getRevenueLedger());assert.equal(rows.find(r=>r.id===record.createId).phone,record.phone);
});

test('S7: Case account label survives save and reload without pretending to establish a CRM foreign-key link',async t=>{
 const io=business(t),createId=newRevenueCreateId();assert.equal((await save('case','create',{createId,title:'Synthetic classroom onboarding',account:'Synthetic Cedar Contract',status:'Open',priority:'med',type:'company',workspace:'classin'})).ok,true);
 const item=(await getRevenueLedger()).cases.find(r=>r.id===createId);assert.equal(item.account,'Synthetic Cedar Contract');assert.equal(io.rows('operation_cases').get(createId).customer_account_id,undefined);
});

test('S6 guard: a linked contact phone remains authoritative over the manual lead phone',async t=>{
 const io=business(t),record=draft(),contactId=newRevenueCreateId();await save('lead','create',record);
 io.rows('leads').get(record.createId).contact_id=contactId;
 io.rows('contacts').set(contactId,{id:contactId,workspace_id:io.rows('leads').get(record.createId).workspace_id,name:'Synthetic contact',phone:'000-0000-0202'});
 const customer=customerRows(await getRevenueLedger()).find(r=>r.id===record.createId);assert.equal(customer.phone,'000-0000-0202');
});

test('S7 guard: linked account wins; malformed and blank legacy labels never reach the rendered account field',async t=>{
 const io=business(t),accountId=newRevenueCreateId();await save('account','create',{createId:accountId,name:'Synthetic linked contract'});
 const workspace_id=io.rows('customer_accounts').get(accountId).workspace_id;
 const linked=newRevenueCreateId();io.rows('operation_cases').set(linked,{id:linked,workspace_id,title:'Linked case',customer_account_id:accountId,meta:{account_label:'Stale free text'}});
 const invalid=[{},[],42,null,'   '].map(label=>{const id=newRevenueCreateId();io.rows('operation_cases').set(id,{id,workspace_id,title:'Legacy case',meta:{account_label:label}});return id;});
 const ledger=await getRevenueLedger();assert.equal(ledger.cases.find(row=>row.id===linked).account,'Synthetic linked contract');
 for(const id of invalid)assert.equal(ledger.cases.find(row=>row.id===id).account,'—');
});

test('S9: same-name Account rename must not change another workspace local row (stable identity regression)',async t=>{
 const RealDate=Date;globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-10-20T10:00:00Z']));}static now(){return new RealDate('2026-10-20T10:00:00Z').getTime();}};
 t.after(()=>globalThis.Date=RealDate);
 const io=business(t),ui=accountUi(io);ui.loseNext();await ui.create('classin')();await ui.create('personal')();
 const target=ui.local().find(row=>row.workspace==='classin'),other=ui.local().find(row=>row.workspace==='personal');assert.equal(target.name,other.name);assert.notEqual(target.createId,other.createId);
 await ui.rename(target,'Synthetic ClassIn-only rename');assert.equal(ui.local().find(row=>row.createId===other.createId).name,other.name,'renaming ClassIn must leave the personal local row unchanged');
 assert.equal((await ui.create('classin',true)()).reason,'original-create-confirmed');
 assert.equal((await ui.create('classin',true)()).ok,true);assert.equal((await ui.create('personal',true)()).ok,true);
 assert.equal(io.rows('customer_accounts').get(target.createId).name,'Synthetic ClassIn-only rename');assert.equal(io.rows('customer_accounts').get(other.createId).name,other.name);
});

test('S10: two same-second quick Accounts in one scope retain independent IDs, selection and saved names',async t=>{
 const RealDate=Date;globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-10-20T10:00:00Z']));}static now(){return new RealDate('2026-10-20T10:00:00Z').getTime();}};t.after(()=>globalThis.Date=RealDate);
 const io=business(t),ui=accountUi(io);await ui.create('classin')();await ui.create('classin')();const [second,first]=ui.local();assert.equal(first.name,second.name);assert.notEqual(first.id,second.id);assert.equal(ui.selected(),second.id);
 await ui.rename(first,'Synthetic first contract renamed');assert.equal(ui.selected(),second.id);assert.equal(io.rows('customer_accounts').get(first.id).name,'Synthetic first contract renamed');assert.equal(io.rows('customer_accounts').get(second.id).name,second.name);assert.equal(io.rows('customer_accounts').size,2);
});
