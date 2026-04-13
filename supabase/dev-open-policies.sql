-- com_moon/supabase/dev-open-policies.sql
-- Temporary no-login access for local/dev testing only.
-- Do NOT use in production with a public/publishable key.

begin;

drop policy if exists dev_open_access_workspaces on public.workspaces;
create policy dev_open_access_workspaces on public.workspaces for all to anon, authenticated using (true) with check (true);

drop policy if exists dev_open_access_projects on public.projects;
create policy dev_open_access_projects on public.projects for all to anon, authenticated using (true) with check (true);

drop policy if exists dev_open_access_content_templates on public.content_templates;
create policy dev_open_access_content_templates on public.content_templates for all to anon, authenticated using (true) with check (true);

drop policy if exists dev_open_access_content_items on public.content_items;
create policy dev_open_access_content_items on public.content_items for all to anon, authenticated using (true) with check (true);

drop policy if exists dev_open_access_content_variants on public.content_variants;
create policy dev_open_access_content_variants on public.content_variants for all to anon, authenticated using (true) with check (true);

drop policy if exists dev_open_access_content_assets on public.content_assets;
create policy dev_open_access_content_assets on public.content_assets for all to anon, authenticated using (true) with check (true);

drop policy if exists dev_open_access_content_publications on public.content_publications;
create policy dev_open_access_content_publications on public.content_publications for all to anon, authenticated using (true) with check (true);

drop policy if exists dev_open_access_leads on public.leads;
create policy dev_open_access_leads on public.leads for all to anon, authenticated using (true) with check (true);

drop policy if exists dev_open_access_lead_activities on public.lead_activities;
create policy dev_open_access_lead_activities on public.lead_activities for all to anon, authenticated using (true) with check (true);

drop policy if exists dev_open_access_deals on public.deals;
create policy dev_open_access_deals on public.deals for all to anon, authenticated using (true) with check (true);

drop policy if exists dev_open_access_campaigns on public.campaigns;
create policy dev_open_access_campaigns on public.campaigns for all to anon, authenticated using (true) with check (true);

drop policy if exists dev_open_access_operation_cases on public.operation_cases;
create policy dev_open_access_operation_cases on public.operation_cases for all to anon, authenticated using (true) with check (true);

drop policy if exists dev_open_access_operation_case_updates on public.operation_case_updates;
create policy dev_open_access_operation_case_updates on public.operation_case_updates for all to anon, authenticated using (true) with check (true);

drop policy if exists dev_open_access_decision_records on public.decision_records;
create policy dev_open_access_decision_records on public.decision_records for all to anon, authenticated using (true) with check (true);

drop policy if exists dev_open_access_automation_workflows on public.automation_workflows;
create policy dev_open_access_automation_workflows on public.automation_workflows for all to anon, authenticated using (true) with check (true);

drop policy if exists dev_open_access_automation_runs on public.automation_runs;
create policy dev_open_access_automation_runs on public.automation_runs for all to anon, authenticated using (true) with check (true);

drop policy if exists dev_open_access_webhook_events on public.webhook_events;
create policy dev_open_access_webhook_events on public.webhook_events for all to anon, authenticated using (true) with check (true);

drop policy if exists dev_open_access_error_logs on public.error_logs;
create policy dev_open_access_error_logs on public.error_logs for all to anon, authenticated using (true) with check (true);

commit;
