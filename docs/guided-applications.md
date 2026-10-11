# Guided grant applications

This milestone extends the existing profile, projects, opportunities and private application workspace. It does not create a second onboarding or application system.

## Journey

1. Sign in through the existing authentication flow. Incomplete profiles go to quick setup; existing users retain access to their workspace.
2. Quick setup records the applicant profile, a funding purpose and the project's delivery/service area separately from applicant residence or registration. First completion opens project-scoped opportunities. Interrupted setup can be resumed; repeated submissions must not overwrite an existing project or application draft.
3. Inspect ranked opportunities and their recorded match reasons. A recommendation is not an eligibility decision. Missing eligibility, uncertain geographic interpretation and unavailable current rounds remain visible.
4. Review **How to apply** and the official source. Requirements need source-level support, not merely a program-level verification badge. Unsupported fields stay unknown. Source data and private working notes are distinct.
5. **Start application** opens the existing private application workspace and connects the selected project. It must reuse prior saved work, preserve archived records and avoid duplicating requirements or drafts on repeat clicks. Supported copied facts retain source provenance. General writing starters remain an explicit separate action and are not presented as funder questions.
6. Use the local writing coach inside each question editor for structure/style prompts, word limits, numbers to verify and evidence review. Compare source-backed published criteria manually, and explore clearly labeled funded-work/reference resources. Existing prose is never automatically replaced. See [writing tools](writing-tools.md).
7. Return to the dashboard for a next action derived from saved state: connect a project, resolve requirements, complete an open task, revise a draft, or review the actual application. Final review is always required.

## Submission and privacy

GrantOS does not submit applications. To newly record the submitted stage, the user must explicitly confirm they have submitted through the funder's required process. Official email, offline or contact-first processes are supported by this wording. Following a link, finishing a checklist or creating a workspace does not record a submission.

This milestone does not send private project narratives or drafts to AI services or funders, create external accounts, accept external agreements, or change production data. Private tasks attached to externally sourced applications appear on the dashboard alongside catalog-backed work.

## Validation and limits

Run typecheck and build, then the full serial suite against an isolated local PostgreSQL fixture. The backup/restore release test also requires `pg_dump` and `pg_restore`, which are absent from the embedded PostgreSQL package used in the cloud fallback environment.

Browser interaction testing is blocked in this environment: the previous verified attempt hit denied Chromium socket creation and Next's network-interface `EPERM`. No browser pass or screenshot is claimed. Check first-login, interrupted setup, repeated Start clicks, back/forward navigation, application switching, edit/archive preservation and source-link navigation in a supported browser before release.

No deployment or production migration is included in this milestone.

### Browser release checklist (not yet run here)

- Sign in as a first-time applicant, save partial setup, leave and return, then finish setup. Confirm one associated project and project-scoped recommendations.
- Sign in as an existing user, visit profile, change profile-only fields and return to the dashboard. Existing project/application drafts must remain unchanged.
- Open a project-scoped grant, inspect known/unknown how-to-apply fields, follow the official link, return with browser Back, and start twice. Confirm one application and one copy of each supported requirement.
- Edit a copied requirement or draft, archive a requirement, repeat Start and verify neither edits nor archival are reset.
- Switch between two applications using client navigation. The stage selector must reflect the current application; submitted requires an explicit confirmation checkbox.
- Check a contact-first program and a program with a verified application portal separately. Missing portals must not be replaced with an invented Apply link.
- Use viewer and second-workspace accounts to verify private project/application access restrictions and disabled write controls.

## Rollout

Apply additive migrations `038_quick_setup.sql` and `039_application_guidance.sql` through the existing migration runner before serving this code. Migration 038 adds private resumable setup data and an explicit same-workspace project link without requiring existing users to repeat setup. No production migration was run.

## Guidance storage and explicit editorial authoring

Apply `039_application_guidance.sql` with the existing migration runner, after migration 038. It adds an append-only, retractable `opportunity_application_guidance` record for each reviewed fact; an immutable, one-time `application_guidance_imports` snapshot; and immutable `source_provenance` columns on preparation items and tasks. No new public catalog facts are seeded by this migration.

