-- Unified inquiry ledger. Only the Engine's service-role RPC mutates this domain.
begin;

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  org_scope text not null default 'unclassified' check (org_scope in ('classin', 'personal', 'unclassified')),
  kind text not null default 'general' check (kind in ('sales', 'support', 'partnership', 'general')),
  classification text not null default 'review' check (classification in ('inquiry', 'review', 'ignored')),
  reason text not null default '' check (length(reason) <= 1000),
  subject text not null check (length(subject) between 1 and 500),
  contact_name text not null default '' check (length(contact_name) <= 200),
  contact_email text not null default '' check (length(contact_email) <= 320),
  contact_phone text not null default '' check (length(contact_phone) <= 100),
  status text not null default 'new' check (status in ('new', 'in_progress', 'waiting', 'closed', 'ignored')),
  sources text[] not null default '{}' check (sources <@ array['gmail', 'webhook', 'manual']::text[]),
  last_inbound_seq bigint not null default 0 check (last_inbound_seq between 0 and 9007199254740991),
  last_read_seq bigint not null default 0 check (last_read_seq between 0 and last_inbound_seq),
  unread boolean generated always as (last_inbound_seq > last_read_seq) stored,
  received_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  lead_id uuid references public.leads(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  case_id uuid references public.operation_cases(id) on delete set null,
  -- A durable split receipt stays on its new inquiry, independent of later edits.
  split_from_id uuid references public.inquiries(id) on delete set null,
  split_event_id uuid,
  split_key text check (length(split_key) between 1 and 200),
  unique (id, workspace_id),
  unique (workspace_id, split_key)
);

create table public.inquiry_events (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source text not null check (source in ('gmail', 'webhook', 'manual')),
  source_account_key text not null check (length(source_account_key) between 1 and 320),
  external_event_id text not null check (length(external_event_id) between 1 and 300),
  thread_id text check (length(thread_id) between 1 and 300),
  canonical_key text check (length(canonical_key) between 1 and 700),
  subject text not null check (length(subject) between 1 and 500),
  body text not null check (length(body) between 1 and 40000),
  contact jsonb not null default '{}' check (jsonb_typeof(contact) = 'object'),
  source_url text check (length(source_url) <= 2048 and source_url ~ '^https?://'),
  received_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  -- Arrival routing order is independent of the provider's message timestamp.
  -- Moving a thread event during a split makes that inquiry the route for replies.
  routed_at timestamptz not null default clock_timestamp(),
  inbound_seq bigint not null check (inbound_seq between 0 and 9007199254740991),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  foreign key (inquiry_id, workspace_id) references public.inquiries(id, workspace_id) on delete cascade,
  unique (workspace_id, source, source_account_key, external_event_id)
);

create table public.inquiry_sync_states (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  account_key text not null check (length(account_key) between 1 and 320),
  state jsonb not null default '{}' check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 65536),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text check (length(last_error) <= 500),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (workspace_id, account_key),
  check ((lease_token is null) = (lease_expires_at is null))
);

create index inquiries_workspace_received_idx on public.inquiries(workspace_id, received_at desc, id);
create index inquiries_workspace_unread_idx on public.inquiries(workspace_id, received_at desc)
  where unread and status not in ('closed', 'ignored') and classification <> 'ignored';
create index inquiry_events_timeline_idx on public.inquiry_events(workspace_id, inquiry_id, received_at, id);
create index inquiry_events_canonical_idx on public.inquiry_events(workspace_id, canonical_key) where canonical_key is not null;
create index inquiry_events_thread_idx on public.inquiry_events(workspace_id, source, source_account_key, thread_id, routed_at desc)
  where thread_id is not null;

alter table public.inquiries enable row level security;
alter table public.inquiry_events enable row level security;
alter table public.inquiry_sync_states enable row level security;
revoke all on public.inquiries, public.inquiry_events, public.inquiry_sync_states from public, anon, authenticated, service_role;
grant select on public.inquiries, public.inquiry_events, public.inquiry_sync_states to service_role;

