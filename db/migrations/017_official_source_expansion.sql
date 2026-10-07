-- Researched official directories, 2026-10-07. Source coverage is not grant eligibility.
-- Preserve existing editor configuration on conflicts. Blocked federal directories start disabled.
BEGIN;
INSERT INTO crawl_sources(name,url,approved_domains,categories,funding_focus,geography,enabled) VALUES
('NYSCA regrants and services','https://arts.ny.gov/nysca-regrants-and-partnerships',ARRAY['arts.ny.gov'],ARRAY['Music','Visual Art','Film / Video','Theater','Dance','Writing / Literature','Photography','Nonprofit','Community Project'],ARRAY[]::text[],'New York State',true),
('New York Women''s Foundation grantmaking','https://nywf.org/our-work/grant-making/',ARRAY['nywf.org'],ARRAY['Nonprofit','Community Project'],ARRAY['women','minorities','lgbtq','low-income'],'New York City',true),
('Borealis race gender and disability funding','https://borealisphilanthropy.org/funding/race-gender-and-disability-justice/',ARRAY['borealisphilanthropy.org'],ARRAY['Nonprofit','Community Project'],ARRAY['lgbtq','minorities','disabilities'],'United States',true),
('USDA Rural Development programs','https://www.rd.usda.gov/programs-services/all-programs',ARRAY['www.rd.usda.gov'],ARRAY['Agriculture / Food','Small Business','Community Project','Technology'],ARRAY['rural','indigenous','low-income'],'United States',true),
('Administration for Community Living grants','https://acl.gov/grants',ARRAY['acl.gov'],ARRAY['Research','Education','Nonprofit','Community Project'],ARRAY['older-adults','disabilities'],'United States',true),
('ACF funding directory — access needs checking','https://acf.gov/grants',ARRAY['acf.gov'],ARRAY['Nonprofit','Community Project','Education'],ARRAY['immigrants','youth','low-income'],'United States',false),
('Veterans Employment and Training grants — access needs checking','https://www.dol.gov/agencies/vets/grants',ARRAY['www.dol.gov'],ARRAY['Nonprofit','Education','Community Project'],ARRAY['veterans'],'United States',false)
ON CONFLICT(url) DO NOTHING;
COMMIT;
