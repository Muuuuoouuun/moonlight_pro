-- Stamp won_at / lost_at on transition into a terminal stage — the "when did it close?"
-- timestamp the "최근 4주 won/lost" Guru rollup needs.
--
-- won_at / lost_at columns exist (migration 0001) but no write path (Hub, sheets-sync,
-- eeocrm-sync) ever set them, so the rollup had no reliable transition timestamp and fell
-- back to updated_at (approximate). A BEFORE INSERT/UPDATE trigger stamps them on transition
-- into won/lost, idempotently (never overwrites an existing value), regardless of which path
-- writes the row.
--
-- Additive + idempotent — safe to re-run.

create or replace function public.stamp_deal_terminal_ts()
returns trigger language plpgsql as $$
begin
  if new.stage = 'won' and new.won_at is null
     and (tg_op = 'INSERT' or new.stage is distinct from old.stage) then
    new.won_at := now();
  end if;
  if new.stage = 'lost' and new.lost_at is null
     and (tg_op = 'INSERT' or new.stage is distinct from old.stage) then
    new.lost_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_deal_terminal_ts on public.deals;
create trigger trg_stamp_deal_terminal_ts
  before insert or update on public.deals
  for each row execute function public.stamp_deal_terminal_ts();
