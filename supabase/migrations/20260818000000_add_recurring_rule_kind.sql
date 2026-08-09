-- recurring_rules need to represent income (salary) as well as expenses
-- (bills), so the forecast ledger's running balance means something.
-- amount stays a positive magnitude; kind determines the sign when a
-- transaction is generated from the rule.
alter table recurring_rules
  add column kind text not null default 'expense' check (kind in ('expense', 'income'));
