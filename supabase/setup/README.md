# Moonlight Supabase Setup Pack

Use these files when creating or repairing the Moonlight Supabase ledger.

## New Supabase Project

Run in this order from the Supabase SQL Editor:

1. `00_live_schema.sql`
2. `01_storage.sql`
3. `03_seed_dev_workspace.sql`
4. `99_smoke_checks.sql`

Only run `02_rls_policies.sql` after Supabase Auth users are mapped into `profiles` and `workspace_memberships`.

## Existing Supabase Project

If `supabase/schema.sql` and the earlier migrations already ran, apply:

1. `../migrations/20260602_0004_live_setup_contracts.sql`
2. `01_storage.sql`
3. `99_smoke_checks.sql`

## Runtime Env Alignment

For the dev seed, set:

```bash
COM_MOON_DEFAULT_WORKSPACE_ID=11111111-1111-1111-1111-111111111111
OPENCLAW_PROJECT_ID=33333333-3333-3333-3333-333333333331
```

Production can use different UUIDs, but `COM_MOON_DEFAULT_WORKSPACE_ID` must match an actual `workspaces.id`.
