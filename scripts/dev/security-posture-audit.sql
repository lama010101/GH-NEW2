-- SEC-BUILD-POSTUREAUDIT-020 — Supabase security-posture audit (READ-ONLY).
-- Emits one row per violation candidate: check_id, severity, object, detail.
-- Never outputs secret VALUES (only identifiers). The runner
-- (scripts/dev/security-posture-audit.ts) applies the allowlist
-- (scripts/dev/security-posture-allowlist.json) before reporting.
--
-- Checks:
--   C1 CRITICAL  open write policies for anon/authenticated/public
--                (cmd INSERT/UPDATE/DELETE/ALL with always-true USING or WITH CHECK)
--   C2 HIGH      always-true SELECT policies for client roles on non-allowlisted tables
--   C3 CRITICAL  public tables with RLS disabled
--      HIGH      anon/authenticated write grants on tables with no write policy for that role
--   C4 CRITICAL  SECURITY DEFINER functions executable by anon/authenticated
--      MEDIUM    SECURITY DEFINER functions without a pinned search_path
--   C5 HIGH      security-definer views readable by anon/authenticated
--   C6 CRITICAL  secret-like columns / secret-looking values in kv tables
--   C7 MEDIUM    out-of-band DDL drift candidates (resolved against the repo by the runner)

WITH norm AS (
  SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check,
         regexp_replace(lower(coalesce(qual, '')), '[\s()]|::[a-z_]+', '', 'g') AS qual_n,
         regexp_replace(lower(coalesce(with_check, '')), '[\s()]|::[a-z_]+', '', 'g') AS check_n
  FROM pg_policies
  WHERE schemaname = 'public'
),
always_true AS (
  SELECT unnest(ARRAY[
    'true',
    'auth.uid()isnotnull',
    $$auth.role()='authenticated'$$,
    $$auth.role()='anon'$$
  ]) AS expr
)

SELECT * FROM (
  -- C1: open-write policies ---------------------------------------------------
  SELECT 'C1' AS check_id, 'CRITICAL' AS severity,
         'policy:' || schemaname || '.' || tablename || '.' || policyname AS object,
         'cmd=' || cmd || ' roles=' || roles::text ||
         ' always-true USING=' || qual_n || ' WITH CHECK=' || check_n AS detail
  FROM norm
  WHERE cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
    AND (roles && '{anon,authenticated,public}'::name[])
    AND (qual_n IN (SELECT expr FROM always_true)
      OR check_n IN (SELECT expr FROM always_true))

  UNION ALL

  -- C2: always-true read policies for client roles (allowlist: publicReadTables)
  SELECT 'C2', 'HIGH',
         'policy:' || schemaname || '.' || tablename || '.' || policyname,
         'always-true SELECT for ' || roles::text || ' on public.' || tablename
  FROM norm
  WHERE cmd IN ('SELECT', 'ALL')
    AND (roles && '{anon,authenticated,public}'::name[])
    AND qual_n IN (SELECT expr FROM always_true)

  UNION ALL

  -- C3a: RLS disabled on public tables
  SELECT 'C3', 'CRITICAL',
         'table:public.' || c.relname,
         'RLS disabled (rowsecurity off)'
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity

  UNION ALL

  -- C3b: write grants held by client roles with no write policy for that role
  SELECT 'C3', 'HIGH',
         'table:public.' || g.table_name,
         g.grantee || ' holds ' || g.privs || ' but no INSERT/UPDATE/DELETE policy for ' || g.grantee
  FROM (
    SELECT table_name, grantee, string_agg(privilege_type, ',') AS privs
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
      AND grantee IN ('anon', 'authenticated')
    GROUP BY table_name, grantee
  ) g
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = g.table_name
      AND p.cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      AND p.roles && ARRAY[g.grantee]::name[]
  )

  UNION ALL

  -- C4a: SECURITY DEFINER functions executable by client roles
  --      (allowlist: clientCallableDefinerFunctions)
  SELECT 'C4', 'CRITICAL',
         'function:' || p.oid::regprocedure::text,
         'SECURITY DEFINER executable by ' || r.role
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role)
  WHERE n.nspname = 'public' AND p.prosecdef
    AND has_function_privilege(r.role, p.oid, 'EXECUTE')

  UNION ALL

  -- C4b: SECURITY DEFINER functions without a pinned search_path
  SELECT 'C4', 'MEDIUM',
         'function:' || p.oid::regprocedure::text,
         'SECURITY DEFINER without pinned search_path'
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef
    AND NOT EXISTS (
      SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) c
      WHERE c LIKE 'search_path=%'
    )

  UNION ALL

  -- C5: security-definer views readable by client roles (allowlist: publicDefinerViews)
  SELECT 'C5', 'HIGH',
         'view:public.' || c.relname,
         'security-definer view (no security_invoker) readable by ' || g.grantee
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN (VALUES ('anon'), ('authenticated')) AS g(grantee)
  WHERE n.nspname = 'public' AND c.relkind = 'v'
    AND NOT coalesce(
      (SELECT true FROM unnest(c.reloptions) o
       WHERE o IN ('security_invoker=true', 'security_invoker=on')),
      false)
    AND has_table_privilege(g.grantee, c.oid, 'SELECT')

  UNION ALL

  -- C6a: secret-like column names in public tables (allowlist: secretLikeColumns)
  SELECT 'C6', 'HIGH',
         'column:public.' || table_name || '.' || column_name,
         'secret-like column name (' || data_type || ')'
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND column_name ~* 'key|secret|token|password|credential|api_'

  UNION ALL

  -- C6b: secret-looking values in the settings kv table (id reported, value NEVER)
  SELECT 'C6', 'CRITICAL',
         'row:public.settings',
         'secret-looking value, id=' || id
  FROM public.settings
  WHERE value ~ '^(sk-|eyJ|-----BEGIN|sb_secret)'
     OR lower(value) LIKE '%bearer %'

  UNION ALL

  -- C7: drift candidates — every public policy + non-system public function.
  --     The runner greps supabase/migrations/*.sql for each name; objects whose
  --     name never appears are reported as MEDIUM drift.
  SELECT 'C7', 'MEDIUM',
         'policy:' || schemaname || '.' || tablename || '.' || policyname,
         'policy candidate for repo-migration presence check'
  FROM pg_policies WHERE schemaname = 'public'

  UNION ALL

  SELECT 'C7', 'MEDIUM',
         'function:' || p.oid::regprocedure::text,
         'function candidate for repo-migration presence check'
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
) audit
ORDER BY check_id, severity, object;
