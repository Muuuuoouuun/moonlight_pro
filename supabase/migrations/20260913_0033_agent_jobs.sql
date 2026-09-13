-- Optional local SDK execution queue. Requires workspaces and agent_runs.
-- Agent/worker credentials stay at Hub/Engine; only service_role may call RPCs.
create table if not exists public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id text not null check (length(actor_id) between 1 and 128),
  request_id uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  project_id text not null check (length(project_id) between 1 and 100),
  mode text not null check (mode in ('read','draft','apply')),
  runtime text not null default 'codex-sdk-0.154.0',
  model text,
  state text not null default 'queued' check (state in ('queued','running','succeeded','failed','cancelled','needs_attention')),
  prompt text not null check (octet_length(prompt) between 1 and 16384),
  context_refs jsonb not null default '[]' check (jsonb_typeof(context_refs)='array' and jsonb_array_length(context_refs)<=8),
  budget jsonb not null,
  thread_id text,
  checkpoint jsonb not null default '{}' check (octet_length(checkpoint::text)<=8192),
  usage jsonb,
  usage_reason text not null default 'not-reported',
  result jsonb,
  error text,
  attempt integer not null default 0,
  turn_count integer not null default 1,
  lease_owner text,
  lease_token uuid,
  lease_expires_at timestamptz,
  cancel_requested_at timestamptz,
  event_seq bigint not null default 0,
  run_id uuid references public.agent_runs(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  started_at timestamptz,
  finished_at timestamptz,
  unique(workspace_id,actor_id,request_id)
);
create index if not exists agent_jobs_queue on public.agent_jobs(workspace_id,state,created_at,id);
create index if not exists agent_jobs_actor on public.agent_jobs(workspace_id,actor_id,created_at desc);
create table if not exists public.agent_job_events (
  job_id uuid not null references public.agent_jobs(id) on delete cascade,
  seq bigint not null,
  event_key text not null,
  type text not null,
  payload jsonb not null default '{}' check (octet_length(payload::text)<=20000),
  created_at timestamptz not null default clock_timestamp(),
  primary key(job_id,seq),
  unique(job_id,event_key)
);
create table if not exists public.agent_workers (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  worker_id text not null,
  projects jsonb not null default '[]',
  last_heartbeat_at timestamptz not null default clock_timestamp(),
  primary key(workspace_id,worker_id)
);
alter table public.agent_jobs enable row level security;
alter table public.agent_job_events enable row level security;
alter table public.agent_workers enable row level security;
revoke all on public.agent_jobs,public.agent_job_events,public.agent_workers from public,anon,authenticated;
grant all on public.agent_jobs,public.agent_job_events,public.agent_workers to service_role;

create or replace function public.agent_job_public_v1(j public.agent_jobs) returns jsonb language sql stable set search_path=public,pg_temp as $$
 select jsonb_build_object('id',j.id,'projectId',j.project_id,'mode',j.mode,'runtime',j.runtime,'model',j.model,
 'state',j.state,'promptSummary',left(j.prompt,180),'threadId',j.thread_id,'contextRefs',j.context_refs,
 'budget',j.budget,'attempt',j.attempt,'turnCount',j.turn_count,'checkpoint',j.checkpoint,'usage',j.usage,
 'usageReason',j.usage_reason,'result',j.result,'error',j.error,'cancelRequestedAt',j.cancel_requested_at,
 'createdAt',j.created_at,'updatedAt',j.updated_at,'startedAt',j.started_at,'finishedAt',j.finished_at,
 'leaseExpiresAt',j.lease_expires_at,'lastEventSeq',j.event_seq,'runId',j.run_id)
$$;

create or replace function public.agent_job_emit_v1(p_id uuid,p_key text,p_type text,p_payload jsonb) returns bigint
language plpgsql security definer set search_path=public,pg_temp as $$
declare n bigint;
begin
 select seq into n from agent_job_events where job_id=p_id and event_key=p_key;
 if found then return n; end if;
 update agent_jobs set event_seq=event_seq+1,updated_at=clock_timestamp() where id=p_id returning event_seq into n;
 insert into agent_job_events(job_id,seq,event_key,type,payload) values(p_id,n,p_key,p_type,p_payload);
 return n;
end $$;

