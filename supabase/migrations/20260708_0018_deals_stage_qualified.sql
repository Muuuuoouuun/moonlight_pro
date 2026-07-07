-- Fix silent deal-write failures: widen deals.stage vocabulary to include 'qualified'.
--
-- The Hub write path (apps/hub/lib/sales-os/revenue-write.js buildDealWrite) reverse-maps
-- the display keys lead/qual/prop/neg/won/lost onto the DB stage column. The read path
-- (revenue-ledger.js STAGE_ALIASES) already expects DB values
-- prospect/qualified/proposal/negotiation/won/lost — but the original CHECK constraint
-- omitted 'qualified'. Result: a deal saved as Qualified (and, before the write-path fix,
-- any non-terminal stage) was rejected by PostgREST and silently downgraded to preview —
-- the operator thought it saved, the row never persisted. Adding 'qualified' lets the full
-- display vocabulary round-trip. Purely additive: no existing row can violate the wider set.
--
-- Additive + idempotent — safe to re-run.

alter table public.deals drop constraint if exists deals_stage_check;
alter table public.deals add constraint deals_stage_check
  check (stage in ('prospect', 'qualified', 'proposal', 'negotiation', 'won', 'lost'));
