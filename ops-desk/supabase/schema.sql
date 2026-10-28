-- Ops Desk database (Supabase). Safe to run again on the same project.
-- Accounts are made only by an admin (through the `ops` function); there is no public sign-up.
-- Every change to a case goes through the functions below, which enforce who may do what;
-- the tables themselves are read-only to the app.

create schema if not exists private;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- 1. People ----------------------------------------------------------------------------
create table if not exists public.members (
  user_id uuid primary key references auth.users on delete cascade,
  email text not null unique,
  name text not null,
  role text not null check (role in ('admin','agent')),
  active boolean not null default true,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now()
);

-- An admin's "add teammate" writes here first; the auth trigger turns it into a member.
create table if not exists private.pending_accounts (
  email text primary key, name text not null, role text not null, created_at timestamptz not null default now()
);

create or replace function private.on_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p private.pending_accounts;
begin
  select * into p from private.pending_accounts where email = lower(new.email);
  if not found then raise exception 'Ops Desk accounts are created by an admin'; end if;
  insert into public.members (user_id, email, name, role) values (new.id, lower(new.email), p.name, p.role);
  delete from private.pending_accounts where email = p.email;
  return new;
end $$;
grant usage on schema private to supabase_auth_admin, authenticated;
grant execute on function private.on_auth_user() to supabase_auth_admin;
drop trigger if exists ops_new_user on auth.users;
create trigger ops_new_user after insert on auth.users for each row execute function private.on_auth_user();

create or replace function private.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.members where user_id = (select auth.uid()) and active
$$;
grant execute on function private.my_role() to authenticated;

-- 2. Cases -----------------------------------------------------------------------------
create table if not exists public.cases (
  id bigint generated always as identity primary key,
  type text not null check (type in ('exchange','return','escalation')),
  order_ref text not null check (length(order_ref) between 1 and 100),
  customer text not null check (length(customer) between 1 and 150),
  contact text not null default '' check (length(contact) <= 200),
  summary text not null check (length(summary) between 1 and 2000),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'new' check (status in ('new','assigned','in_progress','waiting','resolved','closed')),
  assignee uuid references public.members (user_id),
  created_by uuid not null references public.members (user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- last time the assignee did something; drives the 30-minute reminder
  last_activity_at timestamptz not null default now(),
  last_reminded_at timestamptz,
  started_at timestamptz,
  resolved_at timestamptz
);
create index if not exists cases_assignee on public.cases (assignee, status);

create table if not exists public.case_events (
  id bigint generated always as identity primary key,
  case_id bigint not null references public.cases on delete cascade,
  user_id uuid references public.members (user_id),
  kind text not null,
  body text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists case_events_case on public.case_events (case_id, id);

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.members (user_id) on delete cascade,
  case_id bigint references public.cases on delete cascade,
  kind text not null,
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  pushed_at timestamptz
);
create index if not exists notifications_user on public.notifications (user_id, id desc);
create index if not exists notifications_unpushed on public.notifications (id) where pushed_at is null;

create table if not exists public.push_subs (
  endpoint text primary key,
  user_id uuid not null references public.members (user_id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subs_user on public.push_subs (user_id);

-- Server-only settings: keys the `ops` function and the scheduler use.
create table if not exists public.ops_config (
  id int primary key check (id = 1),
  cron_key text not null,
  setup_key text not null,
  reminder_minutes int not null default 30,
  vapid jsonb
);
insert into public.ops_config (id, cron_key, setup_key)
values (1, encode(extensions.gen_random_bytes(32), 'hex'), encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (id) do nothing;

-- 3. Who can read what (writes only through the functions below) ------------------------
alter table public.members enable row level security;
alter table public.cases enable row level security;
alter table public.case_events enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subs enable row level security;
alter table public.ops_config enable row level security;
revoke all on public.ops_config from anon, authenticated;

drop policy if exists "team reads members" on public.members;
create policy "team reads members" on public.members for select to authenticated
  using ((select private.my_role()) is not null or user_id = (select auth.uid()));
drop policy if exists "team reads cases" on public.cases;
create policy "team reads cases" on public.cases for select to authenticated using ((select private.my_role()) is not null);
drop policy if exists "team reads events" on public.case_events;
create policy "team reads events" on public.case_events for select to authenticated using ((select private.my_role()) is not null);
drop policy if exists "own notifications" on public.notifications;
create policy "own notifications" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and (select private.my_role()) is not null);
drop policy if exists "own push read" on public.push_subs;
create policy "own push read" on public.push_subs for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "own push add" on public.push_subs;
create policy "own push add" on public.push_subs for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.my_role()) is not null);
drop policy if exists "own push change" on public.push_subs;
create policy "own push change" on public.push_subs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "own push remove" on public.push_subs;
create policy "own push remove" on public.push_subs for delete to authenticated using (user_id = (select auth.uid()));

-- 4. Actions ---------------------------------------------------------------------------
create or replace function private.notify(p_user uuid, p_case bigint, p_kind text, p_message text) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, case_id, kind, message) values (p_user, p_case, p_kind, p_message)
$$;

