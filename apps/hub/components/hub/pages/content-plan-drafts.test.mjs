import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual JSX with deterministic hooks and injected transports.
// This models subtree unmounts; it is not a browser or React scheduler test.
const ROOT = new URL('../../../../../', import.meta.url);
const FLOW = 'apps/hub/components/hub/pages/content-flow.jsx';
const PROVIDER = 'apps/hub/components/hub/office-session-provider.jsx';
const STORE = 'apps/hub/lib/content-plan-store.js';
const file = path => readFileSync(new URL(path, ROOT), 'utf8');
const normalize = value => JSON.parse(JSON.stringify(value));
function syntheticContent() {
  const items = [], variants = [], brands = [], details = {};
  for (const [domain, orgScope] of [['personal', 'personal'], ['company', 'company']]) {
    const id = `synthetic-${domain}-item`, brandId = `synthetic-${domain}-brand`, variantId = `synthetic-${domain}-variant`;
    const item = { id, title: `합성 ${domain} 소재`, sourceIdea: `합성 ${domain} 소재\n합성 원문 둘째 줄`, sourceUrl: null,
      brief: {}, status: 'idea', createdAt: '2026-10-21T09:00:00Z', updatedAt: '2026-10-21T10:00:00Z', brandId, brandKey: brandId, orgScope, variantId };
    items.push(item);
    variants.push({ id: variantId, contentId: id, type: 'threads_post', body: item.sourceIdea, updatedAt: item.updatedAt });
    brands.push({ id: brandId, key: brandId, name: `합성 ${domain} 브랜드`, orgScope });
    // Scope is catalog-derived; raw item meta intentionally has no org_scope.
    details[id] = { status: 'live', item: { id, workspace_id: 'synthetic-workspace', brand_id: brandId, title: item.title,
      source_idea: item.sourceIdea, updated_at: item.updatedAt, meta: { brief: {}, primary_variant_id: variantId } },
      variants: [{ id: variantId, content_id: id, variant_type: 'threads_post', channel: 'threads', body: item.sourceIdea, updated_at: item.updatedAt }] };
  }
  return { ledger: { syncState: 'live', items, variants, brands, publishLogs: [] }, details };
}
const fixture = syntheticContent();
const blocked = () => { throw new Error('Unexpected effect: synthetic harness has no network or storage transport'); };
function compile(source, imports) {
  const result = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, reportDiagnostics: true });
  assert.equal((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, 'transpile diagnostics');
  const module = { exports: {} };
  const context = vm.createContext({ URL, URLSearchParams });
  assert.equal(vm.runInContext('typeof process + ":" + typeof fetch + ":" + typeof require', context), 'undefined:undefined:undefined');
  const execute = vm.runInContext('(function(require,module,exports,fetch,crypto,AbortSignal,window,localStorage,indexedDB) {\n' + result.outputText + '\n})', context);
  execute(
    name => { if (!Object.hasOwn(imports, name)) throw new Error(`Unexpected dependency: ${name}`); return imports[name]; }, module, module.exports,
    imports.__fetch || blocked, { randomUUID: (() => { let sequence=0; return () => `synthetic-request-${++sequence}`; })() }, { timeout: () => undefined }, imports.__window || undefined, undefined, undefined,
  );
  return module.exports;
}
const pureCache = new Map();
const allowedPure = new Set([
  'apps/hub/lib/content-flow.js', 'apps/hub/lib/content-workflow-client.js', 'apps/hub/lib/content-publish-log.js',
  'apps/hub/lib/content-schedule.js', 'apps/hub/lib/content-workflow.js', 'apps/hub/lib/brand-org-scope.js',
  'apps/hub/components/hub/workspace-map.js', 'apps/hub/components/hub/office-unload.js',
]);
function pure(path) {
  if (pureCache.has(path)) return pureCache.get(path);
  assert.ok(allowedPure.has(path), `Pure source allowlist: ${path}`);
  const source = file(path);
  const imports = {};
  for (const [, name] of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
    let child = name.startsWith('@/') ? `apps/hub/${name.slice(2)}` : new URL(name, new URL(path, ROOT)).href.slice(ROOT.href.length);
    if (!child.endsWith('.js')) child += '.js';
    imports[name] = pure(child);
  }
  const result = compile(source, imports); pureCache.set(path, result); return result;
}
function all(node) {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!node || typeof node !== 'object') return [];
  return [node, ...all(node.rendered), ...all(node.props?.children)];
}
const byLabel = (tree, label) => all(tree).find(n => n.props?.label === label || n.props?.['aria-label'] === label);
const textOf = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(textOf).join('') : node && typeof node === 'object' ? textOf(node.rendered ?? node.props?.children) : '';
const byText = (tree, label) => all(tree).find(n => n.type === 'Button' && textOf(n) === label);
const message = tree => byLabel(tree, '핵심 메시지 · 이것만 있으면 시작');
const planNode = tree => all(tree).find(n => typeof n.type === 'function' && n.type.name === 'PlanPane');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve=r; }); return { promise, resolve }; };
function harness(holder = { active: true }, options = {}) {
  let current, seen, ledger = normalize(fixture.ledger), params = new URLSearchParams('item=synthetic-personal-item'), pathname = '/dashboard/content/queue';
  let workspace, view = 'make';
  const instances = new Map(), events = [], writes = [], reads = [];
  let refreshes = 0;
  const React = {
    Fragment: Symbol('Fragment'), createContext: () => ({}),
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useContext: () => holder,
    useState: initial => { const i=current.cursor++, instance=current; if (!(i in instance.slots)) instance.slots[i] = typeof initial === 'function' ? initial() : initial; return [instance.slots[i], next => { instance.slots[i] = typeof next === 'function' ? next(instance.slots[i]) : next; }]; },
    useRef: initial => { const i=current.cursor++; return current.slots[i] ||= { current: initial }; },
    useCallback: (fn, deps) => { const i=current.cursor++, old=current.slots[i]; if (!old || deps.some((v,k)=>v!==old.deps[k])) current.slots[i]={fn,deps}; return current.slots[i].fn; },
    useMemo: (fn, deps) => { const i=current.cursor++, old=current.slots[i]; if (!old || deps.some((v,k)=>v!==old.deps[k])) current.slots[i]={value:fn(),deps}; return current.slots[i].value; },
    useSyncExternalStore: (_, get) => get(),
    useEffect: (fn, deps) => { const i=current.cursor++, old=current.slots[i]; if (!old || deps.some((v,k)=>v!==old.deps[k])) { old?.cleanup?.(); current.slots[i]={deps, cleanup:fn()}; } },
  };
  function navigate(url, method) { events.push({method,url}); const parsed = new URL(url, 'https://synthetic.invalid'); params = parsed.searchParams; pathname=parsed.pathname; view=params.get('view') || 'make'; }
  const router = { replace: url => navigate(url,'replace'), push: url => navigate(url,'push') };
  const imports = {
    react: React, 'next/navigation': { usePathname:()=>pathname, useSearchParams:()=>params, useRouter:()=>router },
    '../hub-primitives': Object.fromEntries(['Button','CertaintyBadge','SegmentedControl','SelectField','Skeleton','TextAreaField','TruthBadge'].map(n=>[n,n])),
    '../use-content-ledger': { useContentLedger:()=>ledger, readContentLedger:async()=>ledger, refreshContentLedger:async()=>{ refreshes++;return ledger; } },
    '../workspace-map': pure('apps/hub/components/hub/workspace-map.js'), '../use-crm-keyboard': { usePageCreateHotkey:()=>{} },
    '@/lib/content-workflow': pure('apps/hub/lib/content-workflow.js'), '@/lib/content-workflow-client': pure('apps/hub/lib/content-workflow-client.js'),
    '@/lib/content-publish-log': pure('apps/hub/lib/content-publish-log.js'), '@/lib/content-schedule': pure('apps/hub/lib/content-schedule.js'), '@/lib/content-flow': pure('apps/hub/lib/content-flow.js'),
    './use-content-schedule': { useContentSchedule:()=>({ status:'live',schedules:[],reload:()=>{} }) },
    './content-idea-capture': { ContentIdeaCapture:'ContentIdeaCapture' },
    '../office-session-provider': { OfficeSessionContext:{} },
    '@/lib/content-plan-store': compile(file(STORE), {}),
    './content-flow.css': {},
    './content-studio-api': { postStudio: async(endpoint, command) => { assert.equal(endpoint,'workflow'); writes.push(normalize(command)); return options.send ? options.send(command) : {status:'saved', item:{id:command.contentId,updated_at:'2026-10-21T11:00:00Z',meta:{brief:command.item.brief}}}; } },
    __fetch: async url => { assert.match(url,/^\/api\/hub\/content\/workflow\?item=/); reads.push(url); return options.read ? options.read(url) : {ok:true,json:async()=>normalize(fixture.details[decodeURIComponent(url.split('=')[1])])}; },
  };
  const module = compile(file(FLOW), imports);
  function walk(node,path='root') {
    if(Array.isArray(node))return node.map((n,i)=>walk(n,`${path}/${i}`));
    if(!node || typeof node!=='object')return node;
    if(typeof node.type==='function') {
      const key=`${path}/${node.type.name}/${node.props?.key ?? ''}`;
      seen.add(key); let instance=instances.get(key); if(!instance){instance={slots:[],cursor:0};instances.set(key,instance)}
      instance.cursor=0; const prior=current;current=instance;const rendered=node.type(node.props);current=prior;
      return {...node,rendered:walk(rendered,key)};
    }
    return {...node,props:{...node.props,children:walk(node.props?.children,`${path}/children`)}};
  }
  function unmountMissing() { for(const [key, instance] of instances) if(!seen.has(key)){instance.slots.forEach(s=>s?.cleanup?.());instances.delete(key);} }
  return {
    holder, events, writes, reads, get refreshes(){return refreshes}, get ledger(){return ledger}, set ledger(value){ledger=value},
    render(overrides={}) { if ('workspace' in overrides) workspace=overrides.workspace; if ('view' in overrides)view=overrides.view; seen=new Set(); const result=walk(React.createElement(module.ContentFlow,{workspace,view})); unmountMissing();return result; },
    unmount(){seen=new Set();unmountMissing();},
    select(id){params=new URLSearchParams(params);params.set('item',id)},
    setFilter(value){const tree=this.render();byLabel(tree,'브랜드').props.onChange({target:{value}})},
    navigate,
  };
}
function enter(h, value, label='핵심 메시지 · 이것만 있으면 시작') { byLabel(h.render(),label).props.onChange({target:{value}}); return h.render(); }
function storeOf(h,item=fixture.ledger.items[0]) { const m=compile(file(STORE),{});return h.holder.contentPlans.get(m.contentPlanKey(item)); }
function leaveGuard(holder) {
  const listeners=new Map(), effects=[];
  const source=file(PROVIDER);
  const React={createContext:()=>({Provider:'Provider'}),createElement:(type,props,...children)=>({type,props,children}),useState:()=>[holder,()=>{}],useEffect:fn=>{effects.push(fn());}};
  const mod=compile(source,{react:React,'./office-unload':pure('apps/hub/components/hub/office-unload.js'),__window:{addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)}});
  mod.OfficeSessionProvider({children:null});let prevented=0; const event={preventDefault(){prevented++}};listeners.get('beforeunload')(event);effects.forEach(fn=>fn?.());return {prevented,event};
}


