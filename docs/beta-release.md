# Invite-only beta release

## What is ready

Migrations through 011, email-bound invitations, verified roles, reset/verification
flows, database rate limits, session revocation, owner controls, public beta copy,
Render configuration, encrypted backup/restore and public-only catalog transfer.
Production always requires beta activation and verified email; BETA_MODE=false
cannot disable that rule. Local development preserves existing sign-in access,
but owner/editor controls require verified explicit roles in every environment.
Public registration requires an invitation in all environments.

## Credentials and services

1. Acquire a sender domain and configure SPF/DKIM as required by Resend. Set an
   actual monitored SUPPORT_EMAIL. Sending stays disabled until EMAIL_ENABLED=true.
   App quotas reserve at most 90 messages/day and 2,500/month, including failed
   requests. Use a dedicated Resend account/project so other senders cannot spend
   outside these limits. Verify provider billing limits before activation.
2. Create a separate Neon database for the beta. Keep its owner/direct URL only in
   a local release environment as MIGRATION_DATABASE_URL. Never upload .env.local.
   Production DATABASE_URL must target this new database, not the development DB.
3. Run `node scripts/migrate.mjs` against the new database. The migrator uses one
   dedicated connection, an advisory lock and one transaction per migration.
4. Optional: transfer the existing public catalog with CATALOG_SOURCE_DATABASE_URL
   and CATALOG_TARGET_DATABASE_URL, then run
   `node scripts/transfer-catalog.mjs --confirm-empty`. Target must have no accounts.
   This copies only catalog/source tables, never users, saves, research leads,
   private applications, snapshots or tokens. Do this before owner setup.
5. Designate the owner with `node --import tsx scripts/setup-beta-owner.ts EMAIL`.
   This does NOT verify the email. Once the sender is ready, use the same command
   with `--send-verification` to explicitly send the owner invitation/verification.
   Existing accounts retain passwords and must verify; new owners set a password
   via their email invitation. Complete onboarding before opening Beta access.
6. Create a separate worker login: set DISCOVERY_DB_USER to a unique name starting
   grantos_discovery_, set DISCOVERY_DB_PASSWORD to a random 32+ character secret,
   then run `node scripts/setup-discovery-role.mjs` with the owner connection.
   Set DISCOVERY_DATABASE_URL to its DIRECT connection URL in a separate ignored
   local worker env file. Do not use a transaction-pooler connection for the worker:
   it uses session advisory locks. Its grants exclude users/private applications.
7. Configure the Render Blueprint in render.yaml from a reviewed GitHub commit.
   It creates only a free web service, not Render's expiring free database. Set
   APP_URL and AUTH_URL to the HTTPS beta URL, supply AUTH_SECRET, DATABASE_URL,
   SUPPORT_EMAIL and email settings. Auto-deploy is off. Migrations are a separate
   controlled operation, never run during build or startup. The service runs only
   Next.js; it does not launch a crawler or AI worker.
8. Run the local discovery process with DISCOVERY_ENV_FILE pointing to its env:
   `node --import tsx scripts/discovery-worker.ts`. Default idle polling is ten
   minutes to let an idle hosted database sleep. Manual jobs may wait that long;
   the 6 a.m. Eastern job runs on the next poll. Catch-up and singleton locking
   remain active. Stop the development worker before pointing a second instance
   at the beta. The public UI warns after 36 hours without a completed refresh.

## Backups and restore

Generate a random 32-byte base64 BACKUP_KEY and store it separately from backups
in a password manager. Never commit it or include it in logs. BACKUP_DATABASE_URL
may override DATABASE_URL. Set PG_BIN if PostgreSQL tools are not on PATH.

- `node scripts/backup-db.mjs backup /absolute/path/grantos-DATE.enc`
- Restore only into a disposable EMPTY database with RESTORE_DATABASE_URL:
  `node scripts/backup-db.mjs restore FILE.enc --confirm-empty`

AES-256-GCM authenticates the entire archive before restore begins. Restore is
transactional and refuses nonempty databases. Plaintext archives are held in
memory, not temporary files; the current backup cap is 256 MB compressed. Increase
and retest the strategy before exceeding that cap. Run backups before releases
and daily during beta; keep an encrypted off-device copy, retain 30 days, and
manually remove expired backups after verifying the latest restore. No recurring
backup automation has been activated by this implementation. Test restoration
monthly and before opening the beta. Protect the local key file with OS permissions.

## Security and release checks

- Login limits: 10 attempts/email and 60/network bucket per 15 minutes. Other
  account email flows: 5/email and 20/network bucket per 15 minutes. Only the Render
  deployment enables forwarded-network handling. Do not expose a direct untrusted
  origin with TRUST_PROXY=render. Account limits still apply across addresses.
- Invitations expire in seven days, verification in 24 hours, resets in 30 minutes.
  Only hashes are stored. Reset/revocation invalidate session versions immediately.
  Recovery responses don't confirm account existence. No tokens or passwords are
  included in application error logs. Restrict hosting logs and redact token query
  strings in any external access-log/monitoring integration.
- Owner/editor grants are database flags plus verified email and beta activation.
  CATALOG_EDITOR_EMAILS is legacy configuration and no longer grants access.
- Before publishing: run tests/build; verify hosted email to the owner only after
  explicitly initiating setup; test a real invitation, recovery and logout/login;
  inspect desktop/mobile; verify health/refresh indicator and restore a hosted backup.
- /api/health returns 503 when the expected migration is missing or DB is unavailable.
  No uptime monitor, hosted services, domain purchase or invitations are activated
  by preparing these files. Supply hosting credentials and sender-domain setup
  through secure configuration before those explicit release steps.

## Validation completed locally

53 automated tests pass. Encrypted backup restored in a disposable database.
Catalog transfer copied 82 public grants with zero accounts/private applications.
Restricted worker could write snapshots/candidates and publish a grant in a rolled
back acceptance transaction; reads of accounts and private notes were denied.
Real email delivery, hosted restore, and visual desktop/mobile review still require
configured external services and an available browser-testing environment.

Official deployment references:
- https://render.com/docs/blueprint-spec
- https://render.com/docs/free
- https://neon.com/docs/connect/connection-pooling
- https://resend.com/docs/dashboard/emails/idempotency-keys
