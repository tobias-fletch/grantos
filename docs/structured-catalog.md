# Structured official grant imports

GrantOS reuses existing catalogs instead of treating every opportunity as an HTML extraction problem. The first adapters are Grants.gov search2/fetchOpportunity and California Grants Portal's daily CKAN dataset. No API key or new subscription is needed. Existing page research and private application tools remain available.

## Sources and rights

- Grants.gov: https://www.grants.gov/api/api-guide and https://www.grants.gov/api/terms-conditions. Public search/details endpoints; the required non-endorsement disclaimer appears in search and imported grant details.
- California: https://data.ca.gov/dataset/california-grants-portal. Dataset lists public-domain/no-restriction reuse. Pagination uses the linked official CKAN resource; source attribution remains visible.
- SBIR is deferred while its API reports maintenance. Candid contains award-history data, not a replacement for current opportunities. Instrumentl/public redistribution requires separate licensing confirmation. No commercial subscriptions or unauthorized scraping are enabled.

## Operation

The existing worker uses up to the first 10% of its time for imports, within the existing 20% discovery/search share. Maintenance retains its existing share. Each API request consumes the shared invocation budget; each provider is limited to 50 requests, throttled to 1.5 seconds, with a 20-second timeout and 4 MB response limit. No scheduling or spending changes.

Pages are staged durably before processing; each record and its remaining checkpoint commit together under the existing lease/catalog lock. API failures back off from 15 minutes to one day. Successful pages advance across runs. Completed scans restart the following day. Five due records per provider are rechecked per batch so closed opportunities do not depend on remaining in the active feed. California discovery selects active records; federal discovery selects posted/forecast opportunities. Partial scans are explicitly distinct from completion; offset-based upstream pagination can move between requests, so repeated scans provide convergence, not snapshot-complete coverage.

Provider IDs and source URLs preserve catalog IDs; exact title/funder collisions are withheld rather than merged by guesswork. Existing hidden/merged listings remain untouched. Field changes use existing evidence/history/lock operations. An omitted field does not erase a fact. Search recognizes structured records as programs even when titles omit “grant.” Federal location eligibility is not inferred from agency jurisdiction. California statewide geography is assigned only for an explicit statewide statement. Narrower or complex geography remains unknown. Institution eligibility never implies student eligibility. Award totals are not individual award ceilings. Loans/contracts are excluded. Forecasts remain upcoming; archive/closed feeds do not establish permanent discontinuation.

## Local acceptance and deployment handoff

1. Back up the database, then run `node scripts/migrate.mjs` to apply **032_structured_catalog.sql**.
2. Run `node --import tsx scripts/import-catalog.ts` for a two-minute local-only import; ordinary hosted imports run through the existing discovery worker after deployment.
3. Grant existing application and backup roles SELECT on `catalog_provider_sync,catalog_provider_records`. Grant the existing restricted discovery role SELECT, INSERT, UPDATE on those two tables and INSERT on `funders` for official agency identities. Existing public catalog/evidence permissions are still required; do not grant private-table access or rerun role creation. Verify with the actual restricted connections.
4. Run tests and production build before deploying. No new secrets or environment variables are needed.

Admin's Official data imports section shows staged rows, added/skipped counts, batch success, full scan completion, and retry errors. The existing Sources enabled control pauses that source's API import. Global pause is respected. These counters are operational, not a promise of individual eligibility or complete coverage. Public source dates reflect successful API checks; no human verification is implied.

The local command never connects to production. Deployment, production migration and role grants remain separate release steps.
