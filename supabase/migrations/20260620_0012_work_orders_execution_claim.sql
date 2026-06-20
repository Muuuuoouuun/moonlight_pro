-- Add the transient execution-claim status used to prevent double sends/uploads.
-- Flow: proposed -> approved -> executing -> executed. Terminal: executed, dismissed.

alter table if exists public.work_orders
  drop constraint if exists work_orders_status_check;

alter table if exists public.work_orders
  add constraint work_orders_status_check
  check (status in ('proposed', 'approved', 'executing', 'executed', 'dismissed'));
