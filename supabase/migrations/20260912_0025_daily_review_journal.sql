-- R0: shared journal foundation and a single daily review per workspace/date.
-- The Hub resolves workspace and timezone before this service-role-only RPC.
begin;

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entry_kind text not null default 'note' check (entry_kind in ('note', 'daily_review')),
  occurred_at timestamptz not null default now(),
  body text not null default '',
  title text,
  source text not null default 'hub' check (source in ('hub', 'paste', 'import')),
  source_ref text,
  content_hash text,
  review_date date,
  review_timezone text,
  focus_target text,
  review_data jsonb not null default '{}'::jsonb,
  review_revision bigint not null default 1 check (review_revision between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journal_entries_note_shape check (
    entry_kind <> 'note' or (
      body !~ '^[[:space:]]*$'
      and review_date is null and review_timezone is null
      and focus_target is null and review_data = '{}'::jsonb
    )
  ),
  constraint journal_entries_daily_review_shape check (
    entry_kind <> 'daily_review' or coalesce(
      review_date between date '0001-01-01' and date '9999-12-31'
      and review_timezone is not null and review_timezone !~ '^[[:space:]]*$'
      and focus_target is not null and length(focus_target) <= 500
      and length(body) <= 4000
      and jsonb_typeof(review_data) = 'object'
      and review_data ?& array['energy', 'progress']
      and (review_data - array['energy', 'progress']) = '{}'::jsonb
      and review_data->'energy' in ('null'::jsonb, '1'::jsonb, '2'::jsonb, '3'::jsonb, '4'::jsonb, '5'::jsonb)
      and review_data->'progress' in ('null'::jsonb, '0'::jsonb, '1'::jsonb, '2'::jsonb, '"not_applicable"'::jsonb)
      and (jsonb_typeof(review_data->'progress') <> 'number' or focus_target !~ '^[[:space:]]*$')
      and (review_data->'energy' <> 'null'::jsonb or focus_target !~ '^[[:space:]]*$'
        or review_data->'progress' <> 'null'::jsonb or body !~ '^[[:space:]]*$'),
      false
    )
  )
);

create unique index if not exists journal_entries_daily_review_date_uidx
  on public.journal_entries (workspace_id, review_date)
  where entry_kind = 'daily_review';

-- Import deduplication applies only to general notes, never to daily answers.
create unique index if not exists journal_entries_note_hash_uidx
  on public.journal_entries (workspace_id, content_hash)
  where entry_kind = 'note' and content_hash is not null;

create index if not exists journal_entries_timeline_idx
  on public.journal_entries (workspace_id, occurred_at desc);

create table if not exists public.daily_review_receipts (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id uuid not null,
  review_date date not null,
  request_payload jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, request_id)
);

alter table public.journal_entries enable row level security;
alter table public.daily_review_receipts enable row level security;
revoke all on public.journal_entries, public.daily_review_receipts from public, anon, authenticated;
grant select, insert, update, delete on public.journal_entries, public.daily_review_receipts to service_role;

