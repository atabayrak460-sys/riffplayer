-- JWTs (custom /api/v1 auth) were checked only by signature + expiry, with no
-- link to the user's current password. An admin changing a user's password
-- left any JWT issued before that change valid for up to 90 more days — no
-- logout/revocation mechanism existed at all.
--
-- token_version is embedded in every newly-signed JWT and checked against the
-- current DB value on every request; bumping it (done on password change)
-- instantly invalidates all previously-issued tokens for that user.
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
