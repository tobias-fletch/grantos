BEGIN;
-- A permanent, singleton consumption record. Rotating configuration or removing
-- an account must never reopen first-owner setup. No secret is stored here.
CREATE TABLE staging_owner_setup (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  consumed_at timestamptz,
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  CHECK (owner_user_id IS NULL OR consumed_at IS NOT NULL)
);
INSERT INTO staging_owner_setup(singleton) VALUES (true);
COMMIT;