create or replace function public.save_daily_review_v1(
  p_workspace_id uuid,
  p_review_date date,
  p_timezone text,
  p_energy integer,
  p_focus text,
  p_progress jsonb,
  p_note text,
  p_expected_revision bigint,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_progress jsonb := coalesce(p_progress, 'null'::jsonb);
  v_review_data jsonb;
  v_request_payload jsonb;
  v_entry public.journal_entries%rowtype;
  v_receipt public.daily_review_receipts%rowtype;
  v_response jsonb;
begin
  if p_workspace_id is null or not exists (select 1 from public.workspaces where id = p_workspace_id)
    or p_request_id is null or p_expected_revision is null or p_expected_revision < 0
    or p_expected_revision >= 9007199254740991
    or p_review_date is null or p_review_date < date '0001-01-01' or p_review_date > date '9999-12-31'
    or p_timezone is null or not exists (select 1 from pg_timezone_names where name = p_timezone)
    or (p_energy is not null and p_energy not between 1 and 5)
    or p_focus is null or length(p_focus) > 500
    or p_note is null or length(p_note) > 4000
    or v_progress not in ('null'::jsonb, '0'::jsonb, '1'::jsonb, '2'::jsonb, '"not_applicable"'::jsonb)
    or (jsonb_typeof(v_progress) = 'number' and p_focus ~ '^[[:space:]]*$')
    or (p_energy is null and p_focus ~ '^[[:space:]]*$' and v_progress = 'null'::jsonb and p_note ~ '^[[:space:]]*$')
  then
    return jsonb_build_object('status', 'invalid-input', 'error', 'invalid-review', 'review', null);
  end if;

  v_review_data := jsonb_build_object('energy', p_energy, 'progress', v_progress);
  -- Timezone is server configuration, not user input. Changing that configuration
  -- between retries must not turn the same user request into a different one.
  v_request_payload := jsonb_build_object(
    'reviewDate', p_review_date, 'energy', p_energy, 'focus', p_focus,
    'progress', v_progress, 'note', p_note, 'expectedRevision', p_expected_revision
  );

  -- Request lock first, date lock second: same key/different dates and different
  -- keys/same date both serialize without a read-then-insert race.
  perform pg_advisory_xact_lock(hashtextextended('daily-review-request:' || p_workspace_id::text || ':' || p_request_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('daily-review-date:' || p_workspace_id::text || ':' || p_review_date::text, 0));

  select * into v_entry from public.journal_entries
    where workspace_id = p_workspace_id and entry_kind = 'daily_review' and review_date = p_review_date
    for update;
  select * into v_receipt from public.daily_review_receipts
    where workspace_id = p_workspace_id and request_id = p_request_id;

  if v_receipt.request_id is not null then
    if v_receipt.request_payload is distinct from v_request_payload then
      return jsonb_build_object('status', 'conflict', 'error', 'request-id-reused',
        'review', case when v_entry.id is null then null else to_jsonb(v_entry) end);
    end if;
    if v_entry.id is null then
      return jsonb_build_object('status', 'conflict', 'error', 'review-no-longer-exists', 'review', null);
    end if;
    -- Keep the original receipt for audit, but return the latest row so retrying
    -- a timed-out earlier save cannot roll the browser back to an old revision.
    return jsonb_build_object('status', 'duplicate', 'review', to_jsonb(v_entry));
  end if;

  if v_entry.id is null then
    if p_expected_revision <> 0 then
      return jsonb_build_object('status', 'conflict', 'error', 'revision-without-review', 'review', null);
    end if;
    insert into public.journal_entries (
      workspace_id, entry_kind, occurred_at, body, source,
      review_date, review_timezone, focus_target, review_data, review_revision
    ) values (
      p_workspace_id, 'daily_review', p_review_date::timestamp at time zone p_timezone, p_note, 'hub',
      p_review_date, p_timezone, p_focus, v_review_data, 1
    ) returning * into v_entry;
  else
    if p_expected_revision <> v_entry.review_revision then
      return jsonb_build_object('status', 'conflict',
        'error', case when p_expected_revision = 0 then 'date-exists' else 'stale-revision' end,
        'review', to_jsonb(v_entry));
    end if;
    update public.journal_entries
      set body = p_note, focus_target = p_focus, review_data = v_review_data,
        review_revision = review_revision + 1, updated_at = clock_timestamp()
      where id = v_entry.id and workspace_id = p_workspace_id
      returning * into v_entry;
  end if;

  v_response := jsonb_build_object('status', 'saved', 'review', to_jsonb(v_entry));
  insert into public.daily_review_receipts (workspace_id, request_id, review_date, request_payload, response)
    values (p_workspace_id, p_request_id, p_review_date, v_request_payload, v_response);
  return v_response;
end;
$$;

revoke all on function public.save_daily_review_v1(uuid, date, text, integer, text, jsonb, text, bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.save_daily_review_v1(uuid, date, text, integer, text, jsonb, text, bigint, uuid)
  to service_role;

commit;
