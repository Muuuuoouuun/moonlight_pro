-- 브랜드 Threads 글 올리기 작업 (2026-11-02 운영자 결정: 직접 발행은 Threads부터).
-- 운영자가 올리기 창에서 누른 한 번 = 작업 하나. 예약 실행기·자동 올리기는 이 표에 없다.
-- 0064(Go;Re 1건 시험)와 같은 계약을 일반화했다:
--   * 공급자 POST 전에 의도(creating · publish_requested)를 먼저 남긴다(CAS + lease).
--   * 응답을 잃으면 다시 올리지 않고 ambiguous(확인 필요)로 멈춘다. 운영자가 정리(abandon)해야 다음 작업이 열린다.
--   * 결과물 하나에 끝나지 않은 작업은 하나뿐이고, 이미 올린 결과물은 다시 올리지 않는다.
--   * verified 전이가 발행 기록(publish_logs) · 결과물/콘텐츠 상태 · 예약 상태를 같은 트랜잭션에서 남긴다.
-- 연결 글은 같은 작업 안에서 차례로 올린다(step = 지금 올리는 글의 순번, post_ids = 올라간 글).
create table public.threads_publish_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id uuid not null,
  brand_id uuid not null references public.brands(id),
  brand_key text not null check (brand_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  content_id uuid not null references public.content_items(id) on delete cascade,
  variant_id uuid not null references public.content_variants(id) on delete cascade,
  account_id text not null check (account_id ~ '^[0-9]{1,32}$'),
  app_key text not null check (app_key ~ '^[a-z0-9_]{1,40}$'),
  username text not null check (username ~ '^[a-z0-9._]{1,30}$'),
  title text not null default '' check (length(title) <= 200),
  posts jsonb not null check (jsonb_typeof(posts) = 'array'),
  post_count integer not null check (post_count between 1 and 10),
  body_hash text not null check (body_hash ~ '^[a-f0-9]{64}$'),
  state text not null default 'prepared' check (state in
    ('prepared','claimed','creating','container_ready','publish_requested','post_recorded','verified','ambiguous','abandoned')),
  step integer not null default 0 check (step >= 0 and step < post_count),
  container_id text check (container_id is null or container_id ~ '^[0-9]{1,32}$'),
  post_ids text[] not null default '{}'::text[],
  permalink text,
  version bigint not null default 1,
  lease_owner uuid, lease_token uuid, lease_expires_at timestamptz,
  error_code text check (error_code in ('outcome-unconfirmed','expired-effect-lease','verification-unconfirmed')),
  abandon_reason text check (abandon_reason in ('not-posted','posted-manually','cancelled-before-send')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  verified_at timestamptz,
  abandoned_at timestamptz,
  unique (workspace_id, request_id),
  check (jsonb_array_length(posts) = post_count),
  check (cardinality(post_ids) <= post_count and array_position(post_ids, null) is null),
  check (state not in ('container_ready','publish_requested') or container_id is not null),
  check (state <> 'post_recorded' or cardinality(post_ids) = step + 1),
  check (state <> 'verified' or (cardinality(post_ids) = post_count and permalink is not null and verified_at is not null)),
  check (permalink is null or permalink ~ '^https://(www[.])?threads[.](com|net)/@[a-z0-9._]{1,30}/post/[A-Za-z0-9_-]+/?$'),
  check (state <> 'abandoned' or (abandon_reason is not null and abandoned_at is not null))
);
-- 결과물 하나에 끝나지 않은 작업은 하나 — 같은 글을 두 번 올리는 길을 저장소가 막는다.
create unique index threads_publish_jobs_open_variant_idx on public.threads_publish_jobs (workspace_id, variant_id)
  where state not in ('verified','abandoned');
create index threads_publish_jobs_variant_idx on public.threads_publish_jobs (workspace_id, variant_id, created_at desc);
alter table public.threads_publish_jobs enable row level security;
revoke all on public.threads_publish_jobs from public, anon, authenticated, service_role;

-- 토큰·lease는 내보내지 않는다.
create or replace function public.threads_publish_job_public_v1(j public.threads_publish_jobs)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object('id', j.id, 'requestId', j.request_id, 'brandId', j.brand_id, 'brandKey', j.brand_key,
    'contentId', j.content_id, 'variantId', j.variant_id, 'provider', 'meta_threads', 'accountId', j.account_id,
    'appKey', j.app_key, 'username', j.username, 'title', j.title, 'posts', j.posts, 'postCount', j.post_count,
    'bodyHash', j.body_hash, 'state', j.state, 'step', j.step, 'containerId', j.container_id,
    'postIds', to_jsonb(j.post_ids), 'permalink', j.permalink, 'version', j.version, 'errorCode', j.error_code,
    'abandonReason', j.abandon_reason, 'createdAt', j.created_at, 'updatedAt', j.updated_at,
    'verifiedAt', j.verified_at, 'abandonedAt', j.abandoned_at);
$$;

create or replace function public.threads_publish_job_v1(p_workspace_id uuid, p_action text, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  j public.threads_publish_jobs%rowtype;
  v record; existing public.threads_publish_jobs%rowtype;
  next_state text; owner_id uuid; lease_id uuid; allowed boolean; post_text jsonb; n integer;
begin
  if p_workspace_id is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text) > 32768
    or p_action not in ('prepare','get','latest','claim','advance','abandon') then
    return jsonb_build_object('status', 'invalid-input');
  end if;

  if p_action = 'prepare' then
    n := case when jsonb_typeof(p_input->'posts') = 'array' then jsonb_array_length(p_input->'posts') else 0 end;
    if coalesce(p_input->>'requestId','') !~ '^[0-9a-f-]{36}$' or coalesce(p_input->>'variantId','') !~ '^[0-9a-f-]{36}$'
      or coalesce(p_input->>'contentId','') !~ '^[0-9a-f-]{36}$' or coalesce(p_input->>'brandId','') !~ '^[0-9a-f-]{36}$'
      or coalesce(p_input->>'brandKey','') !~ '^[a-z0-9][a-z0-9_-]{0,63}$' or coalesce(p_input->>'accountId','') !~ '^[0-9]{1,32}$'
      or coalesce(p_input->>'appKey','') !~ '^[a-z0-9_]{1,40}$' or coalesce(p_input->>'username','') !~ '^[a-z0-9._]{1,30}$'
      or coalesce(p_input->>'bodyHash','') !~ '^[a-f0-9]{64}$' or n < 1 or n > 10 then
      return jsonb_build_object('status', 'invalid-input');
    end if;
    for post_text in select value from jsonb_array_elements(p_input->'posts') loop
      if jsonb_typeof(post_text) <> 'string' or char_length(btrim(post_text #>> '{}')) = 0 or char_length(post_text #>> '{}') > 500 then
        return jsonb_build_object('status', 'invalid-input');
      end if;
    end loop;
    -- 결과물 · 콘텐츠 · 브랜드가 이 워크스페이스에서 서로 맞아야 하고, 승인한 본문은 지금 저장된 본문이어야 한다.
    select cv.id, cv.content_id, cv.body, cv.status as variant_status, cv.variant_type, ci.brand_id, ci.title as item_title,
           coalesce(nullif(cv.title, ''), ci.title, '') as title, b.slug as brand_slug, b.status as brand_status
      into v
      from public.content_variants cv
      join public.content_items ci on ci.id = cv.content_id and ci.workspace_id = p_workspace_id
      left join public.brands b on b.id = ci.brand_id and b.workspace_id = p_workspace_id
     where cv.id = (p_input->>'variantId')::uuid and cv.workspace_id = p_workspace_id;
    if not found or v.content_id <> (p_input->>'contentId')::uuid or v.variant_type <> 'threads_post' then
      return jsonb_build_object('status', 'not-found');
    end if;
    if v.brand_id is distinct from (p_input->>'brandId')::uuid or v.brand_slug is distinct from p_input->>'brandKey'
      or v.brand_status is distinct from 'active' then
      return jsonb_build_object('status', 'brand-mismatch');
    end if;
    if encode(sha256(convert_to(v.body, 'UTF8')), 'hex') <> p_input->>'bodyHash' then
      return jsonb_build_object('status', 'stale-body');
    end if;
    perform pg_advisory_xact_lock(hashtextextended('threads-publish:' || p_workspace_id::text || ':' || v.id::text, 0));
    select * into existing from public.threads_publish_jobs
     where workspace_id = p_workspace_id and request_id = (p_input->>'requestId')::uuid;
    if found then
      if existing.variant_id <> v.id or existing.body_hash <> p_input->>'bodyHash' or existing.account_id <> p_input->>'accountId' then
        return jsonb_build_object('status', 'conflict');
      end if;
      return jsonb_build_object('status', 'duplicate', 'job', public.threads_publish_job_public_v1(existing));
    end if;
    if v.variant_status = 'published' or exists (select 1 from public.threads_publish_jobs
         where workspace_id = p_workspace_id and variant_id = v.id and state = 'verified') then
      return jsonb_build_object('status', 'already-published');
    end if;
    select * into existing from public.threads_publish_jobs
     where workspace_id = p_workspace_id and variant_id = v.id and state not in ('verified','abandoned');
    if found then
      return jsonb_build_object('status', 'busy', 'job', public.threads_publish_job_public_v1(existing));
    end if;
    insert into public.threads_publish_jobs (workspace_id, request_id, brand_id, brand_key, content_id, variant_id,
      account_id, app_key, username, title, posts, post_count, body_hash)
    values (p_workspace_id, (p_input->>'requestId')::uuid, v.brand_id, v.brand_slug, v.content_id, v.id,
      p_input->>'accountId', p_input->>'appKey', p_input->>'username', left(v.title, 200), p_input->'posts', n, p_input->>'bodyHash')
    returning * into j;
    return jsonb_build_object('status', 'saved', 'job', public.threads_publish_job_public_v1(j));
  end if;

  if p_action = 'get' then
    select * into j from public.threads_publish_jobs where workspace_id = p_workspace_id and id = (p_input->>'jobId')::uuid;
    if not found then return jsonb_build_object('status', 'not-found'); end if;
    return jsonb_build_object('status', 'live', 'job', public.threads_publish_job_public_v1(j));
  end if;

  if p_action = 'latest' then
    select * into j from public.threads_publish_jobs
     where workspace_id = p_workspace_id and variant_id = (p_input->>'variantId')::uuid
     order by created_at desc, id desc limit 1;
    if not found then return jsonb_build_object('status', 'live', 'job', null); end if;
    return jsonb_build_object('status', 'live', 'job', public.threads_publish_job_public_v1(j));
  end if;

  select * into j from public.threads_publish_jobs where workspace_id = p_workspace_id and id = (p_input->>'jobId')::uuid for update;
  if not found then return jsonb_build_object('status', 'not-found'); end if;

  if p_action = 'abandon' then
    -- 운영자 정리: 보내기 전(prepared·claimed, lease 만료)이거나 확인 필요일 때만. 보내는 중인 작업은 끊지 않는다.
    if j.state = 'abandoned' then return jsonb_build_object('status', 'duplicate', 'job', public.threads_publish_job_public_v1(j)); end if;
    if not (j.state = 'ambiguous' or j.state = 'prepared' or (j.state = 'claimed' and coalesce(j.lease_expires_at, '-infinity') <= clock_timestamp()))
      or p_input->>'reason' not in ('not-posted','posted-manually','cancelled-before-send')
      or (j.state <> 'ambiguous' and p_input->>'reason' <> 'cancelled-before-send')
      or (j.state = 'ambiguous' and p_input->>'reason' = 'cancelled-before-send') then
      return jsonb_build_object('status', 'conflict', 'job', public.threads_publish_job_public_v1(j));
    end if;
    update public.threads_publish_jobs set state = 'abandoned', abandon_reason = p_input->>'reason', abandoned_at = clock_timestamp(),
      lease_owner = null, lease_token = null, lease_expires_at = null, version = version + 1, updated_at = clock_timestamp()
     where id = j.id returning * into j;
    return jsonb_build_object('status', 'saved', 'job', public.threads_publish_job_public_v1(j));
  end if;

  if j.state in ('verified','abandoned') then
    return jsonb_build_object('status', 'duplicate', 'job', public.threads_publish_job_public_v1(j));
  end if;

  if p_action = 'claim' then
    owner_id := (p_input->>'owner')::uuid;
    if owner_id is null then return jsonb_build_object('status', 'invalid-input'); end if;
    if j.lease_expires_at > clock_timestamp() then
      return jsonb_build_object('status', 'busy', 'job', public.threads_publish_job_public_v1(j));
    end if;
    if j.state not in ('prepared','claimed') then
      -- lease가 끝났는데 보내는 중이었다면 결과를 모른다 — 다시 보내지 않고 확인 필요로.
      if j.state <> 'ambiguous' then
        update public.threads_publish_jobs set state = 'ambiguous', error_code = 'expired-effect-lease', version = version + 1,
          lease_owner = null, lease_token = null, lease_expires_at = null, updated_at = clock_timestamp()
         where id = j.id returning * into j;
      end if;
      return jsonb_build_object('status', 'blocked', 'job', public.threads_publish_job_public_v1(j));
    end if;
    update public.threads_publish_jobs set state = 'claimed', lease_owner = owner_id, lease_token = gen_random_uuid(),
      lease_expires_at = clock_timestamp() + interval '90 seconds', version = version + 1, updated_at = clock_timestamp()
     where id = j.id returning * into j;
    return jsonb_build_object('status', 'claimed', 'job', public.threads_publish_job_public_v1(j), 'leaseToken', j.lease_token,
      'leaseRemainingMs', greatest(0, floor(extract(epoch from (j.lease_expires_at - clock_timestamp())) * 1000)));
  end if;

  -- advance: lease 주인 + 버전 CAS. 성공할 때마다 lease를 90초 연장한다(연결 글이 여럿이라).
  owner_id := (p_input->>'owner')::uuid; lease_id := (p_input->>'leaseToken')::uuid; next_state := p_input->>'state';
  if j.lease_owner is distinct from owner_id or j.lease_token is distinct from lease_id or owner_id is null or lease_id is null
    or j.version is distinct from (p_input->>'expectedVersion')::bigint or j.lease_expires_at <= clock_timestamp() then
    return jsonb_build_object('status', 'conflict', 'job', public.threads_publish_job_public_v1(j));
  end if;
  allowed := next_state = 'ambiguous'
    or (j.state = 'claimed' and next_state = 'creating')
    or (j.state = 'creating' and next_state = 'container_ready' and coalesce(p_input->>'containerId','') ~ '^[0-9]{1,32}$')
    or (j.state = 'container_ready' and next_state = 'publish_requested')
    or (j.state = 'publish_requested' and next_state = 'post_recorded' and coalesce(p_input->>'postId','') ~ '^[0-9]{1,32}$')
    or (j.state = 'post_recorded' and next_state = 'creating' and j.step + 1 < j.post_count)
    or (j.state = 'post_recorded' and next_state = 'verified' and cardinality(j.post_ids) = j.post_count);
  if not coalesce(allowed, false) then return jsonb_build_object('status', 'conflict', 'job', public.threads_publish_job_public_v1(j)); end if;
  if next_state = 'ambiguous' and coalesce(p_input->>'errorCode','') not in ('outcome-unconfirmed','expired-effect-lease','verification-unconfirmed') then
    return jsonb_build_object('status', 'invalid-input');
  end if;
  -- 보내기 직전 두 단계는 연결 · 브랜드를 다시 확인한다(토큰은 서버가 읽고, 여기서는 연결이 살아 있는지만).
  if next_state in ('creating','publish_requested') and not exists (
      select 1 from public.integration_connections c
       where c.workspace_id = p_workspace_id and c.provider = 'meta_threads' and c.status = 'connected'
         and c.account_key = j.account_id and coalesce(c.config->>'brandKey', 'bridgemaker') = j.brand_key
         and lower(ltrim(coalesce(c.config->>'username',''), '@')) = j.username
         and (c.config->>'expiresAt')::timestamptz > clock_timestamp() + interval '30 seconds'
         and string_to_array(regexp_replace(coalesce(c.config->>'scope',''), '[,[:space:]]+', ',', 'g'), ',') @> array['threads_content_publish']) then
    return jsonb_build_object('status', 'blocked', 'job', public.threads_publish_job_public_v1(j));
  end if;
  if next_state in ('creating','publish_requested') and not exists (
      select 1 from public.brands where id = j.brand_id and workspace_id = p_workspace_id and slug = j.brand_key and status = 'active') then
    return jsonb_build_object('status', 'blocked', 'job', public.threads_publish_job_public_v1(j));
  end if;
  if next_state = 'verified' and (coalesce(p_input->>'permalink','') !~ '^https://(www[.])?threads[.](com|net)/@[a-z0-9._]{1,30}/post/[A-Za-z0-9_-]+/?$'
      or lower(split_part(split_part(p_input->>'permalink', '/@', 2), '/', 1)) <> j.username) then
    return jsonb_build_object('status', 'invalid-input');
  end if;
  if next_state = 'post_recorded' and (p_input->>'postId') = any (j.post_ids) then
    return jsonb_build_object('status', 'conflict', 'job', public.threads_publish_job_public_v1(j));
  end if;

  update public.threads_publish_jobs set
    state = next_state,
    step = case when j.state = 'post_recorded' and next_state = 'creating' then step + 1 else step end,
    container_id = case when next_state = 'container_ready' then p_input->>'containerId'
                        when j.state = 'post_recorded' and next_state = 'creating' then null else container_id end,
    post_ids = case when next_state = 'post_recorded' then post_ids || (p_input->>'postId') else post_ids end,
    permalink = case when next_state = 'verified' then p_input->>'permalink' else permalink end,
    verified_at = case when next_state = 'verified' then clock_timestamp() else verified_at end,
    error_code = case when next_state = 'ambiguous' then p_input->>'errorCode' else null end,
    lease_owner = case when next_state in ('verified','ambiguous') then null else lease_owner end,
    lease_token = case when next_state in ('verified','ambiguous') then null else lease_token end,
    lease_expires_at = case when next_state in ('verified','ambiguous') then null else clock_timestamp() + interval '90 seconds' end,
    version = version + 1, updated_at = clock_timestamp()
   where id = j.id returning * into j;

  if next_state = 'verified' then
    -- 발행 기록 · 상태를 같은 트랜잭션에서. 기록 ID는 작업 ID라 다시 실행돼도 한 줄이다.
    insert into public.publish_logs (id, workspace_id, variant_id, channel, status, provider, target_url, external_id,
      attempt_count, payload, published_at, created_at, updated_at)
    values (j.id, p_workspace_id, j.variant_id, 'threads', 'published', 'meta_threads', j.permalink, j.post_ids[1], 1,
      jsonb_build_object('event', 'api_published', 'provenance', 'provider_verified', 'external_verified', true,
        'job_id', j.id, 'post_ids', to_jsonb(j.post_ids), 'brand_id', j.brand_id, 'brand_key', j.brand_key,
        'title', j.title, 'target_channel', 'threads', 'username', j.username),
      j.verified_at, j.verified_at, j.verified_at)
    on conflict (id) do nothing;
    update public.content_variants set status = 'published', published_at = j.verified_at, updated_at = j.verified_at
     where id = j.variant_id and workspace_id = p_workspace_id;
    update public.content_items set status = 'published', published_at = j.verified_at, updated_at = j.verified_at
     where id = j.content_id and workspace_id = p_workspace_id;
    update public.content_schedules set status = 'published', published_at = j.verified_at, revision = revision + 1, updated_at = j.verified_at
     where workspace_id = p_workspace_id and variant_id = j.variant_id and status in ('scheduled','missed');
  end if;
  return jsonb_build_object('status', 'saved', 'job', public.threads_publish_job_public_v1(j));
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or check_violation
  or not_null_violation or unique_violation then
  return jsonb_build_object('status', 'invalid-input');
end;
$$;
revoke all on function public.threads_publish_job_public_v1(public.threads_publish_jobs), public.threads_publish_job_v1(uuid,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.threads_publish_job_public_v1(public.threads_publish_jobs), public.threads_publish_job_v1(uuid,text,jsonb)
  to service_role;
notify pgrst, 'reload schema';
