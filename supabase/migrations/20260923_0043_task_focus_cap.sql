-- A read/count in the Engine followed by a separate PATCH cannot enforce the Top 3 cap when
-- two tasks are picked at once. Serialize additions per workspace inside the database.
-- Existing focus_dates metadata is left intact; only newly added dates are checked.
begin;

create or replace function public.enforce_task_focus_cap_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_dates jsonb := '[]'::jsonb;
  v_day text;
  v_selected integer;
begin
  if jsonb_typeof(new.meta->'focus_dates') is distinct from 'array' then
    return new;
  end if;
  if tg_op = 'UPDATE' and jsonb_typeof(old.meta->'focus_dates') = 'array' then
    v_old_dates := old.meta->'focus_dates';
  end if;
  if not exists (
    select 1 from jsonb_array_elements_text(new.meta->'focus_dates') as days(day)
    where not v_old_dates ? days.day
  ) then
    return new;
  end if;

  -- This row lock is held until the transaction commits. A second task update in the same
  -- workspace waits here, then counts the first transaction's committed choice.
  perform 1 from public.workspaces where id = new.workspace_id for no key update;
  if not found then
    raise exception 'focus-workspace-not-found';
  end if;

  for v_day in select jsonb_array_elements_text(new.meta->'focus_dates') loop
    if v_old_dates ? v_day then
      continue;
    end if;
    select count(*) into v_selected
      from public.tasks
      where workspace_id = new.workspace_id
        and id <> new.id
        and meta->'focus_dates' ? v_day;
    if v_selected >= 3 then
      raise exception 'focus-limit' using errcode = 'P0001';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists task_focus_cap_v1 on public.tasks;
create trigger task_focus_cap_v1
  before insert or update of meta on public.tasks
  for each row execute function public.enforce_task_focus_cap_v1();

revoke all on function public.enforce_task_focus_cap_v1() from public, anon, authenticated;
grant execute on function public.enforce_task_focus_cap_v1() to service_role;

commit;
