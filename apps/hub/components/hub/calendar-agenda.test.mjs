import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CalendarAgenda, orderedAgendaEvents } from './calendar-agenda.jsx';
import { mapGoogleEventsToGrid } from '../../lib/calendar-event-view.js';
import { CALENDAR_COMPACT_QUERY, resolveCalendarView, useCalendarCompactView } from './calendar-view.js';

const day=new Date(2026,9,20,12);
const provider=(id,start,end,extra={})=>({id,outcomeKey:`synthetic:${id}`,title:id,start,end,...extra});
const project=events=>mapGoogleEventsToGrid(events,[day]);
const render=(events=[],state='live',props={})=>renderToStaticMarkup(React.createElement(CalendarAgenda,{events,tasks:[],calendarState:state,taskState:'live',onSelectEvent(){},...props}));
const find=(node,predicate)=>Array.isArray(node)?node.flatMap(child=>find(child,predicate)):node&&typeof node==='object'?[...(predicate(node)?[node]:[]),...find(node.props?.children,predicate)]:[];

test('Agenda sorts all-day then timed rows, preserves originals and shows every supplied row',()=>{
  const raw=[provider('late','2026-10-20T23:30:00','2026-10-20T23:45:00'),provider('early','2026-10-20T07:00:00','2026-10-20T07:30:00'),provider('all-day','2026-10-20','2026-10-21',{allDay:true})];
  const segments=project(raw),before=[...segments];
  assert.deepEqual(orderedAgendaEvents(segments).map(row=>row.id),['all-day','early','late']);assert.deepEqual(segments,before);
  const html=render(segments);assert.match(html,/종일/);assert.match(html,/7:00 – 7:30/);assert.match(html,/23:30 – 23:45/);assert.doesNotMatch(html,/8:00 – 9:00|진행 중|완료됨/);
  const many=project(Array.from({length:100},(_,i)=>provider(`meeting-${i}`,`2026-10-20T09:${String(i%60).padStart(2,'0')}:00`,`2026-10-20T10:${String(i%60).padStart(2,'0')}:00`)));
  assert.equal((render(many).match(/class="calendar-agenda__event hub-row"/g)||[]).length,100);
});

test('Agenda uses exclusive all-day ends and original prior-date context for carry-over events',()=>{
  const events=project([provider('carry','2026-10-19T23:00:00','2026-10-20T01:00:00'),provider('excluded','2026-10-18','2026-10-20',{allDay:true})]);
  assert.deepEqual(events.map(row=>row.id),['carry']);
  assert.match(render(events),/2026-10-19 23:00 – 2026-10-20 1:00/);
});

test('Agenda distinguishes loading, partial, error, preview and confirmed empty',()=>{
  assert.match(render([],'live'),/선택한 날짜에 일정이 없습니다/);
  for(const state of ['loading','partial','error','preview'])assert.doesNotMatch(render([],state),/선택한 날짜에 일정이 없습니다/);
  assert.match(render([],'loading'),/일정 목록 확인 중/);
  assert.match(render([],'partial'),/일정을 모두 확인하지 못했습니다/);
  assert.match(render([],'error'),/일정 목록을 읽지 못했습니다/);
  assert.match(render([],'preview'),/캘린더 연결 후/);
  assert.match(render(project([provider('kept','2026-10-20T09:00:00','2026-10-20T10:00:00')]),'partial'),/확인한 .*일정 1건|확인한 일정 1건/);
});

test('Agenda event/task callbacks preserve original identities and partial retry is explicit',()=>{
  const events=project([provider('original/id','2026-10-20T09:00:00','2026-10-20T09:15:00')]);
  const calls=[],tree=CalendarAgenda({events,tasks:[{id:'task/id',title:'합성 할 일'}],calendarState:'partial',taskState:'partial',onSelectEvent:event=>calls.push(event),onNavigate:path=>calls.push(path)});
  find(tree,node=>node.type==='button').forEach(button=>button.props.onClick());
  assert.equal(calls[0],events[0]);assert.equal(calls[0].outcomeKey,'synthetic:original/id');assert.equal(calls[1],'dashboard/work/my?task=task%2Fid');
  let retries=0;const empty=CalendarAgenda({events:[],tasks:[],calendarState:'partial',taskState:'live',onRetry:()=>retries++});
  assert.equal(retries,0);find(empty,node=>node.props?.action)[0].props.action.props.onClick();assert.equal(retries,1);
});

test('view resolver preserves all explicit modes and desktop fallback, including invalid stored-like input',()=>{
  assert.equal(CALENDAR_COMPACT_QUERY,'(max-width: 720px)');
  for(const compact of [true,false])for(const choice of ['agenda','day','week'])assert.equal(resolveCalendarView(choice,compact),choice);
  assert.equal(resolveCalendarView(null,true),'agenda');assert.equal(resolveCalendarView(null,false),'week');assert.equal(resolveCalendarView('invalid',true),'agenda');
  const Probe=()=>React.createElement('span',null,resolveCalendarView(null,useCalendarCompactView()));
  assert.equal(renderToStaticMarkup(React.createElement(Probe)),'<span>week</span>','SSR fallback is deterministic; this does not certify hydration pixels');
});

test('viewport subscription uses the compact media query and releases its listener',()=>{
  const source=readFileSync(new URL('./calendar-view.js',import.meta.url),'utf8').replace(/^import React[^\n]+\n/m,'').replace(/\bexport /g,'');
  let listener,removed,query;const media={matches:true,addEventListener(type,fn){assert.equal(type,'change');listener=fn;},removeEventListener(type,fn){removed=fn;}};
  const fakeWindow={matchMedia(value){query=value;return media;}};
  let updates=0,unsubscribe;
  const runtime={useSyncExternalStore(subscribe,snapshot,serverSnapshot){assert.equal(serverSnapshot(),false);unsubscribe=subscribe(()=>updates++);return snapshot();}};
  const hook=new Function('React','window',`${source}; return useCalendarCompactView;`)(runtime,fakeWindow);
  assert.equal(hook(),true);assert.equal(query,CALENDAR_COMPACT_QUERY);media.matches=false;listener();assert.equal(updates,1);unsubscribe();assert.equal(removed,listener);
});

test('Agenda source has vertical wrapping and 44px controls, without a timed-grid minimum width',()=>{
  const css=readFileSync(new URL('./calendar-agenda.css',import.meta.url),'utf8');
  assert.match(css,/min-height: 44px/);assert.match(css,/overflow-wrap: anywhere/);assert.match(css,/@media \(max-width: 720px\)/);assert.doesNotMatch(css,/min-width: (?:320|896|900)px/);
});
