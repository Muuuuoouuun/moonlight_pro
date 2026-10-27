-- Allow the operator-confirmed brand apps in the one-time OAuth ledger.
-- Keep the existing identity pair, replay, expiry and ownership guards.
alter table public.social_oauth_flows
  drop constraint if exists social_oauth_flows_app_key_check,
  add constraint social_oauth_flows_app_key_check
    check (app_key is null or app_key in ('moonlight', 'politic_officer', 'classmoon', 'gore', '22nomad', 'holyfuncollector', 'sinabro'));

notify pgrst, 'reload schema';
