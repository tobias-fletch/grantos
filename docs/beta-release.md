# GrantOS beta release: icangetgrants.com

## Current release

Use Render Free for Next.js, a separate Neon database, Gmail API for account mail,
and GitHub Actions for discovery and encrypted backups. Owner, sender and support:
tobias.fletch@gmail.com. Canonical URL: https://icangetgrants.com. No billing or paid
AI/search is enabled. Render Free sleeps when idle; schedule timing is best effort.

Code preparation is not a deployment. Account creation, Google authorization,
production secrets, DNS, and hosted acceptance must be completed before invitations.
Never copy .env.local, local test users, applications, notes or tokens to production.

## 1. Accounts and Gmail authorization

Create free Render and Neon accounts. Create a Google Cloud project, enable Gmail
API, and configure an external OAuth consent screen with the website/privacy/support
URLs. Only the operator authorizes their mailbox; beta users do not connect Google.
Request only https://www.googleapis.com/auth/gmail.send. Create a Desktop OAuth client,
and download its JSON outside the repository. Run:

    node scripts/setup-gmail.mjs ABSOLUTE_PATH_TO_CLIENT_JSON

Open the printed Google URL and personally authorize tobias.fletch@gmail.com.
The helper uses state and PKCE, listens on loopback for five minutes, and writes
ignored .env.gmail without printing credentials. Never use the normal Gmail password.

External OAuth apps in Testing can issue seven-day refresh tokens. Before launch,
set the consent app's publishing status appropriately, complete any verification
Google requires for this use case, and authorize again after moving out of Testing.
Verify refresh-token renewal with a real account email. Only then set
GMAIL_OAUTH_PRODUCTION_CONFIRMED=true and EMAIL_ENABLED=true. These flags are an
operator attestation, not a substitute for checking Google's console. Revocation or
expiry still requires reauthorization. Keep email disabled until this is complete.

Account mail reserves a budget of 90/day and 2,500/month. Each token is attempted
once. Gmail has no idempotency-key send API: uncertain sends are not retried, and
failed tokens are revoked. Request a new link after fixing delivery. Existing
invitation/reset expiry, generic responses, rate limits and session revocation remain.

## 2. Database release

Create a new Neon project in a region near Render, on the Free plan. Keep the direct
owner connection in an ignored .env.release as MIGRATION_DATABASE_URL. The app uses
a separate pooled connection; the worker uses a DIRECT connection for session locks.
Do not point any production secret at localhost or the development database.

Run with release environment variables (Node 22 supports --env-file=.env.release):

    node --env-file=.env.release scripts/migrate.mjs
    node --env-file=.env.release scripts/transfer-catalog.mjs --confirm-empty

Transfer requires CATALOG_SOURCE_DATABASE_URL and CATALOG_TARGET_DATABASE_URL.
The target must be new, with no accounts or private work. It copies public grants,
source registry, aliases, merge links and catalog-monitoring state, including
automatic archival. It excludes users, saved grants, applications, research leads,
crawl evidence/history, tokens and editorial actor identities. Migrations through
013 are required. Transfer before owner setup or starting the hosted worker.

Create distinct application and read-only backup users with generated 32+ character
passwords using APP_DB_USER (grantos_app_ prefix), APP_DB_PASSWORD, BACKUP_DB_USER
(grantos_backup_ prefix), BACKUP_DB_PASSWORD:

    node --env-file=.env.release scripts/setup-release-roles.mjs

Create a separate discovery user with DISCOVERY_DB_USER (grantos_discovery_ prefix)
and DISCOVERY_DB_PASSWORD:

    node --env-file=.env.release scripts/setup-discovery-role.mjs

Never give the crawler access to users/private applications. Reapply table grants
after later migrations. Keep migration/owner credentials out of Render runtime and
discovery workflow secrets. The backup credential can read private data, but not edit.

## 3. Deploy and connect IONOS DNS

Push the reviewed release branch. Deploy render.yaml using that exact branch/commit;
auto-deploy stays off. The Blueprint defines only a free web app. Supply:

- DATABASE_URL: pooled Neon URL for the app login.
- AUTH_SECRET: separately generated production secret.
- APP_URL and AUTH_URL: https://icangetgrants.com.
- SUPPORT_EMAIL and GMAIL_SENDER: tobias.fletch@gmail.com.
- GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN: securely stored secrets.
- GMAIL_OAUTH_PRODUCTION_CONFIRMED and EMAIL_ENABLED: false until authorization is verified.

Migrate separately; builds/startup never apply migrations. Health requires migrations
011, 012 and 013. Production always requires beta activation and verified email. The
trusted local owner exception runs only under NODE_ENV=development.

Add icangetgrants.com to Render custom domains and use the exact DNS targets Render
shows in IONOS. Add/redirect www to the canonical root. Change only relevant website
DNS records; preserve existing MX/TXT records and unrelated services. Verify Render's
TLS certificate and HTTPS redirects before sending any account links.

Bootstrap the production owner using the release environment plus Gmail credentials:

    node --env-file=.env.release --import tsx scripts/setup-beta-owner.ts tobias.fletch@gmail.com --send-verification

This explicitly sends the owner an invitation if new, or verification if already
registered. Complete the link and onboarding with a new production password.
Never reuse the local password supplied in chat. No bulk invitations are automatic.

