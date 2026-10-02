-- Prepared only. Coordinate 0061/0062 report work and proposed 0063 before applying.
-- One operator-approved Go;Re text test; no scheduler or credential storage.
create table public.gore_threads_test_jobs (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  brand_id uuid not null references public.brands(id), job_key text not null,
  account_id text not null check(account_id ~ '^[0-9]{1,32}$'),
  app_id text not null check(app_id ~ '^[0-9]{1,32}$'), body text not null,
  body_hash text not null check(body_hash='cefd7d31a8c445c8693c307f630b6462ddd8b19798665c27f4147293d8a1807e'),
  payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
  state text not null default 'prepared' check(state in ('prepared','claimed','creating','container_ready','publish_requested','post_recorded','verified','ambiguous')),
  version bigint not null default 1, lease_owner uuid, lease_token uuid, lease_mode text,
  lease_expires_at timestamptz, container_id text, post_id text, permalink text,
  receipt_source text check(receipt_source in ('provider-response','operator-reconciled')),
  verified_at timestamptz,
  error_code text check(error_code in ('outcome-unconfirmed','post-id-requires-manual-confirmation','expired-effect-lease')),
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
  unique(workspace_id,job_key),
  check(job_key='gore-threads-test-20260930-01'),
  check(brand_id='7fad9d64-bb90-4a63-8528-de8a8a23836d'::uuid),
  check(encode(sha256(convert_to(body,'UTF8')),'hex')=body_hash),
  check(container_id is null or container_id ~ '^[0-9]{1,32}$'),
  check(post_id is null or post_id ~ '^[0-9]{1,32}$'),
  check(permalink is null or permalink ~ '^https://(www[.])?threads[.](com|net)/@go_re_startagain/post/[A-Za-z0-9_-]+/?$'),
  check(state not in ('container_ready','publish_requested','post_recorded','verified') or container_id is not null),
  check(state not in ('post_recorded','verified') or post_id is not null),
  check(state<>'verified' or (permalink is not null and receipt_source is not null and verified_at is not null)),
  check(lease_mode is null or lease_mode in ('execute','lookup'))
);
alter table public.gore_threads_test_jobs enable row level security;
revoke all on public.gore_threads_test_jobs from public,anon,authenticated,service_role;

create or replace function public.gore_threads_test_job_public_v1(j public.gore_threads_test_jobs)
returns jsonb language sql stable set search_path=public,pg_temp as $$
 select jsonb_build_object('id',j.id,'workspaceId',j.workspace_id,'brandId',j.brand_id,
  'brandKey','gore','provider','meta_threads','appKey','gore','username','go_re_startagain','visibility','public',
  'jobKey',j.job_key,'accountId',j.account_id,'appId',j.app_id,'body',j.body,'bodyHash',j.body_hash,
  'payloadHash',j.payload_hash,'state',j.state,'version',j.version,'containerId',j.container_id,
  'postId',j.post_id,'permalink',j.permalink,'receiptSource',j.receipt_source,'errorCode',j.error_code,
  'createdAt',j.created_at,'updatedAt',j.updated_at,'verifiedAt',j.verified_at);
$$;

