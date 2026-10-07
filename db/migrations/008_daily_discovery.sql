BEGIN;
CREATE TABLE crawl_sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
 url text NOT NULL UNIQUE, approved_domains text[] NOT NULL,
 categories text[] NOT NULL DEFAULT '{}', geography text NOT NULL DEFAULT 'NYC / United States',
 enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO crawl_sources(name,url,approved_domains,categories)
 SELECT o.name,o.source_url,ARRAY[substring(o.source_url from '^https://([^/]+)')],
 ARRAY(SELECT category FROM opportunity_categories WHERE opportunity_id=o.id)
 FROM opportunities o WHERE NOT is_demo ON CONFLICT(url) DO NOTHING;
INSERT INTO crawl_sources(name,url,approved_domains,categories) VALUES
 ('NYFA awards directory','https://www.nyfa.org/awards-grants/',ARRAY['www.nyfa.org'],ARRAY['Music','Visual Art','Film / Video','Theater','Dance','Writing / Literature','Photography']),
 ('NEA grants directory','https://www.arts.gov/grants',ARRAY['www.arts.gov'],ARRAY['Music','Visual Art','Film / Video','Theater','Dance','Writing / Literature','Photography','Nonprofit','Community Project']),
 ('NSF funding directory','https://www.nsf.gov/funding',ARRAY['www.nsf.gov'],ARRAY['Research','Education','Technology']),
 ('USDA AMS grants directory','https://www.ams.usda.gov/services/grants',ARRAY['www.ams.usda.gov'],ARRAY['Agriculture / Food','Small Business']),
 ('Spencer research grants','https://www.spencer.org/research-grants',ARRAY['www.spencer.org'],ARRAY['Research','Education']),
 ('SARE grants directory','https://www.sare.org/grants/',ARRAY['www.sare.org'],ARRAY['Agriculture / Food','Research','Education']),
 ('NYSERDA funding directory','https://www.nyserda.ny.gov/funding',ARRAY['www.nyserda.ny.gov'],ARRAY['Technology','Small Business','Research']),
 ('NYC nonprofit funding','https://www.nyc.gov/site/nonprofits/resources/apply-for-funding.page',ARRAY['www.nyc.gov'],ARRAY['Nonprofit','Community Project'])
 ON CONFLICT(url) DO NOTHING;
CREATE TABLE crawl_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), schedule_day date UNIQUE,
 trigger text NOT NULL CHECK(trigger IN ('scheduled','manual','acceptance')),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','complete','partial','failed')),
 requested_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 started_at timestamptz, heartbeat_at timestamptz, finished_at timestamptz,
 page_limit integer NOT NULL DEFAULT 1000 CHECK(page_limit BETWEEN 1 AND 1000),
 source_id uuid REFERENCES crawl_sources(id), note text NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX one_active_crawl ON crawl_runs ((true)) WHERE status IN ('queued','running');
CREATE TABLE crawl_frontier (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id uuid NOT NULL REFERENCES crawl_sources(id),
 url text NOT NULL, depth integer NOT NULL CHECK(depth BETWEEN 0 AND 3),
 last_run_id uuid REFERENCES crawl_runs(id), attempted_at timestamptz,
 UNIQUE(source_id,url)
);
CREATE TABLE crawl_visits (
 run_id uuid NOT NULL REFERENCES crawl_runs(id), source_id uuid NOT NULL REFERENCES crawl_sources(id),
 url text NOT NULL, status text NOT NULL CHECK(status IN ('reading','read','blocked','failed')),
 error text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(run_id,source_id,url)
);
CREATE TABLE crawl_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id uuid NOT NULL REFERENCES crawl_sources(id),
 url text NOT NULL, hash text NOT NULL, title text NOT NULL, body text NOT NULL,
 extracted jsonb NOT NULL DEFAULT '{}', fetched_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_id,url,hash)
);
CREATE TABLE crawl_candidates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id uuid NOT NULL REFERENCES crawl_sources(id),
 url text NOT NULL, hash text NOT NULL, snapshot_id uuid REFERENCES crawl_snapshots(id),
 opportunity_id uuid REFERENCES opportunities(id), kind text NOT NULL CHECK(kind IN ('new','changed','domain')),
 title text NOT NULL, previous jsonb NOT NULL DEFAULT '{}', proposed jsonb NOT NULL DEFAULT '{}',
 evidence text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','dismissed','superseded')),
 reviewed_by uuid REFERENCES users(id), reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_id,url,hash,kind)
);
CREATE INDEX crawl_pending ON crawl_candidates(status,created_at DESC);
ALTER TABLE opportunities ADD COLUMN catalog_updated_at timestamptz;
COMMIT;
