import assert from 'node:assert/strict';
import { test } from 'node:test';
let client;
try { client = await import('./content-workflow-client.js'); } catch {}
const api = () => { assert.ok(client, 'content workflow client helpers must exist'); return client; };
const item = { id:'item-1',workspace_id:'ws-1',title:'기획 제목',source_idea:'처음 생각\n그대로',brand_id:'brand-1',next_action:'사례 추가',updated_at:'2026-09-12T00:00:00Z',meta:{brief:{audience:'강사',message:'복습 행동'},blocker:'evidence',primary_variant_id:'thread-2'} };
const variants = [
  {id:'thread-1',content_id:'item-1',variant_type:'x_thread',channel:'x',title:'첫 글',body:'첫 번째',updated_at:'2026-09-12T01:00:00Z'},
  {id:'thread-2',content_id:'item-1',variant_type:'x_thread',channel:'threads',title:'다른 글',body:'같은 말\n🙂 같은 말',updated_at:'2026-09-12T02:00:00Z'},
];
test('opens the requested variant or explicit primary without relying on array order', () => {
  const c=api();
  assert.equal(c.draftFromDetail({item,variants},'thread-1').variantId,'thread-1');
  assert.equal(c.draftFromDetail({item,variants}).variantId,'thread-2');
  assert.throws(()=>c.draftFromDetail({item,variants},'missing'), /결과물/);
  assert.throws(()=>c.draftFromDetail({item,variants:[{...variants[0],content_id:'other'}]},'thread-1'), /결과물/);
});
test('saved draft carries original source and shared brief independently of titles and channel', () => {
  const c=api(),draft=c.draftFromDetail({item,variants});
  const request=c.buildStudioSave({...draft,title:'새 기획 제목',variantTitle:'새 결과물 제목'},'request-1',true);
  assert.equal(request.item.sourceIdea,item.source_idea);
  assert.equal(request.item.brief.audience,'강사');
  assert.equal(request.variant.channel,'threads');
  assert.equal(request.variant.variantType,'x_thread');
  assert.equal(request.item.title,'새 기획 제목');
  assert.equal(request.variant.title,'새 결과물 제목');
  assert.equal(request.expectedVariantUpdatedAt,variants[1].updated_at);
});
test('selection offsets preserve the second identical phrase after an emoji', () => {
  const c=api(),body='같은 말\n🙂 같은 말';
  const start=body.lastIndexOf('같은 말');
  const selection=c.selectSource(body,start,body.length);
  assert.equal(selection.text,'같은 말');
  const source={body,prefix:selection.prefix,suffix:selection.suffix,selectionText:selection.text};
  assert.equal(c.previewCandidate(source,{body:'다른 말'}),'같은 말\n🙂 다른 말');
  assert.throws(()=>c.selectSource(body,-1,5), /선택/);
  assert.throws(()=>c.selectSource(body,2,body.length+1), /선택/);
});
test('a generation is stale after changing its source body or selected variant', () => {
  const c=api(),draft=c.draftFromDetail({item,variants});
  const run={source_snapshot:{variantId:draft.variantId,body:draft.body,variantUpdatedAt:draft.variantUpdatedAt}};
  assert.equal(c.isTransformStale(run,draft),false);
  assert.equal(c.isTransformStale(run,{...draft,body:draft.body+' 직접 수정'}),true);
  assert.equal(c.isTransformStale(run,{...draft,variantId:'thread-1'}),true);
});
test('save acknowledgment advances server versions but never discards edits made in flight', () => {
  const c=api(),sent=c.draftFromDetail({item,variants}),current={...sent,body:'저장 중 직접 쓴 문장'};
  const response={status:'saved',item:{...item,updated_at:'new-item'},variant:{...variants[1],body:sent.body,updated_at:'new-variant'}};
  const state=c.acknowledgeStudioSave(current,sent,response);
  assert.equal(state.draft.body,current.body);
  assert.equal(state.draft.variantUpdatedAt,'new-variant');
  assert.equal(state.dirty,true);
  assert.equal(c.acknowledgeStudioSave(sent,sent,response).dirty,false);
});
test('preview or successful HTTP without persisted rows is never treated as cloud saved', () => {
  const c=api();
  assert.equal(c.isDurableStudioSave({status:'preview',item,variant:variants[0]}),false);
  assert.equal(c.isDurableStudioSave({status:'saved'}),false);
  assert.equal(c.isDurableStudioSave({status:'duplicate',item,variant:variants[0]}),true);
});
test('browser mirrors isolate workspace and variant and preserve explicit new drafts', () => {
  const c=api();
  const base={workspaceId:'w1',contentId:'c1',variantId:'v1'};
  assert.notEqual(c.studioMirrorKey(base),c.studioMirrorKey({...base,variantId:'v2'}));
  assert.notEqual(c.studioMirrorKey(base),c.studioMirrorKey({...base,workspaceId:'w2'}));
  assert.notEqual(c.studioMirrorKey({...base,variantId:null,contentId:null,draftKey:'d1'}),c.studioMirrorKey({...base,variantId:null,contentId:null,draftKey:'d2'}));
});
test('export includes only accepted result content, never private source or brief', () => {
  const c=api();
  const draft={...c.emptyStudioDraft(),sourceIdea:'개인 메모 비밀',brief:{evidence:'고객 비밀'},body:'공개할 문장',variantTitle:'글 제목'};
  const exported=c.exportStudioVariant(draft);
  assert.equal(exported.text,'공개할 문장');
  assert.ok(!JSON.stringify(exported).includes('비밀'));
  const card=c.exportStudioVariant({...draft,variantType:'card_news',body:JSON.stringify({slides:[{id:'1',title:'표지',sub:'설명'}]})});
  assert.match(card.text,/표지/);
  assert.equal(card.extension,'json');
});
test('invalid structured content is flagged instead of silently replacing existing work', () => {
  const c=api();
  assert.throws(()=>c.parseStudioStructure('broken','card_news'), /구조/);
  assert.equal(c.parseStudioStructure('{"scenes":[{"id":"1","spoken":"대사"}]}','reels_script').scenes[0].spoken,'대사');
  assert.equal(c.formatForChannel('youtube_shorts'),'reels_script');
  assert.equal(c.formatForChannel('threads'),'threads_post');
});

test('opens a captured Threads idea and retains its distinct type on save', () => {
  const c = api();
  const capture = { id: 'capture', content_id: item.id, variant_type: 'threads_post', channel: null, body: '원문 소재', updated_at: '2026-09-14T00:00:00Z' };
  const draft = c.draftFromDetail({ item, variants: [capture] }, capture.id);
  assert.equal(draft.channel, 'threads');
  assert.equal(c.buildStudioSave(draft, 'save-capture').variant.variantType, 'threads_post');
  assert.equal(c.emptyStudioDraft().variantType, 'threads_post');
});
