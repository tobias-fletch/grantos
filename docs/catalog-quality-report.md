# Local catalog quality report

Captured 2026-10-08T16:03:57.107Z. Local database only; no production data was inspected or changed for this report.

## Method

Compared program-v12 and program-v13 against the same frozen set of 173 published local listings, 160 of which had stored source bodies. No new network fetches were made for this comparison. These are counts of pages yielding supported parser output, not database completeness or unique programs. Related pages may describe the same program. The existing catalog was not bulk overwritten for this report.

## Parser comparison

| Field | Before | After | Change |
|---|---:|---:|---:|
| Application status | 29 | 29 | 0 |
| Fixed deadline | 4 | 4 | 0 |
| Rolling designation | 1 | 1 | 0 |
| Minimum award | 3 | 11 | 8 |
| Maximum award | 16 | 24 | 8 |
| Recurrence | 0 | 11 | 11 |
| Official categories | 0 | 4 | 4 |
| Eligibility notes | 21 | 21 | 0 |
| Applicant types | 3 | 3 | 0 |
| Geography | 0 | 0 | 0 |

Eleven pages gained extracted facts. The additions come from explicit annual FCA award descriptions and Northeast SARE Professional Development descriptions. No extra statuses, deadlines, applicant types or locations were found by these new rules. Unknown remains appropriate where evidence is absent.

## Representative evidence

- [Professional Development Grant Program](https://northeast.sare.org/Grants/Get-a-Grant/Professional-Development-Grant-Program): recurrence = annual; minimum = 30000; maximum = 150000.
- [Helen Frankenthaler Award for Painting](https://www.foundationforcontemporaryarts.org/grants/helen-frankenthaler-award-for-painting): recurrence = annual; minimum = 45000; maximum = 45000; categories = ["Visual Art"].
- [Roy Lichtenstein Award](https://www.foundationforcontemporaryarts.org/grants/roy-lichtenstein-award): recurrence = annual; minimum = 45000; maximum = 45000.
- [Professional Development Grant Program Overview](https://northeast.sare.org/grants/get-a-grant/grant-program-overview): recurrence = annual.
- [Alvin Lucier Award for Music](https://www.foundationforcontemporaryarts.org/grants/alvin-lucier-award): recurrence = annual; minimum = 45000; maximum = 45000; categories = ["Music"].
- [C.D. Wright Award for Poetry](https://www.foundationforcontemporaryarts.org/grants/cd-wright-award-for-poetry): recurrence = annual; minimum = 45000; maximum = 45000; categories = ["Writing / Literature"].

## Classification and safeguards

Regression fixtures reject grant-management/reporting pages, quoted grant roundups, office hours, contact pages, archives and directories as grant cards. Historical FCA award wording does not establish ongoing recurrence. Annual progress-report deadlines do not become application deadlines. Tests cover independent search pages/counts, legacy URLs, unknown-fact filters, retry/backoff transfer, completed-inventory continuation, category provenance restoration and existing private-work preservation.

## Rollout

New views/classification are immediate in the local app. Persistent catalog enrichment and reversible cleanup run through the worker after rollout, respecting its pause, lease and budget. The report does not claim those catalog mutations or a fresh source check occurred. Migrations through 023 and the updated discovery-role permissions are required; see catalog-maintenance.md. No push, deployment or hosted run was performed.

## Validation results (2026-10-08)

- Full automated suite: **97 passed, 0 failed**. Integration tests used disposable schemas in local PostgreSQL, not production.
- Optimized Next.js production build, including TypeScript validation: **passed**.
- Browser checks at 1440×1000 and 390×844: desktop/mobile search and admin layouts, light/dark themes, separate research tab, quick preview, full grant detail, duplicate decisions, and the detailed filter drawer. No horizontal page overflow was observed in sampled views. Multiple funding-focus selections remained selected until submission.
- Local unfiltered UI at handoff: **186 grant-program results and 4 research leads**. These counts combine eligible published records with recognizable pending candidates and suppress confirmed supporting content/aliases; they are not counts of newly published database rows.
- The local overview still reported a large due-URL backlog and no maintenance heartbeat. This pass did not run network maintenance, change global scheduling, or inspect production health. Parser improvements are ready for the worker, not evidence that bulk enrichment is already complete.
- Saves, notes, tasks, recurrence/date history, merge preservation, authorization and provider-disable regression tests remain in the full suite.
