-- MP-FIX-AUTH-NULLTOKEN-ADMINCRASH-001
-- GoTrue scans auth.users token columns as non-nullable strings, so NULL
-- values cause GET /admin/users to return 500. Set only the affected
-- columns to empty string ''.

UPDATE auth.users
SET confirmation_token = ''
WHERE confirmation_token IS NULL;

UPDATE auth.users
SET recovery_token = ''
WHERE recovery_token IS NULL;

UPDATE auth.users
SET email_change_token_new = ''
WHERE email_change_token_new IS NULL;
