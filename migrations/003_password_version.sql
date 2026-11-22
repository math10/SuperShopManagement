-- Raised on every password change or admin reset. Each session remembers the
-- version it logged in with, and a session holding an older version is logged
-- out, so changing a password that someone else saw actually locks them out.
ALTER TABLE users ADD COLUMN password_version integer NOT NULL DEFAULT 1;
