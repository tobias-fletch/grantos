# Catalog maintenance operations

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