create or replace function public.inquiry_command_v1(p_workspace_id uuid, p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set timezone = 'UTC'
set lock_timeout = '5s'
as $$
declare
  v_action text := p_command->>'action';
  v_inquiry public.inquiries%rowtype;
  v_original public.inquiries%rowtype;
  v_event public.inquiry_events%rowtype;
  v_canonical public.inquiry_events%rowtype;
  v_sync public.inquiry_sync_states%rowtype;
  v_now timestamptz;
  v_id uuid;
  v_event_id uuid;
  v_lease uuid;
  v_account text;
  v_source text;
  v_external text;
  v_thread text;
  v_canonical_key text;
  v_subject text;
  v_body text;
  v_url text;
  v_received timestamptz;
  v_contact jsonb;
  v_hash text;
  v_seq bigint;
  v_seen bigint;
  v_historical boolean;
  v_patch jsonb;
  v_key text;
  v_reference uuid;
  v_split_key text;
  v_status text;
begin
  if p_workspace_id is null or not exists (select 1 from public.workspaces where id = p_workspace_id)
    or p_command is null or jsonb_typeof(p_command) <> 'object'
    or v_action is null or v_action not in ('ingest', 'mark_read', 'update', 'split', 'claim_sync', 'save_sync', 'release_sync')
  then return jsonb_build_object('status', 'invalid-input', 'error', 'invalid-command'); end if;

  -- One consistent lock covers event identity, canonical identity, thread routing,
  -- read high-water marks, splits and lease fencing. All writes share this RPC.
  perform pg_advisory_xact_lock(hashtextextended('inquiries:' || p_workspace_id::text, 0));
  v_now := clock_timestamp();

  if v_action in ('claim_sync', 'save_sync', 'release_sync') then
    v_account := p_command->>'accountKey';
    if jsonb_typeof(p_command->'accountKey') is distinct from 'string' or length(btrim(v_account)) not between 1 and 320 then
      return jsonb_build_object('status', 'invalid-input', 'error', 'invalid-account');
    end if;
    if v_action = 'claim_sync' then
      insert into public.inquiry_sync_states(workspace_id, account_key) values (p_workspace_id, v_account) on conflict do nothing;
      select * into v_sync from public.inquiry_sync_states where workspace_id = p_workspace_id and account_key = v_account for update;
      if v_sync.lease_token is not null and v_sync.lease_expires_at > v_now then
        return jsonb_build_object('status', 'busy', 'state', v_sync.state, 'sync', to_jsonb(v_sync) - 'lease_token', 'retryable', true);
      end if;
      update public.inquiry_sync_states set lease_token = gen_random_uuid(), lease_expires_at = v_now + interval '120 seconds',
        last_attempt_at = v_now, updated_at = v_now
        where workspace_id = p_workspace_id and account_key = v_account returning * into v_sync;
    else
      if jsonb_typeof(p_command->'leaseToken') is distinct from 'string' then
        return jsonb_build_object('status', 'invalid-input', 'error', 'invalid-lease');
      end if;
      v_lease := (p_command->>'leaseToken')::uuid;
      select * into v_sync from public.inquiry_sync_states where workspace_id = p_workspace_id and account_key = v_account for update;
      if v_sync.lease_token is distinct from v_lease or v_sync.lease_expires_at is null or v_sync.lease_expires_at <= v_now then
        return jsonb_build_object('status', 'conflict', 'error', 'stale-lease', 'retryable', true);
      end if;
      if v_action = 'save_sync' then
        if jsonb_typeof(p_command->'state') is distinct from 'object' or octet_length((p_command->'state')::text) > 65536
          or (p_command ? 'success' and jsonb_typeof(p_command->'success') <> 'boolean')
          or (p_command ? 'error' and jsonb_typeof(p_command->'error') not in ('string', 'null'))
          or length(p_command->>'error') > 500
        then return jsonb_build_object('status', 'invalid-input', 'error', 'invalid-sync-state'); end if;
        update public.inquiry_sync_states set state = p_command->'state', lease_expires_at = v_now + interval '120 seconds', updated_at = v_now,
          last_success_at = case when p_command->'success' = 'true'::jsonb then v_now else last_success_at end,
          last_error = case when p_command->'success' = 'true'::jsonb then null
            when p_command->'success' = 'false'::jsonb then coalesce(nullif(p_command->>'error', ''), 'sync-failed') else last_error end
          where workspace_id = p_workspace_id and account_key = v_account returning * into v_sync;
      else
        update public.inquiry_sync_states set lease_token = null, lease_expires_at = null, updated_at = v_now
          where workspace_id = p_workspace_id and account_key = v_account returning * into v_sync;
      end if;
    end if;
    return jsonb_build_object('status', 'saved', 'state', v_sync.state, 'sync', to_jsonb(v_sync) - 'lease_token', 'leaseToken', v_sync.lease_token);
  end if;

  if v_action = 'ingest' then
    v_source := p_command->>'source'; v_account := p_command->>'sourceAccountKey'; v_external := p_command->>'externalEventId';
    v_thread := nullif(p_command->>'threadId', ''); v_canonical_key := nullif(p_command->>'canonicalKey', '');
    v_subject := coalesce(nullif(btrim(p_command->>'subject'), ''), '제목 없는 문의'); v_body := p_command->>'body';
    v_url := nullif(p_command->>'sourceUrl', ''); v_contact := coalesce(p_command->'contact', '{}'::jsonb);
    if not coalesce(v_source in ('gmail', 'webhook', 'manual') and jsonb_typeof(p_command->'sourceAccountKey') = 'string'
      and length(btrim(v_account)) between 1 and 320 and jsonb_typeof(p_command->'externalEventId') = 'string'
      and length(btrim(v_external)) between 1 and 300 and jsonb_typeof(p_command->'body') = 'string'
      and length(btrim(v_body)) between 1 and 40000 and jsonb_typeof(v_contact) = 'object'
      and coalesce(p_command->>'kind', 'general') in ('sales', 'support', 'partnership', 'general')
      and coalesce(p_command->>'classification', 'review') in ('inquiry', 'review', 'ignored')
      and coalesce(p_command->>'orgScope', 'unclassified') in ('classin', 'personal', 'unclassified')
      and jsonb_typeof(p_command->'receivedAt') = 'string', false)
      or (p_command ? 'historical' and jsonb_typeof(p_command->'historical') <> 'boolean')
    then return jsonb_build_object('status', 'invalid-input', 'error', 'invalid-inquiry'); end if;
    foreach v_key in array array['threadId', 'canonicalKey', 'subject', 'sourceUrl', 'reason'] loop
      if p_command ? v_key and jsonb_typeof(p_command->v_key) not in ('string', 'null') then
        return jsonb_build_object('status', 'invalid-input', 'error', 'invalid-inquiry');
      end if;
    end loop;
    foreach v_key in array array['name', 'email', 'phone'] loop
      if v_contact ? v_key and jsonb_typeof(v_contact->v_key) not in ('string', 'null') then
        return jsonb_build_object('status', 'invalid-input', 'error', 'invalid-contact');
      end if;
    end loop;
    v_contact := jsonb_build_object('name', coalesce(v_contact->>'name', ''), 'email', coalesce(v_contact->>'email', ''), 'phone', coalesce(v_contact->>'phone', ''));
    if length(v_thread) > 300 or length(v_canonical_key) > 700 or length(v_subject) > 500
      or length(p_command->>'reason') > 1000 or length(v_contact->>'name') > 200 or length(v_contact->>'email') > 320 or length(v_contact->>'phone') > 100
      or (v_contact->>'email' <> '' and v_contact->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
      or (v_url is not null and (length(v_url) > 2048 or v_url !~ '^https?://[^[:space:]/?#]+'))
    then return jsonb_build_object('status', 'invalid-input', 'error', 'invalid-inquiry'); end if;
    v_received := (p_command->>'receivedAt')::timestamptz;
    if not isfinite(v_received) then return jsonb_build_object('status', 'invalid-input', 'error', 'invalid-date'); end if;
    v_historical := coalesce((p_command->>'historical')::boolean, false);

    if p_command ? 'leaseToken' or p_command ? 'accountKey' then
      if v_source <> 'gmail' or (p_command->>'accountKey') is distinct from v_account or jsonb_typeof(p_command->'leaseToken') is distinct from 'string' then
        return jsonb_build_object('status', 'invalid-input', 'error', 'invalid-ingest-lease');
      end if;
      v_lease := (p_command->>'leaseToken')::uuid;
      select * into v_sync from public.inquiry_sync_states where workspace_id = p_workspace_id and account_key = v_account;
      if v_sync.lease_token is distinct from v_lease or v_sync.lease_expires_at is null or v_sync.lease_expires_at <= v_now then
        return jsonb_build_object('status', 'conflict', 'error', 'stale-lease', 'retryable', true);
      end if;
    end if;

    -- Classification, historical flags and lease tokens are processing metadata;
    -- rerunning a classifier cannot alter the immutable provider payload identity.
    v_hash := encode(sha256(convert_to(jsonb_build_object('source', v_source, 'account', v_account, 'event', v_external,
      'thread', v_thread, 'canonical', v_canonical_key, 'subject', v_subject, 'body', v_body, 'contact', v_contact,
      'receivedAt', v_received, 'sourceUrl', v_url)::text, 'UTF8')), 'hex');
    select * into v_event from public.inquiry_events where workspace_id = p_workspace_id and source = v_source
      and source_account_key = v_account and external_event_id = v_external;
    if v_event.id is not null then
      select * into v_inquiry from public.inquiries where id = v_event.inquiry_id and workspace_id = p_workspace_id;
      if v_event.payload_hash <> v_hash then
        return jsonb_build_object('status', 'conflict', 'error', 'event-key-reused', 'inquiry', to_jsonb(v_inquiry), 'retryable', false);
      end if;
      return jsonb_build_object('status', 'duplicate', 'inquiry', to_jsonb(v_inquiry));
    end if;

    if v_canonical_key is not null then
      select * into v_canonical from public.inquiry_events where workspace_id = p_workspace_id and canonical_key = v_canonical_key order by created_at, id limit 1;
    end if;
    if v_canonical.id is not null then
      v_id := v_canonical.inquiry_id;
    elsif v_thread is not null then
      select inquiry_id into v_id from public.inquiry_events where workspace_id = p_workspace_id and source = v_source
        and source_account_key = v_account and thread_id = v_thread order by routed_at desc, id desc limit 1;
    end if;
    if v_id is not null then select * into v_inquiry from public.inquiries where id = v_id and workspace_id = p_workspace_id for update; end if;
    if v_inquiry.id is null then
      v_seq := case when v_historical then 0 else 1 end;
      insert into public.inquiries(workspace_id, org_scope, kind, classification, reason, subject, contact_name, contact_email, contact_phone,
        status, sources, last_inbound_seq, received_at, updated_at)
        values (p_workspace_id, coalesce(p_command->>'orgScope', 'unclassified'), coalesce(p_command->>'kind', 'general'),
          coalesce(p_command->>'classification', 'review'), coalesce(p_command->>'reason', ''), v_subject,
          v_contact->>'name', v_contact->>'email', v_contact->>'phone',
          case when p_command->>'classification' = 'ignored' then 'ignored' else 'new' end, array[v_source], v_seq, v_received, v_now)
        returning * into v_inquiry;
    else
      v_seq := case when v_canonical.id is not null then v_canonical.inbound_seq when v_historical then 0 else v_inquiry.last_inbound_seq + 1 end;
      update public.inquiries set sources = array(select distinct s from unnest(sources || array[v_source]) s order by s),
        last_inbound_seq = greatest(last_inbound_seq, v_seq), received_at = greatest(received_at, v_received),
        status = case when v_canonical.id is null and not v_historical and status in ('closed', 'waiting') and classification <> 'ignored' then 'in_progress' else status end,
        updated_at = greatest(v_now, updated_at + interval '1 microsecond')
        where id = v_inquiry.id and workspace_id = p_workspace_id returning * into v_inquiry;
    end if;
    insert into public.inquiry_events(inquiry_id, workspace_id, source, source_account_key, external_event_id, thread_id, canonical_key,
      subject, body, contact, source_url, received_at, created_at, routed_at, inbound_seq, payload_hash)
      values (v_inquiry.id, p_workspace_id, v_source, v_account, v_external, v_thread, v_canonical_key,
        v_subject, v_body, v_contact, v_url, v_received, v_now,
        -- Late notification evidence belongs to its original canonical inquiry,
        -- but must not redirect a thread that the operator has since split.
        case when v_canonical.id is not null then v_canonical.routed_at else v_now end, v_seq, v_hash);
    return jsonb_build_object('status', 'saved', 'inquiry', to_jsonb(v_inquiry));
  end if;

  if jsonb_typeof(p_command->'id') is distinct from 'string' then return jsonb_build_object('status', 'invalid-input', 'error', 'invalid-id'); end if;
  v_id := (p_command->>'id')::uuid;
  if v_action = 'split' then
    v_split_key := p_command->>'idempotencyKey';
    if jsonb_typeof(p_command->'idempotencyKey') is distinct from 'string' or length(btrim(v_split_key)) not between 1 and 200
      or jsonb_typeof(p_command->'eventId') is distinct from 'string'
    then return jsonb_build_object('status', 'invalid-input', 'error', 'invalid-split'); end if;
    v_event_id := (p_command->>'eventId')::uuid;
    select * into v_inquiry from public.inquiries where workspace_id = p_workspace_id and split_key = v_split_key;
    if v_inquiry.id is not null then
      if v_inquiry.split_from_id is distinct from v_id or v_inquiry.split_event_id is distinct from v_event_id then
        return jsonb_build_object('status', 'conflict', 'error', 'split-key-reused', 'retryable', false);
      end if;
      return jsonb_build_object('status', 'duplicate', 'inquiry', to_jsonb(v_inquiry));
    end if;
  end if;
  select * into v_inquiry from public.inquiries where id = v_id and workspace_id = p_workspace_id for update;
  if v_inquiry.id is null then return jsonb_build_object('status', 'not-found', 'error', 'inquiry-not-found'); end if;

  if v_action = 'mark_read' then
    if jsonb_typeof(p_command->'seenSeq') is distinct from 'number' or p_command->>'seenSeq' !~ '^[0-9]+$' then
      return jsonb_build_object('status', 'invalid-input', 'error', 'invalid-read-sequence');
    end if;
    v_seen := (p_command->>'seenSeq')::bigint;
    if v_seen > 9007199254740991 then return jsonb_build_object('status', 'invalid-input', 'error', 'invalid-read-sequence'); end if;
    update public.inquiries set last_read_seq = greatest(last_read_seq, least(last_inbound_seq, v_seen)),
      updated_at = case when greatest(last_read_seq, least(last_inbound_seq, v_seen)) > last_read_seq
        then greatest(v_now, updated_at + interval '1 microsecond') else updated_at end
      where id = v_id and workspace_id = p_workspace_id returning * into v_inquiry;
  elsif v_action = 'update' then
    v_patch := p_command->'patch';
    if jsonb_typeof(v_patch) is distinct from 'object' or v_patch = '{}'::jsonb
      or v_patch - array['org_scope', 'kind', 'classification', 'reason', 'subject', 'contact_name', 'contact_email', 'contact_phone', 'status', 'lead_id', 'deal_id', 'case_id'] <> '{}'::jsonb
      or jsonb_typeof(p_command->'expectedUpdatedAt') is distinct from 'string'
    then return jsonb_build_object('status', 'invalid-input', 'error', 'invalid-update'); end if;
    if v_inquiry.updated_at <> (p_command->>'expectedUpdatedAt')::timestamptz then
      return jsonb_build_object('status', 'conflict', 'error', 'stale-update', 'inquiry', to_jsonb(v_inquiry), 'retryable', false);
    end if;
    for v_key in select jsonb_object_keys(v_patch) loop
      if v_key in ('lead_id', 'deal_id', 'case_id') then
        if jsonb_typeof(v_patch->v_key) not in ('string', 'null') then return jsonb_build_object('status', 'invalid-input', 'error', 'invalid-reference'); end if;
        v_reference := (v_patch->>v_key)::uuid;
        if v_reference is not null and (
          (v_key = 'lead_id' and not exists(select 1 from public.leads where id = v_reference and workspace_id = p_workspace_id))
          or (v_key = 'deal_id' and not exists(select 1 from public.deals where id = v_reference and workspace_id = p_workspace_id))
          or (v_key = 'case_id' and not exists(select 1 from public.operation_cases where id = v_reference and workspace_id = p_workspace_id)))
        then return jsonb_build_object('status', 'invalid-input', 'error', 'invalid-reference'); end if;
      elsif jsonb_typeof(v_patch->v_key) is distinct from 'string' then
        return jsonb_build_object('status', 'invalid-input', 'error', 'invalid-update');
      end if;
    end loop;
    if (v_patch ? 'contact_email' and v_patch->>'contact_email' <> '' and v_patch->>'contact_email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
      return jsonb_build_object('status', 'invalid-input', 'error', 'invalid-contact');
    end if;
    update public.inquiries set org_scope = coalesce(v_patch->>'org_scope', org_scope), kind = coalesce(v_patch->>'kind', kind),
      classification = coalesce(v_patch->>'classification', classification), reason = coalesce(v_patch->>'reason', reason),
      subject = coalesce(v_patch->>'subject', subject), contact_name = coalesce(v_patch->>'contact_name', contact_name),
      contact_email = coalesce(v_patch->>'contact_email', contact_email), contact_phone = coalesce(v_patch->>'contact_phone', contact_phone),
      status = coalesce(v_patch->>'status', status),
      lead_id = case when v_patch ? 'lead_id' then (v_patch->>'lead_id')::uuid else lead_id end,
      deal_id = case when v_patch ? 'deal_id' then (v_patch->>'deal_id')::uuid else deal_id end,
      case_id = case when v_patch ? 'case_id' then (v_patch->>'case_id')::uuid else case_id end,
      updated_at = greatest(v_now, updated_at + interval '1 microsecond')
      where id = v_id and workspace_id = p_workspace_id returning * into v_inquiry;
  elsif v_action = 'split' then
    select * into v_event from public.inquiry_events where id = v_event_id and inquiry_id = v_id and workspace_id = p_workspace_id;
    if v_event.id is null then return jsonb_build_object('status', 'not-found', 'error', 'event-not-found'); end if;
    if not exists (select 1 from public.inquiry_events where inquiry_id = v_id and workspace_id = p_workspace_id
      and id <> v_event_id and (v_event.canonical_key is null or canonical_key is distinct from v_event.canonical_key))
    then return jsonb_build_object('status', 'invalid-input', 'error', 'cannot-split-only-event'); end if;
    v_original := v_inquiry;
    v_seq := case when v_event.inbound_seq = 0 then 0 else 1 end;
    insert into public.inquiries(workspace_id, org_scope, kind, classification, reason, subject, contact_name, contact_email, contact_phone,
      status, last_inbound_seq, last_read_seq, received_at, updated_at, split_from_id, split_event_id, split_key)
      values (p_workspace_id, v_original.org_scope, v_original.kind, v_original.classification, v_original.reason, v_event.subject,
        coalesce(nullif(v_event.contact->>'name', ''), v_original.contact_name),
        coalesce(nullif(v_event.contact->>'email', ''), v_original.contact_email),
        coalesce(nullif(v_event.contact->>'phone', ''), v_original.contact_phone), 'new', v_seq,
        case when v_event.inbound_seq <= v_original.last_read_seq then v_seq else 0 end,
        v_event.received_at, v_now, v_id, v_event_id, v_split_key) returning * into v_inquiry;
    update public.inquiry_events set inquiry_id = v_inquiry.id, inbound_seq = v_seq, routed_at = v_now
      where workspace_id = p_workspace_id and inquiry_id = v_id
        and (id = v_event_id or (v_event.canonical_key is not null and canonical_key = v_event.canonical_key));
    update public.inquiries set sources = array(select distinct source from public.inquiry_events where inquiry_id = v_inquiry.id order by source),
      received_at = (select max(received_at) from public.inquiry_events where inquiry_id = v_inquiry.id)
      where id = v_inquiry.id returning * into v_inquiry;
    update public.inquiries set sources = array(select distinct source from public.inquiry_events where inquiry_id = v_id order by source),
      received_at = (select max(received_at) from public.inquiry_events where inquiry_id = v_id),
      last_read_seq = case when not exists(select 1 from public.inquiry_events where inquiry_id = v_id and inbound_seq > v_original.last_read_seq)
        then last_inbound_seq else last_read_seq end,
      updated_at = greatest(v_now, updated_at + interval '1 microsecond') where id = v_id and workspace_id = p_workspace_id;
  end if;
  return jsonb_build_object('status', 'saved', 'inquiry', to_jsonb(v_inquiry));
exception
  -- Input/constraint failures roll back the whole function's subtransaction.
  when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format
    or check_violation or foreign_key_violation or not_null_violation then
    return jsonb_build_object('status', 'invalid-input', 'error', 'invalid-command', 'retryable', false);
end;
$$;

revoke all on function public.inquiry_command_v1(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.inquiry_command_v1(uuid, jsonb) to service_role;

commit;
