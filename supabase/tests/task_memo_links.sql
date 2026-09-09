-- Execute in a transaction after migration 0025; caller rolls back all fixtures.
do $$
declare w uuid; p uuid; n uuid; n2 uuid; wo uuid; a jsonb; b jsonb; t uuid; c int;
begin
  select workspace_id,id into w,p from public.projects limit 1;
  if p is null then raise exception 'test requires one project'; end if;
  insert into public.notes(workspace_id,project_id,title,body) values(w,p,'memo-link-test','preserve original') returning id into n;
  insert into public.notes(workspace_id,project_id,title,body) values(w,p,'memo-link-test-2','second') returning id into n2;
  a := public.link_memo_task_v1(w,'note',n,'create',null,'test task',p,null);
  assert a->>'status'='saved'; t := (a->>'taskId')::uuid;
  b := public.link_memo_task_v1(w,'note',n,'create',null,'retry changed title',p,null);
  assert b->>'status'='duplicate' and b->>'taskId'=a->>'taskId';
  assert (select body from public.notes where id=n)='preserve original';
  a := public.link_memo_task_v1(w,'note',n2,'link',t);
  assert a->>'status'='saved';
  b := public.link_memo_task_v1(w,'note',n2,'link',t);
  assert b->>'status'='duplicate';
  select count(*) into c from public.task_memo_links where task_id=t;
  assert c=2;
  a := public.link_memo_task_v1(gen_random_uuid(),'note',n,'link',t);
  assert a->>'error'='source-not-found';
  a := public.link_memo_task_v1(w,'note',n2,'link',gen_random_uuid());
  assert a->>'error'='task-not-found';
  a := public.link_memo_task_v1(w,'note',n2,'create',null,'invalid project',gen_random_uuid(),null);
  assert a->>'error'='project-not-found';
  insert into public.work_orders(workspace_id,persona,kind,title,body,status,gate,source)
    values(w,'inbox','capture','memo-link-test',jsonb_build_object('raw','capture original'),'proposed','needs_human','inbox') returning id into wo;
  a := public.link_memo_task_v1(w,'work_order',wo,'create',null,'capture task',p,null);
  assert a->>'status'='saved';
  b := public.link_memo_task_v1(w,'work_order',wo,'create',null,'capture task',p,null);
  assert b->>'status'='duplicate' and b->>'taskId'=a->>'taskId';
  assert (select body->>'raw' from public.work_orders where id=wo)='capture original';
end $$;
-- A failed relation insert must roll back the task created inside the RPC.
create function pg_temp.reject_test_memo_link() returns trigger language plpgsql as $$ begin raise exception 'test-link-failure'; end $$;
create trigger test_reject_memo_link before insert on public.task_memo_links for each row execute function pg_temp.reject_test_memo_link();
do $$
declare w uuid;p uuid;n uuid;before_count int;after_count int;
begin
  select workspace_id,id into w,p from public.projects limit 1;
  insert into public.notes(workspace_id,title) values(w,'atomic-test') returning id into n;
  select count(*) into before_count from public.tasks where workspace_id=w;
  begin
    perform public.link_memo_task_v1(w,'note',n,'create',null,'must rollback',p,null);
    raise exception 'expected-link-failure';
  exception when others then
    if sqlerrm <> 'test-link-failure' then raise; end if;
  end;
  select count(*) into after_count from public.tasks where workspace_id=w;
  assert before_count=after_count;
end $$;
drop trigger test_reject_memo_link on public.task_memo_links;
