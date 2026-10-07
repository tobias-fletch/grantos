# GrantOS

**Find it. Qualify it. Apply for it. Track it. Get funded.**

GrantOS is a grant discovery and funding-management SaaS for independent creators, nonprofits, small organizations, businesses, researchers, and grant professionals.

The initial launch focuses especially on NYC artists, musicians, filmmakers, writers, cultural workers, and small nonprofits while keeping the underlying architecture general enough for national and international funding opportunities.

## Product vision

GrantOS combines two systems:

1. **Grant discovery** — find relevant, verified funding opportunities and understand likely eligibility.
2. **Grant management** — turn an opportunity into an application workspace with deadlines, tasks, reusable materials, budgets, notes, and reporting.

The goal is to replace fragmented grant workflows spread across spreadsheets, bookmarks, calendars, documents, email reminders, and memory.

## Initial technology

- Next.js
- React
- TypeScript
- PostgreSQL
- Tailwind CSS
- Workspace-based multi-tenancy
- Server-side authorization
- Database migrations

## Phase 1 — Sellable product

The first production release is planned around:

- Authentication
- Individual and organization workspaces
- Creator and organization profiles
- Grant opportunity database
- Opportunity search and filtering
- NYC creator funding filters
- Saved opportunities
- Grant/application pipeline
- Application workspaces
- Deadline tracking
- Task management
- Reusable application asset library
- Budget builder
- Funding dashboard
- CSV import/export

The first version should work particularly well for independent artists, musicians, and small nonprofits.

## Data quality principles

GrantOS must not invent funding opportunities.

Published opportunities should retain provenance and freshness metadata including:

- Official source URL
- Source organization
- Discovery/check timestamps
- Verification timestamp and status
- Deadline confidence
- Active/closed state

When a recurring opportunity has not announced its next deadline, GrantOS should say so rather than infer or fabricate a future date.

## Security principles

GrantOS is designed around isolated workspaces. Private application data, documents, budgets, contacts, and other user content must only be accessible to authorized workspace members.

Important authorization rules are enforced on the server/data layer rather than relying on UI filtering.

## Development status

### Milestone 1 — Foundation

Repository initialized.

The Milestone 1 application foundation is being added next, including:

- Next.js/TypeScript project structure
- PostgreSQL migrations
- Workspace and membership model
- Profile/onboarding model
- Opportunity/funder schema
- Verification/freshness fields
- Audit logging foundation
- Dashboard shell
- Health endpoint

The individual-user registration, login, onboarding, persistence, and protected
dashboard flow is implemented and verified in development. Shared organization
workflows and commercial-launch hardening remain outstanding. See
[the milestone review](docs/milestone-review.md) for the audit and verification scope.

### Milestone 2 — Daily discovery and source review

The preview includes a sourced grant catalog, filters, private saves, and profile
suggestions. Daily discovery follows registered funder directories and requirements
at 6:00 a.m. Eastern, with catch-up when the local worker restarts. Recognizable
grant leads publish automatically to the free catalog with an unverified label
and unknown fields. Ambiguous pages and changes to reviewed facts require editors.

Run npm run dev to start the web app and discovery worker together. PostgreSQL
must be running. See [daily discovery setup and acceptance](docs/discovery-research.md)
for source management, local scheduling, coverage limits and verification results.
Tavily/Brave research is disabled and reserved for a future paid feature.

Run `npm test` against a development PostgreSQL connection for repeatable database
and authorization tests. Test fixtures are isolated and rolled back.

## Development rule

GrantOS is intended to become commercial software, not a prototype.

Visible functionality should be real: forms should persist data, filters should actually filter, calculations should be deterministic, private data should be protected, and unfinished/mock functionality should be clearly identified.

At each milestone we will verify:

- Tests
- Database persistence
- Authorization boundaries
- Security issues
- Unfinished/mock functionality
- Mobile and desktop usability
- Remaining work before accepting paying customers

## Current roadmap

**Milestone 1:** Foundation and workspace architecture  
**Milestone 2:** Funding opportunity database and search  
**Milestone 3:** Personal grant pipeline and application workspaces  
**Milestone 4:** Reusable application asset library  
**Milestone 5:** Budgets, funding analytics, and goals  
**Milestone 6:** Billing, notifications, operational hardening, and commercial launch

---

GrantOS is being built around one question:

> Does this increase the user's probability of discovering, applying for, winning, or successfully managing funding?

## Saved-grant dashboard and checklists

Discovery now has a profile-only filter within Opportunities. The dashboard focuses on saved grants, deadlines, and incomplete tasks. Manual checklists are free; AI drafts require administrator-enabled paid access and server configuration. See [checklist setup and validation](docs/checklists.md).

### Milestone 3 — Private application tracking

Catalog saves and proposed candidates now open private application records with
stages, notes, personal dates, USD amounts, manual tasks, history and archiving.
The dashboard focuses on active work. Publication and duplicate merges preserve
application progress. See [application setup and acceptance](docs/applications.md).

## Invite-only beta release preparation

Registration requires a personal email invitation. Hosted accounts must be active
and email-verified. Owner/editor authorization uses explicit verified database
roles; CATALOG_EDITOR_EMAILS no longer grants privileges. Password recovery,
shared throttling and session revocation are implemented. See
[beta release instructions](docs/beta-release.md) for Render/Neon setup, sender
verification, restricted crawler credentials, encrypted backups and release gates.
