-- When aven.id last said whether the session's person is a citizen (the roles back channel, src/roles.js), so the API
-- asks again once that answer is old.
ALTER TABLE sessions ADD COLUMN roles_checked_at timestamptz NOT NULL DEFAULT now();
