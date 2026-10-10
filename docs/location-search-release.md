# Location-aware search release

Search defaults to the workspace funding-profile location. City, state, and optional ZIP can be changed without editing that profile. State abbreviations and NYC aliases normalize to canonical names. Existing `location=nyc` and `location=nyc_only` URLs remain supported. The drawer's Any location option intentionally disables geographic eligibility filtering.

The default view includes records with supported eligible geography, applying explicit exclusions first. Nationwide and explicitly worldwide programs can match. Missing city/county/borough/ZIP details needed to establish eligibility remain unresolved. The **Needs checking** button switches to separately counted unknown-geography results. Counts and pagination are calculated after geographic filtering, within both existing program/research views. Neither source coverage nor candidate proposals establishes eligibility.

Search parameters add `country`, `state`, `city`, `postal_code`, and `geoEligibility=unknown` (default: eligible). Profile county/borough constraints are retained where available. A per-search city/state override does not guess a county or infer a ZIP's city. Current support uses explicit structured locations; it does not add a geocoding service.

Every explicit Search or dashboard Find grants submission requests durable background research, regardless of result count. A submission UUID survives navigation and reloads; persisted receipts prevent restarting completed work for the same submission. Equivalent queued/running jobs are shared. A new submission can restart a completed job without waiting six hours. Legacy internal requests without a submission retain the six-hour reuse window. Existing account/shared limits still apply; a limit or pause is reported rather than promising an immediate crawl.

Source selection prioritizes matching local scope, exact state scope, then nationwide/worldwide sources, retaining category and filter intent. Unrecognized registry geography is conservatively excluded from scoped research. Jobs persist normalized geography, constraints and a local-coverage-gap flag. Sorting, pagination, view switching, and theme changes never create a new request.

Polling is now read-only: it no longer starts 20-second crawls on every status request. The existing worker handles queued searches inside its unchanged shared budget, lease, pause, and checkpoint system. New results appear only after the user chooses Refresh results. Production scheduling gaps and the pre-existing PDF reader error remain separate reliability issues.

## Official source seeds

Migration 024 registers these publisher sources, preserving existing settings on URL conflicts:

- [Arts New Orleans Louisiana Project Grants](https://www.artsneworleans.org/grantmaking/louisiana-project-grants/) — Region 1 includes Orleans, Jefferson, and Plaquemines parishes. Source scope is a research hint, not a claim that every user in those places is eligible.
- [Louisiana Division of the Arts grant directory](https://www.crt.la.gov/cultural-development/arts/grants/) — statewide arts funding directory.

Researched October 10, 2026. These seeds improve arts coverage; other categories and unfamiliar external domains remain coverage gaps or editor exceptions. No live funder crawl was required for local regression tests. No dates or open statuses were seeded from these pages.

## Deployment handoff

1. Back up the deployment database using your existing release process.
2. Apply pending migrations through **025_search_submissions.sql** before deploying this app/worker version. 024 adds three columns to the existing search job table and two public sources; 025 adds authenticated search-submission receipts. Existing jobs and visits remain intact.
3. Grant SELECT and INSERT on search_discovery_submissions to the existing application role and SELECT to the backup role. Do not grant this private submission table to the discovery worker. No new secrets, paid APIs, or scheduler changes are required. Health requires migrations 024 and 025.
4. Deploy app and worker from the same code. Check a New Orleans/Louisiana search, unknown-geography view, and an explicit filtered search (including one with more than five matches). Confirm it queues once, then resumes during normal worker execution.

Validation: 101 tests and the production build passed before release. Regression coverage includes location matching/exclusions, unknown geography, pagination, source selection, queue saturation, explicit resubmission, receipt replay, and navigation identity.
