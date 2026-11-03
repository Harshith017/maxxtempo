-- Adds the "pending order" case type and an optional location to a project set up before they existed.
-- Safe to run again.

alter table public.cases drop constraint if exists cases_type_check;

alter table public.cases add constraint cases_type_check check (type in ('exchange','return','pending_order','escalation'));

alter table public.cases add column if not exists location text not null default '' check (length(location) <= 200);

create or replace function private.type_label(t text) returns text
language sql immutable set search_path = '' as $$ select replace(t, '_', ' ') $$;

drop function if exists public.create_case(text, text, text, text, text, text, uuid);

create or replace function public.create_case(p_type text, p_order_ref text, p_customer text, p_contact text,
  p_summary text, p_priority text default null, p_assignee uuid default null, p_location text default '') returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid(); r text := private.need_member(); cid bigint; who public.members;
begin
  if p_type not in ('exchange','return','pending_order','escalation') then raise exception 'Pick exchange, return, pending order or escalation'; end if;
  if p_assignee is not null then
    if r <> 'admin' then raise exception 'Only admins can assign cases'; end if;
    select * into who from public.members where user_id = p_assignee and active;
    if not found then raise exception 'That teammate is not active'; end if;
  end if;
  insert into public.cases (type, order_ref, customer, contact, location, summary, priority, status, assignee, created_by)
  values (p_type, trim(p_order_ref), trim(p_customer), trim(coalesce(p_contact, '')), trim(coalesce(p_location, '')), trim(p_summary),
          coalesce(nullif(p_priority, ''), case when p_type = 'escalation' then 'high' else 'normal' end),
          case when p_assignee is null then 'new' else 'assigned' end, p_assignee, me)
  returning id into cid;
  insert into public.case_events (case_id, user_id, kind, body) values (cid, me, 'created', 'Opened ' || private.type_label(p_type));
  if p_assignee is not null then
    insert into public.case_events (case_id, user_id, kind, body) values (cid, me, 'assigned', 'Assigned to ' || who.name);
    perform private.notify(p_assignee, cid, 'assigned', format('New %s #%s assigned to you (%s).', private.type_label(p_type), cid, trim(p_order_ref)));
  elsif p_type = 'escalation' then
    perform private.notify(m.user_id, cid, 'escalation', format('New escalation #%s needs an owner (%s).', cid, trim(p_order_ref)))
    from public.members m where m.role = 'admin' and m.active;
  end if;
  return cid;
end $$;

create or replace function public.assign_case(p_case bigint, p_assignee uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); c public.cases; who public.members;
begin
  if private.need_member() <> 'admin' then raise exception 'Only admins can assign cases'; end if;
  select * into c from public.cases where id = p_case for update;
  if not found then raise exception 'Case not found'; end if;
  if c.status in ('resolved','closed') then raise exception 'Reopen the case before reassigning it'; end if;
  select * into who from public.members where user_id = p_assignee and active;
  if not found then raise exception 'That teammate is not active'; end if;
  update public.cases set assignee = who.user_id, status = 'assigned', started_at = null, updated_at = now(),
    last_activity_at = now(), last_reminded_at = null where id = c.id;
  insert into public.case_events (case_id, user_id, kind, body) values (c.id, me, 'assigned', 'Assigned to ' || who.name);
  perform private.notify(who.user_id, c.id, 'assigned', format('%s #%s (%s) assigned to you.', upper(private.type_label(c.type)), c.id, c.order_ref));
end $$;

create or replace function public.set_location(p_case bigint, p_location text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r text := private.need_member(); c public.cases; l text := trim(coalesce(p_location, ''));
begin
  if length(l) > 200 then raise exception 'Location is too long'; end if;
  select * into c from public.cases where id = p_case for update;
  if not found then raise exception 'Case not found'; end if;
  if r <> 'admin' and c.assignee is distinct from me then raise exception 'Only the assignee or an admin can change the location'; end if;
  if l = c.location then return; end if;
  update public.cases set location = l, updated_at = now() where id = c.id;
  insert into public.case_events (case_id, user_id, kind, body)
  values (c.id, me, 'location', case when l = '' then 'Removed the location' else 'Location: ' || l end);
end $$;

create or replace function private.run_reminders() returns int
language plpgsql security definer set search_path = '' as $$
declare mins int; n int;
begin
  select reminder_minutes into mins from public.ops_config where id = 1;
  with due as (
    select c.* from public.cases c join public.members m on m.user_id = c.assignee and m.active
    where c.status in ('assigned','in_progress','waiting')
      and now() - greatest(c.last_activity_at, coalesce(c.last_reminded_at, '-infinity')) >= mins * interval '1 minute'
    for update of c skip locked
  ), sent as (
    insert into public.notifications (user_id, case_id, kind, message)
    select assignee, id, 'reminder', format('%s #%s (%s) – %s for %s min. Please %s.', upper(private.type_label(type)), id, order_ref,
      case when status = 'assigned' then 'not started' else 'no update' end,
      floor(extract(epoch from now() - last_activity_at) / 60)::int,
      case when status = 'assigned' then 'start it' else 'post an update' end)
    from due returning case_id
  )
  update public.cases set last_reminded_at = now() where id in (select case_id from sent);
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.create_case, public.assign_case, public.set_location from public, anon;

grant execute on function public.create_case, public.assign_case, public.set_location to authenticated;

revoke all on function private.run_reminders(), private.type_label(text) from public, anon, authenticated;
