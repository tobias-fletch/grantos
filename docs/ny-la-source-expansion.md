# New York / Louisiana source expansion

Reviewed 2026-10-11. This patch extends discovery sources, not a verified grant
inventory. It inserts no opportunities, applicant types, geographic eligibility,
amounts, or open-status claims. Existing borough/New Orleans/state sources remain.

## Official evidence and access

Twelve new URLs in migration 036:

- [NYSCA opportunities](https://arts.ny.gov/OpportunityGuidelines): administering
  state agency, several distinct capital/operating/artist programs. Capital FY2027
  is accepting applications through January 12, 2027; other listed FY2027 programs
  are closed. Never collapse their amounts, deadlines, or applicant requirements.
- [NYSCA State of the Arts Fellowship](https://arts.ny.gov/SOAfellow): separate
  individual-artist fellowship; published deadline October 21, 2026 at 5pm. HTML
  does not establish a timezone or complete residency requirements. The parser
  retains only its explicit date; it does not infer current acceptance from dates.
- [ESD Global NY](https://esd.ny.gov/global-ny-fund-grant-program): export support
  for qualifying NY businesses and economic-development nonprofits. Reimbursement
  and applicant-specific caps differ; they must not become a universal award cap.
- [ESD Innovation Matching Grants](https://esd.ny.gov/innovation-matching-grants-program):
  NY businesses with federal SBIR/STTR conditions. Published Round 5 is closed;
  generic recurring timing does not establish the next announced cycle.

These four NY agency sources start **disabled**: direct public requests from this
execution environment received Cloudflare block pages (NYSCA and ESD Global NY).
The same-host agency entries are conservatively held for access review. Public
web-index evidence confirms content but is not proof that the application crawler
can ingest it. No bypass, credentials, CAPTCHA action, or paid search is enabled.

- [CNY Arts Statewide Community Regrants](https://cnyarts.org/grants/statewide-community-regrants/):
  official NYSCA regional administrator, linked from
  [NYSCA regrant partners](https://arts.ny.gov/nysca-regrants-and-partnerships).
  Despite its name it covers only Cortland, Herkimer, Madison, Oneida, Onondaga,
  and Oswego counties. Its 2027 hub contains different current/future cycles;
  treat as a directory and follow individual program links. Do not pool facts.
- [LDAF Agricultural Workforce Development](https://www.ldaf.la.gov/business/grants-funding/louisiana-agricultural-workforce-development-program):
  state-administered agricultural-business internship reimbursement; current
  business application period closed and next window unannounced. Student/intern
  beneficiary descriptions do not make students direct grant applicants.
- [LDAF Specialty Crop Block Grant](https://www.ldaf.la.gov/food/selling/produce/specialty-crops/program):
  state-administered federal funding; application period closed. Page gives
  April 30, 2026 proposal date under an inconsistent 2025 calendar heading;
  no timezone or new cycle is inferred. Applicant requirements need linked RFA.
- [LDAF Resilient Food Systems Infrastructure](https://www.ldaf.la.gov/business/grants-funding/resilient-food-systems-infrastructure):
  state-administered federal funding; application period closed. December 2026
  is project completion, not an application deadline. Recognize the official
  program title even though it has no word "grant" or "program".
- [Acadiana Center for the Arts Louisiana Project Grants](https://acadianacenterforthearts.org/opportunities-for-organizations/louisiana-project-grants/):
  administering Region 4 arts council. Only Acadia, Evangeline, Iberia, Lafayette,
  St. Landry, St. Martin, St. Mary, and Vermilion parishes. FY27 deadline passed
  June 12, 2026; funding period October 2026–September 2027 is not application
  availability. FY27 excludes individual artists/for-profit businesses and fiscal
  agents. No individual/business eligibility is seeded. Full guidelines remain
  necessary before matching.

The six enabled URLs returned HTTP 200 in bounded public-page checks. Parsing
actual LDAF HTML returned closed for all three programs; the RFSI completion date
was not extracted as a deadline. CNY was classified as a directory; Acadiana as a
program with unknown machine-extracted eligibility/status rather than invented
facts. The production reader's DNS safety check could not run here (EAI_AGAIN);
these checks **do not** certify production robots policy or end-to-end crawling.
No reader security policy was weakened. Shared document hosts, application portals,
and CDNs are not auto-approved; they remain domain-review candidates.

## Additional statewide leads and applicant boundaries

- [NY Climate Resilient Farming Round 10](https://agriculture.ny.gov/rfp-0430-climate-resilient-farming-program-round-10):
  state-agency program; published proposals due November 23, 2026 at 5pm. Direct
  applicants are County Soil and Water Conservation Districts; farms benefit via
  district projects, not unrestricted direct business grants.
- [NY youth transportation to county/local fairs](https://agriculture.ny.gov/rfp-0426-2027-transportation-youth-county-and-local-fairs-program):
  state-agency RFP released October 8, 2026, due December 1, 2026 at 4pm local time.
  Eligible applicants are qualifying fair-sponsoring agricultural/horticultural
  corporations, county extension associations, municipalities, nonprofit
  corporations and tribal organizations. Nonprofit SFS prequalification is
  required by deadline; municipalities are exempt. Full conditions are in the
  [official RFP](https://agriculture.ny.gov/request-proposals-rfp-0426-2027-transportation-youth-county-and-local-fairs-program).
  These two NY agriculture entries also start **disabled**. A researcher received
  HTTP 200 using an identifying GrantOSDiscovery user agent with urllib, but
  implementation checks received Cloudflare 403. Conflicting transport results
  do not establish production-reader access. No request identity workaround was
  introduced. Their published accepting-proposal windows are research evidence,
  not active ingested inventory or parsed open-status claims.
- [Louisiana Bar Foundation Community Partnership Panels](https://raisingthebar.org/community-partnership-panels/):
  enabled, HTTP 200. **Private foundation**, not a state-agency grant. The Jock
  Scott program accepts rolling applications for new/expanded qualifying legal
  services for low-income people, law-related education, or administration of
  justice. Its explicit 501(c)(3) restriction is retained in evidence. A narrow
  official-title and rolling-status parser supports discovery; no award maximum,
  individual/business eligibility or blanket state residency is invented.

Final registry delta: six enabled sources and six disabled access-review sources.
Only the Louisiana foundation program has a newly supported machine-readable open
rolling state in this patch. Three LDAF programs are closed; the two regional arts
sources need per-program/current-cycle review. Missing geography/category evidence
can still prevent strict supported-match counting, as intended by PR #2. The six
NY agency leads are useful research leads, not six working automated feeds.

## Behavior and tests

- Publisher-scoped directory roles prevent cross-program fact leakage at NYSCA,
  CNY Arts and the Baton Rouge arts hub (the latter is not newly seeded).
- A narrow LDAF HTML-heading adapter reads current closed notices, independent of
  historical grant periods and related-news headlines. It does not infer opening.
- Explicit weekday-prefixed deadlines parse as dates, with no invented timezone.
- Same-page dated news cannot override LDAF closure; conflicting related-page open
  evidence remains unknown.
- State-only research includes restricted regional administrators below statewide
  sources. An explicit different city does not match these sources. Source ranking
  never creates opportunity geography, eligibility, or applicant types.
- Existing snapshot/evidence history and manual locks remain authoritative.
- Migration tests cover all prior migrations, twelve additive sources, replay,
  disabled/cadence/title preservation, no opportunity writes, and bounded search.

## Release / rollback

No production migration, crawler run, remote push, merge, or deploy was performed.
Migration 036 uses `ON CONFLICT(url) DO NOTHING`: reapplying it preserves every
existing row, including editor-disabled sources, domains and cadence. Normal
leased workers seed their URLs; there are no migration-time frontier writes.

For an authorized release: back up first, apply migrations with the existing
runner, review source/domain settings, verify robots/access from the deployment
network, then run a bounded preview crawl and inspect evidence before claiming
coverage. Review external guideline hosts individually. Keep the six blocked NY
entries disabled until a supported access route is verified. Other states remain
out of scope.

For rollback, disable only newly inserted source IDs recorded during deployment;
do not delete opportunities, source history, or rows that predated migration 036.
Do not rerun a blanket URL DELETE: URL conflicts may belong to an editor. A code
rollback may leave parser-created evidence, so use the existing audited restore
workflow if specific derived facts require correction; preserve manual locks.

## Validation results

On a separate localhost-only PostgreSQL fixture (no production credentials):

- Focused migration, source, location, reconciliation and availability checks:
  19/19 passed.
- Full serial suite with a local-only authentication fixture: 138/139 passed.
  Existing encrypted backup/restore release test could not complete because this
  container has no `pg_dump` / `pg_restore`; no test was disabled or weakened.
- TypeScript typecheck passed. Production build passed.
- `git diff --check` passed.

Initial environment-only failures (missing fixture auth configuration and an
out-of-root `node_modules` symlink) were corrected and checks rerun. Nothing here
certifies production deployment, database state, or live crawler access.

This branch is based on `598c871` and depends on the conservative matching
changes in draft PR #2. Do not publish it as an independent main-based patch.
