-- Read-only Office request metadata across origins; body/results stay in the
-- existing actor/workspace-bound receipt endpoint. No new business ledger.
create index if not exists office_requests_inbox_idx on public.office_requests
  (workspace_id,actor_id,scope,created_at desc,id desc);
revoke all on public.office_requests from public,anon,authenticated,service_role;

create or replace function public.office_request_inbox_v1(p_workspace_id uuid,p_actor_id text,p_scope text,p_limit integer default 20,p_before jsonb default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_rows jsonb;v_limit integer:=coalesce(p_limit,20);v_time timestamptz;v_id uuid;
begin
  -- office_inbox_metadata_v1: select only the metadata columns below. Never use
  -- the private full-row receipt helper, refresh an application, or write here.
  if not public.office_identity_valid_v1(p_workspace_id,p_actor_id) or p_scope is null
    or p_scope not in ('personal','classin') or v_limit<1 or v_limit>20 then
    return jsonb_build_object('status','invalid-input','error','invalid-query');
  end if;
  if p_before is not null then
    if jsonb_typeof(p_before) is distinct from 'object' or p_before-array['id','createdAt'] <> '{}'::jsonb
      or jsonb_typeof(p_before->'id') is distinct from 'string' or jsonb_typeof(p_before->'createdAt') is distinct from 'string'
      or p_before->>'createdAt' !~ '^\d{4}-\d{2}-\d{2}T' then
      return jsonb_build_object('status','invalid-input','error','invalid-cursor');
    end if;
    v_time:=(p_before->>'createdAt')::timestamptz;v_id:=(p_before->>'id')::uuid;
    if v_time is null or not isfinite(v_time) or v_id is null then return jsonb_build_object('status','invalid-input','error','invalid-cursor'); end if;
  end if;
  select coalesce(jsonb_agg(item order by created_at desc,id desc),'[]'::jsonb) into v_rows from (
    select r.id,r.created_at,jsonb_build_object('requestId',r.id,'createdAt',r.created_at,'intent',r.intent,'scope',r.scope,
      'ownerId',r.owner_id,'mode',r.mode,'participants',r.participants,
      'originRef',case when r.intent='weekly_report' then jsonb_build_object('periodStart',r.origin_ref->>'periodStart',
        'periodEnd',r.origin_ref->>'periodEnd','timezone',r.origin_ref->>'timezone')
        else jsonb_build_object('entityType',r.origin_ref->>'entityType','entityId',r.origin_ref->>'entityId') end,
      'status',case when r.expires_at<=now() then 'expired' when r.state='running' and r.deadline_at<=now() then 'unknown' else r.state end,
      'state',case when r.expires_at<=now() then 'expired' when r.state='running' and r.deadline_at<=now() then 'unknown' else r.state end,
      'expired',r.expires_at<=now()) as item
    from public.office_requests r where r.workspace_id=p_workspace_id and r.actor_id=p_actor_id and r.scope=p_scope
      and r.intent in ('weekly_report','customer_reply') and (p_before is null or (r.created_at,r.id)<(v_time,v_id))
    order by r.created_at desc,r.id desc limit v_limit+1
  ) rows;
  return jsonb_build_object('status','ready','items',v_rows);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or invalid_time_zone_displacement_value then
  return jsonb_build_object('status','invalid-input','error','invalid-cursor');
end; $$;

revoke all on function public.office_request_inbox_v1(uuid,text,text,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.office_request_inbox_v1(uuid,text,text,integer,jsonb) to service_role;
