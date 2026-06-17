-- Align Content OS DB constraints with the Hub Studio/Queue contract.
--
-- This is safe after the Supabase-first foundation migration. It keeps legacy
-- values (`blog`, `social_post`) while allowing the expanded Content OS types
-- planned for Newsletter, Blog/Insight, Card News, X Thread, and Reels Script.

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.content_items'::regclass
    and pg_get_constraintdef(oid) like '%source_type%';

  if constraint_name is not null then
    execute format('alter table public.content_items drop constraint %I', constraint_name);
  end if;
end;
$$;

alter table public.content_items
  add constraint content_items_source_type_check
  check (source_type in ('idea', 'brief', 'meeting', 'research', 'repurpose', 'manual', 'studio', 'import'));

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.content_variants'::regclass
    and pg_get_constraintdef(oid) like '%variant_type%';

  if constraint_name is not null then
    execute format('alter table public.content_variants drop constraint %I', constraint_name);
  end if;
end;
$$;

alter table public.content_variants
  add constraint content_variants_variant_type_check
  check (variant_type in ('card_news', 'blog', 'blog_insight', 'newsletter', 'social_post', 'x_thread', 'reels_script', 'landing_copy'));
