BEGIN;
-- Official program pages checked October 5, 2026. Dates below are published,
-- not projected from previous cycles. Applying this migration later does not
-- change the historical check date. Reverification requires an editorial update.
CREATE TEMP TABLE starter_catalog (
  slug text, name text, funder text, url text, summary text, eligibility text,
  deadline_notes text, minimum_award numeric, maximum_award numeric,
  rolling boolean, status text, opens_at timestamptz, deadline_at timestamptz,
  categories text[], applicants text[], country text, state text, city text
) ON COMMIT DROP;
INSERT INTO starter_catalog VALUES
('fca-emergency-grants', 'FCA Emergency Grants', 'Foundation for Contemporary Arts',
 'https://www.foundationforcontemporaryarts.org/grants/emergency-grants/',
 'Urgent project support for experimental visual and performing artists and poets facing an unexpected public presentation opportunity or a late project expense.',
 'Artists must live and work in the United States. Projects may take place in the U.S. or abroad. Review the emergency and project requirements with the funder.',
 'Year-round applications; the funder reviews requests monthly. Check project timing requirements before applying.',
 500, 3000, true, 'open', null, null,
 ARRAY['Visual Art','Music','Theater','Dance','Writing / Literature'], ARRAY['individual'], 'United States', null, null),
('pollock-krasner-artist-grants', 'Pollock-Krasner Artist Grants', 'Pollock-Krasner Foundation',
 'https://www.pkf.org/how-to-apply/',
 'Unrestricted support for professional painters, sculptors, and artists working on paper to continue their practice.',
 'Requires an established professional exhibition history, including at least ten qualifying exhibitions in ten years. Students and artists working primarily in photography, film, performance, commercial art, or crafts are not eligible.',
 'Applications are accepted year-round. Review typically takes nine to twelve months.',
 null, 50000, true, 'open', null, null,
 ARRAY['Visual Art'], ARRAY['individual'], null, null, null),
('awesome-nyc', 'Awesome NYC Microgrant', 'The Awesome Foundation — NYC',
 'https://www.awesomefoundation.org/en/chapters/nyc',
 'A $1,000 microgrant for a specific creative or community project. The NYC chapter supports ideas across art, technology, media, education, and social projects.',
 'Describe a specific project and how the funds will be used. Review the chapter application for any project and geographic requirements.',
 'The chapter states that applications close on the last day of each month. No exact next cutoff time is published here; confirm the current submission schedule with the funder.',
 1000, 1000, false, 'open', null, null,
 ARRAY['Community Project','Visual Art','Music','Film / Video','Education','Technology','Writing / Literature'],
 ARRAY['individual','collective','nonprofit','organization'], 'United States', 'New York', 'New York City'),
('rauschenberg-medical-cycle-39', 'Rauschenberg Medical Emergency Grants — Cycle 39', 'New York Foundation for the Arts',
 'https://www.nyfa.org/awards-grants/rauschenberg-medical-emergency-grants/',
 'One-time assistance with unexpected medical, dental, or mental-health expenses for artists in financial need.',
 'For eligible artists age 21+ in visual arts, digital/electronic arts, film/video, or choreography who reside in the U.S., D.C., a Tribal Nation, or a U.S. territory. Income limits and emergency timing apply. Music-only practices are not listed as eligible.',
 'Cycle 39 opens October 20, 2026 at 10 AM Eastern and closes November 17, 2026 at 5 PM Eastern. For emergencies on or after April 1, 2026. Confirm all requirements on the official page.',
 null, 5000, false, 'upcoming', '2026-10-20T10:00:00-04:00', '2026-11-17T17:00:00-05:00',
 ARRAY['Visual Art','Film / Video','Dance'], ARRAY['individual'], 'United States', null, null);

INSERT INTO funders(name, website_url)
SELECT DISTINCT s.funder, s.url FROM starter_catalog s
WHERE NOT EXISTS (SELECT 1 FROM funders f WHERE f.name = s.funder);
INSERT INTO opportunities (
  funder_id, name, slug, official_url, funding_type, minimum_award, maximum_award,
  rolling, recurring, source_url, discovered_at, last_checked_at, last_verified_at,
  verification_status, deadline_confidence, summary, eligibility_notes, deadline_notes,
  application_status, opens_at, deadline_at
)
SELECT f.id, s.name, s.slug, s.url, 'grant', s.minimum_award, s.maximum_award,
  s.rolling, true, s.url, '2026-10-05T12:00:00-04:00', '2026-10-05T12:00:00-04:00',
  '2026-10-05T12:00:00-04:00', 'verified', CASE WHEN s.deadline_at IS NOT NULL THEN 100 ELSE NULL END,
  s.summary, s.eligibility, s.deadline_notes, s.status, s.opens_at, s.deadline_at
FROM starter_catalog s JOIN funders f ON f.name = s.funder
ON CONFLICT (slug) DO NOTHING;
INSERT INTO opportunity_categories SELECT o.id, unnest(s.categories)
FROM starter_catalog s JOIN opportunities o USING(slug) ON CONFLICT DO NOTHING;
INSERT INTO opportunity_applicant_types SELECT o.id, unnest(s.applicants)
FROM starter_catalog s JOIN opportunities o USING(slug) ON CONFLICT DO NOTHING;
INSERT INTO opportunity_geographies(opportunity_id,country,state,city)
SELECT o.id, s.country, s.state, s.city FROM starter_catalog s JOIN opportunities o USING(slug);
COMMIT;
