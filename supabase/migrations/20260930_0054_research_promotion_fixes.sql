-- Correct research promotion replay and preserve Studio-ready evidence and provenance.
create or replace function public.research_command_v1(
  p_workspace_id uuid, p_request_id uuid, p_request_hash text, p_command jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_action text := p_command->>'action';
  v_brief public.research_briefs%rowtype;
  v_revision public.research_brief_revisions%rowtype;
  v_receipt public.research_request_receipts%rowtype;
  v_promotion public.research_promotions%rowtype;
  v_body jsonb;
  v_brand_id uuid;
  v_content_id uuid;
  v_variant_id uuid;
  v_destination text;
  v_result jsonb;
begin
  if p_workspace_id is null or p_request_id is null or coalesce(p_request_hash,'') !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_command) is distinct from 'object'
    or coalesce(v_action,'') not in ('create','defer','discard','restore','promote-idea','promote-draft')
    or octet_length(p_command::text) > 32768 then
    return jsonb_build_object('status','invalid-input','error','invalid-command');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_request_id::text,0));
  select * into v_receipt from public.research_request_receipts
    where workspace_id=p_workspace_id and request_id=p_request_id;
  if found then
    if v_receipt.request_hash <> p_request_hash then
      return jsonb_build_object('status','conflict','error','request-id-reused');
    end if;
    return v_receipt.response || jsonb_build_object('status','duplicate');
  end if;

  if v_action = 'create' then
    v_body := p_command->'brief';
    if jsonb_typeof(v_body) is distinct from 'object' or coalesce(v_body->>'eventKey','') !~ '^[a-f0-9]{40}$'
      or length(btrim(coalesce(v_body->>'title',''))) = 0
      or length(btrim(coalesce(v_body->>'change',''))) = 0
      or length(btrim(coalesce(v_body->>'draft',''))) = 0
      or jsonb_typeof(v_body->'facts') is distinct from 'array'
      or jsonb_array_length(v_body->'facts') = 0
      or jsonb_typeof(v_body->'sources') is distinct from 'array'
      or jsonb_array_length(v_body->'sources') = 0 then
      return jsonb_build_object('status','invalid-input','error','invalid-brief');
    end if;
    v_brand_id := (v_body->>'brandId')::uuid;
    if not exists (select 1 from public.brands where id=v_brand_id and workspace_id=p_workspace_id and status='active') then
      return jsonb_build_object('status','invalid-input','error','brand-not-found');
    end if;
    perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || v_brand_id::text || ':' || (v_body->>'eventKey'),0));
    select * into v_brief from public.research_briefs
      where workspace_id=p_workspace_id and brand_id=v_brand_id and event_key=v_body->>'eventKey' for update;
    if found then
      select * into v_revision from public.research_brief_revisions
        where brief_id=v_brief.id and revision=v_brief.latest_revision;
      if v_revision.payload is distinct from v_body then
        return jsonb_build_object('status','conflict','error','event-already-exists','briefId',v_brief.id);
      end if;
      v_result := jsonb_build_object('status','duplicate','briefId',v_brief.id,'revision',v_brief.latest_revision);
    else
      insert into public.research_briefs(workspace_id,brand_id,event_key)
        values(p_workspace_id,v_brand_id,v_body->>'eventKey') returning * into v_brief;
      insert into public.research_brief_revisions(workspace_id,brief_id,revision,payload)
        values(p_workspace_id,v_brief.id,1,v_body);
      v_result := jsonb_build_object('status','saved','briefId',v_brief.id,'revision',1);
    end if;
  else
    select * into v_brief from public.research_briefs
      where id=(p_command->>'briefId')::uuid and workspace_id=p_workspace_id for update;
    if not found then return jsonb_build_object('status','invalid-input','error','brief-not-found'); end if;
    -- A second promotion request must recover the existing link even when its
    -- previous state version is stale. The request-id/hash receipt was checked above.
    select * into v_promotion from public.research_promotions where brief_id=v_brief.id;
    if v_action in ('promote-idea','promote-draft') and v_promotion.brief_id is not null then
      v_result := jsonb_build_object('status','duplicate','briefId',v_brief.id,
        'contentId',v_promotion.content_id,'variantId',v_promotion.variant_id,'destination',v_promotion.destination);
      insert into public.research_request_receipts(workspace_id,request_id,request_hash,response)
        values(p_workspace_id,p_request_id,p_request_hash,v_result);
      return v_result;
    end if;
    if (p_command->>'expectedRevision')::integer is distinct from v_brief.latest_revision then
      return jsonb_build_object('status','conflict','error','stale-revision','revision',v_brief.latest_revision);
    end if;
    if (p_command->>'expectedStateVersion')::integer is distinct from v_brief.state_version then
      return jsonb_build_object('status','conflict','error','stale-state','stateVersion',v_brief.state_version);
    end if;
    select * into v_revision from public.research_brief_revisions
      where brief_id=v_brief.id and workspace_id=p_workspace_id and revision=v_brief.latest_revision;
    if not found then return jsonb_build_object('status','error','error','revision-missing'); end if;
    if v_action in ('promote-idea','promote-draft') then
      if v_promotion.brief_id is not null then
        v_result := jsonb_build_object('status','duplicate','briefId',v_brief.id,
          'contentId',v_promotion.content_id,'variantId',v_promotion.variant_id,'destination',v_promotion.destination);
      elsif v_brief.state = 'discarded' then
        return jsonb_build_object('status','conflict','error','discarded-brief');
      else
        v_content_id := gen_random_uuid(); v_variant_id := gen_random_uuid();
        v_destination := case when v_action='promote-idea' then 'idea' else 'draft' end;
        insert into public.content_items(id,workspace_id,brand_id,title,source_idea,source_type,status,meta)
          values(v_content_id,p_workspace_id,v_brief.brand_id,v_revision.payload->>'title',
            v_revision.payload->>'change','research',v_destination,
            jsonb_build_object('origin','research-inbox','primary_variant_id',v_variant_id,
              'brief',jsonb_build_object('message',v_revision.payload->>'change',
                'evidence',(select string_agg(fact,E'\n' order by ord)
                  from jsonb_array_elements_text(v_revision.payload->'facts') with ordinality as f(fact,ord))),
              'research',jsonb_build_object('brief_id',v_brief.id,'revision',v_brief.latest_revision,
                'sources',v_revision.payload->'sources','verification_level',v_revision.payload->>'verificationLevel',
                'prepared_draft',v_revision.payload->>'draft')));
        insert into public.content_variants(id,workspace_id,content_id,title,body,variant_type,channel,status,meta)
          values(v_variant_id,p_workspace_id,v_content_id,v_revision.payload->>'title',
            case when v_destination='draft' then v_revision.payload->>'draft' else '' end,
            'base_text','unassigned','draft',
            jsonb_build_object('origin','research-inbox','research',jsonb_build_object('brief_id',v_brief.id,
              'revision',v_brief.latest_revision,'sources',v_revision.payload->'sources',
              'verification_level',v_revision.payload->>'verificationLevel')));
        insert into public.research_promotions(brief_id,workspace_id,revision,content_id,variant_id,destination)
          values(v_brief.id,p_workspace_id,v_brief.latest_revision,v_content_id,v_variant_id,v_destination);
        update public.research_briefs set state='promoted',state_version=state_version+1,
          updated_at=clock_timestamp() where id=v_brief.id;
        insert into public.research_reviews(workspace_id,brief_id,revision,action)
          values(p_workspace_id,v_brief.id,v_brief.latest_revision,v_action);
        v_result := jsonb_build_object('status','saved','briefId',v_brief.id,'contentId',v_content_id,
          'variantId',v_variant_id,'destination',v_destination);
      end if;
    else
      if v_promotion.brief_id is not null then return jsonb_build_object('status','conflict','error','already-promoted'); end if;
      if (v_action='restore' and v_brief.state='new') or (v_action='defer' and v_brief.state='deferred')
        or (v_action='discard' and v_brief.state='discarded') then
        v_result := jsonb_build_object('status','duplicate','briefId',v_brief.id,'state',v_brief.state);
      else
        update public.research_briefs set state=case v_action when 'restore' then 'new'
          when 'defer' then 'deferred' else 'discarded' end,state_version=state_version+1,updated_at=clock_timestamp()
          where id=v_brief.id returning * into v_brief;
        insert into public.research_reviews(workspace_id,brief_id,revision,action)
          values(p_workspace_id,v_brief.id,v_brief.latest_revision,v_action);
        v_result := jsonb_build_object('status','saved','briefId',v_brief.id,'state',v_brief.state);
      end if;
    end if;
  end if;
  insert into public.research_request_receipts(workspace_id,request_id,request_hash,response)
    values(p_workspace_id,p_request_id,p_request_hash,v_result);
  return v_result;
exception when invalid_text_representation or numeric_value_out_of_range then
  return jsonb_build_object('status','invalid-input','error','invalid-reference');
end;
$$;
revoke all on function public.research_command_v1(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.research_command_v1(uuid,uuid,text,jsonb) to service_role;
