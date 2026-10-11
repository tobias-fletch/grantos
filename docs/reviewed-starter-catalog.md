# Reviewed starter catalog: isolated staging only

This is an offline, explicit import of public-source research into actual opportunity and evidence rows. It does not fetch websites, create accounts, submit applications, contact funders, or write to production. The default command is an offline dry-run with zero database connections.

```sh
node --import tsx scripts/import-reviewed-starter.ts --dry-run
STAGING_DATABASE_URL=postgresql://…/grantos_staging \
STAGING_CONFIRMATION=grantos-isolated-staging \
node --import tsx scripts/import-reviewed-starter.ts --apply --append-existing-evidence
```

Run staging migrations first. The shared database guard requires a dedicated database name containing a separate `staging` token, the explicit confirmation, and refuses a supplied production database identity. Environment naming is an operator attestation, not proof of provider isolation. Verify the separate provider project/database and least-privilege role before applying. The command never reads `.env.local`, never falls back to `DATABASE_URL`, and never prints the connection string. No reviewer/editor account or persistent credential is created.

## Research boundary

The committed manifest contains 20 grant/fellowship records: nine New York-focused/available programs and eleven Louisiana-focused/available programs. Some programs are nationwide/international; a funder's address is not eligibility. New York FlexTech cost-share assistance and Louisiana training reimbursements are excluded from this grant count. No loans are imported. Future opportunities can remain upcoming without actionable current-cycle guidance.

These are partial assistant-reviewed public-source records, not human verification. `verification_status` remains `needs_verification`; human verification timestamps stay null. Exact quoted requirements are distinguished from prose research summaries. Source snapshots explicitly contain excerpts only, not complete pages. A cited source with no captured quote has an empty excerpt body and cannot support a requirement. Application form access limitations, source conflicts and missing information remain in the manifest and opportunity provenance. Required documents, full questions, fees, matching funds and complete eligibility are not invented from silence.

Amounts are deliberately not populated: source request ranges, cost shares and conditional award figures cannot safely be represented as guaranteed grant award minima/maxima. Applicant-type tags remain empty and incomplete. Location coverage uses restricted rules and separate applicant versus project/service prose; it does not imply statewide applicant residence eligibility. The app's project-fit result remains eligibility-needs-confirmation.

## Safeguards

- Strict schema rejects unknown keys, duplicate identities, malformed URLs/dates, stale/future research, unsupported requirement text and scopes, unlinked application URLs, stale active cycles, and loan programs.
- The stored application closing date is the source-backed application deadline, never a project end date or artificial year-end marker. Exact time/timezone, if evidenced, remains quoted guidance; otherwise it is unknown.
- Renderer independently enforces current-cycle/freshness, same-publisher trusted evidence, latest snapshots, explicit application links and field conflicts. Cross-publisher supporting sources remain audited but cannot silently broaden runtime trust.
- Existing canonical URLs, canonical aliases, same-name/same-funder records and prior starter keys are skipped wholesale. This preserves manual changes, locked fields, guidance, publication state, source settings and snapshots. Changed research is reported for editorial review; it is never automatically merged.
- Shared supporting URLs do not merge distinct programs. Program-specific portal identities distinguish the two Arts Council of Greater Baton Rouge grants. Shared excerpt snapshots are consolidated while per-program facts remain separate.
- New snapshots preserve their original source-check time. Repeated imports do not refresh evidence timestamps or create duplicate guidance. Per-field history and import events retain provenance and manifest hashes. No audit row is rewritten by this importer.
- Entire apply runs in one transaction under the existing catalog advisory lock. An error rolls back the import.

The JSON apply report lists every inserted, unchanged or skipped-existing record. `currentGuidance` for skipped/unchanged records is zero because the importer did not add or revalidate any guidance; this is not a claim that an existing guide is absent. Review skipped entries separately before claiming complete staging coverage. Never equate the manifest's 20 reviewed entries with 20 newly inserted rows.

## Optional existing-record evidence

`--append-existing-evidence` requires `--apply`. It adds source evidence only when an existing visible record has no locks/conflicts, pending source changes, discontinued monitoring, changed known deadline, prior source snapshots at any incoming URL, or research conflicts. All opportunity fields stay byte-for-byte unchanged. No existing guidance or snapshot is rewritten or superseded. A distinct immutable append audit detects repeats and changed reviews. New records also refuse source snapshots that would supersede incompatible existing evidence. Skipped cases require separate editorial reconciliation.