create or replace function public.gore_threads_test_job_v1(p_workspace_id uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.gore_threads_test_jobs%rowtype; next_state text; owner_id uuid; lease_id uuid; allowed boolean;
begin
 if p_workspace_id is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>8192
   or p_action not in ('prepare','get','claim','lookup','advance') then
   return jsonb_build_object('status','invalid-input'); end if;
 if p_action='prepare' then
  if p_input->>'jobKey' is distinct from 'gore-threads-test-20260930-01' or p_input->>'brandKey' is distinct from 'gore'
   or p_input->>'brandId' is distinct from '7fad9d64-bb90-4a63-8528-de8a8a23836d' or p_input->>'workspaceId' is distinct from p_workspace_id::text
   or p_input->>'provider' is distinct from 'meta_threads' or p_input->>'appKey' is distinct from 'gore' or p_input->>'username' is distinct from 'go_re_startagain'
   or p_input->>'visibility' is distinct from 'public' or coalesce(p_input->>'bodyHash','')<>'cefd7d31a8c445c8693c307f630b6462ddd8b19798665c27f4147293d8a1807e'
   or coalesce(p_input->>'accountId','')!~'^[0-9]{1,32}$' or coalesce(p_input->>'appId','')!~'^[0-9]{1,32}$'
   or coalesce(p_input->>'payloadHash','')!~'^[a-f0-9]{64}$'
   or encode(sha256(convert_to(coalesce(p_input->>'body',''),'UTF8')),'hex')<>p_input->>'bodyHash'
   or not exists(select 1 from public.brands where id=(p_input->>'brandId')::uuid and workspace_id=p_workspace_id and slug='gore' and status='active') then
   return jsonb_build_object('status','invalid-input'); end if;
  perform pg_advisory_xact_lock(hashtextextended('gore-text-test:'||p_workspace_id::text,0));
  select * into j from public.gore_threads_test_jobs where workspace_id=p_workspace_id and job_key=p_input->>'jobKey' for update;
  if found then
   if j.payload_hash<>p_input->>'payloadHash' or j.account_id<>p_input->>'accountId' or j.app_id<>p_input->>'appId' then
    return jsonb_build_object('status','conflict'); end if;
   return jsonb_build_object('status','duplicate','job',gore_threads_test_job_public_v1(j)); end if;
  insert into public.gore_threads_test_jobs(workspace_id,brand_id,job_key,account_id,app_id,body,body_hash,payload_hash)
   values(p_workspace_id,(p_input->>'brandId')::uuid,p_input->>'jobKey',p_input->>'accountId',p_input->>'appId',p_input->>'body',p_input->>'bodyHash',p_input->>'payloadHash') returning * into j;
  return jsonb_build_object('status','saved','job',gore_threads_test_job_public_v1(j));
 end if;
 if p_action='get' then
  select * into j from public.gore_threads_test_jobs where workspace_id=p_workspace_id and id=(p_input->>'jobId')::uuid;
  if not found then return jsonb_build_object('status','not-found'); end if;
  return jsonb_build_object('status','live','job',gore_threads_test_job_public_v1(j));
 end if;
 select * into j from public.gore_threads_test_jobs where workspace_id=p_workspace_id and id=(p_input->>'jobId')::uuid for update;
 if not found then return jsonb_build_object('status','not-found'); end if;
 if j.state='verified' then return jsonb_build_object('status','duplicate','job',gore_threads_test_job_public_v1(j)); end if;
 if p_action in ('claim','lookup') then
  owner_id:=(p_input->>'owner')::uuid;
  if owner_id is null then return jsonb_build_object('status','invalid-input'); end if;
  if j.lease_expires_at>clock_timestamp() then return jsonb_build_object('status','busy','job',gore_threads_test_job_public_v1(j)); end if;
  if p_action='claim' and j.state not in ('prepared','claimed') then
   if j.state<>'ambiguous' then
    update public.gore_threads_test_jobs set state='ambiguous',error_code='expired-effect-lease',version=version+1,
     lease_token=null,lease_owner=null,lease_mode=null,lease_expires_at=null,updated_at=clock_timestamp() where id=j.id returning * into j;
   end if;
   return jsonb_build_object('status','blocked','job',gore_threads_test_job_public_v1(j)); end if;
  if p_action='lookup' and j.state in ('prepared','claimed') then return jsonb_build_object('status','blocked','job',gore_threads_test_job_public_v1(j)); end if;
  update public.gore_threads_test_jobs set state=case when p_action='claim' then 'claimed' else state end,
   lease_owner=owner_id,lease_token=gen_random_uuid(),lease_mode=case when p_action='claim' then 'execute' else 'lookup' end,
   lease_expires_at=clock_timestamp()+interval '90 seconds',version=version+1,updated_at=clock_timestamp() where id=j.id returning * into j;
  -- Private claim metadata for the server's pre-POST budget check, outside the job projection.
  return jsonb_build_object('status','claimed','job',gore_threads_test_job_public_v1(j),'leaseToken',j.lease_token,
   'leaseExpiresAt',j.lease_expires_at,
   'leaseRemainingMs',greatest(0,floor(extract(epoch from (j.lease_expires_at-clock_timestamp()))*1000)));
 end if;
 -- Durable CAS fences state writes. The server also checks lease budget before POST;
 -- neither this CAS nor that check can undo an external request already sent.
 owner_id:=(p_input->>'owner')::uuid; lease_id:=(p_input->>'leaseToken')::uuid; next_state:=p_input->>'state';
 if j.lease_owner is distinct from owner_id or j.lease_token is distinct from lease_id or owner_id is null or lease_id is null
  or j.version is distinct from (p_input->>'expectedVersion')::bigint or j.lease_expires_at<=clock_timestamp() then
  return jsonb_build_object('status','conflict','job',gore_threads_test_job_public_v1(j)); end if;
 allowed:=next_state='ambiguous' or (j.lease_mode='execute' and (
  (j.state='claimed' and next_state='creating') or (j.state='creating' and next_state='container_ready') or
  (j.state='container_ready' and next_state='publish_requested') or (j.state='publish_requested' and next_state='post_recorded') or
  (j.state='post_recorded' and next_state='verified'))) or (j.lease_mode='lookup' and next_state='verified');
 if not coalesce(allowed,false) then return jsonb_build_object('status','conflict'); end if;
 if (j.container_id is not null and p_input ? 'containerId' and p_input->>'containerId' is distinct from j.container_id)
  or (j.post_id is not null and p_input ? 'postId' and p_input->>'postId' is distinct from j.post_id) then
  return jsonb_build_object('status','conflict'); end if;
 if j.lease_mode='execute' and next_state in ('creating','publish_requested') and not exists(
  select 1 from public.integration_connections c where c.workspace_id=p_workspace_id and c.provider='meta_threads' and c.status='connected'
   and c.account_key=j.account_id and c.config->>'brandKey'='gore' and c.config->>'oauthAppKey'='gore' and c.config->>'oauthAppId'=j.app_id
   and c.config->>'username'='go_re_startagain' and c.config->>'brandHandle'='go_re_startagain'
   and (c.config->>'expiresAt')::timestamptz>clock_timestamp()+interval '30 seconds'
   and string_to_array(regexp_replace(c.config->>'scope','[,[:space:]]+',',','g'),',') @> array['threads_basic','threads_content_publish']
 ) then return jsonb_build_object('status','blocked'); end if;
 if j.lease_mode='execute' and next_state in ('creating','publish_requested') and not exists(
  select 1 from public.brands where id=j.brand_id and workspace_id=p_workspace_id and slug='gore' and status='active'
 ) then return jsonb_build_object('status','blocked'); end if;
 if next_state='verified' and (coalesce(p_input->>'postId',j.post_id,'')!~'^[0-9]{1,32}$'
  or coalesce(p_input->>'permalink','')!~'^https://(www[.])?threads[.](com|net)/@go_re_startagain/post/[A-Za-z0-9_-]+/?$'
  or p_input->>'receiptSource' is distinct from case when j.lease_mode='execute' then 'provider-response' else 'operator-reconciled' end) then
  return jsonb_build_object('status','invalid-input'); end if;
 update public.gore_threads_test_jobs set state=next_state,version=version+1,
  container_id=coalesce(p_input->>'containerId',container_id),post_id=coalesce(p_input->>'postId',post_id),
  permalink=coalesce(p_input->>'permalink',permalink),receipt_source=coalesce(p_input->>'receiptSource',receipt_source),
  verified_at=case when next_state='verified' then clock_timestamp() else verified_at end,
  error_code=case when next_state='ambiguous' then p_input->>'errorCode' else null end,
  lease_owner=case when next_state in ('verified','ambiguous') then null else lease_owner end,
  lease_token=case when next_state in ('verified','ambiguous') then null else lease_token end,
  lease_mode=case when next_state in ('verified','ambiguous') then null else lease_mode end,
  lease_expires_at=case when next_state in ('verified','ambiguous') then null else lease_expires_at end,
  updated_at=clock_timestamp() where id=j.id returning * into j;
 return jsonb_build_object('status','saved','job',gore_threads_test_job_public_v1(j));
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or check_violation or not_null_violation then
 return jsonb_build_object('status','invalid-input');
end;
$$;
revoke all on function public.gore_threads_test_job_public_v1(public.gore_threads_test_jobs),public.gore_threads_test_job_v1(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.gore_threads_test_job_public_v1(public.gore_threads_test_jobs),public.gore_threads_test_job_v1(uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
