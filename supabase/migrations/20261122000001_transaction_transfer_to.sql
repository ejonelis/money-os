-- One-off entries can now point at the account they pay into (e.g. an extra
-- credit card payment entered on the Bills account), so the card forecast
-- can show it as a payment. Mirrors recurring_rules.transfer_to_account_id.
alter table transactions
  add column transfer_to_account_id uuid references accounts(id) on delete set null;

create index transactions_transfer_to_idx on transactions (transfer_to_account_id);
