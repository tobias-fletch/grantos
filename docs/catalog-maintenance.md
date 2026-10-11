# Catalog maintenance operations

## Official dataset imports

See [structured catalog imports](structured-catalog.md) for Grants.gov and California adapters, source rights, migration 032, scoped role grants, checkpoints and acceptance instructions. Imports share the existing discovery allocation; they do not add worker time or paid calls. Search and detail pages include source attribution. Structured programs retain field history, locks, private saves and application records.

## Admin workspace

`/app/discovery-admin` uses existing authenticated catalog-editor authorization. The Overview has three sections:

- **Catalog quality:** published-program completeness by field. Rolling applications count as having a schedule without a fixed deadline. Recurrence is measured independently.
- **Worker progress:** heartbeat, due/overdue checks, automatic research, durable retries, information unavailable, throughput and the latest reconciliation inventory. A finished invocation is not full catalog coverage.
- **Decisions needed:** unfamiliar domains, locked-field conflicts, uncertain duplicates, persistent source failures and publication failures. Missing facts alone are automatic research.

Catalog retains correction, evidence/history, field locks, rollback, hide/restore and merge controls. Sources retains approved domains, enabled state and cadence. Research progress shows unresolved jobs. Admin exceptions contains decisions. Activity and contributions retain their existing history. Only verified active owners change global cadence or pause/resume. Pausing preserves all checkpoints.

## Scheduling and limits

The existing GitHub workflow targets minute 17 each hour; this release does not change or enable its schedule. Scheduled runs use the existing 60-second soft work window and 18-minute workflow timeout. Manual dispatch retains its existing bounded options. Scheduling and source access are not guaranteed: inspect actual successful checks and growing overdue work, not just green job outcomes.

`runCatalogCycle` shares one 1,000-page invocation budget across maintenance, enrichment, reconciliation, contributions, user searches and discovery. It starts with 50% of the time/window and 500 pages for maintenance, allocates the next 30% to enrichment/reconciliation (150 pages for enrichment, the remainder of 300 for reconciliation), then contributions/search/discovery. Spare final capacity returns to maintenance. Approved domain groups share a 50-page cap. Three-link depth, ten supporting pages per program, robots, public-address validation, bounded downloads, retries and the worker lease remain enforced.

Approaching deadlines/openings target six-hour checks. Active/unknown and recurring programs target daily checks; other closed/discontinued programs weekly. Source cadence is configurable. Retry clocks survive interruption and parser upgrades. These intervals are targets, not coverage guarantees. No paid search or AI provider is called.

## Inventory completion and retries

Reconciliation freezes published records and pending candidates. An item receives one of: checked, unresolved identity/research, or retry scheduled. Once no queued/running item remains, the inventory is complete even when research or retries remain. The run summary separately reports unchecked inventory, research, retries, overdue retries, useful facts resolved, merges and hidden material.

Completed inventories with due blocked items are eligible for continuation. A newer parser inventory takes over the latest blocked page checkpoints for a matching source/URL, retaining attempts, snapshots and next-attempt times; the old item records that continuation. Ambiguous identities therefore do not permanently block future parser upgrades. No similar-title-only merge is allowed. Canonical URLs, publisher IDs and confirmed supporting-page relationships drive consolidation; existing preservation logic retains private applications and histories.

## Extraction and evidence

Parser version `program-v13` adds fixture-backed FCA annual award amounts/recurrence and title-specific arts categories, plus Northeast SARE Professional Development amount ranges/recurrence. Existing Spencer, NYFA, USDA and conservative generic rules remain. Historical awards and annual reporting duties do not establish annual funding. Future deadlines alone do not establish open applications. Dates are never advanced to the next year automatically.

Official facts retain field evidence, history and locks. Directory source topics are not confirmed program categories and do not contribute category matches to personalization. Explicit editor categories or supported official categories can contribute. Failed reads do not close programs. An expired round can show Between rounds only when recurrence is supported; otherwise it shows a previous round ended or Unknown.

