-- ============================================================
-- LunchBox — Supabase Schema (Fixed)
-- Run this entire file in: Supabase Dashboard → SQL Editor
-- ============================================================

create extension if not exists "pgcrypto";


-- ─────────────────────────────────────────────
-- 0. PRIVATE HELPERS
-- ─────────────────────────────────────────────
-- A helper schema for SECURITY DEFINER functions that policies can call
-- without recursing through RLS. PostgREST does not expose this schema
-- as REST endpoints, so the helpers can't be called as RPCs.
create schema if not exists private;
grant usage on schema private to authenticated, anon;

create or replace function private.current_user_role()
returns text
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid();
$$;

revoke execute on function private.current_user_role() from public;
grant  execute on function private.current_user_role() to authenticated;


-- ─────────────────────────────────────────────
-- 1. PROFILES
-- ─────────────────────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text not null check (role in ('superadmin', 'schooladmin', 'parent')),
  name        text not null,
  phone       text,
  location    text,
  repeat_days text[] default '{}',
  created_at  timestamptz default now(),
  -- Parents must have a phone number on file (admins exempt — managed by org).
  constraint profiles_parent_phone_required check (
    role <> 'parent'
    or (phone is not null and length(trim(phone)) > 0)
  )
);

alter table public.profiles enable row level security;

create policy "profiles: own read"
  on public.profiles for select
  using (auth.uid() = id);

-- The cross-role policies use private.current_user_role() instead of an
-- inline subquery on profiles to avoid infinite RLS recursion.
create policy "profiles: superadmin read all"
  on public.profiles for select
  using (private.current_user_role() = 'superadmin');

create policy "profiles: own update"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles: superadmin update all"
  on public.profiles for update
  using       (private.current_user_role() = 'superadmin')
  with check  (private.current_user_role() = 'superadmin');

create policy "profiles: insert own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles: superadmin delete"
  on public.profiles for delete
  using (private.current_user_role() = 'superadmin');

-- School admins need to read parent profiles so the order_details view
-- (security_invoker) can populate parent_name on their order sheets.
create policy "profiles: schooladmin read parents"
  on public.profiles for select
  using (
    role = 'parent' and private.current_user_role() = 'schooladmin'
  );


-- ─────────────────────────────────────────────
-- 2. CHILDREN
-- ─────────────────────────────────────────────
create table public.children (
  id                uuid primary key default gen_random_uuid(),
  parent_id         uuid not null references public.profiles(id) on delete cascade,
  name              text not null,
  grade             text not null,
  dietary_selected  text[] default '{}',
  dietary_other     text default '',
  created_at        timestamptz default now()
);

alter table public.children enable row level security;

create policy "children: parent select"
  on public.children for select
  using (parent_id = auth.uid());

create policy "children: parent insert"
  on public.children for insert
  with check (parent_id = auth.uid());

create policy "children: parent update"
  on public.children for update
  using (parent_id = auth.uid())
  with check (parent_id = auth.uid());

create policy "children: parent delete"
  on public.children for delete
  using (parent_id = auth.uid());

create policy "children: admin read"
  on public.children for select
  using (exists (
    select 1 from public.profiles sa
    where sa.id = auth.uid()
      and sa.role in ('schooladmin', 'superadmin')
  ));


-- ─────────────────────────────────────────────
-- 3. MENU DAYS
-- ─────────────────────────────────────────────
create table public.menu_days (
  id          uuid primary key default gen_random_uuid(),
  date        date not null unique,
  available   boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.menu_days enable row level security;

create policy "menu_days: public read"
  on public.menu_days for select
  using (true);

create policy "menu_days: superadmin insert"
  on public.menu_days for insert
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'superadmin'
  ));

create policy "menu_days: superadmin update"
  on public.menu_days for update
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'superadmin'
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'superadmin'
  ));

create policy "menu_days: superadmin delete"
  on public.menu_days for delete
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'superadmin'
  ));


-- ─────────────────────────────────────────────
-- 4. MENU ITEMS
-- ─────────────────────────────────────────────
create table public.menu_items (
  id          uuid primary key default gen_random_uuid(),
  menu_day_id uuid not null references public.menu_days(id) on delete cascade,
  name        text not null,
  price       numeric(6,2) not null default 0,
  sort_order  int default 0,
  created_at  timestamptz default now()
);

alter table public.menu_items enable row level security;

create policy "menu_items: public read"
  on public.menu_items for select
  using (true);

create policy "menu_items: superadmin insert"
  on public.menu_items for insert
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'superadmin'
  ));

create policy "menu_items: superadmin update"
  on public.menu_items for update
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'superadmin'
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'superadmin'
  ));

create policy "menu_items: superadmin delete"
  on public.menu_items for delete
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'superadmin'
  ));


