-- OpenAshare workspace persistence
-- Run this migration in the Supabase SQL editor or with the Supabase CLI.
-- All user-owned tables use auth.uid() RLS. The backend must still pass the
-- authenticated user's access token when calling PostgREST.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '默认自选股',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

create unique index if not exists watchlists_one_default_per_user
  on public.watchlists (user_id)
  where is_default;

create table if not exists public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  watchlist_id uuid not null references public.watchlists(id) on delete cascade,
  symbol text not null,
  display_name text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (watchlist_id, symbol),
  foreign key (watchlist_id, user_id)
    references public.watchlists (id, user_id)
    on delete cascade
);

create table if not exists public.agent_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '新对话',
  is_pinned boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  intent text,
  stock_code text,
  stock_name text,
  response_payload jsonb not null default '{}'::jsonb,
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (session_id, user_id)
    references public.agent_sessions (id, user_id)
    on delete cascade
);

create table if not exists public.pinned_contexts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid,
  context_type text not null check (context_type in ('stock', 'topic', 'market', 'portfolio')),
  entity_id text,
  title text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (session_id, user_id)
    references public.agent_sessions (id, user_id)
    on delete cascade
);

create table if not exists public.portfolio_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stock_code text not null,
  stock_name text not null,
  cost_price numeric(20, 6) not null check (cost_price >= 0),
  quantity numeric(20, 6) not null check (quantity >= 0),
  weight_pct numeric(10, 4),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.strategy_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  strategy_key text not null,
  stock_code text not null,
  stock_name text not null,
  entry_price numeric(20, 6) not null check (entry_price >= 0),
  quantity numeric(20, 6) not null check (quantity >= 0),
  entry_date date,
  exit_price numeric(20, 6),
  exit_date date,
  source_topic text,
  plan_reason text,
  plan_entry_trigger text,
  plan_entry_zone text,
  plan_stop_loss numeric(20, 6),
  plan_take_profit numeric(20, 6),
  plan_max_position_pct numeric(10, 4),
  notes text,
  status text not null default 'planned'
    check (status in ('watching', 'planned', 'holding', 'weakening', 'exited', 'invalidated')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists watchlists_user_id_idx on public.watchlists (user_id);
create index if not exists watchlist_items_user_list_order_idx
  on public.watchlist_items (user_id, watchlist_id, sort_order, created_at);
create index if not exists agent_sessions_user_updated_idx
  on public.agent_sessions (user_id, updated_at desc);
create index if not exists agent_messages_user_session_created_idx
  on public.agent_messages (user_id, session_id, created_at);
create index if not exists pinned_contexts_user_updated_idx
  on public.pinned_contexts (user_id, updated_at desc);
create index if not exists portfolio_positions_user_id_idx
  on public.portfolio_positions (user_id);
create index if not exists strategy_holdings_user_status_idx
  on public.strategy_holdings (user_id, status, updated_at desc);

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();

drop trigger if exists watchlists_set_updated_at on public.watchlists;
create trigger watchlists_set_updated_at
before update on public.watchlists
for each row execute function public.set_updated_at();

drop trigger if exists agent_sessions_set_updated_at on public.agent_sessions;
create trigger agent_sessions_set_updated_at
before update on public.agent_sessions
for each row execute function public.set_updated_at();

drop trigger if exists pinned_contexts_set_updated_at on public.pinned_contexts;
create trigger pinned_contexts_set_updated_at
before update on public.pinned_contexts
for each row execute function public.set_updated_at();

drop trigger if exists portfolio_positions_set_updated_at on public.portfolio_positions;
create trigger portfolio_positions_set_updated_at
before update on public.portfolio_positions
for each row execute function public.set_updated_at();

drop trigger if exists strategy_holdings_set_updated_at on public.strategy_holdings;
create trigger strategy_holdings_set_updated_at
before update on public.strategy_holdings
for each row execute function public.set_updated_at();

alter table public.user_settings enable row level security;
alter table public.watchlists enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.agent_sessions enable row level security;
alter table public.agent_messages enable row level security;
alter table public.pinned_contexts enable row level security;
alter table public.portfolio_positions enable row level security;
alter table public.strategy_holdings enable row level security;

create policy user_settings_owner_policy on public.user_settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy watchlists_owner_policy on public.watchlists
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy watchlist_items_owner_policy on public.watchlist_items
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy agent_sessions_owner_policy on public.agent_sessions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy agent_messages_owner_policy on public.agent_messages
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy pinned_contexts_owner_policy on public.pinned_contexts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy portfolio_positions_owner_policy on public.portfolio_positions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy strategy_holdings_owner_policy on public.strategy_holdings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
