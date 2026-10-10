BEGIN;
ALTER TABLE search_discovery_jobs ADD COLUMN geography jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE search_discovery_jobs ADD COLUMN search_constraints jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE search_discovery_jobs ADD COLUMN coverage_gap boolean NOT NULL DEFAULT false;
-- Official publisher pages researched October 10, 2026. Coverage is not eligibility.
-- Preserve any existing editor settings, including intentionally disabled sources.
INSERT INTO crawl_sources(name,url,approved_domains,categories,geography,enabled) VALUES
('Arts New Orleans — Louisiana Project Grants','https://www.artsneworleans.org/grantmaking/louisiana-project-grants/',ARRAY['www.artsneworleans.org','artsneworleans.org'],ARRAY['Music','Visual Art','Film / Video','Theater','Dance','Writing / Literature','Photography','Nonprofit','Community Project'],'New Orleans / Louisiana',true),
('Louisiana Division of the Arts — grant programs','https://www.crt.la.gov/cultural-development/arts/grants/',ARRAY['www.crt.la.gov','crt.la.gov','www.crt.state.la.us','crt.state.la.us'],ARRAY['Music','Visual Art','Film / Video','Theater','Dance','Writing / Literature','Photography','Nonprofit','Education','Community Project'],'Louisiana',true)
ON CONFLICT(url) DO NOTHING;
COMMIT;
