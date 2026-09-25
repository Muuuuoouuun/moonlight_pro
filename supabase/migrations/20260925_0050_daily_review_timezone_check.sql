-- save_daily_review_v1 validated p_timezone by looking it up in the system timezone-name catalog
-- view, which measured 500ms+ per call under load (explain analyze) and matched save_daily_review_v1's
-- pg_stat_statements mean/max since 8/25. Replace the catalog lookup with a cheap shape check plus a
-- behavioral resolve through pg_catalog.timezone(), which is the same validation PostgreSQL itself
-- performs and costs single-digit milliseconds. 'UTC' and slash-separated IANA-shaped names ('Area/Location')
-- are attempted; anything else (bare abbreviations like 'KST', POSIX offsets like 'UTC+9') is rejected
-- without a lookup. A shape match that is not a real zone (e.g. 'Mars/Olympus') still fails, because
-- pg_catalog.timezone() raises for it and the exception handler leaves v_timezone_ok false.
-- No explicit begin/commit: moonlight_ops.apply_migration() runs this file's SQL via SPI
-- EXECUTE inside its own transaction, which rejects transaction control statements (0044).

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
  v_timezone_ok boolean := false;
begin
  if p_timezone = 'UTC' or p_timezone ~ '^[A-Z][A-Za-z_]+(/[A-Za-z0-9_+-]+)+$' then
    begin
      perform pg_catalog.timezone(p_timezone, pg_catalog.now());
      v_timezone_ok := true;
    exception when others then
      v_timezone_ok := false;
    end;
  end if;

  if p_workspace_id is null or not exists (select 1 from public.workspaces where id = p_workspace_id)
    or p_request_id is null or p_expected_revision is null or p_expected_revision < 0
    or p_expected_revision >= 9007199254740991
    or p_review_date is null or p_review_date < date '0001-01-01' or p_review_date > date '9999-12-31'
    or not v_timezone_ok
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
