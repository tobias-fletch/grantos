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

Milestone 1 now supports registration with bcrypt-hashed credentials, a personal workspace and owner membership, persisted onboarding, a protected dashboard, and logout/login. Funding discovery, pipeline tools, and dashboard metrics remain placeholders for later milestones. This is a development foundation, not a production launch.

## Run locally

Requires Node.js 22+, pnpm 10.18.0, and PostgreSQL (or Docker).

1. Run `pnpm install --frozen-lockfile`.
2. Copy `.env.example` to `.env.local`. Set `DATABASE_URL` for your development database and generate `AUTH_SECRET` with `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`. Never commit `.env.local`.
3. Start PostgreSQL. With Docker, run `docker compose up -d postgres`; the example connection URL matches that local service. For an existing PostgreSQL installation, create a separate development database and use its connection URL.
4. Run `pnpm migrate`.
5. Run `pnpm dev --hostname 127.0.0.1` and open http://localhost:3000.

Run `pnpm build` and `pnpm typecheck` to validate changes.

### Milestone 1 acceptance check

- Signed-out visits to `/app/dashboard` redirect to login.
- Registration creates a user with a bcrypt hash, personal workspace, owner membership, profile, and audit event in one transaction.
- Onboarding saves location, applicant type, and funding interests before opening the dashboard.
- Logout removes the session; valid credentials restore access to the same workspace.
- Incorrect credentials and invalid/duplicate registration show an error instead of an application crash.

Do not use real personal data in development testing. Before a public launch, add production controls including rate limiting, account recovery, email verification, and operational monitoring.

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