test('actual make → board → make preserves the same draft without automatic POST', () => {
  const h=harness();enter(h,'합성 보존 계획');byLabel(h.render(),'콘텐츠 보기').props.onChange('board');h.render();byLabel(h.render(),'콘텐츠 보기').props.onChange('make');
  assert.equal(message(h.render()).props.value,'합성 보존 계획');assert.equal(h.writes.length,0);
});
for(const destination of ['list','studio']) test(`${destination} navigation callback + subtree remount retains input`,()=>{
  const h=harness();enter(h,'합성 이동 계획');
  if(destination==='list')byLabel(h.render(),'콘텐츠 보기').props.onChange('list');else byText(h.render(),'원고 작성 열기').props.onClick();
  assert.match(h.events.at(-1).url,destination==='list'?/view=list/:/\/content\/studio\?item=synthetic-personal-item/);
  h.unmount();h.navigate('/dashboard/content/queue?item=synthetic-personal-item','return');assert.equal(message(h.render()).props.value,'합성 이동 계획');assert.equal(h.writes.length,0);
});
for (const state of ['loading', 'error', 'preview']) test(`${state} branch unmount retains unsaved input`, () => {
  const h = harness(); enter(h, '합성 읽기 오류 초안'); h.ledger.syncState = state;
  assert.equal(message(h.render()), undefined);
  h.ledger.syncState = 'live'; assert.equal(message(h.render()).props.value, '합성 읽기 오류 초안');
  assert.equal(h.writes.length, 0);
});
test('item A/B, blank-string edit, and actual brand reclassification are isolated',()=>{
  const h=harness();enter(h,'A만');h.select('synthetic-company-item');enter(h,'B만');h.select('synthetic-personal-item');assert.equal(message(h.render()).props.value,'A만');
  h.ledger.items[0].brief.audience='서버 합성 대상';enter(h,'','누구에게');h.unmount();assert.equal(byLabel(h.render(),'누구에게').props.value,'');
  h.ledger.items[0].brandId='synthetic-other-brand';assert.equal(message(h.render()).props.value,'');h.ledger.items[0].brandId=fixture.ledger.items[0].brandId;assert.equal(message(h.render()).props.value,'A만');
});
test('all ↔ matching workspace and brand filters preserve same actual item; opposite workspace displays another item',()=>{
  const h=harness();enter(h,'개인 계획');h.render({workspace:'brand'});assert.equal(message(h.render()).props.value,'개인 계획');h.setFilter('synthetic-personal-brand');assert.equal(message(h.render()).props.value,'개인 계획');h.setFilter('all');
  h.render({workspace:'classin'});assert.equal(message(h.render()).props.value,'');enter(h,'회사 계획');h.render({workspace:undefined});h.select('synthetic-company-item');assert.equal(message(h.render()).props.value,'회사 계획');h.select('synthetic-personal-item');assert.equal(message(h.render()).props.value,'개인 계획');
});
test('brand catalog partial read cannot split a same-item same-brand draft',()=>{
  const h=harness();h.select('synthetic-company-item');enter(h,'카탈로그 부분 실패 중 보존');h.ledger.syncState='partial';h.ledger.brands=[];h.ledger.items[1].orgScope=null;
  assert.equal(message(h.render()).props.value,'카탈로그 부분 실패 중 보존');h.ledger.items[1].orgScope='company';h.ledger.syncState='live';assert.equal(message(h.render()).props.value,'카탈로그 부분 실패 중 보존');
});
test('fresh account holder cannot see previous account text; same-account remount can',()=>{
  const holder={active:true},h=harness(holder);enter(h,'계정 A 입력');h.unmount();assert.equal(message(harness(holder).render()).props.value,'계정 A 입력');assert.equal(message(harness({active:true}).render()).props.value,'');
});
test('actual provider unload guard sees edits, clears after saved ACK, and ignores an edit reverted to server value',async()=>{
  const h=harness();enter(h,'경고할 입력');assert.equal(leaveGuard(h.holder).prevented,1);h.holder.active=true;enter(h,'');assert.equal(leaveGuard(h.holder).prevented,0);h.holder.active=true;
  enter(h,'저장할 입력');await byText(h.render(),'계획 저장').props.onClick();assert.equal(leaveGuard(h.holder).prevented,0);
});
test('same captured save handler twice issues one read/POST and keeps the saving lock across remount',async()=>{
  const gate=deferred(),h=harness({active:true},{read:async()=>{await gate.promise;return {ok:true,json:async()=>normalize(fixture.details['synthetic-personal-item'])}}});
  enter(h,'한 번만');const save=byText(h.render(),'계획 저장').props.onClick;const first=save(),second=save();h.unmount();assert.equal(message(h.render()).props.disabled,true);assert.equal(h.reads.length,1);gate.resolve();await Promise.all([first,second]);assert.equal(h.writes.length,1);assert.deepEqual(normalize(h.writes[0].item),{brief:{message:'한 번만'}});assert.equal(message(h.render()).props.value,'한 번만');assert.equal(storeOf(h).status,'saved');
});
for(const mode of ['preview','conflict','mismatch','throw']) test(`${mode} save preserves exact edits across remount and never claims saved`,async()=>{
  const h=harness({active:true},{send:async()=>{if(mode==='throw')throw new Error('synthetic lost ACK');return mode==='mismatch'?{status:'saved',item:{id:'synthetic-personal-item',meta:{brief:{message:'different'}}}}:{status:mode}}});
  enter(h,'오류 뒤 남는 계획');await byText(h.render(),'계획 저장').props.onClick();h.unmount();assert.equal(message(h.render()).props.value,'오류 뒤 남는 계획');assert.notEqual(storeOf(h).status,'saved');assert.equal(leaveGuard(h.holder).prevented,1);
});
test('lost ACK retry retains existing explicit fresh read/new request ID contract',async()=>{
  let attempts=0;const h=harness({active:true},{send:async command=>{if(++attempts===1)throw new Error('synthetic lost ACK');return {status:'duplicate',item:{id:command.contentId,updated_at:'2026-10-21T12:00:00Z',meta:{brief:command.item.brief}}}}});
  enter(h,'명시적 재시도');await byText(h.render(),'계획 저장').props.onClick();h.unmount();await byText(h.render(),'계획 저장').props.onClick();assert.equal(h.reads.length,2);assert.equal(h.writes.length,2);assert.notEqual(h.writes[0].requestId,h.writes[1].requestId);assert.deepEqual(h.writes[0].item,h.writes[1].item);assert.equal(storeOf(h).status,'saved');
});
test('late ACK after navigation updates original record only; newer field values remain unsent',async()=>{
  const gate=deferred(),entered=deferred(),h=harness({active:true},{send:async command=>{entered.resolve();await gate.promise;return {status:'saved',item:{id:command.contentId,updated_at:'2026-10-21T12:00:00Z',meta:{brief:command.item.brief}}}}});
  enter(h,'전송한 A');const tree=h.render();const pending=byText(tree,'계획 저장').props.onClick();await entered.promise;
  planNode(tree).props.patchPlan('synthetic-personal-item',current=>({edits:{...current.edits,message:'더 새 A',angle:'새 관점'}}));
  h.unmount();h.select('synthetic-company-item');enter(h,'B 변경');gate.resolve();await pending;assert.equal(message(h.render()).props.value,'B 변경');h.select('synthetic-personal-item');assert.equal(message(h.render()).props.value,'더 새 A');assert.equal(byLabel(h.render(),'관점').props.value,'새 관점');assert.equal(leaveGuard(h.holder).prevented,1);
});
test('account inactive before GET resolves prevents a new POST and shared-ledger refresh',async()=>{
  const gate=deferred(),holder={active:true},h=harness(holder,{read:async()=>{await gate.promise;return {ok:true,json:async()=>normalize(fixture.details['synthetic-personal-item'])}}});
  enter(h,'계정 A 읽기 대기');const pending=byText(h.render(),'계획 저장').props.onClick();holder.active=false;gate.resolve();await pending;assert.equal(h.writes.length,0);assert.equal(h.refreshes,0);assert.equal(message(harness().render()).props.value,'');
});
test('account inactive after POST dispatch ignores late ACK and cannot start another save',async()=>{
  const gate=deferred(),entered=deferred(),holder={active:true},h=harness(holder,{send:async command=>{entered.resolve();await gate.promise;return {status:'saved',item:{id:command.contentId,updated_at:'2026-10-21T12:00:00Z',meta:{brief:command.item.brief}}}}});
  enter(h,'계정 A 전송 대기');const save=byText(h.render(),'계획 저장').props.onClick,pending=save();await entered.promise;assert.equal(h.writes.length,1);holder.active=false;gate.resolve();await pending;assert.notEqual(storeOf(h).status,'saved');assert.equal(h.refreshes,0);await save();assert.equal(h.reads.length,1);
});


