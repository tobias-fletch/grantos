# Live official-source search

`LIVE_GRANT_SEARCH=true` enables the single Find grants view. The flag defaults off.
The legacy search remains available when it is off. Local testing enables it only
in the ignored `.env.local`; that file must never be committed.

## Behavior

- Catalog matches render first. A deliberate Search submission creates a private,
  workspace-scoped, one-day session. Navigation reuses its request ID.
- An awaited HTTP batch runs at most two providers concurrently. Provider requests
  have a shared 12-second abort deadline inside the 15-second route target. Database
  checkpoints are awaited before returning; no detached web requests are launched.
- Grants.gov visits posted, forecasted, then closed/archived batches. California
  orders active records first. Both retain provider pagination; there is no ten-match
  stop. A batch stages 20 records, with continuation after timeouts or quota limits.
- Per-account limits are 20 starts and 60 batches/hour. Shared provider limits are
  30 requests/minute for opportunity APIs and 20/minute for award APIs. Failures
  back off for one minute. Equivalent in-flight requests share leased cache entries.
- Provider totals refer to queried status batches before local eligibility filters.
  Retrieved API IDs and displayed deduplicated matches are separate counts.
- Unknown geography stays in **Location eligibility needs checking**. Explicit
  conflicts are excluded. Provider coverage does not establish applicant eligibility.
- Only sanitized keywords and supported category/legal-applicant criteria go to discovery APIs, never profile ZIP fields,
  drafts, application notes, or contact fields. Known email/ZIP/phone patterns are
  stripped from keyword text as an additional safeguard.
- External results are saveable through the existing application workflow. Catalog
  source-link triggers attach later publication without replacing notes or tasks.
  Existing catalog records take precedence, including hidden records and field locks.
- The existing provider worker imports up to ten newly retrieved records per provider
  invocation through `importGrant` and its evidence/lock rules. This reuses the lease;
  it does not add network calls, change schedules, or enable paid providers.
- NIH and NSF award lookups are lazy and require an explicit supported program
  identifier. No keyword-based association is presented as a winning project.
  Related NIH sample-library links are labeled as broader guidance. Existing official
  sample application evidence remains available. No new image rights are assumed.

Expired sessions are pruned for their workspace on the next search. Each start also
prunes at most 100 unleased provider-cache entries older than seven days. Public
external identities persist so saved records remain resolvable.

## Release steps

1. Create and authenticate an encrypted target-database backup.
2. Apply additive migrations `034_live_search.sql` and `035_live_search_order.sql`
   with the migration role. Health requires both. Do not rerun initial role creation.
3. Grant the existing application role SELECT/INSERT/UPDATE/DELETE on
   `grant_search_sessions`, `grant_search_progress`, `grant_search_results`, and
   `grant_search_requests`; SELECT/INSERT/UPDATE on `grant_external_results`.
   Grant the existing backup role SELECT on these five tables.
4. Grant the existing discovery role SELECT and UPDATE on `grant_external_results`
   only. It must have no access to private search sessions, progress, associations,
   request cache, project profiles, or application preparation. Existing public
   catalog import grants remain unchanged. Verify through actual restricted connections.
5. Deploy app and worker together with the flag off. Check health and worker access.
6. Enable the flag for a controlled trial. Compare provider statuses, request latency,
   duplicate rates, and successful saves before broader availability. Disabling the
   flag restores the prior search; retain additive tables and saved applications.

## Local verification and limits

The final local run passed all 123 tests and the production build. Tests cover 25-result pagination, provider failure
isolation, shared request reuse, stale-lease recovery, workspace access, viewer saves,
and saving before catalog publication. Existing geography, recurrence, locks, and
application preservation suites remain in place.

A bounded real API matrix checked fellowship, education, arts, and small-business
keywords. Initial all-status queries returned historical results first, leading to
the open-first retrieval change. Raw totals are not eligibility counts. A local
New Orleans education search retrieved 40 API records in the first batch; only two
catalog programs had confirmed geographic eligibility, while additional results
remained explicitly unconfirmed. The local official-site queue was full; live APIs
continued independently. These observations do not establish production coverage.

The final bounded matrix sampled three records per source for students, educators,
professionals, and small businesses using New Orleans/Louisiana. Of 24 checked records,
13 passed the other filters but still needed geographic eligibility checking; none
established a confirmed local match. Provider requests took 248–1,311 ms, excluding
page rendering and cold starts. These are samples, not complete search totals.
Real NIH lookup for PAR-25-274 returned ten explicitly associated funded projects;
NSF reference code 7568 returned ten related awards. Broader NSF relationships are
labeled accordingly. Public sample applications are not inferred from award records.

Desktop and mobile views were checked in both themes. A live API result was saved,
opened in application preparation, and archived through the UI. Date-only deadlines
now retain their calendar day instead of shifting with the display timezone.
Unknown geography is included by default with a clear Needs checking label; explicit
location-only filters and legacy URLs remain respected.

Current limitations: source metadata often omits geography and exact legal-applicant
requirements; such fields remain unknown. Many programs have no exact award identifier
or public application example. Provider timeouts, upstream limits, database delays,
and Render cold starts can affect latency. No minimum match count is guaranteed.
