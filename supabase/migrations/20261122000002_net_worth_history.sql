-- Net worth history: imported net-worth totals for dates before per-account
-- balances were tracked here (e.g. years of history from another app).
-- The Net Worth page merges these with totals computed from balance
-- snapshots.
create table net_worth_history (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  as_of_date date not null,
  total numeric(14, 2) not null,
  created_at timestamptz not null default now(),
  unique (household_id, as_of_date)
);

create index net_worth_history_household_idx on net_worth_history (household_id);

alter table net_worth_history enable row level security;

create policy "net_worth_history: household access" on net_worth_history
  for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));
