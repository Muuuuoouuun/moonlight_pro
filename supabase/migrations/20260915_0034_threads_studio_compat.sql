-- Integrate Threads captures with the versioned Studio workflow (0026).
-- Run after 20260914_0001_content_threads_post.sql. No channel aliases are rewritten.
begin;
create or replace function public.content_workflow_channel_v1(p_type text, p_channel text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select coalesce(case
    when p_type = 'threads_post' then p_channel = 'threads'
    when p_type in ('x_thread', 'social_post') then p_channel in ('threads', 'x')
    when p_type in ('blog_insight', 'blog', 'landing_copy') then p_channel = 'blog'
    when p_type = 'card_news' then p_channel = 'instagram'
    when p_type = 'reels_script' then p_channel in ('reels', 'instagram', 'youtube_shorts')
    when p_type = 'newsletter' then p_channel = 'email'
    else false end, false);
$$;
revoke all on function public.content_workflow_channel_v1(text, text) from public, anon, authenticated;
update public.content_variants set channel = 'threads' where variant_type = 'threads_post' and channel is null;
commit;
