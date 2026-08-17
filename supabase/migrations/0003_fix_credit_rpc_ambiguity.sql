-- Repair Credit RPC output-column ambiguity.
-- PostgreSQL treats RETURNS TABLE columns as PL/pgSQL variables, so every
-- credit_accounts column reference must be qualified inside these functions.

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

grant execute on function public.reserve_credits(text, integer, jsonb) to authenticated;
grant execute on function public.settle_credits(uuid, integer, jsonb) to authenticated;
grant execute on function public.release_credits(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
