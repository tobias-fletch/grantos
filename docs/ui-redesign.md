# Material UI workspace

The local redesign uses Material UI with the official Next.js App Router cache
provider. Light, dark, and system modes use CSS variables and a pre-hydration
color-scheme script; the browser remembers the choice. No account setting or
database migration is required for appearance.

## Navigation and data

- Home combines quick search, profile-ranked grants, active applications, tasks,
  and personal target dates.
- Find grants merges catalog records and likely leads before pagination. Repeated
  `category` URL parameters mean OR; other explicit filters remain AND. Legacy
  single-category URLs continue working. Unknown facts do not match precise filters.
- My grants uses existing private application records. The old Saved grants route
  redirects to its Saved stage. Existing application IDs and history are retained.
- Funding profile edits existing onboarding fields and preserves the original
  completion timestamp. Viewer roles cannot write.
- Admin tools, source import, support, and logout are in the account menu.

## Ranking and previews

Recommended ordering compares known conflicts, supported profile matches, keyword
relevance, status, deadline, title, and ID. Missing facts earn no match credit.
Crawler-inherited categories are source context, not confirmed program matches.
Explicit geography exclusions and country/state/city/borough/county/postal limits
are considered before a location match is claimed.

The preview URL preserves the search parameters, and its MUI drawer manages focus
and Escape. Dedicated grant pages remain available. Saving stays in context and
links to the existing or new private application record; it never publishes a lead.

For this small beta, the server ranks the complete filtered set in memory, then
paginates. This avoids a hidden cap or page-local recommendation ordering. If the
catalog grows substantially, move the same ranking and canonical deduplication
into SQL rather than imposing a silent results cap. No live web or AI requests
are performed by this interface.

## Verification and release

Regression tests cover multiselect parsing, category OR queries, stable combined
pagination, private save references, unknown/source-derived facts, and geography
ranking. Existing account, crawler, provider-disable, save, task, and archival
tests remain applicable.

Manual local checks cover saving from a preview, note/task persistence, completion,
stage changes, archive/restore, profile saving, both themes, and widths of 360,
768, and 1440 pixels. Preview Escape restores focus and browser Back preserves
the search. Temporary application test data is removed after verification.

The UI is a local preview. Review the appearance before pushing or deploying;
cloud workflows, credentials, workspace plans, and billing are unchanged.

## Funding focus research (October 7, 2026)

Population/community focus filters complement the subject categories. Added veterans
and military families, people with disabilities, Indigenous/tribal communities,
immigrants/refugees, children/youth, older adults, rural communities, and low-income
communities based on these primary sources:

- [VA grant programs](https://grants.gov/learn-grants/grant-making-agencies/u-s-department-of-veterans-affairs-va): veterans, military families, rural/underserved communities.
- [First Nations grantmaking](https://www.firstnations.org/grantmaking/): tribes, Native organizations and individuals.
- [USDA Rural Development](https://www.rd.usda.gov/programs-services/all-programs): rural community programs and income-targeted assistance.
- [New York Community Trust funding areas](https://thenytrust.org/nonprofits/): youth, older adults, disability, immigrant services.

These are source-text discovery filters, not certified eligibility classifications.
They include programs serving a population as well as programs for applicants from
that population. They do not infer or store a user's identity. Multiple selections
use OR, with other filters still applied. Empty matches remain empty; adding a
filter does not import new grants or enable paid search. Tests cover synonyms and
obvious false positives (senior researchers, native plants, veterinary research).