test('lost ACK then board navigation retains the error and exact input', async () => {
  const h = harness({ active: true }, { send: async () => { throw new Error('synthetic ACK loss'); } });
  enter(h, '확인 안 된 입력'); await byText(h.render(), '계획 저장').props.onClick();
  h.render({ view: 'board' }); h.render({ view: 'make' });
  assert.equal(message(h.render()).props.value, '확인 안 된 입력');
  assert.equal(planNode(h.render()).props.plan.status, 'error');
});
test('actual provider warns while POST is pending even after plan subtree unmounts',async()=>{
  const gate=deferred(),entered=deferred(),h=harness({active:true},{send:async command=>{entered.resolve();await gate.promise;return {status:'saved',item:{id:command.contentId,updated_at:'2026-10-21T12:00:00Z',meta:{brief:command.item.brief}}}}});enter(h,'전송 중 입력');const pending=byText(h.render(),'계획 저장').props.onClick();await entered.promise;h.unmount();assert.equal(leaveGuard(h.holder).prevented,1);h.holder.active=true;gate.resolve();await pending;
});
test('saved memory shadow yields to a newer server record after returning',async()=>{
  const h=harness();enter(h,'ACK 확인 값');await byText(h.render(),'계획 저장').props.onClick();h.unmount();assert.equal(message(h.render()).props.value,'ACK 확인 값');h.ledger.items[0].brief.message='더 최신 서버 값';h.ledger.items[0].updatedAt='2026-10-21T13:00:00Z';assert.equal(message(h.render()).props.value,'더 최신 서버 값');
});
test('external store snapshots stay stable between changes and notify mounted subscribers only',()=>{
  const m=compile(file(STORE),{}),store=m.createContentPlanStore(),key=m.contentPlanKey(fixture.ledger.items[0]);let calls=0;const empty=store.get(key);assert.equal(store.get(key),empty);const stop=store.subscribe(()=>calls++);store.patch(key,{edits:{message:'구독 합성 입력'}});assert.notEqual(store.get(key),empty);assert.equal(calls,1);stop();store.patch(key,{edits:{}});assert.equal(calls,1);assert.equal(store.hasUnsentDrafts(),false);
});



