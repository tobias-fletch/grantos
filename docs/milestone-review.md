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

## Milestone 2: first working discovery slice

- Four sourced programs: FCA Emergency Grants, Pollock-Krasner Artist Grants,
  Awesome NYC, and NYFA Rauschenberg Medical Emergency Grants Cycle 39.
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

## Milestone 2 follow-up work

Expand the catalog through source verification, add editorial/import tools and a
reverification workflow, improve structured location and discipline eligibility,
and add more real opportunities. Application workspaces and pipelines belong to
Milestone 3 and are not represented as functioning navigation here.

Sources reviewed: https://www.foundationforcontemporaryarts.org/grants/emergency-grants/
https://www.pkf.org/how-to-apply/
https://www.awesomefoundation.org/en/chapters/nyc
https://www.nyfa.org/awards-grants/rauschenberg-medical-emergency-grants/
