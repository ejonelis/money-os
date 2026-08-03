-- Money OS — initial schema
-- Household-scoped personal finance: accounts (incl. debts), a single
-- transactions ledger with planned/actual status, recurring bill rules,
-- categories, and budgets. See project plan for the full rationale.

-- ---------------------------------------------------------------------
-- households
-- ---------------------------------------------------------------------
create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- household_members — links auth.users to a household
-- ---------------------------------------------------------------------
create table household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  unique (household_id, user_id)
);

-- Security-definer helper so RLS policies can check membership without
-- re-triggering RLS on household_members (which would recurse).
create function is_household_member(target_household_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from household_members
    where household_id = target_household_id
      and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------
-- accounts — bank/credit accounts AND debts (debts are liability accounts,
-- not a separate module; see plan section "Debts are accounts")
-- ---------------------------------------------------------------------
create table accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  type text not null check (
    type in ('checking', 'savings', 'credit_card', 'investment', 'debt', 'other')
  ),
  institution text,
  currency text not null default 'EUR',
  is_liability boolean not null default false,
  -- Debt accounts only: the original amount owed (Sheet's "Skola"), a
  -- single static fact carried over — no historical payment log imported.
  original_amount numeric(14, 2),
  -- Debt accounts only: grouping label, e.g. THS / Sástos / Personal.
  group_label text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index accounts_household_id_idx on accounts (household_id);

-- ---------------------------------------------------------------------
-- balance_snapshots — point-in-time balances; net worth is derived from
-- the latest snapshot per account, not stored separately.
-- ---------------------------------------------------------------------
create table balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  as_of_date date not null,
  balance numeric(14, 2) not null,
  source text not null default 'manual' check (source in ('manual', 'import')),
  created_at timestamptz not null default now(),
  unique (account_id, as_of_date)
);

create index balance_snapshots_account_id_idx on balance_snapshots (account_id);

-- ---------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------
create table categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  parent_id uuid references categories(id) on delete set null,
  kind text not null check (kind in ('income', 'expense')),
  color text,
  icon text,
  created_at timestamptz not null default now()
);

create index categories_household_id_idx on categories (household_id);

-- ---------------------------------------------------------------------
-- recurring_rules — imported from MONTHLY BILLS; generates the next
-- planned transaction for each bill (created before transactions, which
-- reference it).
-- ---------------------------------------------------------------------
create table recurring_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  description text not null,
  frequency text not null check (frequency in ('yearly', 'monthly', 'weekly')),
  amount numeric(14, 2) not null,
  next_due_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index recurring_rules_household_id_idx on recurring_rules (household_id);
create index recurring_rules_account_id_idx on recurring_rules (account_id);

-- ---------------------------------------------------------------------
-- transactions — the single ledger. "planned" vs "actual" is the only
-- difference between an upcoming entry and confirmed history; see plan
-- section "One ledger, two states".
-- ---------------------------------------------------------------------
create table transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  date date not null,
  amount numeric(14, 2) not null,
  status text not null default 'actual' check (status in ('planned', 'actual')),
  recurring_rule_id uuid references recurring_rules(id) on delete set null,
  category_id uuid references categories(id) on delete set null,
  merchant text,
  notes text,
  is_transfer boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index transactions_account_id_idx on transactions (account_id);
create index transactions_status_idx on transactions (status);
create index transactions_date_idx on transactions (date);

-- ---------------------------------------------------------------------
-- budgets
-- ---------------------------------------------------------------------
create table budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  month date not null,
  amount numeric(14, 2) not null,
  created_at timestamptz not null default now(),
  unique (category_id, month)
);

create index budgets_household_id_idx on budgets (household_id);

-- ---------------------------------------------------------------------
-- net_worth — derived view: latest balance per account, split by
-- is_liability. Not a stored table, so it can never drift out of sync.
-- ---------------------------------------------------------------------
create view net_worth
with (security_invoker = true)
as
select
  a.household_id,
  a.is_liability,
  sum(latest.balance) as total
from accounts a
join lateral (
  select bs.balance
  from balance_snapshots bs
  where bs.account_id = a.id
  order by bs.as_of_date desc
  limit 1
) latest on true
where not a.archived
group by a.household_id, a.is_liability;

-- =======================================================================
-- Row-level security — every table is scoped to the requesting user's
-- household(s).
-- =======================================================================

alter table households enable row level security;
alter table household_members enable row level security;
alter table accounts enable row level security;
alter table balance_snapshots enable row level security;
alter table categories enable row level security;
alter table recurring_rules enable row level security;
alter table transactions enable row level security;
alter table budgets enable row level security;

-- households: any signed-in user may create one (they must add themselves
-- via household_members immediately after); membership is required to
-- read, update, or delete it.
create policy "households: insert if signed in" on households
  for insert
  with check (auth.uid() is not null);

create policy "households: select if member" on households
  for select
  using (is_household_member(id));

create policy "households: update if member" on households
  for update
  using (is_household_member(id))
  with check (is_household_member(id));

create policy "households: delete if member" on households
  for delete
  using (is_household_member(id));

-- household_members: members can see the roster; a new household's first
-- member can bootstrap themselves as owner, and existing members can add
-- a partner.
create policy "household_members: select if member" on household_members
  for select
  using (is_household_member(household_id));

create policy "household_members: insert self as first member or by existing member"
  on household_members
  for insert
  with check (
    user_id = auth.uid()
    and (
      is_household_member(household_id)
      or not exists (
        select 1 from household_members m where m.household_id = household_members.household_id
      )
    )
  );

create policy "household_members: delete if member" on household_members
  for delete
  using (is_household_member(household_id));

-- accounts, categories, recurring_rules, budgets: straightforward
-- household-scoped access.
create policy "accounts: household access" on accounts
  for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

create policy "categories: household access" on categories
  for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

create policy "recurring_rules: household access" on recurring_rules
  for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

create policy "budgets: household access" on budgets
  for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

-- balance_snapshots, transactions: scoped via their account's household.
create policy "balance_snapshots: household access via account" on balance_snapshots
  for all
  using (
    exists (
      select 1 from accounts a
      where a.id = balance_snapshots.account_id
        and is_household_member(a.household_id)
    )
  )
  with check (
    exists (
      select 1 from accounts a
      where a.id = balance_snapshots.account_id
        and is_household_member(a.household_id)
    )
  );

create policy "transactions: household access via account" on transactions
  for all
  using (
    exists (
      select 1 from accounts a
      where a.id = transactions.account_id
        and is_household_member(a.household_id)
    )
  )
  with check (
    exists (
      select 1 from accounts a
      where a.id = transactions.account_id
        and is_household_member(a.household_id)
    )
  );
