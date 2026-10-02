-- Permit Go;Re's dedicated Threads app in the existing one-time OAuth ledger.
-- This changes the allowlist only; existing accounts, credentials, app identity
-- pairing, expiry/replay checks and connection ownership guards stay intact.
alter table public.social_oauth_flows
  drop constraint if exists social_oauth_flows_app_key_check,
  add constraint social_oauth_flows_app_key_check
    check (app_key is null or app_key in ('moonlight', 'politic_officer', 'classmoon', 'gore'));

notify pgrst, 'reload schema';
