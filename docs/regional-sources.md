# Regional official sources

Migration 033 registers eleven official sources: LMCC (Manhattan), Brooklyn Arts
Council, NYFA Queens Arts Access, Bronx Council on the Arts, Staten Island Arts,
New York Community Trust, Greater New Orleans Foundation, Arts New Orleans,
New Orleans Tourism and Cultural Foundation, Louisiana Endowment for the
Humanities, and NEA Foundation educator grants. Exact evidence URLs are in the migration.

New sources target a 24-hour revisit through the existing worker. Existing
disabled states and custom schedules are preserved. The worker seeds its frontier,
follows approved links, and publishes eligible program evidence using existing
deduplication and field protections. Source geography/categories describe research
coverage, not confirmed eligibility. Directories are discovery inputs, not grants.
Commercial API integrations remain inactive pending access and reuse rights.

Apply pending migrations 032 and 033 on deployment. No additional permissions are
needed for 033; 032 permissions are documented in structured-catalog.md. No schedules,
budgets, or hosted settings were changed. Revisit intervals are targets subject to
worker availability, robots policies, capacity, and retry backoff.

Local acceptance: encrypted backup created before applying 033. Rerunning the
migration preserved source counts, intentionally disabled status and custom cadence
(scripts/check-regional-sources.ts). A bounded worker invocation recorded eleven
successful page reads and one failure, then encountered a reconciliation unique-key
conflict (freezeReconciliation creating an active crawl). The configured restricted
local worker connection also failed authorization on catalog_automation; the diagnostic
retry used the existing local database connection without changing roles. These
local permission problem is separate from hosted credentials. The release fixes the
reconciliation conflict by storing its crawl evidence container as partial while its
own durable inventory tracks progress, preserving the one-active-crawl constraint
and shared worker lease. A regression test runs reconciliation alongside a queued
scheduled crawl. New publication counts were not established in that initial pass.
