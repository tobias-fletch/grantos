# Isolated staging and release checks

## Scope and boundaries

The `feat/staging-catalog-readiness` branch includes the stacked regional-source,
project-workflow and guided-application changes. Staging must use this reviewed
branch/commit, its own database, its own authentication secret and its own HTTPS URL.
Do not merge production `main`, redeploy `grantos-beta`, change production DNS, copy
production accounts/private drafts, or reuse production runtime credentials to test it.

The existing `render.yaml` is production-intended (`grantos-beta`,
`https://icangetgrants.com`). It is not a staging blueprint. Provider inspection on
2026-10-11 found the actual live service named `grantos`, using
`codex/grantos-cloud-preview`, at `https://grantos-zuj9.onrender.com`; the checked-in
name is not proof of the current hosted target. Confirm the selected
provider/workspace, available free resources, database lifecycle/expiry and any
cost before creating a separate service. Keep automatic deployment off. Creation
of credentials or persistent access requires the operator's explicit approval.
Do not place database URLs, auth secrets, encryption keys or OAuth credentials in Git.

## Automatic CI

`.github/workflows/ci.yml` runs on pull requests, pushes to `main` or `feat/**`, and
manual dispatch. One standard Linux runner is capped at 20 minutes; superseded
runs for the same PR/ref are canceled. Both a push run and a PR run can occur for
a branch with an open PR. It has read-only repository access, no environment or
repository secrets, no deployment, no external grant research, no schedules and
no uploaded backup artifacts. Private repositories consume Actions allowance;
review account billing limits before enabling it there.

The job installs the frozen pnpm lockfile on Node 22, creates a disposable
PostgreSQL 18 service, migrates it, typechecks, builds and runs **every test file
serially** with `pnpm test:ci`. Serial execution is deliberate: existing tests
exercise shared catalog scheduling state. No tests are filtered out.

`scripts/ci-postgres-tools.sh` supplies `pg_dump` and `pg_restore` wrappers using
the same official `postgres:18` image, with ephemeral Docker containers and stdin
forwarding. These are real PostgreSQL tools, not mocks. Environment variables
carry only disposable fixture connection values; passwords are not command-line
arguments. The test database user can create temporary databases because release
tests need separate source, transfer and restore targets. This privilege is for
CI only, never the hosted app's login.

Release tests prove:

- All migration files apply to a fresh database through the real migration runner.
- A second runner invocation changes neither schema, table counts nor migration
  timestamps (the runner skips already-recorded migrations).
- Catalog transfer retains discontinuation state and excludes accounts/private work.
- An authenticated encrypted backup restores catalog and synthetic private rows.
- Wrong keys and modified ciphertext fail before creating restored tables.
- Restore refuses a nonempty target, preserving existing restored data.

The cloud fallback's embedded PostgreSQL server lacks dump/restore binaries. A
local typecheck or partial suite cannot substitute for a green exact-commit CI run.
Never claim the backup gap closed from workflow YAML alone.

## Controlled staging preparation

1. Verify the database is a separate staging resource in the approved provider
   workspace, not a production database/branch or an alias to one. Use a database
   name with a separate `staging` token, for example `grantos_staging`.
2. Supply the owner/direct staging connection securely as `STAGING_DATABASE_URL`
   and set `STAGING_CONFIRMATION=grantos-isolated-staging`. These variables are
   consumed by explicit mutation tools only; there is no `DATABASE_URL` fallback.
   An optional `PRODUCTION_DATABASE_URL` comparison rejects an identical
   host/port/database, even with different login credentials. The naming guard is
   an accident-prevention measure, **not proof** of provider isolation.
3. With those approved variables in an ignored operator file, run:

       node --env-file=.env.staging scripts/migrate-staging.mjs

   Repeat the command and confirm it reports no newly applied migrations. The
   wrapper explicitly directs both runtime and migration URLs to the guarded
   target. Migration output contains filenames only. Production builds and startup never
   migrate databases. The explicitly isolated staging Blueprint uses the staging
   initialization wrapper described below.
4. Import the reviewed starter catalog through its separate dry-run/apply
   workflow. Review unknowns and skipped existing records; never bypass field
   locks, fabricate verified editor identities, or copy private data for seeding.
5. After migrations, apply the reviewed least-privilege app grants using only
   approved credentials. `scripts/setup-release-roles.mjs` creates logins, so
   do not run it without approval for persistent access. Keep the owner login out
   of the web runtime. Migration 038/039 add tables requiring grant review.
