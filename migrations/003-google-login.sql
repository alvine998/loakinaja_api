-- Track whether a user has signed in with Google at least once.
ALTER TABLE users
  ADD COLUMN is_google_login TINYINT(1) NOT NULL DEFAULT 0;
