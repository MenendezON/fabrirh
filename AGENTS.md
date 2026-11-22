# Fabri RH — règles de travail

Projet autonome (plus lié à Lovable). Les migrations vivent dans `drizzle/migrations/` et les scripts
complémentaires dans `docs/sql-manuel/` ; ils sont rejouables avec `sh supabase/apply-all.sh`.
Après un changement de schéma, régénérer `src/integrations/supabase/types.ts`
(`supabase gen types typescript --project-id <réf> > src/integrations/supabase/types.ts`).
Les secrets (`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`) ne sont jamais committés.

## Project rules

- Access control lives in the database: roles in `public.user_roles` (one active row per user, `archived_at` = deactivated), checked through `has_role` / `has_any_role` / `get_my_role` security-definer functions in RLS. UI role checks are cosmetic only.
- Every app table carries `id, created_at, updated_at, created_by, updated_by, archived_at`, plus the `set_audit_columns` (BEFORE) and `log_audit` (AFTER) triggers; clients get no DELETE grant, so rows are archived, never removed.
- Business parameters are rows in `public.settings` (integer value + unit); code reads them, never hardcodes them.
- Computed HR fields (age, seniority, remaining days, retirement date) must be SQL views, never stored columns.
- Display formatting (FCFA, dates in Africa/Dakar) goes through `src/lib/format.ts` so the rule stays in one tested place.
- Signed-in pages live under `src/routes/_authenticated/` (client-only gate) and render inside `AppShell`; admin-only screens wrap content in `RequireRole`.
- Privileged auth operations (inviting users) run in `createServerFn` with `requireSupabaseAuth`, verify `has_role` first, then load the admin client inside the handler.
- Public sign-up is disabled; the first account created when no active admin exists is auto-promoted to `admin_rh` by the `handle_new_user` trigger.
