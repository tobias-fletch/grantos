# Catalog maintenance operations

The admin workspace is `/app/discovery-admin`: Overview, Catalog, Sources, Needs attention, and Activity. Existing catalog editor authorization protects every read and mutation. Only verified active beta owners can change cadence or pause/resume.

## Scheduling and budgets

Production uses GitHub Actions at minute 17 of every hour (America/New_York), with a 60-second scheduled work window, 15 seconds reserved for publication, and the existing 18-minute hard workflow timeout. Slow bounded HTTP retries may exceed the soft window. Manual dispatch supports 60, 300, or 840 seconds. Each invocation permits at most 976 maintenance/discovery pages plus a 24-page search job. Robots requests are auxiliary requests, as before. Per-source limits stay 50 and link depth stays three.

At least half the page budget is reserved for due catalog URLs; unused capacity transfers to general discovery. Sources rotate one page at a time. A normal bounded slice finishes as partial when necessary; remaining URLs retain their due times. A crash resumes the durable job. UTC hour keys deduplicate invocations and distinguish repeated Eastern hours during DST.

Six-hour checks target active/unknown programs with deadlines within 30 days. Other active/unknown programs target daily checks; closed and explicitly discontinued programs target weekly checks. Directory intervals are editor-configurable (6–168 hours). Failed reads back off from one hour to seven days. These are targets, not completeness guarantees.

Owner cadence controls change database scheduling, not GitHub workflow definitions. Daily mode targets 6 a.m. Eastern through the next hourly runner; hourly mode queues each UTC hour. Pausing stops both maintenance and user-triggered crawling while preserving catalog access.

## Free-tier verification (2026-10-07)

GitHub API confirmed `tobias-fletch/grantos` is public. Standard ubuntu-latest runners are free for public repositories: https://docs.github.com/en/billing/concepts/product-billing/github-actions . Account billing showed Actions $0 budget with Stop usage enabled. This workflow does not upload artifacts or enable dependency caches.

Neon console showed Free plan: 1 GB storage and 100 compute hours, approximately 36.06 MB storage and 1.05 CU-hours used at review. No paid upgrade was enabled. Initial hourly slices are limited to 60 seconds; usage still depends on database compute scaling and application traffic. The worker pauses automation when database size exceeds 850 MiB. Monitor Neon usage and the admin backlog; reduce cadence if capacity becomes constrained.

## Sources and extraction

Migration 017 adds seven official source entries researched on 2026-10-07, preserving existing configuration on URL conflicts:

- NYSCA: https://arts.ny.gov/nysca-regrants-and-partnerships (arts categories and statewide regrant partners).
- New York Women's Foundation: https://nywf.org/our-work/grant-making/ (NYC community and gender-equity funding).
- Borealis: https://borealisphilanthropy.org/funding/race-gender-and-disability-justice/ (racial, LGBTQ+, disability focus).
- USDA Rural Development: https://www.rd.usda.gov/programs-services/all-programs (rural, tribal, low-income and business/community programs; loans must not be represented as grants).
- ACL: https://acl.gov/grants (aging and disability programs).
- ACF: https://acf.gov/grants (children/families/refugees); disabled after HTTP 403 during research.
- DOL VETS: https://www.dol.gov/agencies/vets/grants (veterans); disabled after access errors during research.

Source focus is directory coverage, not applicant eligibility. Unknown coverage remains visible as a gap. External domains still require approval. Extraction expands Spencer's explicit month-name deadlines only; multiple cycles and impossible dates remain unknown. Other publishers retain conservative generic excerpts until supported extraction fixtures exist.

## Release and retention

Back up before migrations 016 and 017. Reapply discovery-role.sql. App role requires SELECT/UPDATE on catalog_automation and SELECT/INSERT on catalog_admin_events; backup role needs SELECT on both. Health requires both migrations. Keep hourly_enabled false until the hosted smoke check passes, then enable through the owner control.

Evidence referenced by any candidate, current frontier cache, or catalog URL/provenance is retained. At most 500 unreferenced snapshots older than 90 days are pruned per completed slice. Private applications, saves, notes, and tasks are untouched. Routine source checks never renew editorial verification; failed reads never archive programs.

## Contributions and reliability (migration 021)

Signed-in writable workspace members can suggest official grant URLs and corrections at /app/contributions. Submissions coalesce by canonical source URL, target grant, and field; each contributor retains private text visible only to that contributor and editors. Ten submissions per account per hour use PostgreSQL rate limits. The worker has no permission to read proposed values or notes: it independently extracts official evidence. Unknown domains require source registration/approval. Corrections need a confirmed program association; locked/conflicting facts remain exceptions. No email is sent.

The shared worker spends up to the first 50% of its window on maintenance, the next 30% on enrichment, and the final 20% on contributions/search/discovery. All readers share the 1,000-page and 50-per-approved-domain-group ceilings. Contributions process at most ten jobs per slice and respect existing failure backoff and leases. New program pages feed their links into the normal frontier. Unsupported suggestions close as unconfirmed; source errors retry exponentially up to one week. Editors can close a contribution through an audited action without changing facts.

Worker samples retain starting/ending due counts, fetch attempts and distinct successful URL checks for 90 days. An unfinished sample indicates interruption, not success. Admin Overview warns after three hours without a heartbeat while automation is enabled. Compare a full day of samples before judging capacity: newly overdue and newly discovered URLs can grow the queue even during successful runs. Domain notices are grouped by URL; approval still applies to the displayed source association.

On October 8, both workflows were active on main with enable gates true, but scheduled starts were sparse. GitHub documents delayed/dropped schedule events; the exact account-specific cause was not established. Do not claim hourly coverage solely because cron is configured. Keep existing schedules and budgets pending the 48-hour observation.

Before release: back up, apply migration 021, grant app access to all three new tables, backup read access to all three, and discovery access only to catalog_contributions and catalog_worker_samples. Never grant the discovery role catalog_contribution_submissions. Health requires migration 021.
