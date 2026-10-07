# Program reconciliation

Deploy migration `018_program_reconciliation.sql` before this release, then reapply
`db/operations/discovery-role.sql` and grant the existing application and backup
roles access to the five new catalog tables. Back up production first. The worker
retains no permission to read accounts or private applications. Its narrow merge
function retargets public grant references without deleting application records.

Manually dispatch **Reconcile hosted grant catalog** on `main`. It shares the
production discovery concurrency group, environment, and database lease. The
workflow has a 60-minute timeout; the worker stops at 55 minutes or 1,000 attempted
pages, with 50 per source and one primary plus ten supporting pages per program.
The operation freezes published records and pending non-domain candidates once.
Restarts reuse that inventory; hourly jobs prioritize unfinished due items.
The hourly cron itself is unchanged. Disabled sources and retry backoff remain
effective. Ambiguous items stay flagged and keep the operation partial.

Evidence is held in `program_evidence_pages`: page role, explicit association,
snapshot, fetch time, extracted fact, excerpt, source URL, and stated cycle.
Known facts survive omissions. Conflicting current evidence remains unresolved;
historical dates never establish current availability. Extraction is deliberately
conservative and never calls paid search or AI. A source check is not verification.

Inspect **Catalog → Official evidence and unresolved facts** and **Activity** in
the admin workspace. `catalog_reconciliation_runs`, `catalog_reconciliation_items`,
`catalog_reconciliation_pages`, and `catalog_reconciliation_events` retain durable
progress and outcomes. `partial` is not full coverage. Failed pages never close or
delete a program. Confirmed non-programs are hidden reversibly; candidates remain
stored as evidence. Existing editorial hidden state is preserved.

Only explicit publisher IDs or official page relationships establish merges.
Similar titles remain separate for review. Program duplicates prefer a verified
record, otherwise the oldest record. Application notes, histories, and tasks keep
their IDs, including when two applications point to the consolidated grant.
