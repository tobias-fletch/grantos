# Daily direct-source discovery

GrantOS refreshes registered public funder sources at 06:00 America/New_York.
Tavily and Brave are disabled at the action and provider boundaries even when keys
are present. They are reserved for a future paid feature requiring both an enabled
feature and a paid workspace. Daily discovery makes no paid search or AI calls.

## Start locally

Apply migrations with npm run migrate. Run npm run dev to launch Next.js and the
separate discovery worker together. npm run worker:discovery runs only the worker.
The development PostgreSQL instance must already be available. Closing the app
process or sleeping/shutting down the computer stops crawling. The worker queues
one catch-up job for the latest due Eastern calendar day on restart; it does not
replay every missed day. Duplicate scheduled jobs are prevented by a unique date.

Set CATALOG_EDITOR_EMAILS in ignored .env.local to trusted existing account emails.
An allowlisted email must register/sign in normally; this setting does not create
an account or modify credentials. Secrets remain ignored and uncommitted.

## Sources and limits

The registry starts with existing grant sources plus NYFA, NEA, NSF, USDA AMS,
Spencer, SARE, NYSERDA, and NYC nonprofit funding directories. It covers all current
funding categories with NYC/U.S. priority. Editors manage sources, exact approved
hostnames, categories, geography and enabled state at /app/discovery-admin.

The crawler follows listings, pagination, application links, feeds, sitemaps and
readable PDFs to depth three. Limits: 50 pages per source, 1,000 pages per run,
5,000 frontier URLs per source, 4 MB downloads, 100,000 captured characters per
page and 25 PDF pages. Pending URLs within depth limits continue on later runs;
depth-limited links require a new seed to explore further. Sources not visited in
recent runs are prioritized to avoid starvation. Limits and source failures are
reported as partial coverage, not successful exhaustive searches.

Public HTTPS, DNS pinning, exact approved hostnames, bounded same-policy redirects,
robots rules, per-domain delays, and bounded retries protect retrieval. Unknown
external domains enter an editor approval queue. Unavailable robots policies defer
reads. Missing robots files allow crawling. JavaScript-only, blocked, unsupported,
and scanned pages can remain unreadable. Some discovered pages will be directories
or other non-grant resources; reviewers dismiss those.

Official directory references checked during implementation:
- https://www.nyfa.org/awards-grants/
- https://www.arts.gov/grants
- https://www.nsf.gov/funding
- https://www.ams.usda.gov/services/grants
- https://www.spencer.org/research-grants
- https://www.sare.org/grants/
- https://www.nyserda.ny.gov/funding
- https://www.nyc.gov/site/nonprofits/resources/apply-for-funding.page

## Review and publication

Snapshot hashes identify changed content. A first capture of a catalog source
also enters review because no previous snapshot establishes equivalence. Source
fetch dates never renew grant verification. Recognizable grant leads publish to
the base catalog automatically, including incomplete listings. Publication is
independent of verification and workspace plan. Missing amounts, dates, applicants,
and locations remain Unknown and cannot satisfy precise filters. Every automatic
listing displays an unverified warning, source link, and source fetch date.

Directories, recipient biographies, announcements, jobs, supporting documents,
domain approval requests, and ambiguous leads remain unpublished in the queue.
Classification is conservative and heuristic; editors can correct mistakes.
Canonical URLs and likely program aliases prevent duplicates. Source-supported
unverified fields can refresh automatically; reviewed facts require approval.
Hidden or merged listings are never resurrected by a crawl.

Publisher-specific rules currently propose titles on NEA, USDA AMS, and Spencer
pages, and explicitly closed application status on Spencer program pages. Dates,
amounts and eligibility are left unknown unless an editor supplies them. No LLM
inference is used. Content changes conservatively enter review, including changes
that an editor may judge immaterial. The review view shows captured before/after
evidence and proposed versus existing structured facts.

Editors review official sources, complete structured fields and confirm an exact
source excerpt before verifying. Candidate approval and audited grant updates
are transactional. Changed sources show an awaiting-review notice in discovery.
Archived programs remain excluded. New/updated filters use a seven-day window;
updated means a published content update, not merely a successful fetch.
Editors can hide unsuitable listings or merge duplicates while moving saves and
manual tasks to the retained grant ID. Active checklist generation blocks merging.

The manual public-source importer remains available separately. Existing private
research leads remain intact. Provider-backed premium web research is unavailable.

## Operations and verification

A session advisory lock prevents competing workers. Per-page checkpoints survive
restarts; an interrupted page is retried. Page counts, source failures, candidates,
review backlog, recent runs and manual refresh are visible to editors. The catalog
shows the last completed crawl and whether coverage was partial.

Migration 009 adds publication state/provenance, URL aliases, publication results,
and moderation history without replacing existing grants. The worker processes
the pending backlog on startup and publishes after each crawl. Per-candidate
transactions and a shared catalog lock make restarts idempotent. Failures retry
up to three times and remain pending for review. Run
`node --import tsx scripts/publish-backlog.ts` for a manual publication pass.
Run summaries include published, updated, skipped, and failed counts.

Run npm test and npm run build. Tests cover Eastern/DST scheduling, catch-up and
job deduplication, singleton locking, checkpoint recovery, both page limits,
robots/SSRF/domain rules, temporary failures, feeds/sitemaps, duplicate candidates,
review access, audited publication, save preservation, freshness filters and zero
provider requests with configured keys.

Live acceptance used a six-page Spencer crawl: five pages read, one missing sitemap
recorded, and grant candidates retained for review. A live-source candidate was
reviewed, published, found, saved and updated in a rollback-only acceptance
transaction; no synthetic account or test publication remains in the catalog.

Automatic-publication rollout on October 6 backed up the development database,
applied migration 009, and published 45 real-source leads with no failures. Two
duplicate programs were merged into existing records, leaving 43 additional
visible listings (64 total). HTTP checks verified login, free catalog visibility,
unknown values, and exclusion from open-only searches. Automated tests cover
save/manual-task preservation, verified-fact protection, publication replay,
source reversions, duplicate merges, and authorization. Tavily/Brave remain disabled.

## Candidate search visibility

All pending non-domain source candidates with captured evidence are visible to
all workspaces in Opportunities, without publication or editorial approval.
This includes ambiguous pages and proposed changes, labeled Candidate — unverified.
Keyword and source-category filters apply, with separate pagination. Specific
eligibility, location, amount, open-status and profile filters exclude candidates
whose facts are unknown. Hidden/archived listings stay excluded. Domain approval
requests are crawler settings, not search results. Editorial review is optional
for browsing and remains available to verify structured catalog facts.
