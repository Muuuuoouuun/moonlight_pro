-- com_moon/supabase/dev-close-policies.sql
-- Removes temporary development-only open access policies.

begin;

drop policy if exists dev_open_access_workspaces on public.workspaces;
drop policy if exists dev_open_access_projects on public.projects;
drop policy if exists dev_open_access_content_templates on public.content_templates;
drop policy if exists dev_open_access_content_items on public.content_items;
drop policy if exists dev_open_access_content_variants on public.content_variants;
drop policy if exists dev_open_access_content_assets on public.content_assets;
drop policy if exists dev_open_access_content_publications on public.content_publications;
drop policy if exists dev_open_access_leads on public.leads;
drop policy if exists dev_open_access_lead_activities on public.lead_activities;
drop policy if exists dev_open_access_deals on public.deals;
drop policy if exists dev_open_access_campaigns on public.campaigns;
drop policy if exists dev_open_access_operation_cases on public.operation_cases;
drop policy if exists dev_open_access_operation_case_updates on public.operation_case_updates;
drop policy if exists dev_open_access_decision_records on public.decision_records;
drop policy if exists dev_open_access_automation_workflows on public.automation_workflows;
drop policy if exists dev_open_access_automation_runs on public.automation_runs;
drop policy if exists dev_open_access_webhook_events on public.webhook_events;
drop policy if exists dev_open_access_error_logs on public.error_logs;

commit;
