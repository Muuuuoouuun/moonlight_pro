import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { accountKey, accountCreateScope, resolveAccountReference, queueAccountRename } from './account-identity.js';
import { pendingRevenueCreates, rememberRevenueDraft, hasPendingRevenueCreate, mergeRevenueDrafts, notifyRevenueSaveFailure } from './revenue-create-client.js';
import { scopeFilterForQuery, resolveScopeFilter } from '../../../lib/revenue-scope-filter.js';
import { saveRevenueCreate } from './revenue-create-client.js';
import { newRevenueCreateId } from '../../../lib/sales-os/revenue-create-command.js';
const source=readFileSync(new URL('./revenue.jsx',import.meta.url),'utf8');
const js=ts.transpileModule(source.slice(source.indexOf('export function Accounts(')).replace('export ',''),{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
const emptyDetail=()=>({mrr:0,contacts:[],deals:[],activity:[],notes:[]});
function mount({records=[],scope=null,search='',save=async()=>({ok:true,status:'saved'}),read=async()=>({ok:true,json:async()=>({status:'live',activities:[]})}),reload=async()=>undefined}={}){
 let slots=[],index=0,tree,ledger={accounts:records},workspace=scope,query=search,syncState='live';const effects=[],replaced=[],keyboardRows=[],timers=new Map(),errors=[];
 const React={createElement:(type,props,...children)=>({type,props:{...props,children:children.flat(Infinity).filter(v=>v!==null&&v!==false&&v!==undefined)}}),
 useState(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];},
 useRef(initial){const i=index++;return slots[i]??={current:initial};},useMemo:fn=>fn(),useCallback:fn=>fn,
 useEffect(fn,deps){const i=index++,previous=slots[i];if(!previous||deps.some((v,j)=>!Object.is(v,previous.deps[j]))){slots[i]={deps,cleanup:previous?.cleanup};effects.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn();});}}};
 const scopeHookSource=source.slice(source.indexOf('function useScopeFilter('),source.indexOf('// Parse a display amount'));
 const useScopeFilter=new Function('React','scopeFilterForQuery','resolveScopeFilter',`${scopeHookSource};return useScopeFilter;`)(React,scopeFilterForQuery,resolveScopeFilter);
 const deps={React,accountKey, accountCreateScope,resolveAccountReference,queueAccountRename,newRevenueCreateId,pendingRevenueCreates,rememberRevenueDraft,hasPendingRevenueCreate,mergeRevenueDrafts,notifyRevenueSaveFailure,emptyDetail,
 useToast:()=>({success(){},error:(...a)=>errors.push(a),info(){}}),useRevenueLedger:()=>({ledger,syncState,reload}),useSearchParams:()=>new URLSearchParams(query),useRouter:()=>({replace:url=>replaced.push(url)}),usePathname:()=>'/dashboard/revenue/accounts',useScopeFilter,getWorkspace:w=>w?{label:w}:null,
 filterAccountsByWorkspace:(rows,w)=>w?rows.filter(a=>a.workspace===w):rows,buildAccountRelationshipDetail:a=>({contacts:a.contacts||[],deals:a.linkedDeals||[]}),
 useUndoableAction:()=>({schedule:(key,fn)=>timers.set(key,fn),cancel:key=>timers.delete(key)}),useCrmSelection:rows=>{keyboardRows.push(rows);return{selectedId:null};},useCrmKeyboard(){},saveRevenueRecord:save,fetch:read,SCOPE_OPTIONS:[],fmt:String,setTimeout:()=>1,clearTimeout(){},document:{querySelector:()=>null}};
 for(const name of ['Card','EmptyState','Button','Kbd','TruthBadge','SegmentedControl','Input','Skeleton','LedgerReadError','Avatar','Badge','HealthDot','Iconed','SortHead','DetailPanel'])deps[name]=name;
 const Accounts=new Function(...Object.keys(deps),`${js};return Accounts;`)(...Object.values(deps));
 function render(){index=0;effects.length=0;tree=Accounts({workspace});return tree;}
 function findAll(predicate,node=tree){if(!node||typeof node!=='object')return[];return[...(predicate(node)?[node]:[]),...(node.props?.children||[]).flatMap(n=>findAll(predicate,n))];}
 render();return{render,findAll,replaced,keyboardRows,timers,errors,runEffects(){effects.splice(0).forEach(fn=>fn());},setScope:w=>workspace=w,setQuery:q=>query=q,setRecords:r=>ledger={accounts:r},setSyncState:s=>syncState=s};
}
const row=(id,name='Same synthetic organization',workspace='classin')=>({id,name,workspace,type:'company',health:'ok',value:0,deals:0});
const panel=h=>h.findAll(n=>n.type==='DetailPanel')[0];
function open(h,id){const card=h.findAll(n=>n.type==='Card'&&n.props.key===id)[0];assert.ok(card,`card ${id}`);card.props.children[0].props.onClick();h.render();return panel(h);}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('identity survives create acknowledgement/reload; missing identity never falls back to a name',()=>{
 const id=newRevenueCreateId();assert.equal(accountKey({createId:id,name:'Before'}),id);assert.equal(accountKey({id,createId:id,name:'After'}),id);assert.equal(accountKey({id,name:'Reloaded'}),id);assert.equal(accountKey({name:'Unidentified'}),null);
});

