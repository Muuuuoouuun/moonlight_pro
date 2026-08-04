-- Distinguish work ("클래스인" company) brands from personal brands.
--
-- Class.Moon and Study.Seagull are ClassIn-side content brands; ClassIn Side
-- is a new sibling brand for the same company work. Everything else in the
-- canonical brand directory (sinabro, gore, holyfuncollector, bridgemaker,
-- moonpm, politicofficer, 22nomad) stays personal. `org_scope` lives in
-- `meta` JSONB, same pattern as `philosophy`/`voice`/`content_rules` in
-- 20260427_0004_canonical_brand_directory.sql.

update public.brands
set meta = meta || jsonb_build_object('org_scope', 'classin'),
    updated_at = now()
where slug in ('classmoon', 'studyseagull');

with target_workspace as (
  select id from public.workspaces
  where slug = 'com-moon-os'
     or id = '11111111-1111-1111-1111-111111111111'
  limit 1
)
insert into public.brands (workspace_id, slug, name, kind, color_hex, description, meta)
select
  w.id,
  'classin_side',
  'ClassIn Side',
  'education',
  '#5274a8',
  '클래스인 세일즈 사이드 채널 (설명 추후 보완)',
  jsonb_build_object(
    'glyph', '◈', 'tone', 'moon', 'order', 65,
    'org_scope', 'classin'
  )
from target_workspace w
on conflict (workspace_id, slug) do update
set
  name = excluded.name,
  kind = excluded.kind,
  status = 'active',
  color_hex = excluded.color_hex,
  description = excluded.description,
  meta = public.brands.meta || excluded.meta,
  updated_at = now();
