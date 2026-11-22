-- Credit card forecast: a credit limit on accounts, and a way for a bill
-- (e.g. a weekly card payment on the Bills account) to point at the
-- account it pays into, so the card forecast can show it as a payment.
alter table accounts
  add column credit_limit numeric(14, 2);

alter table recurring_rules
  add column transfer_to_account_id uuid references accounts(id) on delete set null;

create index recurring_rules_transfer_to_idx on recurring_rules (transfer_to_account_id);
