BEGIN;
CREATE TABLE catalog_ai_research (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 topic_key text NOT NULL, topic jsonb NOT NULL,
 status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','researched','queued','failed')),
 reserved_cents integer NOT NULL DEFAULT 10 CHECK(reserved_cents = 10),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), finished_at timestamptz,
 response_id text, input_tokens integer, output_tokens integer,
 links jsonb NOT NULL DEFAULT '[]', queued_count integer NOT NULL DEFAULT 0,
 domain_count integer NOT NULL DEFAULT 0, note text NOT NULL DEFAULT ''
);
CREATE INDEX catalog_ai_research_created ON catalog_ai_research(created_at);
CREATE INDEX catalog_ai_research_topic ON catalog_ai_research(topic_key,created_at);
ALTER TABLE crawl_sources ADD COLUMN ai_discovered boolean NOT NULL DEFAULT false;
COMMIT;
