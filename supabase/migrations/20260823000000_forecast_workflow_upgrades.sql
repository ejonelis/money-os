-- Balance snapshots: allow more than one entry per account per day, so a
-- quick balance update from the Forecast page (e.g. 7pm) doesn't collide
-- with the morning's Balances-page entry (e.g. 6am) — both are kept, and
-- "current balance" always means whichever was entered most recently.
-- Looked up by type rather than assumed name, so this can't silently no-op.
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'balance_snapshots'::regclass and contype = 'u';
  if cname is not null then
    execute format('alter table balance_snapshots drop constraint %I', cname);
  end if;
end $$;

-- Transactions: add "on_hold" — a one-off that's been added to the Forecast
-- ledger but deliberately excluded from the running balance until there's
-- money to cover it.
alter table transactions drop constraint if exists transactions_status_check;

alter table transactions add constraint transactions_status_check
  check (status in ('planned', 'actual', 'on_hold'));

-- Recurring rules: add "monthly_weekday" for bills that land on a specific
-- weekday-of-month (e.g. "every 2nd Tuesday") rather than a fixed day
-- number.
alter table recurring_rules drop constraint if exists recurring_rules_frequency_check;

alter table recurring_rules add constraint recurring_rules_frequency_check
  check (frequency in ('yearly', 'monthly', 'bimonthly', 'quarterly', 'weekly', 'monthly_weekday'));
