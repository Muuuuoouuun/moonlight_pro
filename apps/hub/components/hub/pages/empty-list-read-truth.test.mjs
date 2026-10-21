import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { groupFollowups } from '../../../lib/sales-os/followup-groups.js';
import { contentQueueScope, contentQueueTabs } from '../../../lib/content-workflow.js';

function compile(file, name) {
  const source=readFileSync(new URL(file,import.meta.url),'utf8');
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
  const fn=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
  assert.ok(fn,`${name} production component exists`);
  return ts.transpileModule(fn.getText(ast).replace('export function','function'),{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
}
const inertReact={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:initial=>[typeof initial==='function'?initial():initial,()=>{}],useRef:value=>({current:value}),useMemo:fn=>fn(),useCallback:fn=>fn,useEffect(){}};
const find=(node,predicate)=>Array.isArray(node)?node.flatMap(child=>find(child,predicate)):node&&typeof node==='object'?[...(predicate(node)?[node]:[]),...find(node.props?.children,predicate)]:[];
function component(file,name,runtime,extras){
  const code=compile(file,name),deps={React:runtime,...extras};
  for(const match of code.matchAll(/React\.createElement\(([A-Z]\w*)/g)){
    if(deps[match[1]])continue;
    deps[match[1]]=runtime===React?()=>null:match[1];
  }
  if(runtime===React){
    deps.EmptyState=({title,description,action})=>React.createElement('section',null,title,description,action);
    deps.Button=({children})=>React.createElement('button',null,children);
    deps.Skeleton=({label})=>React.createElement('div',{'role':'status'},label);
    deps.ContactRow=({item})=>React.createElement('div',null,item.name);
    deps.SectionHead=({title})=>React.createElement('h3',null,title);
  }
  return new Function(...Object.keys(deps),`${code};return ${name};`)(...Object.values(deps));
}
function followups(syncState,items=[],runtime=React,reload=()=>{}){
  return component('./followups.jsx','Followups',runtime,{
    useToast:()=>({}),useFollowups:()=>({syncState,items,upcoming:[],dormant:[],week:null,failedSources:syncState==='partial'?['promises']:[],reload}),
    useCrmNudges:()=>({nudges:[]}),TIP_RULE_IDS:new Set(),useSearchParams:()=>new URLSearchParams(),useRouter:()=>({}),usePathname:()=>'/dashboard/revenue/followups',
    kstDayKey:()=> '2026-10-20',groupFollowups,rowKey:item=>`${item.kind}:${item.id}`,kbId:item=>`${item.kind}-${item.id}`,targetOf:item=>item,
    useCrmSelection:()=>({}),useCrmKeyboard(){},SOURCE_LABEL:{promises:'약속'},buildRecordQueue:()=>[],headerDate:()=> '10월 20일',MAX_DANGER_RAILS:3,
  });
}
function queue(syncState,rows=[],runtime=React,retry=()=>{}){
  return component('./content.jsx','Queue',runtime,{
    getWorkspace:()=>null,useRouter:()=>({push(){}}),useSearchParams:()=>new URLSearchParams(),useContentLedger:()=>({syncState,brands:[],queue:rows,tagTrends:[]}),
    filterBrandsByWorkspace:rows=>rows,filterContentByWorkspace:rows=>rows,contentQueueScope,contentQueueTabs,statusKeyOf:item=>item.statusKey,
    CONTENT_QUEUE_PAGE_SIZE:30,usePageCreateHotkey(){},readContentLedger:retry,
  });
}
const html=Component=>renderToStaticMarkup(React.createElement(Component,{}));

test('partial-empty Followups cannot promise there are no contacts due',()=>{
  const output=html(followups('partial'));
  assert.match(output,/오늘 약속을 모두 확인하지 못했/);
  assert.match(output,/실제 연락 약속이 있을 수 있습니다/);
  assert.match(output,/확인한 기록/);
  assert.match(output,/다시 읽기/);
  assert.doesNotMatch(output,/오늘 챙길 약속이 없어요|오늘 연락하기로 한 고객이 없어요/);
});

test('Followups retains verified empty and separate loading/error/preview states',()=>{
  assert.match(html(followups('live')),/오늘 챙길 약속이 없어요/);
  assert.match(html(followups('live')),/오늘 연락하기로 한 고객이 없어요/);
  for(const state of ['loading','error','preview']){
    const output=html(followups(state));
    assert.doesNotMatch(output,/오늘 챙길 약속이 없어요|오늘 연락하기로 한 고객이 없어요/);
  }
  assert.match(html(followups('loading')),/연락 목록 불러오는 중/);
  assert.match(html(followups('error')),/연락 목록을 읽지 못했습니다/);
});

test('Followups partial rows remain visible and explicit retry calls the read callback only',()=>{
  const row={kind:'lead',id:'synthetic-1',name:'합성 고객',bucket:'today',promisedAt:'2026-10-20T09:00:00+09:00'};
  // Use the production grouping contract; the fixture must actually enter a visible due group.
  const groups=groupFollowups([row]);assert.ok(groups.today.length+groups.missed.length>0);
  assert.match(html(followups('partial',[row])),/합성 고객/);
  let reads=0;const Page=followups('partial',[],inertReact,()=>reads++);
  const tree=Page({});assert.equal(reads,0);
  const state=find(tree,node=>node.type==='EmptyState'&&node.props.title==='오늘 약속을 모두 확인하지 못했습니다')[0];
  state.props.action.props.onClick();assert.equal(reads,1);
});

test('Content queue loading is a skeleton, not a zero count or empty list',()=>{
  const output=html(queue('loading'));
  assert.match(output,/콘텐츠 목록 확인 중/);
  assert.match(output,/콘텐츠 확인 중/);
  assert.doesNotMatch(output,/표시할 콘텐츠가 없습니다|0건 중 0건/);
});

test('Content queue only live confirms empty; partial/error/preview keep uncertainty explicit',()=>{
  assert.match(html(queue('live')),/표시할 콘텐츠가 없습니다/);
  for(const state of ['partial','error','preview']){
    const output=html(queue(state));
    assert.doesNotMatch(output,/표시할 콘텐츠가 없습니다/);
    assert.match(output,state==='preview'?/기록 연결 후/:/실제 콘텐츠가 비어 있다는 뜻은 아닙니다/);
  }
});

test('Content queue keeps partial rows visible and empty retry is explicit read-only',()=>{
  const row={id:'synthetic-content',title:'합성 원고',statusKey:'draft',channel:'test'};
  assert.match(html(queue('partial',[row])),/합성 원고/);
  let reads=0;const Page=queue('partial',[],inertReact,()=>reads++);
  const tree=Page({});assert.equal(reads,0);
  const state=find(tree,node=>node.type==='EmptyState')[0];state.props.action.props.onClick();assert.equal(reads,1);
});
