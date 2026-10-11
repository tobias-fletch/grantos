BEGIN;
-- Official administering sources reviewed 2026-10-11; evidence and rollout limits:
-- docs/ny-la-source-expansion.md. Coverage/category hints are NOT eligibility.
-- Blocked NY agency pages remain disabled pending supported crawler access.
-- Never reset an editor's enablement, approved domains, cadence, or reviewed fields.
INSERT INTO crawl_sources(name,url,approved_domains,categories,geography,enabled,interval_hours) VALUES
('NYSCA opportunity guidelines — access needs checking','https://arts.ny.gov/OpportunityGuidelines',ARRAY['arts.ny.gov'],ARRAY['Music','Visual Art','Film / Video','Theater','Dance','Writing / Literature','Photography','Nonprofit','Community Project'],'New York',false,24),
('NYSCA State of the Arts Fellowship — access needs checking','https://arts.ny.gov/SOAfellow',ARRAY['arts.ny.gov'],ARRAY['Music','Visual Art','Film / Video','Theater','Dance','Writing / Literature','Photography'],'New York',false,24),
('ESD Global NY Fund Grant Program — access needs checking','https://esd.ny.gov/global-ny-fund-grant-program',ARRAY['esd.ny.gov'],ARRAY['Small Business','Nonprofit'],'New York',false,24),
('ESD Innovation Matching Grants — access needs checking','https://esd.ny.gov/innovation-matching-grants-program',ARRAY['esd.ny.gov'],ARRAY['Small Business','Technology','Research'],'New York',false,24),
('Louisiana Bar Foundation Community Partnership Panels — private foundation','https://raisingthebar.org/community-partnership-panels/',ARRAY['raisingthebar.org'],ARRAY['Nonprofit','Education','Community Project'],'Louisiana',true,24),
('NY Agriculture Climate Resilient Farming Round 10 — access needs checking','https://agriculture.ny.gov/rfp-0430-climate-resilient-farming-program-round-10',ARRAY['agriculture.ny.gov'],ARRAY['Agriculture / Food','Community Project'],'New York',false,24),
('NY Agriculture Transportation for Youth to Fairs — access needs checking','https://agriculture.ny.gov/rfp-0426-2027-transportation-youth-county-and-local-fairs-program',ARRAY['agriculture.ny.gov'],ARRAY['Agriculture / Food','Education','Nonprofit','Community Project'],'New York',false,24),
('CNY Arts Statewide Community Regrants — six-county region','https://cnyarts.org/grants/statewide-community-regrants/',ARRAY['cnyarts.org'],ARRAY['Music','Visual Art','Film / Video','Theater','Dance','Writing / Literature','Photography','Nonprofit','Education','Community Project'],'Cortland County / Herkimer County / Madison County / Oneida County / Onondaga County / Oswego County / New York',true,24),
('LDAF Agricultural Workforce Development Program','https://www.ldaf.la.gov/business/grants-funding/louisiana-agricultural-workforce-development-program',ARRAY['www.ldaf.la.gov'],ARRAY['Agriculture / Food','Small Business','Education'],'Louisiana',true,24),
('LDAF Specialty Crop Block Grant Program','https://www.ldaf.la.gov/food/selling/produce/specialty-crops/program',ARRAY['www.ldaf.la.gov'],ARRAY['Agriculture / Food','Research','Community Project'],'Louisiana',true,24),
('LDAF Resilient Food Systems Infrastructure','https://www.ldaf.la.gov/business/grants-funding/resilient-food-systems-infrastructure',ARRAY['www.ldaf.la.gov'],ARRAY['Agriculture / Food','Small Business'],'Louisiana',true,24),
('Acadiana Center for the Arts Louisiana Project Grants — Region 4','https://acadianacenterforthearts.org/opportunities-for-organizations/louisiana-project-grants/',ARRAY['acadianacenterforthearts.org'],ARRAY['Music','Visual Art','Film / Video','Theater','Dance','Writing / Literature','Photography','Nonprofit','Education','Community Project'],'Acadia Parish / Evangeline Parish / Iberia Parish / Lafayette Parish / St. Landry Parish / St. Martin Parish / St. Mary Parish / Vermilion Parish / Louisiana',true,24)
ON CONFLICT(url) DO NOTHING;
-- Seed URLs through normal leased worker execution; no frontier or opportunity writes.
COMMIT;
