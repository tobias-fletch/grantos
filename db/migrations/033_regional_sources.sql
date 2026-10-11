BEGIN;
-- Official pages checked 2026-10-10. Source coverage is NOT applicant eligibility.
-- Existing editor choices (including disabled sources and cadence) take precedence.
INSERT INTO crawl_sources(name,url,approved_domains,categories,geography,enabled,interval_hours) VALUES
('LMCC Manhattan Arts Grants','https://lmcc.net/resources/manhattan-arts-grants/',ARRAY['lmcc.net','www.lmcc.net'],ARRAY['Music','Visual Art','Theater','Dance','Community Project'],'Manhattan / New York City / New York',true,24),
('Brooklyn Arts Council grants','https://www.brooklynartscouncil.org/what-we-do/grants',ARRAY['www.brooklynartscouncil.org','brooklynartscouncil.org'],ARRAY['Music','Visual Art','Theater','Dance','Community Project'],'Brooklyn / New York City / New York',true,24),
('NYFA Queens Arts Access','https://www.nyfa.org/awards-grants/queens-arts-fund-arts-access-grant/',ARRAY['www.nyfa.org','nyfa.org'],ARRAY['Music','Visual Art','Theater','Dance','Nonprofit'],'Queens / New York City / New York',true,24),
('Bronx Council on the Arts Community Arts','https://www.bronxarts.org/grants/community-arts-grant/',ARRAY['www.bronxarts.org','bronxarts.org'],ARRAY['Music','Visual Art','Theater','Dance','Nonprofit','Community Project'],'Bronx / New York City / New York',true,24),
('Staten Island Arts grants','https://statenislandarts.org/grants/',ARRAY['statenislandarts.org','www.statenislandarts.org'],ARRAY['Music','Visual Art','Theater','Dance','Community Project'],'Staten Island / New York City / New York',true,24),
('New York Community Trust nonprofit funding','https://www.thenytrust.org/nonprofits/',ARRAY['www.thenytrust.org','thenytrust.org'],ARRAY['Nonprofit','Education','Community Project'],'New York City / New York',true,24),
('Greater New Orleans Foundation grants','https://www.gnof.org/nonprofits/grants/',ARRAY['www.gnof.org','gnof.org'],ARRAY['Nonprofit','Education','Community Project'],'New Orleans / Louisiana',true,24),
('Arts New Orleans grantmaking','https://www.artsneworleans.org/grantmaking/',ARRAY['www.artsneworleans.org','artsneworleans.org'],ARRAY['Music','Visual Art','Film / Video','Theater','Dance','Writing / Literature','Community Project'],'New Orleans / Louisiana',true,24),
('New Orleans Tourism and Cultural Foundation grants','https://notcf.com/grants/',ARRAY['notcf.com','www.notcf.com'],ARRAY['Music','Visual Art','Small Business','Nonprofit','Community Project'],'New Orleans / Louisiana',true,24),
('Louisiana Endowment for the Humanities grants','https://leh.org/grants/',ARRAY['leh.org','www.leh.org'],ARRAY['Education','Nonprofit','Writing / Literature','Community Project'],'Louisiana',true,24),
('NEA Foundation educator grants','https://www.neafoundation.org/educator-grants-and-fellowships/',ARRAY['www.neafoundation.org','neafoundation.org'],ARRAY['Education'],'United States',true,24)
ON CONFLICT(url) DO NOTHING;
-- The worker seeds enabled source URLs under its normal lease. Keeping runtime
-- frontier rows out of migrations also preserves fresh-database catalog transfer.
COMMIT;
