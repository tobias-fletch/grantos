# GrantOS milestone review — October 5, 2026

## Milestone 1: individual-user development foundation verified

Implemented and exercised: Next.js/TypeScript application, PostgreSQL migrations,
hashed-password registration, personal workspace and owner membership creation,
JWT login/logout, onboarding profile/category persistence, server-side membership
checks, dashboard protection, and workspace/profile audit events.

This audit corrected missing login/registration/onboarding feedback, limited
passwords to bcrypt's 72-byte input limit, blocked viewer profile writes,
validated funding categories, labeled the public homepage's illustrative metrics,
and made the health endpoint check the database. Desktop and mobile navigation
now expose implemented sections and explicitly identify later milestones.

This is a development foundation, not commercial-launch approval. Organization
workspace creation/invitations/switching, password recovery, email verification,
login abuse controls, operational backups/restore drills, and production security
review remain outstanding. The app currently selects the user's earliest workspace.
Database-level RLS is not enabled; authorization is enforced by the server data layer.

## Milestone 2: discovery, research, and editorial workflow

- 21 sourced programs with at least five per funding-interest category across all
  application statuses; narrow eligibility/status filters can return fewer.
- Search by title/funder/summary; category, applicant, NYC, application status,
  and potential award filters; deadline/award/freshness sorting and pagination.
- Detail pages with award, requirements, official sources, and check dates.
- Workspace-private saved grants with idempotent save/remove and viewer protection.
- Dashboard counts from the database and deterministic profile suggestions based
  on category, applicant type, and published geography; no eligibility guarantees.
- Published opening and closing times use Eastern time. Passed deadlines close
  automatically; unannounced dates remain null. Source checks older than 90 days
  require reverification. Startup does not refresh historical verification dates.

## Verification

The integration suite uses an isolated PostgreSQL schema inside a transaction,
applies all migrations, and rolls back the schema and fixtures after testing.
It exercises filters, literal wildcard/injection search, sorting/pagination,
two-workspace isolation, viewer/membership checks, save/remove persistence,
deadline expiry, stale checks, and exclusion of archived/demo data.

`npm test` requires `DATABASE_URL` (loaded from `.env.local` if present).
`npm run build` includes TypeScript validation.

Local browser checks cover invalid login feedback, login, filtering, save
persistence, and updated dashboard counts. The deployed development app must also
be checked after rollout.

## Milestone 2 implementation update

Implemented direct daily discovery with a source registry, robots-aware bounded
crawling, checkpoints, Eastern-time scheduling, catch-up, change snapshots, domain
approval, editorial review and publication history. Registered sources cover all
current categories. Crawls never overwrite verified facts or renew verification.
Editors review changes and approve updates while preserving saves and checklists.

Tavily and Brave integrations remain in the code but all provider calls are
blocked, including when keys exist. Premium research is deferred until paid tiers.

Automated checks cover scheduling, limits, recovery, authorization, review,
persistence and source safety. A bounded live Spencer crawl produced candidates;
a real-source publication/save/update acceptance transaction passed and rolled
back its test records. Catalog source reading can be partial; morning jobs depend
on the local computer, database and worker being available. The configured editor
email must have a registered GrantOS account before using editor controls.
See [workflow, limits and acceptance](discovery-research.md).

## October 6: automatic free-catalog publication

Recognizable grant leads now publish after daily crawling and during startup
backlog processing. Incomplete listings show Unknown fields, an unverified label,
source links and fetch dates. Precise filters exclude unknown eligibility/status
values. Reviewed facts remain protected; editor correction, hiding and duplicate
merging preserve saves and manual tasks. Publication results are checkpointed.

The backed-up local rollout added 43 visible listings after two duplicate merges,
bringing the catalog to 64 programs. Tests and production build pass. Live HTTP
checks confirmed authenticated visibility and filtering. Browser visual checks
were unavailable in this session; a visual smoke test remains useful. Paid
enrichment, exhaustive internet coverage, and always-on hosting remain deferred.

Sources reviewed: https://www.foundationforcontemporaryarts.org/grants/emergency-grants/
https://www.pkf.org/how-to-apply/
https://www.awesomefoundation.org/en/chapters/nyc
https://www.nyfa.org/awards-grants/rauschenberg-medical-emergency-grants/
