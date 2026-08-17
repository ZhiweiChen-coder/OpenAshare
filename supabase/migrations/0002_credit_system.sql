-- Credit ledger for public Agent usage.
-- All balance mutations happen through security-definer RPCs so the browser
-- cannot grant, edit, or delete credits directly.

create table if not exists public.credit_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  lifetime_granted integer not null default 0 check (lifetime_granted >= 0),
  lifetime_purchased integer not null default 0 check (lifetime_purchased >= 0),
  lifetime_used integer not null default 0 check (lifetime_used >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,
  entry_type text not null check (
    entry_type in ('grant', 'purchase', 'reserve', 'settle', 'release', 'refund', 'adjustment')
  ),
  reference_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  reserved_amount integer not null check (reserved_amount > 0),
  settled_amount integer not null default 0 check (settled_amount >= 0),
  status text not null default 'reserved' check (status in ('reserved', 'settled', 'released')),
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, request_id)
);

-- Stripe webhook idempotency is intentionally separate from the credit
-- ledger. A later Stripe integration can insert an event once, then issue a
-- purchase adjustment through a server-side function.
create table if not exists public.stripe_events (
  event_id text primary key,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists credit_ledger_user_created_idx
  on public.credit_ledger (user_id, created_at desc);
create index if not exists credit_reservations_user_created_idx
  on public.credit_reservations (user_id, created_at desc);

drop trigger if exists credit_accounts_set_updated_at on public.credit_accounts;
create trigger credit_accounts_set_updated_at
before update on public.credit_accounts
for each row execute function public.set_updated_at();

drop trigger if exists credit_reservations_set_updated_at on public.credit_reservations;
create trigger credit_reservations_set_updated_at
before update on public.credit_reservations
for each row execute function public.set_updated_at();

alter table public.credit_accounts enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.credit_reservations enable row level security;
alter table public.stripe_events enable row level security;

drop policy if exists credit_accounts_select_own on public.credit_accounts;
create policy credit_accounts_select_own
on public.credit_accounts for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists credit_ledger_select_own on public.credit_ledger;
create policy credit_ledger_select_own
on public.credit_ledger for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists credit_reservations_select_own on public.credit_reservations;
create policy credit_reservations_select_own
on public.credit_reservations for select
to authenticated
using (auth.uid() = user_id);

-- No client policy is created for stripe_events. It is a server-side
-- idempotency table and should be written by the service-role webhook only.

create or replace function public.ensure_credit_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  inserted_rows integer;
  initial_grant constant integer := 100;
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  insert into public.credit_accounts (user_id, balance, lifetime_granted)
  values (current_user_id, initial_grant, initial_grant)
  on conflict (user_id) do nothing;

  get diagnostics inserted_rows = row_count;
  if inserted_rows = 1 then
    insert into public.credit_ledger (user_id, delta, entry_type, reference_id, metadata)
    values (
      current_user_id,
      initial_grant,
      'grant',
      'initial-grant',
      jsonb_build_object('reason', 'new_account')
    );
  end if;
end;
$$;

create or replace function public.reserve_credits(
  p_request_id text,
  p_amount integer,
  p_metadata jsonb default '{}'::jsonb
)
returns table (reservation_id uuid, reserved_amount integer, balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  account_balance integer;
  existing public.credit_reservations%rowtype;
  new_reservation public.credit_reservations%rowtype;
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if coalesce(trim(p_request_id), '') = '' or p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_CREDIT_RESERVATION';
  end if;

  perform public.ensure_credit_account();

  select * into existing
  from public.credit_reservations
  where user_id = current_user_id and request_id = p_request_id
  for update;
  if existing.id is not null then
    select ca.balance into account_balance
    from public.credit_accounts ca
    where ca.user_id = current_user_id;
    return query select existing.id, existing.reserved_amount, account_balance;
    return;
  end if;

  select ca.balance into account_balance
  from public.credit_accounts ca
  where ca.user_id = current_user_id
  for update;

  -- Re-check after taking the account lock. This closes the race where two
  -- retries with the same request_id both pass the first lookup.
  select * into existing
  from public.credit_reservations
  where user_id = current_user_id and request_id = p_request_id
  for update;
  if existing.id is not null then
    return query select existing.id, existing.reserved_amount, account_balance;
    return;
  end if;

  if account_balance < p_amount then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  update public.credit_accounts as credit_account
  set balance = credit_account.balance - p_amount
  where credit_account.user_id = current_user_id;

  insert into public.credit_reservations (user_id, request_id, reserved_amount, metadata)
  values (current_user_id, p_request_id, p_amount, coalesce(p_metadata, '{}'::jsonb))
  returning * into new_reservation;

  insert into public.credit_ledger (user_id, delta, entry_type, reference_id, metadata)
  values (current_user_id, -p_amount, 'reserve', new_reservation.id::text, coalesce(p_metadata, '{}'::jsonb));

  return query select new_reservation.id, p_amount, account_balance - p_amount;
end;
$$;

create or replace function public.settle_credits(
  p_reservation_id uuid,
  p_actual_amount integer,
  p_metadata jsonb default '{}'::jsonb
)
returns table (balance integer, charged_amount integer, released_amount integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  reservation public.credit_reservations%rowtype;
  account_balance integer;
  refund_amount integer;
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_actual_amount is null or p_actual_amount < 0 then
    raise exception 'INVALID_CREDIT_SETTLEMENT';
  end if;

  select * into reservation
  from public.credit_reservations
  where id = p_reservation_id and user_id = current_user_id
  for update;
  if reservation.id is null then
    raise exception 'CREDIT_RESERVATION_NOT_FOUND';
  end if;
  if reservation.status <> 'reserved' then
    select ca.balance into account_balance
    from public.credit_accounts ca
    where ca.user_id = current_user_id;
    return query select account_balance, reservation.settled_amount, 0;
    return;
  end if;
  if p_actual_amount > reservation.reserved_amount then
    raise exception 'CREDIT_SETTLEMENT_EXCEEDS_RESERVATION';
  end if;

  refund_amount := reservation.reserved_amount - p_actual_amount;
  update public.credit_accounts as credit_account
  set balance = credit_account.balance + refund_amount,
      lifetime_used = credit_account.lifetime_used + p_actual_amount
  where credit_account.user_id = current_user_id
  returning credit_account.balance into account_balance;

  update public.credit_reservations
  set settled_amount = p_actual_amount, status = 'settled', metadata =
    coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb)
  where id = reservation.id;

  insert into public.credit_ledger (user_id, delta, entry_type, reference_id, metadata)
  values (current_user_id, 0, 'settle', reservation.id::text, coalesce(p_metadata, '{}'::jsonb));
  if refund_amount > 0 then
    insert into public.credit_ledger (user_id, delta, entry_type, reference_id, metadata)
    values (current_user_id, refund_amount, 'refund', reservation.id::text, jsonb_build_object('reason', 'unused_reservation'));
  end if;

  return query select account_balance, p_actual_amount, refund_amount;
end;
$$;

create or replace function public.release_credits(
  p_reservation_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns table (balance integer, released_amount integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  reservation public.credit_reservations%rowtype;
  account_balance integer;
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into reservation
  from public.credit_reservations
  where id = p_reservation_id and user_id = current_user_id
  for update;
  if reservation.id is null then
    raise exception 'CREDIT_RESERVATION_NOT_FOUND';
  end if;
  if reservation.status <> 'reserved' then
    select ca.balance into account_balance
    from public.credit_accounts ca
    where ca.user_id = current_user_id;
    return query select account_balance, 0;
    return;
  end if;

  update public.credit_accounts as credit_account
  set balance = credit_account.balance + reservation.reserved_amount
  where credit_account.user_id = current_user_id
  returning credit_account.balance into account_balance;

  update public.credit_reservations
  set status = 'released', metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb)
  where id = reservation.id;

  insert into public.credit_ledger (user_id, delta, entry_type, reference_id, metadata)
  values (current_user_id, reservation.reserved_amount, 'release', reservation.id::text, coalesce(p_metadata, '{}'::jsonb));

  return query select account_balance, reservation.reserved_amount;
end;
$$;

create or replace function public.get_credit_balance()
returns table (balance integer, lifetime_granted integer, lifetime_purchased integer, lifetime_used integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  perform public.ensure_credit_account();
  return query
  select ca.balance, ca.lifetime_granted, ca.lifetime_purchased, ca.lifetime_used
  from public.credit_accounts ca
  where ca.user_id = current_user_id;
end;
$$;

revoke all on function public.ensure_credit_account() from public, anon, authenticated;
grant execute on function public.reserve_credits(text, integer, jsonb) to authenticated;
grant execute on function public.settle_credits(uuid, integer, jsonb) to authenticated;
grant execute on function public.release_credits(uuid, jsonb) to authenticated;
grant execute on function public.get_credit_balance() to authenticated;
