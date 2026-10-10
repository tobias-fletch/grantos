# Hosted AI catalog pilot

Approved allowance: **$10 per UTC calendar month**. The pilot is disabled until the
GitHub repository variable `CATALOG_AI_ENABLED=true` is set and the beta-discovery
environment contains `OPENAI_API_KEY`. API billing is separate from ChatGPT.

## Behavior

The separate daily GitHub workflow runs at 7:43 a.m. America/New_York, subject to
GitHub scheduling delays. It shares concurrency and the database lease with the
ordinary crawler. It makes at most three API requests per UTC day, including
manual runs. Existing hourly discovery, crawl page limits and workspace plans do
not change. Tavily, Brave and paid user-facing search remain disabled.

Prioritize under-target searches and coverage gaps from the last 30 days. Send
only categories, broad city/region/country and applicant type. Never send raw
search text, ZIP, names, emails, workspace IDs, notes, contributions or applications.
Fallback research rotates category topics with worldwide scope; this is a research
request, not a worldwide eligibility assertion. Equivalent topics have a seven-day
cooldown, including failed calls.

GPT-4.1 mini performs one web search with at most 3,000 output tokens. Only citation
URLs are retained; generated claims never become catalog facts. Safe canonical URLs
on enabled approved domains enter the existing frontier. The ordinary crawler then
fetches official evidence under robots, DNS, download and page limits, extracts
facts, deduplicates and publishes eligible programs. Unknown remains Unknown.
Unfamiliar hosts create disabled source suggestions and domain approval requests.
The editor's existing Approve domain action enables these new sources; it does not
silently re-enable previously disabled sources. Rejected suggestions stay rejected.
This pilot does not eliminate the one-time official-domain approval step.

## Spending and recovery

Every attempted API call first commits a **10-cent conservative reservation** under
a PostgreSQL transaction lock. No more than 1,000 cents may be reserved per UTC
month. There are no automatic SDK retries. Errors/timeouts/crashes retain their
reservation because the remote request may have been billed. A saved response can
resume URL queuing without another paid call. Reservations are not actual invoices;
actual usage should be lower. This protects this worker only, not other uses of the
same OpenAI account/key, taxes, or future provider price changes.

Pricing checked October 10, 2026: model input $0.40 and output $1.60 per million
tokens; web search $0.01 per call with 8,000 search input tokens for this model.
One tool call, bounded input and output leave substantial room within 10 cents.
Model is pinned to `gpt-4.1-mini-2025-04-14`, standard processing, official API URL.
The pilot automatically stops on **November 10, 2026** pending a pricing review.
No refunds of unused reservations and no account-level hard-cap claim.

Sources: https://developers.openai.com/api/docs/models/gpt-4.1-mini and
https://developers.openai.com/api/docs/pricing and
https://developers.openai.com/api/docs/guides/tools-web-search.

## Activation and verification

1. Back up the database and apply additive `028_ai_catalog_research.sql`.
2. Grant SELECT, INSERT, UPDATE on catalog_ai_research to the existing restricted
   discovery role (updated db/operations/discovery-role.sql). Ensure the migration
   owner's existing backup role can SELECT the new table. Grant the application
   database role SELECT on catalog_ai_research for authenticated editor summaries;
   no ledger write privileges are needed by the web app. Existing crawl_sources
   permissions suffice for domain approval.
3. Add the API key privately to beta-discovery, enable API billing, and use a
   dedicated project/key. Do not add this key to the Render web app.
4. Push the reviewed workflow and worker, then enable the repository variable.
   Existing BETA_JOBS_ENABLED and global catalog pause must also allow work.
5. Manually dispatch one run. Check its outcome and catalog_ai_research counters,
   domain exceptions and frontier additions. Follow the next ordinary crawl through
   publication. A queued link is not a verified grant or a publication count.

Before reporting an active pilot, verify a real request and its downstream result.
Without an API key, local mocked integration tests prove controls, not live provider
access. Disable CATALOG_AI_ENABLED to stop paid research; ordinary crawling continues.