test('canonical ID links win; legacy names resolve only when unique in the supplied scope',()=>{
 const a=row('a'),b=row('b'),c=row('c','Other');assert.equal(resolveAccountReference([a,b,c],'b').account,b);assert.equal(resolveAccountReference([a,b,c],a.name).status,'ambiguous');assert.equal(resolveAccountReference([a,c],a.name).account,a);assert.equal(resolveAccountReference([a], 'missing').status,'missing');assert.equal(resolveAccountReference([{name:'Legacy without ID'}],'Legacy without ID').status,'missing');
});

test('same-name cards, keyboard selection and detail caches identify the chosen record, not the first name',()=>{
 const h=mount({records:[row('a'),row('b')]});assert.deepEqual(h.keyboardRows.at(-1).map(r=>r.id),['a','b']);assert.equal(open(h,'b').props.account.id,'b');assert.equal(panel(h).props.key,'b');
 panel(h).props.onAddNote('Synthetic note for B');h.render();assert.equal(panel(h).props.detail.notes[0].body,'Synthetic note for B');
 const left=h.findAll(n=>n.type==='div'&&n.props.key==='a'&&n.props.role==='button')[0];left.props.onClick();h.render();assert.equal(panel(h).props.account.id,'a');assert.equal(panel(h).props.detail.notes.length,0);assert.equal(panel(h).props.key,'a');
});

test('search text index does not let same-name records overwrite each other',()=>{
 const a={...row('a'),contacts:[{name:'Contact A',phone:'000-111',labels:[]}]},b={...row('b'),contacts:[{name:'Contact B',phone:'000-222',labels:[]}]};const h=mount({records:[a,b]});
 h.findAll(n=>n.type==='Input')[0].props.onChange('000-111');h.render();const cards=h.findAll(n=>n.type==='Card'&&n.props.interactive);assert.deepEqual(cards.map(n=>n.props.key),['a']);
});

test('persisted rename updates only its stable-key label and retains selection',async()=>{
 const writes=[],h=mount({records:[row('a'),row('b')],save:async(kind,op,payload)=>{writes.push(payload);return{ok:true,status:'saved'};}});open(h,'b');await panel(h).props.onRename('Renamed B');h.render();assert.equal(panel(h).props.account.id,'b');assert.equal(panel(h).props.account.name,'Renamed B');assert.deepEqual(writes,[{id:'b',name:'Renamed B'}]);
 h.setScope('personal');h.render();h.runEffects();h.render();assert.equal(panel(h)?.props.account??null,null);
});

test('late activity acknowledgement remains in its original same-name detail and cannot clear another account error',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);const h=mount({records:[row('a'),row('b')],save:async(kind,op,payload)=>payload.accountId==='a'?gate:{ok:false,status:'failed'}});
 open(h,'a');panel(h).props.onAddNote('Pending A');h.render();h.findAll(n=>n.type==='div'&&n.props.key==='b'&&n.props.role==='button')[0].props.onClick();h.render();panel(h).props.onAddNote('Rejected B');await tick();h.render();assert.equal(panel(h).props.activityError.body,'Rejected B');
 release({ok:true,status:'saved',id:'note-a'});await tick();h.render();assert.equal(panel(h).props.activityError.body,'Rejected B');assert.equal(panel(h).props.detail.notes.length,0);
 h.findAll(n=>n.type==='div'&&n.props.key==='a'&&n.props.role==='button')[0].props.onClick();h.render();assert.equal(panel(h).props.detail.notes[0].id,'note-a');assert.equal(panel(h).props.detail.notes[0].body,'Pending A');
});

