-- Add the operator-selected Instagram-only brand without changing OAuth guards.
alter table public.social_oauth_flows
  drop constraint if exists social_oauth_flows_app_key_check,
  add constraint social_oauth_flows_app_key_check
    check (app_key is null or app_key in ('moonlight', 'politic_officer', 'classmoon', 'gore', '22nomad', 'holyfuncollector', 'sinabro', 'studyseagull'));

notify pgrst, 'reload schema';