6. Set the app's staging-only `DATABASE_URL`, `AUTH_SECRET`, `APP_URL`, `AUTH_URL`
   and `SUPPORT_EMAIL`; use the actual staging HTTPS hostname, never the
   production domain. Start with `EMAIL_ENABLED=false`,
   `GMAIL_OAUTH_PRODUCTION_CONFIRMED=false`, `CATALOG_AI_ENABLED=false` and
   `LIVE_GRANT_SEARCH=false`. Do not supply production Gmail or AI credentials.
   Keep beta access enabled and use only synthetic, explicitly approved test
   accounts. Production mode always enforces active/verified beta accounts;
   the development-owner exception is not a staging login strategy.
7. Deploy the exact green reviewed commit to the isolated service. Check
   `/api/health`, confirm the deployed commit and execute the browser checks in
   `guided-applications.md` and `writing-tools.md` before calling staging accepted.

## Recovery rehearsal and release gate

CI proves the code path with disposable fixtures. Before production rollout,
rehearse backup and restore with a staging-only dataset into another **empty,
separately verified** database. `scripts/backup-db.mjs` requires `BACKUP_DATABASE_URL`,
a separately protected `BACKUP_KEY` and, for restore, `RESTORE_DATABASE_URL` plus
`--confirm-empty`. It refuses existing user tables and uses authenticated
AES-256-GCM. Keep backups/keys outside Git and outside public artifacts; never
upload a production backup to this public application repository. Do not run
these operator commands against a production URL as part of staging work.

Record the exact commit, CI run URL, migration count, hosted health check, catalog
import summary, restore outcome and interactive browser results. Any unrun or
blocked check stays explicitly open. Rollback uses a previously reviewed app
commit; do not reverse additive migrations or overwrite a live database as an
automatic fallback.

## Verified CI evidence (2026-10-11)

Initial readiness commit `7e51e5c30ae29da2cbd45071b577a190a108001b` passed
[GitHub Actions run 38168817065](https://github.com/tobias-fletch/grantos/actions/runs/38168817065):
198/198 tests, zero failures, successful typecheck/build, all migrations and real
PostgreSQL 18.6 dump/restore. This closes the earlier missing-client-tools failure.
The subsequent health-contract and reviewed-catalog changes require their own
exact-commit final CI check; this initial run does not validate unpublished code.

## Separate Render staging Blueprint

`render.staging.yaml` creates new `grantos-staging` and `grantos-staging-db`
resources in Virginia, both explicitly on free plans. It selects
`feat/staging-catalog-readiness`, disables auto-deploy, sets PostgreSQL 18 and the
`grantos_staging` database name, binds the internal database connection through
`fromDatabase`, and uses an empty database IP allowlist to prevent external
connections. Render generates the new authentication secret internally. Applying
this file creates persistent access and resources: obtain operator approval first.
The file passed the official Render JSON schema on 2026-10-11; provider-side
validation and availability still control creation.

Free database expiry is 30 days. Free web hours are shared across the workspace;
review remaining allowance before creation and do not keep staging awake through
an artificial pinger. This is a disposable acceptance environment, not a permanent
hosting or backup arrangement. No paid upgrade, recurring job or production DNS
change is included.

The staging-only `start-staging.mjs` wrapper validates the explicit database guard
and Render-assigned `https://grantos-staging*.onrender.com` origin, then sets
`APP_URL`/`AUTH_URL` without guessing the assigned hostname. It runs migrations and
the idempotent reviewed catalog import (including explicitly approved additive
source evidence for safe existing catalog matches) before serving traffic. Any
failure stops startup. It forces email, AI catalog research and live search off.

This convenience wrapper uses the new disposable database owner's connection for
both initialization and runtime; it is not the production least-privilege model.
The staging resource must contain only the reviewed public catalog and approved
synthetic test accounts. Do not connect production data or invite real users. A
permanent environment should separate a release job from a restricted app role.
The existing `start-production.mjs` and production Blueprint are unchanged.

Local staging-startup acceptance on 2026-10-11 used the populated isolated
`grantos_staging` fixture: guarded migration replay and repeat catalog import
completed, then the production server returned HTTP 200 for `/api/health`
(`database: ok`) and `/login`. This is an HTTP/startup smoke check, not interactive
browser acceptance or evidence of a hosted deployment.