test('ID deep link clears transient search, keeps scope query, and opens the intended same-name account',()=>{
 const h=mount({records:[row('a'),row('b')],scope:'classin'});h.findAll(n=>n.type==='Input')[0].props.onChange('hides all');h.render();h.setQuery('account=b&scope=company&keep=yes');h.render();h.runEffects();h.render();assert.equal(panel(h).props.account.id,'b');assert.equal(h.findAll(n=>n.type==='Input')[0].props.value,'');assert.equal(h.replaced.at(-1),'/dashboard/revenue/accounts?scope=company&keep=yes');
});

test('ambiguous legacy deep link never opens an arbitrary account; scoped unique legacy links remain compatible',()=>{
 const h=mount({records:[row('a'),row('b')],search:'account=Same+synthetic+organization&scope=company'});h.runEffects();h.render();assert.equal(panel(h),undefined);assert.ok(h.findAll(n=>n.props.role==='alert').some(n=>JSON.stringify(n.props.children).includes('여러 개')));
 const scoped=mount({records:[row('a'),row('b',undefined,'personal')],scope:'classin',search:'account=Same+synthetic+organization&keep=yes'});scoped.runEffects();scoped.render();assert.equal(panel(scoped).props.account.id,'a');
});

test('rename queue serializes one record but not another; stale failure cannot roll back a newer confirmed name',async()=>{
 const queue=new Map(),calls=[];let release;const first=queueAccountRename(queue,'a','Original','First',name=>{calls.push(name);return new Promise(resolve=>release=resolve);});
 const second=queueAccountRename(queue,'a','First','Second',async name=>{calls.push(name);return{ok:true};});const other=queueAccountRename(queue,'b','Other','Independent',async name=>{calls.push(name);return{ok:true};});await tick();assert.deepEqual(calls,['First','Independent']);assert.equal((await other).current,true);release({ok:false});assert.equal((await first).current,false);const result=await second;assert.equal(result.current,true);assert.equal(result.confirmedName,'Second');assert.equal(queue.size,0);
});

test('two failed queued renames restore the last confirmed name, not failed optimistic input',async()=>{
 const queue=new Map(),first=queueAccountRename(queue,'a','Original','First',async()=>({ok:false})),second=queueAccountRename(queue,'a','First','Second',async()=>({ok:false}));await first;assert.equal((await second).confirmedName,'Original');
});

test('later ordinary ledger refresh replaces a confirmed overlay after the immediate reload failed',async()=>{
 const h=mount({records:[row('a','Original')],save:async()=>({ok:true,status:'saved'})});h.runEffects();open(h,'a');await panel(h).props.onRename('Confirmed B');h.render();assert.equal(panel(h).props.account.name,'Confirmed B');
 h.setRecords([row('a','External C')]);h.render();h.runEffects();h.render();assert.equal(panel(h).props.account.id,'a');assert.equal(panel(h).props.account.name,'External C');
});

test('refresh cannot erase a newer queued rename',async()=>{
 let release;const h=mount({records:[row('a','Original')],save:async()=>new Promise(resolve=>release=resolve)});h.runEffects();open(h,'a');const pending=panel(h).props.onRename('Newer input');await tick();h.setRecords([row('a','External intermediate')]);h.render();h.runEffects();h.render();assert.equal(panel(h).props.account.name,'Newer input');release({ok:true,status:'saved'});await pending;
});

test('late failure retains separate error input for both same-name accounts',async()=>{
 let release;const h=mount({records:[row('a'),row('b')],save:async(kind,op,payload)=>payload.accountId==='a'?new Promise(resolve=>release=resolve):{ok:false,status:'failed'}});
 open(h,'a');panel(h).props.onAddNote('Failed A input');h.findAll(n=>n.type==='div'&&n.props.key==='b'&&n.props.role==='button')[0].props.onClick();h.render();panel(h).props.onAddNote('Failed B input');await tick();release({ok:false,status:'failed'});await tick();h.render();assert.equal(panel(h).props.activityError.body,'Failed B input');
 h.findAll(n=>n.type==='div'&&n.props.key==='a'&&n.props.role==='button')[0].props.onClick();h.render();assert.equal(panel(h).props.activityError.body,'Failed A input');
});

