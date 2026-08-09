-- Widen recurring_rules.frequency to add "every 2 months" and "quarterly",
-- alongside the existing weekly/monthly/yearly options.
alter table recurring_rules drop constraint if exists recurring_rules_frequency_check;

alter table recurring_rules add constraint recurring_rules_frequency_check
  check (frequency in ('yearly', 'monthly', 'bimonthly', 'quarterly', 'weekly'));
