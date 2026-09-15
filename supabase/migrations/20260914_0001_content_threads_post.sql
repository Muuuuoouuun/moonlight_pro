-- Threads is a distinct channel from the existing X thread type.
-- Additive contract only; existing rows and identifiers remain unchanged.
begin;
alter table public.content_variants
  drop constraint if exists content_variants_variant_type_check;
alter table public.content_variants
  add constraint content_variants_variant_type_check
  check (variant_type in ('newsletter', 'blog', 'blog_insight', 'card_news', 'social_post', 'x_thread', 'reels_script', 'landing_copy', 'threads_post'));
commit;
