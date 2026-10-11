# US grant search: matching and evidence

Search uses the entered city/state/country consistently, including when it differs
from the saved applicant profile. Supported broader geographic rules include
statewide and nationwide eligibility. A borough restriction is not satisfied by
knowing only the city. Search location does not establish actual residence,
project location, residency duration, nonprofit status, or other grant conditions.

## What a result means

- **Potential match:** current reviewed/official evidence supports the recorded
  applicant type and location. All other requirements still need checking.
- **Eligibility needs checking:** requirements, applicant details, source evidence,
  or source freshness are incomplete. Category overlap alone is not eligibility.
- **Excluded:** recorded geographic rules conflict, or a complete applicant-type
  list establishes a disjoint legal type. Extracted keyword tags are not treated
  as exhaustive. Organization/role overlap remains uncertain.

The location toggle filters geographic matches, not certified full eligibility.
Known hard conflicts are removed before counts and pagination. Unknown applicant
requirements remain visible for investigation, even with an applicant selection.

Recommended ordering prefers current reviewed or recognized official evidence,
then known profile matches and round availability. “Current” is a conservative
90-day evidence-age bound, additionally honoring overdue source monitoring; it
is not a guarantee that the funder has made no subsequent changes. A record's
mere presence in the catalog is not verification.

Open/closed/upcoming/unknown describes the application round separately from
eligibility. Undated nonrolling listings cannot claim to be open. Rolling
listings need current trusted evidence. Annual recurrence does not invent the
next round, deadline, or discipline cycle.

## Regression reference programs

These are synthetic rule fixtures based on official program requirements checked
on October 11, 2026, not newly imported or independently maintained grant records.

- [LMCC Creative Engagement](https://lmcc.net/resources/manhattan-arts-grants/creative-engagement/): Manhattan applicant and public Manhattan project requirements.
- [Brooklyn Arts Fund](https://www.brooklynartscouncil.org/what-we-do/grants/brooklyn-arts-fund): Brooklyn applicant and public Brooklyn project requirements.
- [NEA Grants for Arts Projects](https://www.arts.gov/grants/grants-for-arts-projects): organizational eligibility does not make individual artists eligible.
- [NYSCA/NYFA Artist Fellowship](https://www.nyfa.org/awards-grants/nysca-nyfa-artist-fellowship/): a recurring fellowship is not evidence that a music cycle is currently open.

## Coverage limits

This change corrects matching; it does not expand the source catalog. Current
live structured providers are Grants.gov and the California Grants Portal.
Outside that coverage, a useful city-specific list depends on existing catalog
records and research of relevant official local/state funders. Nationwide access,
local supply, completeness, and a minimum result count are not guaranteed.
Unknown records must not be padded into “confirmed eligible” results.

No migrations, production data changes, account/permission changes, paid AI
activation, or deployment are part of this patch. Existing private application
access and manual-field-lock behavior are preserved.
