-- Dropshipper fee wallet transaction types
-- Must land in its own migration so new enum values are committed
-- before functions in 015 reference them.

do $$
begin
  alter type public.wallet_tx_type add value if not exists 'inventory_fee';
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter type public.wallet_tx_type add value if not exists 'platform_commission';
exception
  when duplicate_object then null;
end;
$$;
