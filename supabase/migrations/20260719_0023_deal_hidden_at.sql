-- Reversible hide/show for deals (초기화 없이 파이프라인에서만 걷어내는 용도) —
-- additive and nullable, existing rows and writers are unaffected.
alter table if exists public.deals
  add column if not exists hidden_at timestamptz;