-- ─────────────────────────────────────────────
-- 5. ORDERS
-- ─────────────────────────────────────────────
create table public.orders (
  id            uuid primary key default gen_random_uuid(),
  parent_id     uuid not null references public.profiles(id) on delete cascade,
  child_id      uuid not null references public.children(id) on delete cascade,
  menu_day_id   uuid not null references public.menu_days(id),
  menu_item_id  uuid not null references public.menu_items(id),
  item_name     text not null,
  item_price    numeric(6,2) not null,
  drink         text not null,
  location      text not null,
  order_date    date not null,
  created_at    timestamptz default now()
);

alter table public.orders enable row level security;

create policy "orders: parent select"
  on public.orders for select
  using (parent_id = auth.uid());

create policy "orders: parent insert"
  on public.orders for insert
  with check (parent_id = auth.uid());

create policy "orders: parent delete"
  on public.orders for delete
  using (parent_id = auth.uid());

create policy "orders: schooladmin read"
  on public.orders for select
  using (exists (
    select 1 from public.profiles sa
    where sa.id = auth.uid()
      and sa.role = 'schooladmin'
      and sa.location = orders.location
  ));

create policy "orders: superadmin select"
  on public.orders for select
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'superadmin'
  ));

create policy "orders: superadmin delete"
  on public.orders for delete
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'superadmin'
  ));

-- Enforce 8 AM cutoff on insert
create or replace function check_order_cutoff()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if now() >= (new.order_date::timestamptz + interval '8 hours') then
    raise exception 'Order cutoff has passed for this date';
  end if;
  return new;
end;
$$;

create trigger enforce_order_cutoff
  before insert on public.orders
  for each row execute function check_order_cutoff();

-- Enforce 8 AM cutoff on delete
create or replace function check_delete_cutoff()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if now() >= (old.order_date::timestamptz + interval '8 hours') then
    raise exception 'Cannot cancel — order cutoff has passed';
  end if;
  return old;
end;
$$;

create trigger enforce_delete_cutoff
  before delete on public.orders
  for each row execute function check_delete_cutoff();


-- ─────────────────────────────────────────────
-- 6. BLOCKED DAYS
-- ─────────────────────────────────────────────
create table public.blocked_days (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  label       text not null,
  location    text not null default 'all',
  created_by  uuid references public.profiles(id),
  created_at  timestamptz default now(),
  unique(date, location)
);

alter table public.blocked_days enable row level security;

create policy "blocked_days: public read"
  on public.blocked_days for select
  using (true);

create policy "blocked_days: superadmin insert"
  on public.blocked_days for insert
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'superadmin'
  ));

create policy "blocked_days: superadmin delete"
  on public.blocked_days for delete
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'superadmin'
  ));

create policy "blocked_days: schooladmin insert own location"
  on public.blocked_days for insert
  with check (exists (
    select 1 from public.profiles sa
    where sa.id = auth.uid()
      and sa.role = 'schooladmin'
      and sa.location = location
  ));

create policy "blocked_days: schooladmin delete own location"
  on public.blocked_days for delete
  using (exists (
    select 1 from public.profiles sa
    where sa.id = auth.uid()
      and sa.role = 'schooladmin'
      and sa.location = blocked_days.location
  ));


-- ─────────────────────────────────────────────
-- 7. NOTIFICATIONS
-- ─────────────────────────────────────────────
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  type        text not null,
  message     text not null,
  date_ref    date,
  sent_at     timestamptz default now()
);

alter table public.notifications enable row level security;

create policy "notifications: admins read"
  on public.notifications for select
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('superadmin', 'schooladmin')
  ));

-- No INSERT policy: notifications are written by the notify-menu-change
-- Edge Function using the service role key, which bypasses RLS. Leaving
-- this without a policy prevents regular users from inserting via the API.


-- ─────────────────────────────────────────────
-- 8. AUTO-CREATE PROFILE ON SIGNUP
-- ─────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, role, name, phone, location, repeat_days)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'parent'),
    coalesce(new.raw_user_meta_data->>'name', 'Unknown'),
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'location',
    '{}'
  );
  return new;
end;
$$;

-- Trigger fires regardless of EXECUTE grants; revoke RPC access so it
-- can't be called as POST /rest/v1/rpc/handle_new_user by random users.
revoke execute on function public.handle_new_user() from anon, authenticated, public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ─────────────────────────────────────────────
-- 9. VIEWS
-- ─────────────────────────────────────────────
-- security_invoker = on so the view respects the calling user's RLS on
-- orders / profiles / children, instead of running as the view creator.
create or replace view public.order_details
with (security_invoker = on)
as
select
  o.id,
  o.order_date,
  o.location,
  o.item_name,
  o.item_price,
  o.drink,
  o.created_at,
  o.menu_day_id,
  o.menu_item_id,
  o.child_id,
  o.parent_id,
  p.name        as parent_name,