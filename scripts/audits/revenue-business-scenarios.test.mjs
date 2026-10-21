import assert from 'node:assert/strict';
import test from 'node:test';
import { business, draft, save, customerRows } from './revenue-business-fixture.mjs';
import { newRevenueCreateId } from '../../apps/hub/lib/sales-os/revenue-create-command.js';
import { getRevenueLedger } from '../../apps/hub/lib/repositories/revenue-ledger.js';

test('S8: downstream customer→deal/account linkage acceptance (known missing workflow, not an idempotency guarantee)',{todo:'Create surfaces do not establish company/lead/account foreign-key links; requires product-scoped workflow design.'},async t=>{
 const io=business(t),lead=draft();await save('lead','create',lead);const id=newRevenueCreateId();await save('deal','create',{createId:id,name:'Synthetic Cedar demo subscription',stage:'quote',value:'1200000',workspace:'classin',leadId:lead.createId});
 const customer=customerRows(await getRevenueLedger()).find(r=>r.id===lead.createId);assert.equal(customer.deals.some(d=>d.id===id),true,'the new deal should appear in the customer context');
 assert.equal(io.rows('deals').get(id).lead_id,lead.createId);
});