function component(name,props){
 const ast=ts.createSourceFile('revenue.jsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
 const named=n=>ast.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text===n).getText(ast);
 const code=ts.transpileModule(`${named('useDetailDraft')}\n${named(name)}`,{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
 let slots=[],i=0,tree;const effects=[];
 const React={createElement:(type,p,...children)=>({type,props:{...p,children:children.flat(Infinity).filter(Boolean)}}),useState(initial){const key=i++;if(!(key in slots))slots[key]=typeof initial==='function'?initial():initial;return[slots[key],v=>slots[key]=typeof v==='function'?v(slots[key]):v];},useRef(initial){return slots[i++]??={current:initial};},useEffect(fn,deps){const key=i++,old=slots[key];if(!old||deps.some((v,n)=>!Object.is(v,old[n]))){slots[key]=deps;effects.push(fn);}}};
 const deps={React,accountKey, accountCreateScope,emptyDetail,fmt:String,ACT_LABEL:{note:'Note',call:'Call'}};
 for(const n of ['Avatar','Badge','Iconed','IconButton','Button','HealthDot','QuickActions','Tabs','GoalLinks','LogComposer'])if(n!==name)deps[n]=n;
 const fn=new Function(...Object.keys(deps),`${code};return ${name};`)(...Object.values(deps));
 const render=()=>{i=0;tree=fn(props);return tree;};
 const findAll=(pred,node=tree)=>!node||typeof node!=='object'?[]:[...(pred(node)?[node]:[]),...(node.props?.children||[]).flatMap(n=>findAll(pred,n))];
 render();return{render,findAll,runEffects:()=>effects.splice(0).forEach(fn=>fn())};
}

test('same-name account note drafts survive keyed selection but never appear under another identity',()=>{
 const draftCache={current:new Map()},props=account=>({account,detail:emptyDetail(),draftCache});
 const a=component('DetailPanel',props(row('a')));a.findAll(n=>n.type==='Tabs')[0].props.onChange('notes');a.render();a.findAll(n=>n.type==='textarea')[0].props.onChange({target:{value:'Unsent A note'}});
 const b=component('DetailPanel',props(row('b')));b.findAll(n=>n.type==='Tabs')[0].props.onChange('notes');b.render();assert.equal(b.findAll(n=>n.type==='textarea')[0].props.value,'');
 const resumed=component('DetailPanel',props({...row('a'),name:'Renamed A'}));assert.equal(resumed.findAll(n=>n.type==='textarea')[0].props.value,'Unsent A note');
});

test('log draft and type survive account remount without replaying the old quick-action preset',()=>{
 const draftCache={current:new Map()},logged=[];const props=key=>({draftCache,draftKey:key,preset:{type:'note',text:'',seq:0},onLog:entry=>logged.push({key,...entry})});
 const a=component('LogComposer',props('a'));a.runEffects();a.render();a.findAll(n=>n.type==='textarea')[0].props.onChange({target:{value:'Unsent A call'}});a.findAll(n=>n.type==='select')[0].props.onChange({target:{value:'call'}});
 const b=component('LogComposer',props('b'));b.runEffects();b.render();assert.equal(b.findAll(n=>n.type==='textarea')[0].props.value,'');
 const resumed=component('LogComposer',props('a'));resumed.runEffects();resumed.render();assert.equal(resumed.findAll(n=>n.type==='textarea')[0].props.value,'Unsent A call');assert.equal(resumed.findAll(n=>n.type==='select')[0].props.value,'call');resumed.findAll(n=>n.type==='Button')[0].props.onClick();assert.deepEqual(logged,[{key:'a',type:'call',msg:'Unsent A call'}]);assert.equal(draftCache.current.get('a').logText,'');
});

test('rename Enter plus blur submits once, and Escape plus blur submits nothing',()=>{
 const calls=[],p=component('DetailPanel',{account:row('a'),detail:emptyDetail(),onRename:name=>calls.push(name)});
 const begin=()=>{p.findAll(n=>n.type==='IconButton'&&n.props.tooltip==='이름 변경')[0].props.onClick();p.render();return p.findAll(n=>n.type==='input')[0];};
 const first=begin();first.props.onKeyDown({key:'Enter',currentTarget:{value:'Committed once'},preventDefault(){}});first.props.onBlur({currentTarget:{value:'Committed once'}});p.render();assert.deepEqual(calls,['Committed once']);
 const cancelled=begin();cancelled.props.onKeyDown({key:'Escape',stopPropagation(){}});cancelled.props.onBlur({currentTarget:{value:'Must not save'}});assert.deepEqual(calls,['Committed once']);
});


test('query-only personal scope is effective before same-name legacy deep-link consumption',()=>{
 const company=row('company'),personal={...row('personal'),type:'personal'};
 const h=mount({records:[company,personal]});h.runEffects();h.setQuery('scope=personal&account=Same+synthetic+organization&keep=yes');h.render();h.runEffects();h.render();
 assert.equal(panel(h).props.account.id,'personal');assert.equal(h.replaced.at(-1),'/dashboard/revenue/accounts?scope=personal&keep=yes');
 assert.equal(h.findAll(n=>n.props.role==='alert').length,0);
 // A manual filter still owns later renders while the query is unchanged.
 h.findAll(n=>n.type==='SegmentedControl')[1].props.onChange('company');h.render();assert.deepEqual(h.keyboardRows.at(-1),[{id:'company'}]);
});

test('query-only personal scope creates a visible personal account, not an old-scope company',async()=>{
 const calls=[],h=mount({save:async(kind,op,record)=>{calls.push(record);return{ok:true,status:'saved',id:record.createId};}});h.runEffects();h.setQuery('scope=personal&new=account&keep=yes');h.render();h.runEffects();await tick();h.render();
 assert.equal(calls.length,1);assert.equal(calls[0].type,'personal');assert.equal(panel(h).props.account.id,calls[0].createId);assert.equal(h.replaced.at(-1),'/dashboard/revenue/accounts?scope=personal&keep=yes');
});

test('ledger invalidate loading/error emptiness does not discard selected identity or cached details',()=>{
 const records=[row('a'),row('b')],h=mount({records});h.runEffects();open(h,'b');panel(h).props.onAddNote('Selected B local note');h.render();
 h.setSyncState('loading');h.setRecords([]);h.render();h.runEffects();h.render();assert.equal(panel(h),undefined);
 h.setSyncState('error');h.render();h.runEffects();h.render();
 h.setSyncState('live');h.setRecords(records);h.render();h.runEffects();h.render();assert.equal(panel(h).props.account.id,'b');assert.equal(panel(h).props.detail.notes[0].body,'Selected B local note');
});

test('unresolved create retains current name against a stale ledger and converges after recovery and refresh',async()=>{
 const createId=newRevenueCreateId(),original={createId,name:'Original receipt',type:'company',workspace:'classin'};
 await saveRevenueCreate('account',original,async()=>({ok:false,status:'unknown'}));
 const h=mount({scope:'classin',records:[],save:(kind,op,record)=>saveRevenueCreate(kind,record,async()=>({ok:true,status:'saved',id:createId}))});h.runEffects();open(h,createId);await panel(h).props.onRename('Edited current input');h.render();
 h.setRecords([row(createId,'Original receipt')]);h.render();h.runEffects();h.render();assert.equal(panel(h).props.account.name,'Edited current input');
 const create=()=>h.findAll(n=>n.type==='Button'&&n.props.icon==='plus')[0].props.onClick();
 assert.equal((await create()).reason,'original-create-confirmed');h.render();assert.equal((await create()).ok,true);h.render();
 assert.equal(panel(h).props.account.id,createId);assert.equal(panel(h).props.account.name,'Edited current input');
 h.setRecords([row(createId,'External after recovery')]);h.render();h.runEffects();h.render();assert.equal(panel(h).props.account.id,createId);assert.equal(panel(h).props.account.name,'External after recovery');
});


test('actual scope hook preserves manual choice until query changes or is removed',()=>{
 const h=mount({records:[row('c'),{...row('p'),type:'personal'}],search:'scope=personal'});h.runEffects();h.render();assert.deepEqual(h.keyboardRows.at(-1),[{id:'p'}]);
 h.findAll(n=>n.type==='SegmentedControl')[1].props.onChange('company');h.render();h.runEffects();h.render();assert.deepEqual(h.keyboardRows.at(-1),[{id:'c'}]);
 h.setQuery('scope=personal&keep=yes');h.render();h.runEffects();h.render();assert.deepEqual(h.keyboardRows.at(-1),[{id:'c'}]);
 h.setQuery('keep=yes');h.render();assert.deepEqual(h.keyboardRows.at(-1),[{id:'c'},{id:'p'}]);h.runEffects();h.render();assert.deepEqual(h.keyboardRows.at(-1),[{id:'c'},{id:'p'}]);
 h.setQuery('scope=personal');h.render();assert.deepEqual(h.keyboardRows.at(-1),[{id:'p'}]);
});

test('activity load completing after a rename remains attached to the same ID',async()=>{
 let release;const h=mount({records:[row('a'),row('b')],read:()=>new Promise(resolve=>release=resolve)});h.runEffects();open(h,'b');h.runEffects();await panel(h).props.onRename('Renamed B');
 release({ok:true,json:async()=>({status:'live',activities:[{id:'note-b',type:'note',msg:'Read for B'}]})});await tick();h.render();assert.equal(panel(h).props.account.id,'b');assert.equal(panel(h).props.detail.notes[0].body,'Read for B');
 h.findAll(n=>n.type==='div'&&n.props.key==='a'&&n.props.role==='button')[0].props.onClick();h.render();assert.equal(panel(h).props.detail.notes.length,0);
});

test('late pin failure and delete undo stay with the original same-name identity',async()=>{
 let rejectPin;const writes=[],h=mount({records:[row('a'),row('b')],read:async url=>({ok:true,json:async()=>({status:'live',activities:[{id:url.endsWith('a')?'note-a':'note-b',type:'note',msg:url.endsWith('a')?'A only':'B only',pinned:false}]})}),save:async(kind,op,payload)=>{writes.push({op,...payload});return op==='update'?new Promise(resolve=>rejectPin=resolve):{ok:true,status:'saved'};}});
 h.runEffects();open(h,'a');h.runEffects();await tick();h.render();panel(h).props.onPinNote(panel(h).props.detail.notes[0]);h.render();assert.equal(panel(h).props.detail.notes[0].pinned,true);
 h.findAll(n=>n.type==='div'&&n.props.key==='b'&&n.props.role==='button')[0].props.onClick();h.render();h.runEffects();await tick();rejectPin({ok:false,status:'failed'});await tick();h.render();assert.equal(panel(h).props.detail.notes[0].body,'B only');assert.equal(panel(h).props.activityError??null,null);
 h.findAll(n=>n.type==='div'&&n.props.key==='a'&&n.props.role==='button')[0].props.onClick();h.render();assert.equal(panel(h).props.detail.notes[0].pinned,false);assert.ok(panel(h).props.activityError.message.includes('핀 저장 실패'));
 panel(h).props.onDeleteActivity(panel(h).props.detail.activity[0]);h.render();const undo=panel(h).props.deleteNotice.undo;assert.equal(panel(h).props.detail.notes.length,0);
 h.findAll(n=>n.type==='div'&&n.props.key==='b'&&n.props.role==='button')[0].props.onClick();h.render();assert.equal(panel(h).props.deleteNotice??null,null);undo();h.render();assert.equal(panel(h).props.detail.notes[0].body,'B only');
 h.findAll(n=>n.type==='div'&&n.props.key==='a'&&n.props.role==='button')[0].props.onClick();h.render();assert.equal(panel(h).props.detail.notes[0].body,'A only');assert.equal(h.timers.size,0);assert.deepEqual(writes,[{op:'update',id:'note-a',pinned:true}]);
});

test('unknown company and personal creates remain separate through query switch and remount',async()=>{
 let accept=false;const calls=[],save=(kind,op,record)=>saveRevenueCreate(kind,record,async(operation,body)=>{calls.push({...body,operation});return accept?{ok:true,status:'saved',id:body.createId}:{ok:false,status:'unknown'};});
 const create=h=>h.findAll(n=>n.type==='Button'&&n.props.icon==='plus')[0].props.onClick();
 const h=mount({save});h.runEffects();await create(h);h.render();const companyId=panel(h).props.account.createId;
 h.setQuery('scope=personal');h.render();h.runEffects();h.render();await create(h);h.render();const personalId=panel(h).props.account.createId;assert.notEqual(personalId,companyId);assert.equal(panel(h).props.account.type,'personal');
 assert.equal(pendingRevenueCreates('account').length,2);
 const remount=mount({save,search:'scope=personal'});remount.runEffects();accept=true;await create(remount);remount.render();assert.equal(panel(remount).props.account.id,personalId);assert.equal(panel(remount).props.account.type,'personal');
 remount.setQuery('');remount.render();remount.runEffects();remount.render();await create(remount);remount.render();assert.equal(panel(remount).props.account.id,companyId);assert.equal(panel(remount).props.account.type,'company');
 assert.deepEqual(calls.map(r=>r.createId),[companyId,personalId,personalId,companyId]);assert.equal(pendingRevenueCreates('account').length,0);
});
