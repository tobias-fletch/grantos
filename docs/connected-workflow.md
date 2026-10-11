# Connected project workflow

## What is included

1. Create or edit a private project in **Projects**. Optional writing and fit details record the applicant's declared legal status, the project's service area, beneficiaries, activities, intended outcomes and supporting evidence. Applicant address and project/service geography remain separate.
2. Choose **Find funding for this project**. Search keeps the project association while adjusting filters, inspecting a result or clearing filters. Search still uses public applicant/location/interests filters; private project narratives, evidence and planning amounts are not sent to providers or AI.
3. **Save for this project** atomically saves the result and connects the project. Repeated saves reuse the same application. An application already connected to another project is never reassigned from search; open it and explicitly review/change its project instead.
4. The application displays **Project fit** with recorded source facts, source dates and unresolved requirements. It makes no eligibility guarantee. Geographic rules do not establish whether a funder means residence, registration, delivery or beneficiaries, so this distinction remains a confirmation step. Unsupported external/lead records remain unknown.
5. **Create draft starters** uses local templates and explicitly entered project facts. Bracketed prompts identify missing information. Starters are working outlines, not verified funder questions or submission-ready responses. They can be edited through the existing version-checked question editor. Creating starters again does not replace, recreate or duplicate them, even after edits or archival. Updating a project never overwrites application answers.
6. Record official requirements, questions, budget rows, tasks, personal target dates and stages using existing controls. The independent preparation summary counts unresolved eligibility, draft gaps, over-limit responses and open tasks; final source and submission review is always required. Application cards show the connected project and searching My grants includes the project name.

## Storage and rollout

Apply migration `037_project_context.sql` before serving this code, through the project's existing migration command. It adds `funding_projects.context` as a non-null JSON object with an empty-object default. Existing projects remain valid and legacy saves without context preserve prior context. This change does not enable new provider calls, workers, recurring jobs or model services.

Application project links use the existing same-workspace composite foreign key. Search saves validate the authenticated current workspace and writable role, lock consistently with existing saves, and commit project association with the save. Existing manual eligibility, budget, archive/restore, tasks and status features remain available.

## Verification

- `pnpm typecheck`
- `pnpm build`
- With an isolated local PostgreSQL database and disposable `AUTH_SECRET`: `node --import tsx --test --test-concurrency=1 tests/*.test.ts`
- New focused coverage: `connected-workflow.test.ts`, `project-context.test.ts`, `project-fit.test.ts`, and `writing.test.ts`.
- The release backup/restore test additionally requires `pg_dump` and `pg_restore`; embedded PostgreSQL packages may not contain them.

No code in this milestone submits applications, contacts funders or creates an external AI draft request.
