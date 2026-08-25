-- Lets category find-or-create (the balance reconciliation flow) resolve
-- a name to a single row via upsert instead of a racy select-then-insert.
alter table categories
  add constraint categories_household_id_name_kind_key unique (household_id, name, kind);