A successfully completed exact manifest has an immutable completion marker. Later restarts return an unchanged no-op without refreshing evidence, even after its dates expire. New or changed manifests still require fresh validation; runtime guides independently expire. This prevents routine restarts from failing when a previously imported application deadline passes.

## Local acceptance, 2026-10-11

The isolated local `grantos_staging` database received 17 new opportunities and safe evidence-only additions to 3 seeded programs (Rauschenberg Medical Emergency, FCA Emergency, Pollock-Krasner). A full database-backed renderer check found 23 current source facts across all 20 programs. Repeating the import returned 20 unchanged results. No production database was accessed. Editorial coverage: 14 arts/craft programs, 1 energy program, 1 legal-services grant, 1 economic-mobility nonprofit grant, 1 emergency nonprofit-facility fund, and 2 early-learning/literacy programs. These are descriptive groupings, not verified applicant-type tags. Manifest timing: 10 nonrolling open, 7 rolling open, 3 upcoming; these are researched statuses, not proof that a particular applicant is eligible.

## Checks

`tests/reviewed-starter.test.ts` covers schema failure cases, honest assistant-review provenance, field conflicts and expiry, database idempotency, retained manual corrections/locks, and distinct programs sharing supporting URLs. Database tests require an isolated loopback database and use a transaction-scoped random schema. Run the complete database suite serially with `npm run test:ci`.

## Evidence enrichment revision

After the base import, run:

```sh
node --import tsx scripts/enrich-reviewed-guidance.ts --dry-run
STAGING_DATABASE_URL=postgresql://…/grantos_staging \
STAGING_CONFIRMATION=grantos-isolated-staging \
node --import tsx scripts/enrich-reviewed-guidance.ts --apply
```

The separate `data/reviewed-starter-guidance.json` revision expands inspected public instructions. It applies only to programs already recorded by the reviewed starter import. It never changes opportunity fields, user applications, notes, tasks, manual locks, or human-reviewed guidance. Every previous source quote and observed link must survive exactly. Original snapshots remain unchanged; new snapshots and before/after evidence audits are appended. Protected, changed, unrelated or incompatible shared-source records are refused rather than overwritten.

An exact, recorded canonical program-page link may authorize an external application form or PDF. One same-publisher, non-directory guideline page may intervene. Both links must be recorded exactly, every snapshot must be current/latest, and the final external target must have inspected evidence. External intermediates, arbitrary third-party domains, portal directory inference and longer chains are rejected. This changes display-time evidence checks only; it never fetches URLs or relaxes crawler/network restrictions. The recorded authority chain appears beside source evidence.

A narrow audited refinement of assistant-created conflict scopes preserves unresolved discrepancies without suppressing unrelated documents. For example, LMCC work-sample password-expiry disagreement stays unresolved while an independently supported CV requirement can appear. Human/manual conflict state is never refined automatically. The former Shaw post-award use condition is withdrawn from selection criteria, with its original evidence retained. Post-award reports are not shown as application prerequisites. Bare word limits lacking question labels and unlabeled headings are omitted.

Migration 040 separates source fetch time from immutable ingestion recording time. Equal authentic fetch times no longer choose the latest excerpt revision by random UUID order. Recording time is used only as a tie-breaker, never to freshen source evidence. Legacy rows use source fetch time as an explicitly unavailable-recording-time fallback.

### Enriched local acceptance

On 2026-10-11, all 20 programs rendered 101 evidence items: 40 document constraints, 17 deadline facts, 15 application steps, 14 explicit application routes, 8 eligibility fragments and 7 question/limit excerpts. These are partial sourced facts, not complete or universally applicable checklists. Twenty program-source links remain available. Programs without a current verified portal retain their official program/contact route.

Examples of honest remaining limits:

- The upcoming NYFA medical/dancer cycles publish submission instructions, but no current live form link was established.
- Louisiana Bar Foundation CPP is contact-first; no application form or attachment list was established.
- Powers/Shaw public portals do not establish a complete authenticated required-field checklist.
- CERF Get Ready's future cycle and conflicting award amount remain explicit; no amount is silently selected.
- Recipient-specific LMCC documents retain their exact branch scope. NYFA session/year conflicts remain unresolved.

Focused acceptance passed 28 tests, including database-backed preservation of every opportunity column and every old snapshot, tied source timestamps, expiry-safe exact-manifest no-ops, source-chain bounds, malformed URLs, application-start idempotency and private provenance retention. Full release CI remains the final publication gate.
