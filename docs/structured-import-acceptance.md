# Structured import acceptance — local, 2026-10-10

- Migration 032 applied after encrypted local backup; production unchanged.
- Two bounded real API batches: 44 requests; 131 new records (40 Grants.gov, 91 California); 9 non-grant rows skipped; zero provider failures.
- Initial California batch included historical rows. Discovery was corrected to select active rows, with independent refresh of previously imported records. The 38 closed records already imported remain explicitly closed, not deleted or represented as current rounds.
- Final sampled imported statuses: 77 open, 16 upcoming, 38 closed. These are source availability states, not guarantees of applicant eligibility. Unknown geography remains separate.
- Local broad program search returned 317 program records after imports. This count is not a production count or a guarantee of matches for a specific user.
- Real California records exposed `ApplicationDeadline: Ongoing`; adapter now maps this to rolling. Earlier sampled records receive that mapping during subsequent refreshes.
- Full regression suite: 119 passed, zero failed. Production build passed. Tests cover typed values, unknown geography, excluded instruments, limits, private-address rejection, idempotency, saving, private application preservation, locked conflicts, hidden records, restart checkpoints and retry backoff.
- Production migration, actual restricted-role grants, deployment and hosted verification remain release work. No paid services, new credentials or schedule changes were made.

See [deployment and source documentation](structured-catalog.md).
