# Recurring programs and catalog consolidation

This application update separates a grant program from the availability of its latest known application round. It does not assume that annual programs are currently accepting applications.

## Public behavior

- Explicitly recurring programs with an elapsed deadline or closed window display **Between rounds — next dates unannounced**.
- An elapsed deadline without confirmed recurrence displays **Previous round ended — future availability unknown**.
- A future opening date displays an upcoming round. Reaching that date does not automatically establish that applications are open.
- Explicit rolling acceptance displays **Rolling applications** while the underlying status is open.
- Permanent discontinuation remains distinct and excluded from ordinary discovery results.
- Expired dates are labeled as previous-round deadlines. They do not become an invented next-year deadline or a current deadline used for discovery sorting.
- The detail page includes retained application date evidence, source links and fetch dates. These are evidence observations, not a claim that every historic funding cycle is complete.

Recurrence and opening dates use existing field history, evidence, locks and rollback controls. Recurrence begins unknown for existing records. The worker fills it only from explicit source language supported by the parser; omission alone does not erase a known fact.

## Identity and cleanup

Canonical URL aliases, explicit NYFA/Grants.gov identifiers and uniquely associated official program subpages can attach evidence to an existing program. Supporting pages do not create additional program listings. Similar titles alone remain insufficient for merging.

Confirmed catalog aliases are suppressed from pending search results even if the parent catalog entry does not match that search. Uncertain name-only matches remain distinct. Exact program identities are collapsed for display with a preference for human-reviewed records, otherwise the oldest record. Display grouping never merges private work.

After a parser upgrade, the normal worker queues one reconciliation inventory once earlier reconciliation work has finished. Existing merge and reversible hiding controls process confirmed duplicates and non-program pages. Enrichment and reconciliation each receive time within their existing combined 30% slice, preventing a large enrichment backlog from consuming all cleanup time. Existing budgets, leases, retry timing, pause controls and schedules remain in force.

Historical round evidence stays attached to its original grant ID; the public history follows merge chains. Existing applications, saves, notes, tasks and application histories use the existing preservation logic.

## Deployment checklist for the operator

No hosted changes are part of this code update. Before deploying it yourself:

1. Back up your production database using your existing process.
2. Run `pnpm migrate` with the production migration connection supplied securely through `MIGRATION_DATABASE_URL`. This applies `022_program_recurrence.sql` and `023_program_cleanup_version.sql`. Do not place a connection string in a committed file or command history.
3. Reapply `db/operations/discovery-role.sql` as the database owner. It includes access to the new round evidence table and permission to update recurrence/opening fields.
4. Grant the existing application role access to `program_round_evidence` and the existing backup role read access. Substitute your actual role names:

   ```sql
   GRANT SELECT, INSERT, UPDATE, DELETE ON program_round_evidence TO your_existing_app_role;
   GRANT SELECT ON program_round_evidence TO your_existing_backup_role;
   ```

   No new database users or credentials are necessary. Existing table-level grants on `opportunities` and `catalog_automation` cover their new columns.
5. Deploy the app and worker from the same version. The health endpoint now requires migration 023 as well as prior required migrations.
6. Check a known recurring program, an expired program without recurrence evidence, and an upcoming round. Confirm the filters distinguish these cases. A subsequent ordinary worker run picks up parser changes and queues cleanup; it may need multiple bounded runs to finish.

No paid APIs are enabled. There is no guarantee that the worker can establish recurrence or the next opening date if official sources do not state them. Blocked sources and uncertain identities retain the existing research/exception handling.

## Local verification

Run `pnpm test`, `pnpm typecheck` and `pnpm build`. Database integration tests should use a local PostgreSQL database; they create and remove isolated test schemas. The regression suite covers recurrence evidence, date/status distinctions, round history idempotence, supporting-page publication, alias suppression, cleanup queuing, and preservation of saves and notes, alongside existing merge, authorization and worker tests.

## Catalog quality and browsing follow-up

The same local release now includes separate program/research views, reconciliation outcome settlement and parser v13. Completed inventories may retain durable research/retry outcomes; those no longer block the next parser inventory. The discovery-role script also grants category-row DELETE for audited replacement of source topics with official categories. See `catalog-maintenance.md` and `catalog-quality-report.md` for current behavior, test results and the frozen-evidence comparison.
