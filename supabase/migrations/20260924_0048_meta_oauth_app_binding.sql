-- Bind each one-time Meta OAuth flow to the exact developer app that started it.
-- Existing unexpired 0047 flows have no app identity and cannot be redeemed by
-- the updated callback; operators must start a new authorization in that case.
alter table public.social_oauth_flows
  add column if not exists app_key text,
  add column if not exists app_id text;

alter table public.social_oauth_flows
  drop constraint if exists social_oauth_flows_app_key_check,
  add constraint social_oauth_flows_app_key_check
    check (app_key is null or app_key in ('moonlight', 'politic_officer', 'classmoon')),
  drop constraint if exists social_oauth_flows_app_id_check,
  add constraint social_oauth_flows_app_id_check
    check (app_id is null or app_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  drop constraint if exists social_oauth_flows_app_identity_pair_check,
  add constraint social_oauth_flows_app_identity_pair_check
    check ((app_key is null) = (app_id is null));

-- An existing social connection may gain an app identity once; after that the
-- app identity cannot change, including through a concurrent upsert.
create or replace function public.guard_social_connection_brand_key()
returns trigger language plpgsql as $$
declare
  previous_brand text;
  next_brand text;
  previous_app_id text;
  previous_app_key text;
begin
  if old.provider not in ('instagram_api', 'meta_threads', 'youtube') then
    return new;
  end if;
  previous_brand := nullif(old.config->>'brandKey', '');
  next_brand := nullif(new.config->>'brandKey', '');
  if previous_brand is not null and next_brand is distinct from previous_brand then
    raise exception 'social-account-brand-mismatch' using errcode = '23514';
  end if;
  if old.provider in ('instagram_api', 'meta_threads') then
    previous_app_id := nullif(old.config->>'oauthAppId', '');
    previous_app_key := nullif(old.config->>'oauthAppKey', '');
    if (previous_app_id is not null and nullif(new.config->>'oauthAppId', '') is distinct from previous_app_id)
      or (previous_app_key is not null and nullif(new.config->>'oauthAppKey', '') is distinct from previous_app_key) then
      raise exception 'social-account-app-mismatch' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