create or replace function private.need_member() returns text
language plpgsql stable security definer set search_path = '' as $$
declare r text := private.my_role();
begin
  if r is null then raise exception 'Your account is not active in Ops Desk'; end if;
  return r;
end $$;

create or replace function public.create_case(p_type text, p_order_ref text, p_customer text, p_contact text,
  p_summary text, p_priority text default null, p_assignee uuid default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid(); r text := private.need_member(); cid bigint; who public.members;
begin
  if p_type not in ('exchange','return','escalation') then raise exception 'Pick exchange, return or escalation'; end if;
  if p_assignee is not null then
    if r <> 'admin' then raise exception 'Only admins can assign cases'; end if;
    select * into who from public.members where user_id = p_assignee and active;
    if not found then raise exception 'That teammate is not active'; end if;
  end if;
  insert into public.cases (type, order_ref, customer, contact, summary, priority, status, assignee, created_by)
  values (p_type, trim(p_order_ref), trim(p_customer), trim(coalesce(p_contact, '')), trim(p_summary),
          coalesce(nullif(p_priority, ''), case when p_type = 'escalation' then 'high' else 'normal' end),
          case when p_assignee is null then 'new' else 'assigned' end, p_assignee, me)
  returning id into cid;
  insert into public.case_events (case_id, user_id, kind, body) values (cid, me, 'created', 'Opened ' || p_type);
  if p_assignee is not null then
    insert into public.case_events (case_id, user_id, kind, body) values (cid, me, 'assigned', 'Assigned to ' || who.name);
    perform private.notify(p_assignee, cid, 'assigned', format('New %s #%s assigned to you (%s).', p_type, cid, trim(p_order_ref)));
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
  perform private.notify(who.user_id, c.id, 'assigned', format('%s #%s (%s) assigned to you.', upper(c.type), c.id, c.order_ref));
end $$;

create or replace function public.set_status(p_case bigint, p_status text, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r text := private.need_member(); c public.cases; mine boolean; note text := trim(coalesce(p_note, ''));
begin
  if p_status not in ('new','assigned','in_progress','waiting','resolved','closed') then raise exception 'Unknown status'; end if;
  if length(note) > 2000 then raise exception 'Note is too long'; end if;
  select * into c from public.cases where id = p_case for update;
  if not found then raise exception 'Case not found'; end if;
  if r <> 'admin' and c.assignee is distinct from me then raise exception 'Only the assignee or an admin can update this case'; end if;
  if p_status in ('new','assigned') and r <> 'admin' then raise exception 'Only admins can move a case back to new or assigned'; end if;
  if p_status in ('in_progress','waiting','resolved') and c.assignee is null then raise exception 'Assign the case first'; end if;
  -- only the assignee's own actions reset the reminder clock; an admin touching the case doesn't silence it
  mine := c.assignee = me;
  update public.cases set status = p_status, updated_at = now(),
    last_activity_at = case when mine then now() else last_activity_at end,
    last_reminded_at = case when mine then null else last_reminded_at end,
    started_at = coalesce(started_at, case when p_status = 'in_progress' then now() end),
    resolved_at = case when p_status in ('resolved','closed') then now() end
  where id = c.id;
  insert into public.case_events (case_id, user_id, kind, body)
  values (c.id, me, 'status', c.status || ' → ' || p_status || case when note <> '' then ': ' || note else '' end);
end $$;

create or replace function public.add_note(p_case bigint, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); c public.cases; b text := trim(coalesce(p_body, ''));
begin
  perform private.need_member();
  if b = '' then raise exception 'Write something first'; end if;
  if length(b) > 2000 then raise exception 'Note is too long'; end if;
  select * into c from public.cases where id = p_case for update;
  if not found then raise exception 'Case not found'; end if;
  insert into public.case_events (case_id, user_id, kind, body) values (c.id, me, 'note', b);
  if c.assignee = me and c.status in ('assigned','in_progress','waiting') then
    update public.cases set updated_at = now(), last_activity_at = now(), last_reminded_at = null where id = c.id;
  end if;
end $$;

create or replace function public.mark_read(p_id bigint default null) returns void
language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
  where user_id = (select auth.uid()) and read_at is null and (p_id is null or id = p_id)
$$;

create or replace function public.update_member(p_user uuid, p_role text default null, p_active boolean default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if private.need_member() <> 'admin' then raise exception 'Admins only'; end if;
  if p_user = auth.uid() and (p_active = false or p_role = 'agent') then raise exception 'You can''t deactivate or demote yourself'; end if;
  if p_role is not null and p_role not in ('admin','agent') then raise exception 'Unknown role'; end if;
  update public.members set role = coalesce(p_role, role), active = coalesce(p_active, active) where user_id = p_user;
end $$;

create or replace function public.password_changed() returns void
language sql security definer set search_path = '' as $$
  update public.members set must_change_password = false where user_id = (select auth.uid())
$$;

-- Used only by the `ops` function (service role).
create or replace function public.prepare_account(p_email text, p_name text, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_role not in ('admin','agent') then raise exception 'Unknown role'; end if;
  insert into private.pending_accounts (email, name, role) values (lower(trim(p_email)), trim(p_name), p_role)
  on conflict (email) do update set name = excluded.name, role = excluded.role, created_at = now();
end $$;

create or replace function public.claim_pushes() returns setof public.notifications
language sql security definer set search_path = '' as $$
  update public.notifications set pushed_at = now()
  where id in (select id from public.notifications where pushed_at is null order by id limit 200 for update skip locked)
  returning *
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.create_case, public.assign_case, public.set_status, public.add_note,
  public.mark_read, public.update_member, public.password_changed to authenticated;
revoke execute on function public.prepare_account, public.claim_pushes from authenticated;
revoke execute on all functions in schema private from public, anon;
grant execute on function private.my_role() to authenticated;

-- 5. Reminders -------------------------------------------------------------------------
-- An open case (assigned / in progress / waiting) whose assignee hasn't started it or posted an
-- update for 30 minutes gets a reminder, then another every 30 minutes until they act.
create or replace function private.run_reminders() returns int
language plpgsql security definer set search_path = '' as $$
declare mins int; n int;
begin
  select reminder_minutes into mins from public.ops_config where id = 1;
  with due as (
    select c.* from public.cases c join public.members m on m.user_id = c.assignee and m.active
    where c.status in ('assigned','in_progress','waiting')
      and now() - greatest(c.last_activity_at, coalesce(c.last_reminded_at, '-infinity')) >= make_interval(mins => mins)
    for update of c skip locked
  ), sent as (
    insert into public.notifications (user_id, case_id, kind, message)
    select assignee, id, 'reminder', format('%s #%s (%s) – %s for %s min. Please %s.', upper(type), id, order_ref,
      case when status = 'assigned' then 'not started' else 'no update' end,
      floor(extract(epoch from now() - last_activity_at) / 60)::int,
      case when status = 'assigned' then 'start it' else 'post an update' end)
    from due returning case_id
  )
  update public.cases set last_reminded_at = now() where id in (select case_id from sent);
  get diagnostics n = row_count;
  return n;
end $$;

-- Every 20 s: send due reminders, then hand anything new to the `ops` function to push to phones.
create or replace function private.tick() returns void
language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  perform private.run_reminders();
  -- people with no phone signed up for alerts, or notices older than 10 minutes, aren't pushed
  update public.notifications n set pushed_at = now()
  where n.pushed_at is null and (n.created_at < now() - interval '10 minutes'
    or not exists (select 1 from public.push_subs s where s.user_id = n.user_id));
  if not exists (select 1 from public.notifications where pushed_at is null) then return; end if;
  select cron_key into k from public.ops_config where id = 1;
  perform net.http_post(
    url := 'https://ugplpkclluoqfvuadwam.supabase.co/functions/v1/ops',
    body := jsonb_build_object('action', 'tick'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', k),
    timeout_milliseconds := 30000);
end $$;
revoke all on function private.tick(), private.run_reminders() from public, anon, authenticated;

select cron.unschedule('ops-tick') where exists (select 1 from cron.job where jobname = 'ops-tick');
select cron.schedule('ops-tick', '20 seconds', 'select private.tick()');

-- 6. Live updates in the app ------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.cases, public.notifications;
exception when duplicate_object then null; end $$;
