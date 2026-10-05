-- Explicit service review and contract-only registration; no payment observations are invented.
create or replace function public.finance_review_valid_v1(p_entity text,p_changes jsonb) returns boolean
language plpgsql immutable set search_path=pg_catalog,public as $$
declare k text; v jsonb; s text;
begin
 if p_entity not in ('entry','subscription') or jsonb_typeof(p_changes) is distinct from 'object' or p_changes='{}'::jsonb then return false; end if;
 for k,v in select * from jsonb_each(p_changes) loop
  if (p_entity='entry' and k not in ('purpose','claimStatus','approvedAmount','recoveredAmount','note')) or
   (p_entity='subscription' and k not in ('amount','currency','cycle','nextDate','accountAlias','usageNote','purpose','serviceStatus','resumeDate')) then return false; end if;
  s=v#>>'{}';
  if k='purpose' and (s is null or s not in ('unclassified','personal','business','company')) then return false; end if;
  if k='claimStatus' and (s is null or s not in ('unknown','preparing','submitted','approved','partial','rejected','on_hold')) then return false; end if;
  if k in ('amount','approvedAmount','recoveredAmount') and v<>'null'::jsonb then
   if jsonb_typeof(v)<>'number' or s!~'^[0-9]+$' or s::numeric>1000000000000 then return false; end if;
  end if;
  if k='currency' and v<>'null'::jsonb and s<>'KRW' then return false; end if;
  if k='cycle' and v<>'null'::jsonb and s not in ('monthly','quarterly','annual') then return false; end if;
  if k='serviceStatus' and (jsonb_typeof(v)<>'string' or s not in ('unknown','active','paused','cancelled')) then return false; end if;
  if k in ('nextDate','resumeDate') and v<>'null'::jsonb and (jsonb_typeof(v)<>'string' or s!~'^\d{4}-\d{2}-\d{2}$' or to_char(s::date,'YYYY-MM-DD')<>s) then return false; end if;
  if k in ('note','usageNote','accountAlias') and v<>'null'::jsonb and (jsonb_typeof(v)<>'string' or length(s)>case when k='accountAlias' then 120 else 4000 end) then return false; end if;
 end loop;
 if p_changes->>'resumeDate' is not null and coalesce(p_changes->>'serviceStatus','') not in ('paused','cancelled') then return false; end if;
 return true;
exception when others then return false;
end $$;
revoke all on function public.finance_review_valid_v1(text,jsonb) from public,anon,authenticated,service_role;

