-- Backfill user_id for existing reports so they remain visible after the
-- user-scoping hardening. Assigns all NULL-user_id reports to a specified
-- user. Replace the placeholder UUID with your real Supabase auth user ID.
--
-- HOW TO FIND YOUR USER ID:
--   Supabase Dashboard → Authentication → Users → click your user → copy "User UID"
--
-- Then run:
--   UPDATE reportes SET user_id = '<YOUR-USER-UUID-HERE>' WHERE user_id IS NULL;

-- Example (replace with your actual user UUID):
-- UPDATE reportes SET user_id = 'a1b2c3d4-...' WHERE user_id IS NULL;

-- Optional: verify the backfill worked
-- SELECT count(*) FILTER (WHERE user_id IS NULL) AS remaining_nulls,
--        count(*) AS total_reports
-- FROM reportes;
