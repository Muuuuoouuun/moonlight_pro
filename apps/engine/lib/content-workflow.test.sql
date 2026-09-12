-- Run with psql -v ON_ERROR_STOP=1 against a disposable database after migrations.
-- Everything is rolled back; no hosted project is used by this contract test.
begin;
do $$
declare
  w uuid := gen_random_uuid();
  foreign_w uuid := gen_random_uuid();
  request_id uuid := gen_random_uuid();
  c jsonb; r jsonb; previous jsonb; checkpoint jsonb; branch jsonb; source_version text;
  source_id uuid; item_id uuid; run_id uuid := gen_random_uuid();
  revision_id uuid; before_count integer; foreign_brand uuid := gen_random_uuid(); empty_id uuid := gen_random_uuid(); empty_item jsonb;
begin
  insert into workspaces(id, name, slug) values (w, 'Workflow test', 'workflow-' || w), (foreign_w, 'Other test', 'workflow-' || foreign_w);
  insert into brands(id,workspace_id,name,slug) values(foreign_brand,foreign_w,'Foreign brand','foreign');
  c := jsonb_build_object('action','save','item',jsonb_build_object('brandId',foreign_brand,'sourceIdea','not saved'),
    'variant',jsonb_build_object('body','not saved','variantType','x_thread','channel','threads'));
  r := public.content_workflow_v1(w,gen_random_uuid(),'foreign-brand',c);
  assert r->>'status'='invalid-input' and r->>'error'='brand-not-found',r::text;
  assert (select count(*) from content_items where workspace_id=w)=0;
  c := c || jsonb_build_object('item','{}'::jsonb,'variant',jsonb_build_object('body','not saved','variantType','card_news','channel','x'));
  r := public.content_workflow_v1(w,gen_random_uuid(),'invalid-channel',c);
  assert r->>'status'='invalid-input',r::text;
  assert (select count(*) from content_items where workspace_id=w)=0;
  insert into content_items(id,workspace_id,title,source_idea,status) values(empty_id,w,'기존 아이디어','보존할 원문','idea');
  select to_jsonb(ci) into empty_item from content_items ci where id=empty_id;
  c := jsonb_build_object('action','save','contentId',empty_id,'variantId',null,
    'expectedItemUpdatedAt',empty_item->>'updated_at','expectedVariantUpdatedAt',null,
    'item','{}'::jsonb,'variant',jsonb_build_object('body','첫 초안','variantType','x_thread','channel','threads'));
  update content_items set brand_id=foreign_brand where id=empty_id;
  select to_jsonb(ci) into empty_item from content_items ci where id=empty_id;
  c := jsonb_set(c,'{expectedItemUpdatedAt}',empty_item->'updated_at');
  r := public.content_workflow_v1(w,gen_random_uuid(),'existing-foreign-brand',c);
  assert r->>'status'='invalid-input' and r->>'error'='parent-brand-mismatch',r::text;
  assert (select count(*) from content_variants where content_id=empty_id)=0;
  update content_items set brand_id=null where id=empty_id;
  select to_jsonb(ci) into empty_item from content_items ci where id=empty_id;
  c := jsonb_set(c,'{expectedItemUpdatedAt}',empty_item->'updated_at');
  r := public.content_workflow_v1(w,gen_random_uuid(),'first-variant',c);
  assert r->>'status'='saved' and r->>'contentId'=empty_id::text and r->>'variantId' is not null, r::text;
  assert r#>>'{item,source_idea}'='보존할 원문';
  assert (select count(*) from content_variants where content_id=empty_id)=1;
  c := jsonb_build_object('action', 'save', 'contentId', null, 'variantId', null,
    'item', jsonb_build_object('sourceIdea', '  원문  ', 'brief', jsonb_build_object('audience', '독자'), 'blocker', '근거'),
    'variant', jsonb_build_object('body', '앞🙂선택뒤', 'variantType', 'x_thread', 'channel', 'threads'));
  r := public.content_workflow_v1(w, request_id, 'create-hash', c);
  assert r->>'status' = 'saved', r::text;
  assert r#>>'{item,source_idea}' = '  원문  ';
  item_id := (r->>'contentId')::uuid; source_id := (r->>'variantId')::uuid;
  assert item_id is not null and source_id is not null;
  previous := r;
  r := public.content_workflow_v1(w, request_id, 'create-hash', c);
  assert r->>'status' = 'duplicate' and r->'item' = previous->'item' and r->'variant' = previous->'variant', r::text;
  r := public.content_workflow_v1(w, request_id, 'different-hash', c);
  assert r->>'status' = 'conflict', r::text;
  update content_variants set status='ready',visibility='public',excerpt='설명',summary='요약',
    seo_title='검색 제목',seo_description='검색 설명',meta='{"custom":{"keep":true}}'::jsonb where id=source_id;
  select to_jsonb(cv) into c from content_variants cv where id=source_id;
  previous := previous || jsonb_build_object('variant',c);
  update content_items set meta = meta || '{"unrelated":{"keep":true}}'::jsonb where id = item_id;
  select to_jsonb(ci) into c from content_items ci where id = item_id;
  previous := previous || jsonb_build_object('item', c);
  c := jsonb_build_object('action', 'save', 'contentId', item_id, 'variantId', source_id,
    'expectedItemUpdatedAt', previous#>>'{item,updated_at}', 'expectedVariantUpdatedAt', previous#>>'{variant,updated_at}',
    'item', jsonb_build_object('title', '제목 수정', 'nextAction', '이어쓰기', 'brief', jsonb_build_object('message', '핵심')), 'variant', '{}'::jsonb);
  r := public.content_workflow_v1(w, gen_random_uuid(), 'title-hash', c);
  assert r->>'status' = 'saved', r::text;
  assert r#>>'{item,source_idea}' = '  원문  ' and r#>>'{item,next_action}' = '이어쓰기';
  assert r#>>'{item,meta,brief,audience}' = '독자' and r#>>'{item,meta,brief,message}' = '핵심';
  assert r#>>'{item,meta,unrelated,keep}' = 'true';
  assert r->'variant' = previous->'variant', 'source-only save changed the variant';
  assert r#>>'{variant,status}'='ready' and r#>>'{variant,variant_type}'='x_thread';
  previous := r;
  c := c || jsonb_build_object('expectedItemUpdatedAt', r#>>'{item,updated_at}', 'item', jsonb_build_object('sourceIdea', ''), 'checkpoint', true);
  r := public.content_workflow_v1(w, gen_random_uuid(), 'clear-hash', c);
  assert r->>'status' = 'saved' and r#>>'{item,source_idea}' = '', r::text;
  checkpoint := r; revision_id := (r->>'revisionId')::uuid;
  assert revision_id is not null;
  c := c || jsonb_build_object('expectedItemUpdatedAt', previous#>>'{item,updated_at}', 'item', jsonb_build_object('sourceIdea', 'must not save'));
  r := public.content_workflow_v1(w, gen_random_uuid(), 'stale-item', c);
  assert r->>'status' = 'conflict', r::text;
  assert (select source_idea from content_items where id = item_id) = '';
  c := c || jsonb_build_object('expectedItemUpdatedAt', checkpoint#>>'{item,updated_at}', 'expectedVariantUpdatedAt', '2000-01-01T00:00:00Z');
  r := public.content_workflow_v1(w, gen_random_uuid(), 'stale-variant', c);
  assert r->>'status' = 'conflict', r::text;
  r := public.content_workflow_v1(foreign_w, gen_random_uuid(), 'foreign-parent', c);
  assert r->>'status' = 'invalid-input', r::text;

  c := jsonb_build_object('action', 'create_variant', 'contentId', item_id, 'variantId', source_id,
    'expectedItemUpdatedAt', checkpoint#>>'{item,updated_at}', 'expectedVariantUpdatedAt', checkpoint#>>'{variant,updated_at}',
    'variant', jsonb_build_object('title', '파생', 'body', '카드', 'variantType', 'card_news', 'channel', 'instagram'));
  r := public.content_workflow_v1(w, gen_random_uuid(), 'branch', c);
  assert r->>'status' = 'saved' and (r->>'variantId')::uuid <> source_id, r::text;
  assert r#>>'{variant,meta,parent_variant_id}' = source_id::text;
  assert r#>>'{variant,meta,parent_revision_id}' is not null;
  assert jsonb_array_length(r#>'{variant,meta,source_refs}') > 0;
  branch := r;
  assert (select body from content_variants where id = source_id) = '앞🙂선택뒤';

  insert into content_transform_runs(id,workspace_id,content_id,variant_id,request_hash,operation,source_snapshot,result,status)
  values(run_id,w,item_id,source_id,'ai-hash','polish',
    jsonb_build_object('contentId',item_id,'variantId',source_id,'variantUpdatedAt',checkpoint#>>'{variant,updated_at}','itemUpdatedAt',checkpoint#>>'{item,updated_at}',
      'body','앞🙂선택뒤','prefix','앞🙂','selectionText','선택','suffix','뒤'),
    '{"candidates":[{"id":"candidate-1","title":"후보","body":"개선","variantType":"x_thread","channel":"threads","summary":"개선","missing":[]}]}'::jsonb,'succeeded');
  c := jsonb_build_object('action','apply_candidate','contentId',item_id,'variantId',source_id,
    'expectedItemUpdatedAt',checkpoint#>>'{item,updated_at}','expectedVariantUpdatedAt',checkpoint#>>'{variant,updated_at}',
    'runId',run_id,'candidateId','candidate-1','mode','replace');
  update content_transform_runs set source_snapshot=jsonb_set(source_snapshot,'{prefix}','"wrong"'::jsonb) where id=run_id;
  r := public.content_workflow_v1(w,gen_random_uuid(),'invalid-prefix',c);
  assert r->>'status'='conflict' and r->>'error'='transform-selection-mismatch', r::text;
  assert (select body from content_variants where id=source_id)='앞🙂선택뒤';
  update content_transform_runs set source_snapshot=jsonb_set(source_snapshot,'{prefix}','"앞🙂"'::jsonb) where id=run_id;
  update content_transform_runs set operation='repurpose' where id=run_id;
  r := public.content_workflow_v1(w,gen_random_uuid(),'repurpose-overwrite',c);
  assert r->>'status'='invalid-input' and r->>'error'='repurpose-requires-new-variant',r::text;
  update content_transform_runs set operation='polish',result=jsonb_set(result,'{candidates,0,channel}','"x"'::jsonb) where id=run_id;
  r := public.content_workflow_v1(w,gen_random_uuid(),'incompatible-overwrite',c);
  assert r->>'status'='invalid-input' and r->>'error'='candidate-format-mismatch',r::text;
  update content_transform_runs set result=jsonb_set(result,'{candidates,0,channel}','"threads"'::jsonb) where id=run_id;
  update content_items set meta=meta || '{"brief":{"message":"새 기획"}}'::jsonb where id=item_id;
  select to_jsonb(ci) into empty_item from content_items ci where id=item_id;
  c := jsonb_set(c,'{expectedItemUpdatedAt}',empty_item->'updated_at');
  r := public.content_workflow_v1(w,gen_random_uuid(),'stale-brief',c);
  assert r->>'status'='conflict' and r->>'error'='stale-transform-source',r::text;
  update content_transform_runs set source_snapshot=jsonb_set(source_snapshot,'{itemUpdatedAt}',empty_item->'updated_at') where id=run_id;
  c := c || '{"variant":{"body":"client body must be ignored"}}'::jsonb;
  r := public.content_workflow_v1(w,gen_random_uuid(),'apply',c);
  assert r->>'status' = 'saved' and r#>>'{variant,body}' = '앞🙂개선뒤', r::text;
  previous := r;
  select count(*) into before_count from content_revisions where workspace_id=w;
  r := public.content_workflow_v1(w,gen_random_uuid(),'double-apply',c);
  assert r->>'status' = 'duplicate' and r->>'variantId' = source_id::text, r::text;
  assert r->'variant' = previous->'variant';
  assert (select count(*) from content_revisions where workspace_id=w) = before_count;
  assert (select body from content_variants where id=(branch->>'variantId')::uuid) = '카드';

  c := jsonb_build_object('action','restore_revision','contentId',item_id,'variantId',source_id,
    'expectedItemUpdatedAt',previous#>>'{item,updated_at}','expectedVariantUpdatedAt',previous#>>'{variant,updated_at}', 'revisionId',revision_id);
  r := public.content_workflow_v1(w,gen_random_uuid(),'restore',c);
  assert r->>'status'='saved' and r#>>'{variant,body}' = checkpoint#>>'{variant,body}', r::text;
  assert (r->'variant') - 'updated_at' = (checkpoint->'variant') - 'updated_at', 'restore must reproduce variant fields';
  assert r#>>'{item,source_idea}' = '' and r#>>'{item,meta,brief,message}' = '새 기획';
  assert r->>'revisionId' <> revision_id::text;
  previous := r;
  insert into content_transform_runs(id,workspace_id,content_id,variant_id,request_hash,operation,source_snapshot,result,status)
    select gen_random_uuid(),workspace_id,content_id,variant_id,'stale-hash',operation,source_snapshot,result-'applications',status
    from content_transform_runs where id=run_id returning id into run_id;
  c := jsonb_build_object('action','apply_candidate','contentId',item_id,'variantId',source_id,
    'expectedItemUpdatedAt',previous#>>'{item,updated_at}','expectedVariantUpdatedAt',previous#>>'{variant,updated_at}',
    'runId',run_id,'candidateId','candidate-1','mode','replace');
  r := public.content_workflow_v1(w,gen_random_uuid(),'stale-ai-source',c);
  assert r->>'status'='conflict' and r->>'error'='stale-transform-source', r::text;
  c := c || jsonb_build_object('action','create_variant','variantId',(select id from content_variants where content_id=empty_id limit 1),
    'variant',jsonb_build_object('body','bad parent','variantType','x_thread','channel','threads'));
  r := public.content_workflow_v1(w,gen_random_uuid(),'foreign-relationship',c);
  assert r->>'status'='invalid-input' and r->>'error'='variant-not-found', r::text;
end $$;
do $$
declare
  w uuid := gen_random_uuid(); c jsonb; r jsonb; v jsonb; run_id uuid := gen_random_uuid();
begin
  insert into workspaces(id,name,slug) values(w,'Legacy test','legacy-' || w);
  r := content_workflow_v1(w,gen_random_uuid(),'legacy-create',
    '{"action":"save","variant":{"body":"레거시 초안","variantType":"x_thread","channel":"x"}}'::jsonb);
  update content_variants set channel=null where id=(r->>'variantId')::uuid returning to_jsonb(content_variants.*) into v;
  insert into content_transform_runs(id,workspace_id,content_id,variant_id,request_hash,operation,source_snapshot,result,status)
  values(run_id,w,(r->>'contentId')::uuid,(r->>'variantId')::uuid,'legacy-ai','polish',
    jsonb_build_object('contentId',r->>'contentId','variantId',r->>'variantId','itemUpdatedAt',r#>>'{item,updated_at}',
      'variantUpdatedAt',v->>'updated_at','body','레거시 초안','prefix','','selectionText','레거시 초안','suffix',''),
    '{"candidates":[{"id":"candidate-1","title":"후보","body":"다듬은 레거시","variantType":"x_thread","channel":"x","summary":"개선","missing":[]}]}'::jsonb,'succeeded');
  c := jsonb_build_object('action','apply_candidate','contentId',r->>'contentId','variantId',r->>'variantId',
    'expectedItemUpdatedAt',r#>>'{item,updated_at}','expectedVariantUpdatedAt',v->>'updated_at','runId',run_id,'candidateId','candidate-1','mode','replace');
  r := content_workflow_v1(w,gen_random_uuid(),'legacy-apply',c);
  assert r->>'status'='saved' and r#>>'{variant,body}'='다듬은 레거시',r::text;
end $$;
do $$
declare
  w uuid := gen_random_uuid(); c jsonb; r jsonb; run_id uuid := gen_random_uuid();
begin
  insert into workspaces(id,name,slug) values(w,'Draft lifecycle test','draft-life-' || w);
  r := content_workflow_v1(w,gen_random_uuid(),'note-create',
    '{"action":"save","item":{"sourceIdea":"새 메모"},"variant":{"title":"","body":"","variantType":"x_thread","channel":"threads"}}'::jsonb);
  assert r#>>'{item,status}'='idea',r::text;
  insert into content_transform_runs(id,workspace_id,content_id,variant_id,request_hash,operation,source_snapshot,result,status)
  values(run_id,w,(r->>'contentId')::uuid,(r->>'variantId')::uuid,'note-ai','draft',
    jsonb_build_object('contentId',r->>'contentId','variantId',r->>'variantId','itemUpdatedAt',r#>>'{item,updated_at}',
      'variantUpdatedAt',r#>>'{variant,updated_at}','body','','prefix','','selectionText','','suffix',''),
    '{"candidates":[{"id":"candidate-1","title":"완성된 초안 제목","body":"첫 초안 본문","variantType":"x_thread","channel":"threads","summary":"초안 작성","missing":[]}]}'::jsonb,'succeeded');
  c := jsonb_build_object('action','apply_candidate','contentId',r->>'contentId','variantId',r->>'variantId',
    'expectedItemUpdatedAt',r#>>'{item,updated_at}','expectedVariantUpdatedAt',r#>>'{variant,updated_at}','runId',run_id,'candidateId','candidate-1','mode','replace');
  r := content_workflow_v1(w,gen_random_uuid(),'note-apply',c);
  assert r->>'status'='saved' and r#>>'{item,status}'='draft',r::text;
  assert r#>>'{variant,title}'='완성된 초안 제목',r::text;
  assert r#>>'{item,source_idea}'='새 메모',r::text;
end $$;
rollback;