function mountProvider() {
  let holder, effect;
  const listeners = new Map();
  const React = {
    createContext: () => ({ Provider: 'Provider' }),
    createElement: (type, props) => ({ type, props }),
    useState: initial => { holder ||= initial(); return [holder, () => {}]; },
    useEffect: fn => { effect = fn; },
  };
  const module = compile(file(PROVIDER), { react: React, './office-unload': pure('apps/hub/components/hub/office-unload.js'),
    __window: { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) } });
  module.OfficeSessionProvider({ children: null });
  return { holder, listeners, setup: () => effect() };
}

test('actual shell provider owns the active lifecycle through cleanup and effect replay', () => {
  const shell = mountProvider();
  assert.equal(shell.holder.active, false);
  assert.equal(shell.holder.store, null);
  const firstCleanup = shell.setup();
  assert.equal(shell.holder.active, true);
  assert.equal(shell.listeners.has('beforeunload'), true);
  firstCleanup();
  assert.equal(shell.holder.active, false);
  assert.equal(shell.listeners.size, 0);
  const secondCleanup = shell.setup();
  assert.equal(shell.holder.active, true);
  secondCleanup();
  assert.equal(shell.holder.active, false);
});

test('account-keyed shell replacement creates an empty holder and deactivates the old owner', () => {
  assert.match(file('apps/hub/components/hub/hub-app.jsx'), /<OfficeSessionProvider key=\{memoDraftContext\}/);
  const oldShell = mountProvider(), deactivate = oldShell.setup();
  enter(harness(oldShell.holder), '이전 소유자 초안');
  deactivate();
  const nextShell = mountProvider(), cleanup = nextShell.setup();
  assert.notEqual(nextShell.holder, oldShell.holder);
  assert.equal(oldShell.holder.active, false);
  assert.equal(message(harness(nextShell.holder).render()).props.value, '');
  cleanup();
});

test('adding plan drafts keeps the existing Office and registered mentor leave guards', () => {
  const unload = pure('apps/hub/components/hub/office-unload.js');
  const shell = mountProvider(), cleanup = shell.setup();
  let officeDirty = true, mentorDirty = false;
  shell.holder.store = { hasUnsentDrafts: () => officeDirty };
  const unregister = unload.registerOfficeUnloadStore({ hasUnsentDrafts: () => mentorDirty });
  const warns = () => { let prevented = 0; shell.listeners.get('beforeunload')({ preventDefault() { prevented++; } }); return prevented; };
  try {
    assert.equal(warns(), 1);
    officeDirty = false; mentorDirty = true;
    assert.equal(warns(), 1);
    mentorDirty = false;
    assert.equal(warns(), 0);
    enter(harness(shell.holder), '계획만 미저장');
    assert.equal(warns(), 1);
  } finally { unregister(); cleanup(); }
});