## 4. Cloud jobs and spending limits

GitHub scheduled workflows run from the default branch. Review and merge the release
before enabling schedules; deploying a feature branch alone does not activate cron.
The application repository is public. Run discovery there, but keep the backup
workflow and backup script in the private tobias-fletch/grantos-operations repository.
Never upload production backup artifacts to the public application repository.
Create GitHub environments beta-discovery (application repository) and beta-backup
(operations repository), restricted to the reviewed default branch. Protect workflow
edits and enable Actions failure notifications.
For unattended jobs, avoid environment approval rules that pause every schedule.

- beta-discovery secret DISCOVERY_DATABASE_URL: restricted DIRECT worker connection.
- beta-backup secrets BACKUP_DATABASE_URL: read-only DIRECT backup connection;
  BACKUP_KEY: 32 random bytes in base64, saved independently in a password manager.
- Repository variable BETA_JOBS_ENABLED=true only after secrets and restore test pass.
- Operations repository variable BETA_BACKUPS_ENABLED=true only after free-tier
  spending controls and the restore test pass. The backup workflow also requires
  a private repository and refuses to run in the public application repository.

Discovery schedules 06:00 Eastern with resume opportunities at 12:17 and 18:17,
including DST. Each invocation processes at most 14 minutes with an 18-minute job
ceiling. Existing page limits, durable checkpoints and singleton locks remain.
Manual dispatch resumes/enqueues work; Run refresh now in the app queues a job for
the next worker invocation. No provider-backed search or AI calls occur.

Backups run at 05:23 Eastern with an eight-minute ceiling. pg_dump runs in the
official PostgreSQL 18 container with Node's public CA roots mounted read-only
and TLS hostname verification enabled. Only AES-256-GCM encrypted backup.enc is uploaded;
GitHub retains it for 30 days. Downloading artifacts requires repository access;
protect the repository and encryption key. Failed jobs never upload plaintext.
Artifacts and logs count against GitHub quotas. Set a zero-spend Actions budget,
disable paid overages/upgrades and verify current account allowances before enabling.
Free allowances are account-wide; other projects may consume them. Monitor Neon
storage/compute too; snapshot accumulation is bounded per crawl, not forever.

The backup script refuses an encrypted artifact above 12 MiB by default, keeping
30 retained daily files below roughly 360 MiB. Larger databases require an explicit
storage/budget decision, not automatic charging or partial backups. Failed backups
must be resolved promptly. Use a separate downloaded encrypted copy for off-provider
recovery. No job activation or account billing change is implied by checking in YAML.

## 5. Restore and launch gates

Use scripts/backup-db.mjs restore with RESTORE_DATABASE_URL targeting a disposable
EMPTY database, BACKUP_KEY and --confirm-empty. PG_BIN can point to PostgreSQL tools.
The authenticated format is shared by local and cloud backups. Wrong keys, nonempty
targets and corrupt files must fail. Never restore over live beta data.

Before inviting a small group:

- Full test suite/build pass; no secrets in Git; reviewed release deployed.
- Owner receives/uses invitation; test email mismatch, expiry, replay and recovery.
- Verify session revocation and production refusal of unverified owner/editor access.
- Desktop/mobile walkthrough: onboarding, search, candidate filters, save, application
  notes/tasks, stages, dates, archive/restore and fresh login.
- Confirm another workspace cannot read/edit private work.
- Manual cloud discovery dispatch completes a bounded run, publishes a real lead,
  and preserves verified facts, saves and archived catalog state.
- Download and restore a cloud backup; verify representative rows and access isolation.
- Confirm support/privacy text, domain redirects, Gmail delivery, health, stale-data
  notices, job-failure notifications and budget settings.

Automated monitoring records fetch success separately from editorial verification.
Explicit matching-program discontinuation archives only from search, never private
work. Closed cycles and failed requests are not discontinuation. Ambiguous pages
remain reviewable; grant coverage and eligibility are not guaranteed.

References: https://render.com/docs/free ; https://render.com/docs/custom-domains ;
https://developers.google.com/identity/protocols/oauth2 ;
https://developers.google.com/workspace/gmail/api/guides/sending ;
https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax

## Cloud operations locations

- Discovery runs: https://github.com/tobias-fletch/grantos/actions/workflows/discovery.yml
- Private backups: https://github.com/tobias-fletch/grantos-operations/actions/workflows/backup.yml
- Discovery secrets: application repository Settings > Environments > beta-discovery.
- Backup secrets: private operations repository Settings > Environments > beta-backup.
- Both environments accept deployments only from main. Secrets are encrypted in
  GitHub; values are never committed or displayed in logs.
- Manual discovery runs offer 60, 300, or 840 seconds. Scheduled invocations use
  840 seconds. The next invocation resumes the existing daily database job.
- To pause a workflow, set its repository enable variable to false. Do not delete
  discovery checkpoints or existing backup artifacts to troubleshoot a failed run.
- Failed-workflow notifications are enabled for the owner's GitHub account via
  GitHub and email; the account Actions budget is $0 with Stop usage enabled.

The cloud backup artifact was restored successfully into a disposable Neon database
on 2026-10-07; 37 public-schema tables restored and representative counts matched.
The disposable database was removed after verification. Keep an independent secure
copy of BACKUP_KEY: losing it makes encrypted artifacts unrecoverable.
