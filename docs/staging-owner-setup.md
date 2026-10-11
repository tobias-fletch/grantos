# One-time isolated staging owner setup

This is an explicitly gated bootstrap for the isolated Render staging service.
It does not open public signup, change existing beta authentication, send email,
reset an existing password, or modify production. It is unavailable unless all
runtime, database, HTTPS, owner-email, token and expiry guards pass.

## Operator preparation, with separate approval

The implementation does not authorize creating/configuring a credential,
pushing, deploying, or creating the owner account. Those actions need their
applicable approvals. Never use production credentials or account data.

After verifying the isolated staging resource and approving provider-side
credential configuration, set these **server-only** variables on that staging
service, using the provider's secure environment-variable UI:

- `STAGING_OWNER_SETUP_ENABLED=true`
- `STAGING_OWNER_EMAIL`: the specifically approved owner's email, not a domain
  allowlist. It must not already belong to any account in the staging database.
- `STAGING_OWNER_SETUP_TOKEN`: a fresh, provider-generated cryptographically
  random secret, with at least 256 bits (32 random bytes) of entropy. The code
  accepts 32–256 characters in base64/base64url-compatible encoding, including
  `+`, `/` and `=`. Length validation cannot establish randomness or provenance;
  the operator must use the provider's generator, not a memorable string. Do not
  reuse `AUTH_SECRET` or any production secret.
- `STAGING_OWNER_SETUP_EXPIRES_AT`: a UTC ISO timestamp, such as the shape
  `YYYY-MM-DDTHH:mm:ssZ`, in the future and no more than 24 hours away. Choose a
  short window for the planned handoff. Expired/missing configuration fails
  closed. Do not renew automatically.

The existing staging wrapper sets `GRANTOS_RUNTIME=staging`, production-mode
Node, exact staging `DATABASE_URL`, `APP_URL` and `AUTH_URL`, and forces email/AI
side effects off. Setup also requires `TRUST_PROXY=render`, the explicit
`STAGING_CONFIRMATION=grantos-isolated-staging`, a staging-named database and
Render's assigned `https://grantos-staging*.onrender.com` origin. The actual
application Pool connection URL and `current_database()` must match this target.
These checks prevent accidental target mismatches; they do not replace provider
verification that the database is isolated. Production startup never supplies
the staging runtime marker. Adding a setup token alone never enables setup.

Migration `041_staging_owner_setup.sql` must be applied. It creates one durable
consumption row and stores no token. Use the staging migration/startup workflow;
do not run an owner-creation CLI against the hosted database.

## User-controlled secure handoff

1. The approved owner opens `/staging/setup` on the verified staging HTTPS URL.
2. The owner personally reads the generated secret through the provider's secure
   UI, enters it in the form, supplies the approved email, and chooses/confirms
   their own password (at least 12 characters, at most 72 UTF-8 bytes).
3. The owner personally submits. Do not ask the owner to paste the token or
   password into chat. Do not type/submit these credentials on their behalf.
4. On success, the owner logs in through `/login` and follows the normal profile
   onboarding. Setup does not mark that profile complete. No password is preassigned or
   shared and no automatic login/session is created by the setup endpoint.
5. After approved configuration cleanup, disable setup and remove its token and
   expiry from the provider's environment. The database consumption record still
   prevents replay or reopening if configuration is later re-enabled or rotated.

The form page itself requires the approved Host and HTTPS forwarding headers.
The plain HTML form sends the token/password only in a same-origin HTTPS POST
body. It never places them in a URL, hidden field, server-rendered default value,
client prop, cookie or response. Do not capture screenshots of populated fields
or enable request-body logging at the provider/proxy. Normal application error
handling never logs the submitted body or caught database/validation exceptions.

## What is created and how it is verified

One active beta owner/catalog editor is created with a normal individual
workspace, owner membership and profile. The existing strict beta login requires
a verification timestamp. This bootstrap sets that timestamp based on possession
of the provider setup token and the preconfigured owner email; it does **not**
prove mailbox access or claim email delivery. Both the page and the permanent
`beta_events`/`audit_logs` entries explicitly label this staging-only
`provider_setup_token` verification and `email_delivered=false`.

The transaction locks the singleton and the user table, refuses any prior owner
(including disabled owners) or any account with the expected email, and commits
owner/workspace/profile/audit/consumption together. A password hash, never the
password, is stored. Removing the user or rotating the token cannot clear the
consumed marker. This is not a recovery mechanism.

All well-formed-origin attempts pass shared DB rate limits before parsing or
bcrypt: at most five requests per source address and 30 globally per 15 minutes.
Failures keep their counters outside the account transaction. Token checks use
fixed-length SHA-256 digests and a constant-time comparison. Requests with wrong
Origin/Host/TLS forwarding, query parameters, malformed or oversized bodies,
invalid password confirmation, wrong email/token, expired configuration, or
repeated/concurrent claims fail closed with generic responses. A successful
claim is single-use even across separate connections.

## Acceptance still required after authorized deployment

Run the focused staging-owner tests, beta-auth regression tests, typecheck and
production build. An independent review and exact-commit CI are separate gates.
Then verify the deployed commit, health/migration readiness, actual Render proxy
headers, blocked production/disabled paths, user-controlled secure setup, normal
login and the individual workspace in the staging browser. Local HTTP tests
cannot prove hosted proxy behavior or user acceptance. Do not provision a secret,
create a real owner, or treat deployment as authorized from this document alone.
