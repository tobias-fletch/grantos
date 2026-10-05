# Saved-grant dashboard and checklists

Opportunities includes the optional `suggested=1` profile filter. The former
`/app/matches` URL redirects with its existing filters preserved. The dashboard
contains only saved grants, upcoming deadlines (30 days), and incomplete tasks;
past deadlines and past-due tasks appear separately. Task dates use the Eastern
calendar. No inferred grant deadlines are introduced.

Manual checklists are free. Draft generation requires workspace `plan='paid'`.
All workspaces default to free; there is no subscription checkout yet. A server
administrator with database access can change a workspace using:

```sh
npm run set-plan -- <workspace UUID> paid
npm run set-plan -- <workspace UUID> free
```

This command records a plan-change audit event. Membership roles, including owner,
do not permit changing paid entitlement through the app. Downgrade preserves all
tasks and draft review; only new AI requests are blocked. Unsaving a grant hides
tasks without deleting them. Resaving restores the checklist.

## AI and worker setup

Configure `OPENAI_API_KEY` and `OPENAI_CHECKLIST_MODEL` as server secrets on both the
web service and worker. Use a Responses API model supporting Structured Outputs.
Do not put credentials in the repository. Generation remains unavailable until
both are configured. Only public grant text is sent to OpenAI (`store:false`),
never profiles, private notes, account details, or existing tasks.

Run `npm run worker` as a separate long-running Railway service using the same
`DATABASE_URL`. Build with `pnpm install`; start with `pnpm run worker`; no public
domain is needed. Apply migrations on the web service before the worker starts.
The worker claims jobs atomically with SKIP LOCKED, polls every five seconds,
and marks interrupted jobs failed after ten minutes. Graceful stop completes
the current job. Logs include job IDs and state only, without source text or keys.

One job can be active per workspace/grant. Requests are serialized by workspace
and limited to ten per UTC day, including failed requests. Draft confirmation is
transactional and idempotent. New drafts never replace existing tasks. Select
items and edit them before confirming; draft edits are submitted at confirmation.
Unconfirmed items never enter the dashboard. AI-generated tasks preserve source
URL, excerpt, and uncertainty even when edited.

The reader checks public DNS and pins the connection to the checked address,
blocks local/private/reserved addresses, and allows same-origin HTTPS redirects
only (three per page). It visits at most five relevant official pages, uses a
12-second request timeout and 4 MB per response, reads at most 25 PDF pages, and
limits extracted text to 24,000 characters per source. Scanned PDFs, login-only
pages, JavaScript-only pages, and unsupported formats yield warnings or a clear
failure. Task and date evidence is checked against retrieved text. Users still
review completeness and meaning before confirming; extraction is not a guarantee.

## Validation and rollout

Run `npm test` against a development database and `npm run build`. Database tests
create an isolated schema inside a rollback transaction. Deploy additive migration
005 before the new web and worker builds. Smoke-test free manual tasks, profile
filter retention, legacy redirect, dashboard overdue/empty states, and the paid
configuration notice. With a securely configured API key, enable a paid test
workspace and verify real generation, editable drafts, and confirmation before
making AI available to customers. No paid workspace is enabled automatically.