The server-side authoring entry points are `recordGuidanceReview(db, editorUserId, opportunityId, input)` and `revokeGuidanceReview(db, editorUserId, opportunityId, reviewId)` in `src/lib/applications/guidance-store.ts`. They enforce the existing active, verified catalog-editor account permission and use the catalog transaction lock. These are ingestion services, not a public write API; there is no unauthenticated endpoint or automatic research import.

A review input has `field` (`application_url`, `eligibility`, `document`, `step`, `deadline`, `fee`, `match`, `question`, or `criterion`), exact `value`, existing `snapshot_id`, exact `source_excerpt`, `source_section`, `applicant_scope`, `cycle`, and `period_end`. Cycle/end are explicitly nullable for undated/rolling guidance. The service derives source URL, reviewer identity and verification time rather than accepting them from the input. Requirement values and conditional applicant scope must occur verbatim in the cited source. An application URL must be a public HTTPS link explicitly captured in that official snapshot; an official link to a third-party portal is permitted. A contact-first instruction is stored as a `step`, never converted into an invented application URL. No form, email, payment, CAPTCHA, login or agreement is completed by this operation.

Before ingestion, a catalog editor must inspect the exact program and cycle and obtain its current source through the already approved catalog-evidence process. The snapshot must already be associated with that opportunity by a confirmed program identity/link and approved publisher domain. Evidence from directories, announcements, historical examples, unresolved associations, older snapshots, or other publishers is rejected. The source and review must be no more than 90 days old, with no future fetch dates or unresolved/expired cycle. All displayed details retain snapshot ID, excerpt, source URL, section, applicant scope, cycle, fetch time and (where reviewed) human verification time. Merely checking a page does not establish that all application requirements were verified.

The read model also accepts existing exact-source eligibility, deadline and rolling facts from trusted program evidence. It does not infer documents, fees, match, application portals, questions, word limits or submission steps from generic text. Conflicting evidence, pending source changes and discontinued programs withhold requirements. Unknown fee/match is never rendered as zero/no match. Application deadlines and personal target dates remain distinct; unverified deadline time/time zone remains explicit.

`Start application` requires the user to choose or retain an associated same-workspace active project. It reuses the existing save transaction and preparation editor, advances only a newly started saved application to preparing, and copies only supported eligibility/questions and document/step tasks. Applicant-route conditions and original text remain visible with immutable provenance. Other guidance stays in the read-only source card. Selection criteria are displayed for review and never turned into application questions. No general draft starter is created automatically. Existing manual writing and notes are not replaced. Repeated starts, including concurrent clicks, reuse the same application and import. Archived/terminal applications are reopened for viewing without changing their status or reseeding work.

A first start with no supported requirements still records an empty import. Later source changes are shown in the live How to apply card, but repeat Start deliberately does not refresh or recreate preparation rows, including archived rows or removed tasks. Add newly confirmed requirements with the normal editable controls after reviewing them. This boundary prevents a later source refresh from silently changing a working application.

The three real-source examples in `docs/guidance-source-examples.md` are reviewed research examples for local authoring/QA only. They do not seed production opportunities or claim full verification.

## Final local validation (2026-10-11)

- TypeScript check: passed.
- Production build: passed, including all application routes.
- Focused pure/render suite: 21/21 passed.
- Complete serial suite against isolated PostgreSQL: 194/195 passed; the only failure is the existing release backup/restore subprocess because this environment has neither `pg_dump` nor `pg_restore`. No test was skipped in the full run.
- Mid-seed failure tests cover both a new pooled transaction and a caller-owned transaction: partial saves/imports/tasks/history roll back, unrelated outer work survives, and retry succeeds. The shared transaction helper now uses unique savepoints.
- Interactive browser QA remains unrun because of the verified environment restrictions above.

The existing public catalog-transfer script intentionally does not transfer crawl snapshots, reviewer accounts or reviewed guidance. A fresh destination therefore needs its own approved source snapshots and editorial reviews before it can show these supported requirements. This milestone does not silently widen the transfer allowlist or copy private editorial identities.