Referenced evidence is retained. Existing pruning removes only bounded unreferenced history older than 90 days; private work is never pruned by the catalog worker. The existing 850 MiB database storage guard remains. Account allowances and billing must be checked separately at deployment; this local release does not revalidate historical hosting allowances.

## User search

Grant programs is the default view, including recognizable incomplete pending programs. Research leads contains unresolved program identities. Identifiable directories, articles, announcements and standalone instructions are supporting material, not grant cards. Both views are saveable and keep terms/applicable filters, counts and independent `programPage` / `leadPage` positions.

`resultType=programs` and `resultType=leads` are the current URLs. Legacy `grants`/missing/invalid values select programs, legacy `all` selects research leads, and `catalog` keeps catalog-only program results. Legacy `page` applies to the selected view. Legacy candidatePage is retained as the research page. Explicit view pages take precedence. Recommended sort uses supported profile matches followed by availability. Unknown eligibility is Needs checking; precise eligibility/location/amount/open-status filters do not match unknown facts. Background discovery offers an explicit results refresh rather than automatically replacing the visible page.

## Release handoff

This release is local only. Before your deployment, back up the target database and run all pending migrations through **023** using the migration credential. Migrations 022/023 add recurrence/date history and parser cleanup versioning; no additional migration is introduced for the view/quality changes. Reapply `db/operations/discovery-role.sql`; the additional permission is DELETE on opportunity_categories so audited category replacement can remove inherited source categories. Preserve restricted worker access to public catalog operations; never grant access to private contribution notes or applications.

Apply the existing application/backup role scripts as required by pending migrations (see `docs/program-availability-release.md`). Health requires migration 023. Deploy the app and worker from the same reviewed code. The next permitted worker invocation queues the parser inventory and reprocesses stored evidence. Existing leases, pauses, schedules, free-service safeguards and provider-disable gates remain unchanged.

See `docs/catalog-quality-report.md` for the local frozen-evidence comparison. It is not a production crawl or a claim of complete catalog coverage.

## Location-aware search release

Migration 024 adds persisted search geography, constraints and coverage-gap state. Search defaults to the funding-profile location, separates unknown geography, and queues bounded approved-source research on every explicit Search submission. Migration 025 stores submission receipts so reloads and navigation do not restart completed research. Equivalent pending jobs are shared; completed jobs can be refreshed by a new submission, subject to existing limits. Polling no longer starts inline crawls; the existing worker resumes queued searches. See [location-search-release.md](location-search-release.md) for source coverage and deployment instructions. Health now requires migrations 024 and 025. The application role requires SELECT/INSERT on search_discovery_submissions and the backup role requires SELECT; the worker does not receive access to this table.


## Search-first scheduled processing (migration 026)

Every explicit user search queues research. Scheduled runs remain unchanged; no GitHub dispatch credential or new service is required. Search jobs receive the first 20% of each bounded run, in four-page turns ordered by last service time (unserved jobs first). Maintenance retains its 50% reservation; enrichment/reconciliation and contributions use the remaining time. Existing 24-page search cap, 50-page source limit, 1,000-page invocation limit, lease, robots and domain restrictions remain in place. A slow request can consume a slice; immediate completion is not promised.

Each turn publishes only candidates associated with that search's visited URLs, including redirects, before more downloads and at the end of the turn. Counts no longer attribute unrelated publication backlog to a user's search. Failed sources receive shared exponential backoff. Unvisited pages under backoff or invocation capacity limits retain a durable next-attempt time instead of appearing complete. Checkpointing and publication remain idempotent.

The default admin view shows catalog availability, search progress, and decisions. Sources, research, contributions, activity and diagnostics remain available under Advanced tools. Overdue searches and worker heartbeats stay visible. Ordinary missing facts never become an approval task.

Deploy migration **026_search_turns.sql** before this app and worker. It adds scheduling columns and redirect evidence URLs to existing tables; existing app/worker grants apply. Health now requires 026. Back up production first. PDF extraction now copies Buffer inputs to a plain Uint8Array before PDF.js; real readable-PDF regression tests cover the previous runtime error. Scheduling gaps in GitHub are still operational limitations; this release does not change cron or purchase capacity.
## Search targets and international locations (migration 027)

