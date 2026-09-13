import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../components/hub/pages/use-memo-search.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
const load = new Function('React', 'MEMO_CHANGED_EVENT', source + '\nreturn useMemoSearch;');
function harness(t) {
  const originalFetch=globalThis.fetch, originalWindow=globalThis.window;
  globalThis.window=new EventTarget(); const requests=[];
  globalThis.fetch=(url,options)=>new Promise(resolve=>requests.push({url,signal:options.signal,resolve:data=>resolve({ok:true,json:async()=>data})}));
  const cells=[];let cursor=0,effects=[],dirty=false,model,query='q=first';
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  const React={
    useState(initial){const i=cursor++;if(!cells[i])cells[i]={value:initial};return[cells[i].value,v=>{cells[i].value=typeof v==='function'?v(cells[i].value):v;dirty=true;}];},
    useRef(value){const i=cursor++;return cells[i]||={current:value};},
    useCallback(fn,deps){const i=cursor++;if(!cells[i]||!same(cells[i].deps,deps))cells[i]={deps,value:fn};return cells[i].value;},
    useEffect(fn,deps){const i=cursor++,prior=cells[i];if(!prior||!same(prior.deps,deps)){cells[i]={deps,cleanup:prior?.cleanup};effects.push(()=>{cells[i].cleanup?.();cells[i].cleanup=fn();});}},
  };
  const hook=load(React,'moonlight:memos-saved');
  function render(next=query){query=next;do{dirty=false;cursor=0;effects=[];model=hook(query);for(const fn of effects)fn();}while(dirty);return model;}
  const unmount=()=>cells.forEach(cell=>cell.cleanup?.());
  t.after(()=>{unmount();globalThis.fetch=originalFetch;if(originalWindow===undefined)delete globalThis.window;else globalThis.window=originalWindow;});
  render();return {render,requests,get:()=>model,unmount};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const live=(entries,nextCursor=null)=>({status:'live',entries,nextCursor});
test('stale search cannot replace newer results and same query rerenders do not refetch',async t=>{
 const h=harness(t);h.render('q=second');assert.equal(h.requests[0].signal.aborted,true);
 h.requests[1].resolve(live([{id:'second'}]));await tick();h.render();
 h.requests[0].resolve(live([{id:'first'}]));await tick();h.render();
 assert.deepEqual(h.get().entries,[{id:'second'}]);assert.equal(h.requests.length,2);
});
test('load more deduplicates and a read error envelope is never an empty success',async t=>{
 const h=harness(t);h.requests[0].resolve(live([{id:'a'}],'cursor'));await tick();h.render();
 const more=h.get().more();h.render();h.requests[1].resolve(live([{id:'a'},{id:'b'}]));await more;h.render();
 assert.deepEqual(h.get().entries,[{id:'a'},{id:'b'}]);
 h.render('q=failed');h.requests[2].resolve({status:'error',message:'read failed',entries:[]});await tick();h.render();
 assert.equal(h.get().status,'error');assert.equal(h.get().error,'read failed');
});
test('leaving the page aborts an in-flight more request',async t=>{
 const h=harness(t);h.requests[0].resolve(live([{id:'a'}],'cursor'));await tick();h.render();
 h.get().more();h.render();h.unmount();assert.equal(h.requests[1].signal.aborted,true);
});
test('save refresh keeps visible rows and refetches the loaded extent',async t=>{
 const h=harness(t);h.requests[0].resolve(live([{id:'a'}],'cursor1'));await tick();h.render();
 const more=h.get().more();h.render();h.requests[1].resolve(live([{id:'b'}]));await more;h.render();
 window.dispatchEvent(new Event('moonlight:memos-saved'));h.render();
 assert.equal(h.get().status,'live');assert.deepEqual(h.get().entries,[{id:'a'},{id:'b'}]);
 h.requests[2].resolve(live([{id:'a',title:'updated'}],'cursor2'));await tick();h.render();
 assert.equal(h.requests.length,4);assert.deepEqual(h.get().entries,[{id:'a'},{id:'b'}]);
 h.requests[3].resolve(live([{id:'b'}]));await tick();h.render();assert.deepEqual(h.get().entries,[{id:'a',title:'updated'},{id:'b'}]);
});
