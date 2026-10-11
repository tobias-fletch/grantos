BEGIN;
CREATE TABLE catalog_provider_sync (
 provider text PRIMARY KEY CHECK(provider IN ('grants-gov','california')),
 enabled boolean NOT NULL DEFAULT true,
 cursor integer NOT NULL DEFAULT 0 CHECK(cursor>=0),
 pending jsonb NOT NULL DEFAULT '[]',
 next_check_at timestamptz NOT NULL DEFAULT now(),
 last_success_at timestamptz, completed_at timestamptz,
 failures integer NOT NULL DEFAULT 0,
 last_error text NOT NULL DEFAULT '',
 imported integer NOT NULL DEFAULT 0, skipped integer NOT NULL DEFAULT 0
);
INSERT INTO catalog_provider_sync(provider) VALUES('grants-gov'),('california');
CREATE TABLE catalog_provider_records (
 provider text NOT NULL REFERENCES catalog_provider_sync(provider),
 external_id text NOT NULL, opportunity_id uuid REFERENCES opportunities(id),
 hash text NOT NULL, checked_at timestamptz NOT NULL DEFAULT now(),
 next_check_at timestamptz NOT NULL DEFAULT now()+interval '1 day',
 PRIMARY KEY(provider,external_id)
);
CREATE INDEX provider_records_due ON catalog_provider_records(provider,next_check_at);
COMMIT;