Each explicit search still requests a fresh check, reusing pending equivalent work. The worker measures distinct recognizable published programs against supported applicant, geographic, category, focus, keyword, amount and freshness filters. Only records checked within the last 24 hours count; older records remain browseable and get enrichment priority. The default target is ten open matches. An explicit availability filter changes that target; upcoming/between-round programs are counted separately. These are supported filter matches, not certification of every eligibility requirement. Missing applicant type or country prevents a supported-match count; users can still browse and research with Any location.

Below-target searches can continue through five durable research waves of 24 page attempts each (120 lifetime attempts per submitted search), adding at most eight applicable approved sources per wave. A wave is spread across the existing four-page worker turns; no invocation page, time, source, depth, queue, or hourly budget was increased. Exhausted source coverage or the five-wave limit ends the search as partial with an explanation. A successful job is not a promise of ten grants. New submissions can request another bounded pass.

Potentially relevant published programs with missing facts receive a one-day enrichment priority. Existing retries, field locks and evidence checks remain in force. Related funding words guide link/source research only; they do not relax selected result filters. Recommended results order availability before the number of profile matches after eligibility conflicts are considered.

Location input accepts country names or two-letter country codes, a city, state/province/region and optional postal code. U.S. state and ZIP normalization remains available; other postal codes are preserved. National and worldwide source selection works for every country. Register international local scopes as `City / Region / Country` or `Region / Country`; legacy unqualified scopes remain U.S. hints. Scope is never grant eligibility. No new domains or geographic coverage are automatically approved. Lack of applicable local sources remains a coverage gap.

Parser program-v14 extracts explicit English residency statements naming a country, U.S. state, or a qualified `City, Region, Country`. Ambiguous places, compound restrictions and unhandled languages remain unresolved, not assumed nationwide. Existing structured geographic eligibility supports other locations independently of this parser.

Deployment: back up the target database, apply `027_search_targets.sql` with the migration role, then deploy the app and worker together. Existing app/worker grants on the altered tables suffice; no new secrets or permissions are needed. Health requires migration 027. The hourly schedule, free-service limits and disabled paid providers are unchanged.

## Optional hosted AI pilot (migration 028)
The separately enabled AI source-research pilot is documented in [ai-catalog-pilot.md](ai-catalog-pilot.md). It supersedes the blanket no-AI statement only for this bounded operator-funded pilot. Ordinary discovery and user-facing paid providers remain unchanged. Apply migration 028 and ledger role grants before deploying this app; health requires 028. The admin search-progress card shows reservations and source-link outcomes, not claimed grants found.

## Funded projects and application examples (migration 029)

Grant details show source-supported funded projects/recipients and public sample applications separately from current requirements. HTML extraction retains short attributed excerpts, full links, check dates, and same-publisher images when explicitly present. Missing examples/images remain missing; guidelines and blank templates are not application examples. No AI or additional paid calls are used.

Enrichment follows example links within existing page, source, depth, domain and robots limits. Supporting pages must explicitly name the program; the program page can supply its own recipient cards. Historical example pages do not supply current application facts or program aliases. Examples live on retained program evidence snapshots; merged records remain readable through the program family. Old snapshots without example metadata are not treated as evidence that examples disappeared. Fresh HTML without examples clears that page's examples.

Apply additive migration 029_program_examples.sql before deploying this version (health requires it). Local backup and migration are separate from deployment. Existing programs gain examples as scheduled enrichment revisits their official pages; this does not backfill every grant immediately. Images are linked, not copied, may be unavailable, and remain owned by the source. PDFs can be linked as public samples from HTML evidence; PDF image extraction is not implemented.

## Live user-search sessions (034–035)
See [live-search-release.md](live-search-release.md) for progressive official API search, private session retention, lazy award examples, and restricted role grants. Hosted crawling, leases, schedules, and the separately authorized AI pilot remain unchanged. API results can be saved before the worker publishes their catalog records. Health now requires migrations through 035.
