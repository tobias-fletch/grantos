import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stagingRuntimeEnvironment } from '../scripts/staging-runtime.mjs';
const fixture = { STAGING_DATABASE_URL: 'postgresql://fixture:fixture@internal/grantos_staging', STAGING_CONFIRMATION: 'grantos-isolated-staging', RENDER_EXTERNAL_URL: 'https://grantos-staging-example.onrender.com', AUTH_SECRET: 'fixture-only', SUPPORT_EMAIL: 'fixture@example.test' };
test('staging startup binds its assigned HTTPS origin and isolated database, disabling external effects', () => {
  const env = stagingRuntimeEnvironment({ ...fixture, DATABASE_URL: 'postgresql://production/live', APP_URL: 'https://icangetgrants.com', EMAIL_ENABLED: 'true', CATALOG_AI_ENABLED: 'true' });
  assert.equal(env.DATABASE_URL, fixture.STAGING_DATABASE_URL);
  assert.equal(env.MIGRATION_DATABASE_URL, fixture.STAGING_DATABASE_URL);
  assert.equal(env.APP_URL, fixture.RENDER_EXTERNAL_URL);
  assert.equal(env.AUTH_URL, fixture.RENDER_EXTERNAL_URL);
  assert.equal(env.EMAIL_ENABLED, 'false');
  assert.equal(env.CATALOG_AI_ENABLED, 'false');
  assert.equal(env.BETA_MODE, 'true');
  assert.equal(env.NODE_ENV, 'production');
});
test('staging startup refuses missing configuration, live domains and ambiguous URLs', () => {
  for (const url of ['', 'http://grantos-staging.onrender.com', 'https://icangetgrants.com', 'https://grantos-zuj9.onrender.com', 'https://grantos-staging.onrender.com/path', 'https://grantos-staging.onrender.com?query', 'https://user@grantos-staging.onrender.com', 'https://grantos-staging.onrender.com:444']) {
    assert.throws(() => stagingRuntimeEnvironment({ ...fixture, RENDER_EXTERNAL_URL: url }));
  }
  assert.throws(() => stagingRuntimeEnvironment({ ...fixture, AUTH_SECRET: '' }));
  assert.throws(() => stagingRuntimeEnvironment({ ...fixture, STAGING_CONFIRMATION: '' }));
  assert.equal(stagingRuntimeEnvironment({ ...fixture, RENDER_EXTERNAL_URL: 'https://grantos-staging.onrender.com/' }).APP_URL, 'https://grantos-staging.onrender.com');
});
