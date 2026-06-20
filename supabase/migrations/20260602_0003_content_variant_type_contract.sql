begin;

update content_variants
set variant_type = case variant_type
  when 'blog' then 'blog_insight'
  when 'social_post' then 'x_thread'
  when 'landing_copy' then 'blog_insight'
  else variant_type
end
where variant_type in ('blog', 'social_post', 'landing_copy');

alter table if exists content_variants
  drop constraint if exists content_variants_variant_type_check;

alter table if exists content_variants
  add constraint content_variants_variant_type_check
  check (variant_type in ('newsletter', 'blog', 'blog_insight', 'card_news', 'social_post', 'x_thread', 'reels_script', 'landing_copy'));

commit;
