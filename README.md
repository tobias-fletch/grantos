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

Authentication persistence and production authorization flows are **not yet complete** and should not be treated as working functionality until implemented and tested.

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
