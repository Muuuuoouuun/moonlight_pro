-- One OPEN followup work_order per deal — DB-level dedupe for the stalled-deal scan.
--
-- The scan (apps/hub/lib/sales-os/stalled-scan.js) and the kanban's manual queue
-- button both propose followups with a read-then-insert dedupe, which races under
-- concurrent requests (two brief loads can both see "no open order" and insert).
-- This partial unique index makes the insert itself the arbiter: the loser gets a
-- unique-violation, which createWorkOrder surfaces as persisted:false and the scan
-- counts as skipped. Terminal orders (executed/dismissed) don't block a new proposal.
-- Additive + idempotent.

create unique index if not exists uq_work_orders_open_followup
  on public.work_orders (workspace_id, deal_id)
  where kind = 'followup'
    and status in ('proposed', 'approved', 'executing')
    and deal_id is not null;
