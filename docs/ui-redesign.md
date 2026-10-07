# Material UI workspace

The local redesign uses Material UI with the official Next.js App Router cache
provider. Light, dark, and system modes use CSS variables and a pre-hydration
color-scheme script; the browser remembers the choice. No account setting or
database migration is required for appearance.

## Navigation and data

- Home combines quick search, profile-ranked grants, active applications, tasks,
  and personal target dates.
- Find grants merges catalog records and likely leads before pagination. Repeated
  `category` URL parameters mean OR; other explicit filters remain AND. Legacy
  single-category URLs continue working. Unknown facts do not match precise filters.
- My grants uses existing private application records. The old Saved grants route
  redirects to its Saved stage. Existing application IDs and history are retained.
- Funding profile edits existing onboarding fields and preserves the original
  completion timestamp. Viewer roles cannot write.
- Admin tools, source import, support, and logout are in the account menu.

## Ranking and previews

Recommended ordering compares known conflicts, supported profile matches, keyword
relevance, status, deadline, title, and ID. Missing facts earn no match credit.
Crawler-inherited categories are source context, not confirmed program matches.
Explicit geography exclusions and country/state/city/borough/county/postal limits
are considered before a location match is claimed.

The preview URL preserves the search parameters, and its MUI drawer manages focus
and Escape. Dedicated grant pages remain available. Saving stays in context and
links to the existing or new private application record; it never publishes a lead.

For this small beta, the server ranks the complete filtered set in memory, then
paginates. This avoids a hidden cap or page-local recommendation ordering. If the
catalog grows substantially, move the same ranking and canonical deduplication
into SQL rather than imposing a silent results cap. No live web or AI requests
are performed by this interface.

## Verification and release

Regression tests cover multiselect parsing, category OR queries, stable combined
pagination, private save references, unknown/source-derived facts, and geography
ranking. Existing account, crawler, provider-disable, save, task, and archival
tests remain applicable.

Manual local checks cover saving from a preview, note/task persistence, completion,
stage changes, archive/restore, profile saving, both themes, and widths of 360,
768, and 1440 pixels. Preview Escape restores focus and browser Back preserves
the search. Temporary application test data is removed after verification.

The UI is a local preview. Review the appearance before pushing or deploying;
cloud workflows, credentials, workspace plans, and billing are unchanged.

## Funding focus research (October 7, 2026)

Population/community focus filters complement the subject categories. Added veterans
and military families, people with disabilities, Indigenous/tribal communities,
immigrants/refugees, children/youth, older adults, rural communities, and low-income
communities based on these primary sources:

- [VA grant programs](https://grants.gov/learn-grants/grant-making-agencies/u-s-department-of-veterans-affairs-va): veterans, military families, rural/underserved communities.
- [First Nations grantmaking](https://www.firstnations.org/grantmaking/): tribes, Native organizations and individuals.
- [USDA Rural Development](https://www.rd.usda.gov/programs-services/all-programs): rural community programs and income-targeted assistance.
- [New York Community Trust funding areas](https://thenytrust.org/nonprofits/): youth, older adults, disability, immigrant services.

These are source-text discovery filters, not certified eligibility classifications.
They include programs serving a population as well as programs for applicants from
that population. They do not infer or store a user's identity. Multiple selections
use OR, with other filters still applied. Empty matches remain empty; adding a
filter does not import new grants or enable paid search. Tests cover synonyms and
obvious false positives (senior researchers, native plants, veterinary research).

## Search-triggered discovery and evidence extraction

Search submissions (including Home quick search and focus/filter changes) start a
free direct-source job after catalog results render. The app processes short
slices after responses; polling resumes unfinished work. The scheduled discovery
worker also resumes these jobs before its daily crawl. A suspended/free hosting
instance can delay work until the next request or worker invocation.

- Only approved, enabled sources and their approved links are read. Existing
  robots, DNS/private-address, download, retry, and depth protections apply.
- Each job selects up to 8 sources and checks up to 24 pages, prioritizing matching
  source categories and URL terms. Sources are visited in rotation. Coverage is
  deliberately bounded; this is not a general internet search engine.
- Equivalent keyword/category/focus searches reuse a job for 6 hours. Requests
  are limited to 12 per user/hour, 30 new jobs/hour globally, and 10 active jobs.
- A database advisory lock coordinates daily and search crawlers. Visits and
  publication are checkpointed; no paid search or AI is used.
- Progress counts describe shared catalog publication during processing, not
  necessarily additional matches for the requesting user's filters.
- Search terms are stored as normalized tokens for prioritization, never added
  to public grant records. The status action returns only public crawl metrics.

HTML block separation, eligibility sections, short descriptions, and explicit
numeric labeled deadlines now produce evidence-backed fields. Ambiguous dates
and missing fields stay unknown. The first official-source verification adapter
supports Spencer Foundation program pages. Automatic verification requires its
known funder, description, eligibility, USD maximum, a dated deadline, explicit
status, and no open/past-deadline conflict. Other publishers can be enriched but
remain unverified. Directory pages such as NYFA are not official verification.

Automatic verification is distinguished in the UI and provenance. Source-inherited
categories do not become confirmed eligibility. Existing verified/editor-owned,
hidden, archived, or merged records are protected. Changed verified source facts
remain pending for review. Additional publisher adapters require fixtures and
review before broadening automatic verification.

### Rollout

Local database was backed up with an encrypted archive before migration 014.
Production is unchanged. Before deploying this commit:

1. Back up production and apply `014_search_discovery.sql` with the migration role.
2. As database owner, reapply `db/operations/discovery-role.sql` for the existing
   worker role (do not recreate or rotate its login). The worker needs access to
   the search job tables and the explicitly listed extracted/verification columns.
3. Grant the existing restricted app role SELECT/INSERT/UPDATE/DELETE on
   `search_discovery_jobs,search_discovery_visits`; grant the existing backup role
   SELECT on these tables. Preserve their current credentials and other grants.
4. Deploy app and worker code together. Health checks now require migration 014.
   Ensure the scheduled worker's default branch includes this release.
5. Run a bounded hosted search and verify metrics, publication and permissions.

No new schedules, provider credentials, hosting tiers, or automatic paid usage
were enabled. Local tests cover evidence ambiguity, cache reuse, recovery,
idempotent publication and preservation of verified facts, in addition to the
existing privacy and provider-disable regression suite.