create or replace function public.finance_import_v1(p_workspace_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_import public.finance_imports; r jsonb; s jsonb; v_hash text; v_count integer; v_gross bigint; v_refund bigint; v_net bigint; v_movement bigint;
begin
 if p_workspace_id is null or p_payload->>'version' is distinct from '1' or
  coalesce(p_payload->>'importKey','')!~'^[a-zA-Z0-9_:-]{1,120}$' or jsonb_typeof(p_payload->'coverage') is distinct from 'object' or
  coalesce(p_payload->>'from','')!~'^\d{4}-\d{2}-\d{2}$' or coalesce(p_payload->>'through','')!~'^\d{4}-\d{2}-\d{2}$' or
  (p_payload->>'from')::date>(p_payload->>'through')::date or
  jsonb_typeof(p_payload->'entries') is distinct from 'array' or jsonb_typeof(p_payload->'subscriptions') is distinct from 'array' then
  return jsonb_build_object('status','error','reason','invalid-input'); end if;
 if jsonb_array_length(p_payload->'entries')>5000 or jsonb_array_length(p_payload->'subscriptions')>100 or
  (jsonb_array_length(p_payload->'entries')=0 and (jsonb_array_length(p_payload->'subscriptions')=0 or p_payload->'coverage'->'contractsOnly' is distinct from 'true'::jsonb)) or
  (jsonb_array_length(p_payload->'entries')>0 and p_payload->'coverage'->'contractsOnly'='true'::jsonb) then return jsonb_build_object('status','error','reason','invalid-size'); end if;
 v_hash=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('finance:'||p_workspace_id::text,0));
 select * into v_import from public.finance_imports where workspace_id=p_workspace_id and import_key=p_payload->>'importKey';
 if found then return jsonb_build_object('status',case when v_import.input_hash=v_hash then 'duplicate' else 'conflict' end,'importId',v_import.id); end if;
 for r in select value from jsonb_array_elements(p_payload->'entries') loop
  if coalesce(r->>'sourceKey','')!~'^[a-zA-Z0-9_:-]{1,120}$' or coalesce(r->>'type','') not in ('expense','movement') or r->>'currency' is distinct from 'KRW' or
   coalesce(r->>'date','')!~'^\d{4}-\d{2}-\d{2}$' or (r->>'date')::date not between (p_payload->>'from')::date and (p_payload->>'through')::date or
   coalesce(length(r->>'merchant'),0) not between 1 and 300 or coalesce(length(r->>'source'),0) not between 1 and 80 then return jsonb_build_object('status','error','reason','invalid-observation'); end if;
  if exists(select 1 from jsonb_each(r) x where x.key in ('grossAmount','refundAmount','netAmount','movementAmount') and (jsonb_typeof(x.value)<>'number' or x.value#>>'{}' !~'^-?[0-9]+$')) or not r ?& array['grossAmount','refundAmount','netAmount','movementAmount'] then return jsonb_build_object('status','error','reason','invalid-amount'); end if;
  v_gross=(r->>'grossAmount')::bigint;v_refund=(r->>'refundAmount')::bigint;v_net=(r->>'netAmount')::bigint;v_movement=(r->>'movementAmount')::bigint;
  if v_gross not between 0 and 1000000000000 or v_refund not between 0 and 1000000000000 or abs(v_net)>1000000000000 or abs(v_movement)>1000000000000 or
   (r->>'type'='expense' and (v_net<>v_gross-v_refund or v_movement<>0)) or
   (r->>'type'='movement' and (v_gross<>0 or v_refund<>0 or v_net<>0 or coalesce(r->>'walletKind','') not in ('topup','payment','refund') or (r->>'walletKind'='payment' and v_movement>0) or (r->>'walletKind'<>'payment' and v_movement<0))) then return jsonb_build_object('status','error','reason','invalid-amount'); end if;
  if r ? 'review' and not public.finance_review_valid_v1('entry',r->'review') then return jsonb_build_object('status','error','reason','invalid-review'); end if;
  if r->>'duplicateOf' is not null and not exists(select 1 from jsonb_array_elements(p_payload->'entries') x where x->>'sourceKey'=r->>'duplicateOf' and x->>'sourceKey'<>r->>'sourceKey' and x->>'duplicateOf' is null and x->>'type'='expense' and r->>'type'='expense' and x->>'date'=r->>'date' and x->>'netAmount'=r->>'netAmount' and x->>'source'<>r->>'source') then return jsonb_build_object('status','error','reason','unverified-duplicate'); end if;
 end loop;
 for s in select value from jsonb_array_elements(p_payload->'subscriptions') loop
  if coalesce(s->>'sourceKey','')!~'^[a-zA-Z0-9_:-]{1,120}$' or coalesce(length(s->>'name'),0) not between 1 and 120 or
   s->>'amount' is not null or s->>'currency' is not null or s->>'cycle' is not null or s->>'nextDate' is not null or s->>'serviceStatus' is not null or s->>'resumeDate' is not null then return jsonb_build_object('status','error','reason','invalid-contract'); end if;
 end loop;
 select count(distinct value->>'sourceKey') into v_count from jsonb_array_elements(p_payload->'entries');
 if v_count<>jsonb_array_length(p_payload->'entries') then return jsonb_build_object('status','error','reason','duplicate-key'); end if;
 select count(distinct value->>'sourceKey') into v_count from jsonb_array_elements(p_payload->'subscriptions');
 if v_count<>jsonb_array_length(p_payload->'subscriptions') then return jsonb_build_object('status','error','reason','duplicate-key'); end if;
 if exists(select 1 from public.finance_entries e join jsonb_array_elements(p_payload->'entries') obs on e.source_key=obs->>'sourceKey' where e.workspace_id=p_workspace_id) or
  exists(select 1 from public.finance_subscriptions e join jsonb_array_elements(p_payload->'subscriptions') obs on e.source_key=obs->>'sourceKey' where e.workspace_id=p_workspace_id) then return jsonb_build_object('status','conflict','reason','source-already-imported'); end if;
 insert into public.finance_imports(workspace_id,import_key,input_hash,period_start,period_end,coverage) values(p_workspace_id,p_payload->>'importKey',v_hash,(p_payload->>'from')::date,(p_payload->>'through')::date,p_payload->'coverage') returning * into v_import;
 insert into public.finance_entries(workspace_id,import_id,source_key,data,review)
  select p_workspace_id,v_import.id,obs->>'sourceKey',obs-'review','{"purpose":"unclassified","claimStatus":"unknown","approvedAmount":null,"recoveredAmount":null,"note":""}'::jsonb||coalesce(obs->'review','{}') from jsonb_array_elements(p_payload->'entries') obs;
 insert into public.finance_subscriptions(workspace_id,import_id,source_key,data) select p_workspace_id,v_import.id,obs->>'sourceKey',obs from jsonb_array_elements(p_payload->'subscriptions') obs;
 return jsonb_build_object('status','imported','importId',v_import.id,'entryCount',jsonb_array_length(p_payload->'entries'),'subscriptionCount',jsonb_array_length(p_payload->'subscriptions'));
exception when invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then return jsonb_build_object('status','error','reason','invalid-value');
end $$;

create or replace function public.finance_review_v1(p_workspace_id uuid,p_entity text,p_id uuid,p_expected_revision integer,p_changes jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_data jsonb;v_review jsonb;v_revision integer;
begin
 if p_expected_revision is null or p_expected_revision<1 or not public.finance_review_valid_v1(p_entity,p_changes) then return jsonb_build_object('status','error','reason','invalid-review'); end if;
 if p_entity='subscription' and exists(select 1 from public.finance_subscriptions where workspace_id=p_workspace_id and id=p_id and revision=p_expected_revision and not public.finance_review_valid_v1('subscription',review||p_changes)) then return jsonb_build_object('status','error','reason','invalid-review'); end if;
 if p_entity='entry' then
  update public.finance_entries set review=review||p_changes,revision=revision+1,updated_at=now() where workspace_id=p_workspace_id and id=p_id and revision=p_expected_revision returning data,review,revision into v_data,v_review,v_revision;
 else
  update public.finance_subscriptions set review=review||p_changes,revision=revision+1,updated_at=now() where workspace_id=p_workspace_id and id=p_id and revision=p_expected_revision returning data,review,revision into v_data,v_review,v_revision;
 end if;
 if not found then
  if (p_entity='entry' and exists(select 1 from public.finance_entries where workspace_id=p_workspace_id and id=p_id)) or (p_entity='subscription' and exists(select 1 from public.finance_subscriptions where workspace_id=p_workspace_id and id=p_id)) then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','not-found');
 end if;
 return jsonb_build_object('status','saved','record',case when p_entity='entry' then v_data||jsonb_build_object('review',v_review) else v_data||v_review end||jsonb_build_object('id',p_id,'revision',v_revision));
end $$;
revoke all on function public.finance_import_v1(uuid,jsonb),public.finance_review_v1(uuid,text,uuid,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.finance_import_v1(uuid,jsonb),public.finance_review_v1(uuid,text,uuid,integer,jsonb) to service_role;