create or replace function public.agent_jobs_reap_v1(p_workspace uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare j agent_jobs;
begin
 for j in select * from agent_jobs where workspace_id=p_workspace and state='running' and lease_expires_at<=clock_timestamp() for update loop
   update agent_jobs set state=case when mode='read' and attempt<2 and cancel_requested_at is null then 'queued' else 'needs_attention' end,
    error='worker-lease-expired',lease_expires_at=null,lease_token=null,lease_owner=null,updated_at=clock_timestamp() where id=j.id;
   perform agent_job_emit_v1(j.id,'expired:'||j.turn_count||':'||j.attempt,'job.lease_expired',jsonb_build_object('retryable',j.mode='read' and j.attempt<2 and j.cancel_requested_at is null));
 end loop;
end $$;

create or replace function public.agent_jobs_v1(p_workspace_id uuid,p_actor_id text,p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare j agent_jobs; w agent_workers; available jsonb; online boolean; rows jsonb; n bigint; count_limit integer; rec jsonb;
begin
 if p_workspace_id is null or length(coalesce(p_actor_id,'')) not between 1 and 128 or jsonb_typeof(p_input)<>'object' then
  return jsonb_build_object('status','error','code','invalid-input','error','invalid-input'); end if;
 perform pg_advisory_xact_lock(hashtextextended('agent-jobs:'||p_workspace_id::text,0));
 perform agent_jobs_reap_v1(p_workspace_id);
 select * into w from agent_workers where workspace_id=p_workspace_id order by last_heartbeat_at desc limit 1;
 online:=coalesce(w.last_heartbeat_at>clock_timestamp()-interval '60 seconds',false);
 available:=jsonb_build_object('status','live','executorOnline',online,'lastHeartbeatAt',w.last_heartbeat_at,
  'leaseExpiresAt',(select max(lease_expires_at) from agent_jobs where workspace_id=p_workspace_id and state='running'));
 if p_action='availability' then return available; end if;
 if p_action='list' then
  count_limit:=least(greatest(coalesce((p_input->>'limit')::integer,20),1),20);
  select coalesce(jsonb_agg((agent_job_public_v1(x)-'checkpoint'-'result') order by x.created_at desc,x.id),'[]') into rows from
   (select * from agent_jobs where workspace_id=p_workspace_id and actor_id=p_actor_id order by created_at desc,id limit count_limit) x;
  return jsonb_build_object('status','live','jobs',rows,'availability',available);
 end if;
 if p_action='submit' then
  if p_input->>'mode' not in ('read','draft','apply') or length(coalesce(p_input->>'projectId','')) not between 1 and 100
   or octet_length(coalesce(p_input->>'prompt','')) not between 1 and 16384 or coalesce(p_input->>'requestHash','') !~ '^[a-f0-9]{64}$'
   or jsonb_typeof(p_input->'contextRefs')<>'array' or jsonb_array_length(p_input->'contextRefs')>8
   or jsonb_typeof(p_input->'budget')<>'object' or (p_input->'budget'->>'wallClockSeconds')::integer not between 10 and 3600
   or (p_input->'budget'->>'maxTurns')::integer not between 1 and 10 then
    return jsonb_build_object('status','error','code','invalid-input','error','invalid-input'); end if;
  select * into j from agent_jobs where workspace_id=p_workspace_id and actor_id=p_actor_id and request_id=(p_input->>'requestId')::uuid;
  if found then
   if j.request_hash<>p_input->>'requestHash' then return jsonb_build_object('status','error','code','request-conflict','error','request-conflict'); end if;
   return jsonb_build_object('status','duplicate','job',agent_job_public_v1(j),'availability',available);
  end if;
  online:=exists(select 1 from agent_workers aw,jsonb_array_elements(aw.projects) project where aw.workspace_id=p_workspace_id and aw.last_heartbeat_at>clock_timestamp()-interval '60 seconds' and project->>'id'=p_input->>'projectId' and project->'modes' ? (p_input->>'mode'));
  if not online and not coalesce((p_input->>'queueIfOffline')::boolean,false) then return jsonb_build_object('status','error','code','worker-offline','error','worker-offline','availability',available); end if;
  insert into agent_jobs(workspace_id,actor_id,request_id,request_hash,project_id,mode,prompt,context_refs,budget)
   values(p_workspace_id,p_actor_id,(p_input->>'requestId')::uuid,p_input->>'requestHash',p_input->>'projectId',p_input->>'mode',p_input->>'prompt',p_input->'contextRefs',p_input->'budget') returning * into j;
  perform agent_job_emit_v1(j.id,'submitted','job.queued',jsonb_build_object('mode',j.mode));
  select * into j from agent_jobs where id=j.id;
  return jsonb_build_object('status','accepted','job',agent_job_public_v1(j),'availability',available);
 end if;
 if p_action not in ('get','events','cancel','resume') then return jsonb_build_object('status','error','code','invalid-input','error','invalid-input'); end if;
 select * into j from agent_jobs where workspace_id=p_workspace_id and actor_id=p_actor_id and id=(p_input->>'id')::uuid for update;
 if not found then return jsonb_build_object('status','error','code','not-found','error','not-found'); end if;
 if p_action='get' then return jsonb_build_object('status','live','job',agent_job_public_v1(j),'availability',available); end if;
 if p_action='events' then
  n:=greatest(coalesce((p_input->>'after')::bigint,0),0); count_limit:=least(greatest(coalesce((p_input->>'limit')::integer,50),1),100);
  select coalesce(jsonb_agg(jsonb_build_object('seq',e.seq,'type',e.type,'payload',e.payload,'createdAt',e.created_at) order by e.seq),'[]'),coalesce(max(e.seq),n) into rows,n
   from (select * from agent_job_events where job_id=j.id and seq>n order by seq limit count_limit) e;
  return jsonb_build_object('status','live','events',rows,'nextAfter',n,'hasMore',n<j.event_seq,'jobState',j.state);
 end if;
 if p_action='cancel' then
  if (p_input->>'expectedTurnCount')::integer is distinct from j.turn_count then return jsonb_build_object('status','error','code','stale-job-turn','error','stale-job-turn'); end if;
  if j.state in ('queued','running') then
   update agent_jobs set cancel_requested_at=coalesce(cancel_requested_at,clock_timestamp()),state=case when state='queued' then 'cancelled' else state end,
    finished_at=case when state='queued' then clock_timestamp() else finished_at end where id=j.id;
   perform agent_job_emit_v1(j.id,'cancel:'||j.turn_count,'job.cancel_requested','{}');
  end if;
 end if;
 if p_action='resume' then
  if coalesce(p_input->>'requestHash','') !~ '^[a-f0-9]{64}$' or p_input->>'requestId' is null then return jsonb_build_object('status','error','code','invalid-input','error','invalid-input'); end if;
  perform (p_input->>'requestId')::uuid;
  select payload into rec from agent_job_events where job_id=j.id and event_key='resume-request:'||(p_input->>'requestId');
  if found then
   if rec->>'requestHash'<>p_input->>'requestHash' then return jsonb_build_object('status','error','code','request-conflict','error','request-conflict'); end if;
   return jsonb_build_object('status','duplicate','job',agent_job_public_v1(j),'resumedTurnCount',rec->'turnCount');
  end if;
  if (p_input->>'expectedTurnCount')::integer is distinct from j.turn_count then return jsonb_build_object('status','error','code','stale-job-turn','error','stale-job-turn'); end if;
  if j.state in ('queued','running') then return jsonb_build_object('status','error','code','job-not-resumable','error','job-not-resumable'); end if;
  if j.turn_count>=(j.budget->>'maxTurns')::integer then return jsonb_build_object('status','error','code','turn-limit','error','turn-limit'); end if;
  rec:=p_input->'reconciliation';
  if j.mode<>'read' and j.state in ('needs_attention','failed','cancelled') and
   (coalesce((rec->>'confirmed')::boolean,false) is not true or length(coalesce(rec->>'note',''))<16 or octet_length(coalesce(rec->>'note',''))>2048 or (rec->>'checkedThreadId') is distinct from j.thread_id) then
   return jsonb_build_object('status','error','code','reconciliation-required','error','reconciliation-required'); end if;
  online:=exists(select 1 from agent_workers aw,jsonb_array_elements(aw.projects) project where aw.workspace_id=p_workspace_id and aw.last_heartbeat_at>clock_timestamp()-interval '60 seconds' and project->>'id'=j.project_id and project->'modes' ? j.mode);
  if not online and not coalesce((p_input->>'queueIfOffline')::boolean,false) then return jsonb_build_object('status','error','code','worker-offline','error','worker-offline','availability',available); end if;
  update agent_jobs set state='queued',prompt=coalesce(nullif(p_input->>'prompt',''),prompt),turn_count=turn_count+1,attempt=0,
   cancel_requested_at=null,lease_token=null,lease_owner=null,lease_expires_at=null,error=null,result=null,usage=null,usage_reason='not-reported',finished_at=null,
   checkpoint=checkpoint||jsonb_build_object('reconciliation',rec,'reconciledBy',p_actor_id) where id=j.id;
  perform agent_job_emit_v1(j.id,'resume-request:'||(p_input->>'requestId'),'job.resumed',jsonb_build_object('reconciliation',rec,'requestHash',p_input->>'requestHash','turnCount',j.turn_count+1));
 end if;
 select * into j from agent_jobs where id=j.id;
 return jsonb_build_object('status',case when p_action='resume' then 'accepted' else 'saved' end,'job',agent_job_public_v1(j));
exception when invalid_text_representation or check_violation or not_null_violation or numeric_value_out_of_range then
 return jsonb_build_object('status','error','code','invalid-input','error','invalid-input');
end $$;

create or replace function public.agent_worker_v1(p_workspace_id uuid,p_worker_id text,p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare j agent_jobs; n bigint; final_state text; summary_id uuid;
begin
 if p_workspace_id is null or length(coalesce(p_worker_id,'')) not between 1 and 100 or jsonb_typeof(p_input)<>'object' then return jsonb_build_object('status','error','code','invalid-input','error','invalid-input'); end if;
 perform pg_advisory_xact_lock(hashtextextended('agent-jobs:'||p_workspace_id::text,0));
 perform agent_jobs_reap_v1(p_workspace_id);
 if p_action in ('pulse','claim') then
  if jsonb_typeof(p_input->'projects')<>'array' or jsonb_array_length(p_input->'projects')>50 then return jsonb_build_object('status','error','code','invalid-input','error','invalid-input'); end if;
  insert into agent_workers(workspace_id,worker_id,projects) values(p_workspace_id,p_worker_id,p_input->'projects') on conflict(workspace_id,worker_id) do update set projects=excluded.projects,last_heartbeat_at=clock_timestamp();
  if p_action='pulse' then return jsonb_build_object('status','saved'); end if;
  if exists(select 1 from agent_jobs where workspace_id=p_workspace_id and state='running') then return jsonb_build_object('status','busy','job',null); end if;
  select * into j from agent_jobs q where q.workspace_id=p_workspace_id and q.state='queued' and q.cancel_requested_at is null
   and exists(select 1 from jsonb_array_elements(p_input->'projects') p where p->>'id'=q.project_id and p->'modes' ? q.mode)
   order by q.created_at,q.id limit 1 for update skip locked;
  if not found then return jsonb_build_object('status','idle','job',null); end if;
  update agent_jobs set state='running',attempt=attempt+1,lease_owner=p_worker_id,lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '90 seconds',started_at=coalesce(started_at,clock_timestamp()),updated_at=clock_timestamp(),usage=null,usage_reason='not-reported' where id=j.id returning * into j;
  perform agent_job_emit_v1(j.id,'claimed:'||j.turn_count||':'||j.attempt,'job.running',jsonb_build_object('attempt',j.attempt));
  return jsonb_build_object('status','claimed','job',agent_job_public_v1(j)||jsonb_build_object('prompt',j.prompt,'leaseToken',j.lease_token));
 end if;
 if p_action not in ('heartbeat','event','finish') then return jsonb_build_object('status','error','code','invalid-input','error','invalid-input'); end if;
 select * into j from agent_jobs where workspace_id=p_workspace_id and id=(p_input->>'id')::uuid for update;
 if not found or j.lease_owner is distinct from p_worker_id or j.lease_token is distinct from (p_input->>'leaseToken')::uuid then return jsonb_build_object('status','error','code','lease-lost','error','lease-lost'); end if;
 if p_action='finish' and j.state in ('succeeded','failed','cancelled','needs_attention') then return jsonb_build_object('status','duplicate','job',agent_job_public_v1(j)); end if;
 if j.state<>'running' or j.lease_expires_at<=clock_timestamp() then return jsonb_build_object('status','error','code','lease-lost','error','lease-lost'); end if;
 if p_action='heartbeat' then
  update agent_jobs set lease_expires_at=clock_timestamp()+interval '90 seconds',updated_at=clock_timestamp() where id=j.id;
  update agent_workers set last_heartbeat_at=clock_timestamp() where workspace_id=p_workspace_id and worker_id=p_worker_id;
  return jsonb_build_object('status','saved','cancelRequestedAt',j.cancel_requested_at,'leaseExpiresAt',clock_timestamp()+interval '90 seconds');
 end if;
 if p_input ? 'threadId' and p_input->>'threadId' is not null then
  if length(p_input->>'threadId')>200 or (j.thread_id is not null and j.thread_id<>p_input->>'threadId') then return jsonb_build_object('status','error','code','invalid-input','error','thread-mismatch'); end if;
  update agent_jobs set thread_id=p_input->>'threadId' where id=j.id;
 end if;
 if p_input ? 'checkpoint' then
  if jsonb_typeof(p_input->'checkpoint')<>'object' or octet_length((p_input->'checkpoint')::text)>8192 then return jsonb_build_object('status','error','code','invalid-input','error','invalid-checkpoint'); end if;
  update agent_jobs set checkpoint=checkpoint||(p_input->'checkpoint') where id=j.id;
 end if;
 if p_action='event' then
  if length(coalesce(p_input->>'eventId','')) not between 1 and 200 or length(coalesce(p_input->>'type','')) not between 1 and 100
   or jsonb_typeof(p_input->'payload')<>'object' or octet_length((p_input->'payload')::text)>20000 or j.event_seq>=2000 then return jsonb_build_object('status','error','code','invalid-input','error','event-limit'); end if;
  n:=agent_job_emit_v1(j.id,j.lease_token||':'||(p_input->>'eventId'),p_input->>'type',p_input->'payload');
  if p_input->>'type'='turn.completed' and jsonb_typeof(p_input->'payload'->'usage')='object' and octet_length((p_input->'payload'->'usage')::text)<=1024 then
   update agent_jobs set usage=p_input->'payload'->'usage',usage_reason='reported' where id=j.id;
  end if;
  return jsonb_build_object('status','saved','seq',n);
 end if;
 final_state:=p_input->>'state';
 if final_state not in ('succeeded','failed','cancelled','needs_attention') then return jsonb_build_object('status','error','code','invalid-input','error','invalid-state'); end if;
 if j.cancel_requested_at is not null and final_state='succeeded' then final_state:='cancelled'; end if;
 insert into agent_runs(workspace_id,agent,mode,ref,input_summary,recommendation,result)
  values(p_workspace_id,'codex',j.mode,j.id::text,left(j.prompt,200),jsonb_build_object('jobId',j.id,'state',final_state),case when final_state='succeeded' then 'ok' when final_state='needs_attention' then 'needs_human' else 'error' end) returning id into summary_id;
 update agent_jobs set state=final_state,result=p_input->'result',usage=coalesce(nullif(p_input->'usage','null'),j.usage),usage_reason=case when coalesce(nullif(p_input->'usage','null'),j.usage) is not null then 'reported' else coalesce(p_input->>'usageReason','not-reported') end,
  error=p_input->>'error',run_id=summary_id,lease_expires_at=null,finished_at=clock_timestamp(),updated_at=clock_timestamp() where id=j.id;
 perform agent_job_emit_v1(j.id,'finish:'||j.turn_count,'job.'||final_state,jsonb_build_object('error',p_input->>'error'));
 select * into j from agent_jobs where id=j.id;
 return jsonb_build_object('status','saved','job',agent_job_public_v1(j));
exception when invalid_text_representation or check_violation or not_null_violation or numeric_value_out_of_range then
 return jsonb_build_object('status','error','code','invalid-input','error','invalid-input');
end $$;

revoke all on function public.agent_job_public_v1(public.agent_jobs),public.agent_job_emit_v1(uuid,text,text,jsonb),public.agent_jobs_reap_v1(uuid),public.agent_jobs_v1(uuid,text,text,jsonb),public.agent_worker_v1(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.agent_job_public_v1(public.agent_jobs),public.agent_job_emit_v1(uuid,text,text,jsonb),public.agent_jobs_reap_v1(uuid),public.agent_jobs_v1(uuid,text,text,jsonb),public.agent_worker_v1(uuid,text,text,jsonb) to service_role;
