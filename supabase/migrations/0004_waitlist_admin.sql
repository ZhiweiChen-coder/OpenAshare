-- Waitlist applications and administrator access.
-- Run after 0001_openashare_workspace.sql through 0003_fix_credit_rpc_ambiguity.sql.
-- To grant a signed-up user admin access, insert their auth.users id into
-- public.admin_users from the Supabase SQL editor (see docs/supabase-setup.md).

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.waitlist_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null check (char_length(email) <= 320),
  investment_experience text not null check (
    investment_experience in ('beginner', 'one_to_three_years', 'three_to_five_years', 'five_plus_years')
  ),
  focus_markets text[] not null default '{}',
  research_goals text[] not null default '{}',
  note text not null default '' check (char_length(note) <= 600),
  status text not null default 'submitted' check (
    status in ('submitted', 'reviewing', 'invited', 'declined')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists waitlist_applications_status_created_idx
  on public.waitlist_applications (status, created_at desc);

drop trigger if exists waitlist_applications_set_updated_at on public.waitlist_applications;
create trigger waitlist_applications_set_updated_at
before update on public.waitlist_applications
for each row execute function public.set_updated_at();

alter table public.admin_users enable row level security;
alter table public.waitlist_applications enable row level security;

-- SECURITY DEFINER keeps the role lookup small and reusable while RLS still
-- protects the application records themselves.
create or replace function public.is_openashare_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_openashare_admin() from public;
grant execute on function public.is_openashare_admin() to authenticated;

drop policy if exists admin_users_read_own on public.admin_users;
create policy admin_users_read_own on public.admin_users
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists waitlist_owner_read on public.waitlist_applications;
create policy waitlist_owner_read on public.waitlist_applications
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists waitlist_owner_insert on public.waitlist_applications;
create policy waitlist_owner_insert on public.waitlist_applications
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Applicants can refine their information until an administrator changes the
-- status. They cannot promote or invite themselves.
drop policy if exists waitlist_owner_update on public.waitlist_applications;
create policy waitlist_owner_update on public.waitlist_applications
  for update to authenticated
  using ((select auth.uid()) = user_id and status = 'submitted')
  with check ((select auth.uid()) = user_id and status = 'submitted');

drop policy if exists waitlist_admin_read on public.waitlist_applications;
create policy waitlist_admin_read on public.waitlist_applications
  for select to authenticated
  using (public.is_openashare_admin());

drop policy if exists waitlist_admin_update on public.waitlist_applications;
create policy waitlist_admin_update on public.waitlist_applications
  for update to authenticated
  using (public.is_openashare_admin())
  with check (public.is_openashare_admin());

notify pgrst, 'reload schema';
