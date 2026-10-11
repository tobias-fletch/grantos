import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireStagingDatabaseUrl } from '../scripts/staging-database.mjs';
const fixture = { STAGING_DATABASE_URL: 'postgresql://fixture:fixture@localhost:5432/grantos_staging', STAGING_CONFIRMATION: 'grantos-isolated-staging' };
test('staging mutation guard has no runtime or migration URL fallback', () => {
  assert.throws(() => requireStagingDatabaseUrl({ DATABASE_URL: fixture.STAGING_DATABASE_URL }));
  assert.throws(() => requireStagingDatabaseUrl({ MIGRATION_DATABASE_URL: fixture.STAGING_DATABASE_URL }));
  assert.throws(() => requireStagingDatabaseUrl({ ...fixture, STAGING_CONFIRMATION: '' }));
  assert.equal(requireStagingDatabaseUrl(fixture), fixture.STAGING_DATABASE_URL);
});
test('staging mutation guard rejects invalid, unmarked and known production database targets', () => {
  for (const url of ['bad', 'https://example.com/grantos_staging', 'postgresql://localhost/grantos', 'postgresql://localhost/notstaging', 'postgresql://localhost/stagingproduction']) {
    assert.throws(() => requireStagingDatabaseUrl({ ...fixture, STAGING_DATABASE_URL: url }));
  }
  assert.throws(() => requireStagingDatabaseUrl({ ...fixture, PRODUCTION_DATABASE_URL: 'postgres://another:password@localhost/grantos_staging' }));
  assert.throws(() => requireStagingDatabaseUrl({ ...fixture, PRODUCTION_DATABASE_URL: 'not-a-url' }));
  assert.equal(requireStagingDatabaseUrl({ ...fixture, PRODUCTION_DATABASE_URL: 'postgresql://localhost/grantos_production' }), fixture.STAGING_DATABASE_URL);
});
