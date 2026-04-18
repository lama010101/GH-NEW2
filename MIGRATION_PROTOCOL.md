# MIGRATION PROTOCOL — MANDATORY

## Rule: A migration is not done until DB verification output is pasted.

## Required steps for every schema change:

1. Write SQL file in `supabase/migrations/` 
2. Run it in Supabase SQL Editor directly
3. Immediately run verification query:
   SELECT column_name FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = '<table>'
   ORDER BY ordinal_position;
4. Paste the verification output in your reply
5. Only then record the migration version

## Forbidden:
- Claiming a migration is applied without pasting verification output
- Creating migration files without running them
- Recording versions in schema_migrations without executing the SQL
