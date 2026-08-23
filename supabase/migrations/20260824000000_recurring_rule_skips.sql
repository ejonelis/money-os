-- Tracks individual occurrences of a recurring bill that were deliberately
-- removed from the Forecast ledger (e.g. "delete just this one"), so
-- materialize.ts doesn't silently regenerate them on the next page load.
create table recurring_rule_skips (
  id uuid primary key default gen_random_uuid(),
  recurring_rule_id uuid not null references recurring_rules(id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  unique (recurring_rule_id, date)
);

create index recurring_rule_skips_rule_id_idx on recurring_rule_skips (recurring_rule_id);

alter table recurring_rule_skips enable row level security;

create policy "recurring_rule_skips: household access via rule" on recurring_rule_skips
  for all
  using (
    exists (
      select 1 from recurring_rules r
      where r.id = recurring_rule_skips.recurring_rule_id
        and is_household_member(r.household_id)
    )
  )
  with check (
    exists (
      select 1 from recurring_rules r
      where r.id = recurring_rule_skips.recurring_rule_id
        and is_household_member(r.household_id)
    )
  );
