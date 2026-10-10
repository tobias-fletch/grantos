# Project profiles: first application-preparation phase

Migration: `030_funding_projects.sql` (additive). Migration 029 from the preceding examples feature must also be present. The combined release health check requires 031.

`/app/projects` provides workspace-private project profiles for all existing applicant types. Users can create, edit, archive and restore projects. Viewers can read and search but cannot write. Applicant location, interests and type become editable search filters; private narrative, budget goal and personal target date are not sent to discovery or AI. Goals are USD planning figures, not minimum-award filters. Existing funding profiles and applications remain unchanged.

Search explanations honor an explicitly selected applicant type rather than the workspace default. Matching remains partial: enrollment, business history, sponsorship, institutional approval and other requirements still need source checks. Migration 031 adds manual question drafting, budgets, and project-to-application linking as described below. AI writing assistance remains deferred.

Local backup and migration completed before testing. No hosted migration or deployment performed. On release, grant the existing restricted application role SELECT, INSERT, UPDATE on funding_projects and the backup role SELECT; do not grant discovery access to private project data. Use the existing migration role for DDL. Check new table privileges using the deployed role before rollout. Existing public-catalog transfer must not include funding_projects.

## Application preparation (migration 031)

Saved applications can link/unlink one workspace-owned project. Project archival preserves links; linking another workspace's project is blocked in server authorization and by a composite database foreign key. Private preparation items live under the application: eligibility assessments, question drafts with optional word limits, and USD expense lines. Archive/restore retains item content. Updates use version checks to reject stale edits; existing application history records mutations. Catalog facts, notes, tasks and requested amounts are unchanged by the worksheet.

Deploy migration 031_application_preparation.sql before this app version. The application role needs SELECT, INSERT, UPDATE on application_preparation; the backup role needs SELECT. Existing applications table privileges cover project_id. Discovery must not receive private preparation access. No deployment or paid calls occurred during this local implementation.

Eligibility requirements and application questions are entered manually from official instructions in this phase. Assessments are not funder verification. Word count is whitespace-based; follow the funder's counting rules. Budget supports USD only and does not synchronize the application's requested amount. AI writing, file exports, automatic question extraction and submission remain deferred.
