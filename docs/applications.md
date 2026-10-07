# Applications and private candidate saves

Migration 010 creates workspace-private applications and history, backfills saved
grants, and attaches original grant_tasks rows by application_id. Existing saves,
IDs, task contents, and stage history are preserved. Saving candidates captures
source title, canonical URL, excerpt and fetch date without publishing them.
Repeated saves reuse the record, including archived records; restore is explicit.

Applications offers a searchable list, stage filters, archived records and sorting
by personal target date (source deadline when no target exists). Stages are Saved,
Preparing, Submitted, Awarded, Declined and Withdrawn. Changes are manual and never
submit to funders. Notes, requested/awarded USD amounts, submitted date and personal
target date are optional. User dates do not change catalog deadlines.

Manual tasks support editing, completion/reopening and removal. Archived and
terminal-stage applications are excluded from dashboard active work. Existing
catalog checklist routes remain usable; application detail is the canonical place
to manage private task groups after grant merges. Removing a catalog save does not
delete its application; archive the application to remove it from active work.

Publication links candidate applications to catalog IDs through source aliases.
Merges retarget linked applications while preserving both records if a workspace
already tracked both programs. Tasks retain their application_id. Catalog facts
never overwrite notes, stages, amounts or personal dates. Editors cannot see
another workspace's application data through these routes. Viewers cannot mutate.

The local rollout backs up PostgreSQL before migration. Tests cover migration
backfill, repeat saves, workspace isolation, viewer restrictions, date/amount
validation, stage history, archiving, dashboard exclusion, publication and merges.
HTTP acceptance exercises real server actions and fresh-login persistence using a
free test account, then removes its temporary application and tasks. Visual desktop
and mobile inspection remains unverified in this environment.

Daily crawling, Tavily restrictions and workspace plans remain unchanged. No paid
API is used. Billing, attachments, reminders and repeat-cycle applications remain
future work. Changes are local, without a push or deployment.
