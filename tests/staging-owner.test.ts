import {before, beforeEach, after, test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readdir, readFile} from 'node:fs/promises';
import pg from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import {handleStagingOwnerSetup, stagingOwnerSetupAvailable, stagingOwnerSetupEnabled, stagingOwnerSetupPageAllowed} from '../src/lib/auth/staging-owner';
import {accountAllowed, editorAllowed, requireBetaOwner, validSession} from '../src/lib/beta/security';

dotenv.config({path: '.env.local', quiet: true});
const savedEnvironment = {...process.env};
const testDatabase = `staging_owner_test_${randomBytes(8).toString('hex')}`;
assert.ok(process.env.DATABASE_URL, 'DATABASE_URL must identify a disposable test database');
const connection = new URL(process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(connection.hostname), 'Staging-owner tests require an isolated loopback database');
assert.equal(connection.searchParams.has('host'), false, 'A connection-string host override is not allowed');
connection.pathname = `/${testDatabase}`;
const admin = new pg.Client({connectionString: process.env.DATABASE_URL});
const pool = new pg.Pool({connectionString: connection.href});
const origin = 'https://grantos-staging-fixture.onrender.com';
// These are deliberately public, synthetic test fixtures; no real setup token
// is generated, configured or usable on a hosted service by this test suite.
const token = 'SyntheticFixtureToken_0123456789_+/==';
const password = 'Synthetic private test password!';
const configuration = () => ({
  NODE_ENV: 'production', GRANTOS_RUNTIME: 'staging', STAGING_OWNER_SETUP_ENABLED: 'true',
  STAGING_CONFIRMATION: 'grantos-isolated-staging', TRUST_PROXY: 'render', AUTH_SECRET: 'synthetic-auth-fixture-only',
  STAGING_OWNER_EMAIL: 'owner@staging.example', STAGING_OWNER_SETUP_TOKEN: token,
  STAGING_OWNER_SETUP_EXPIRES_AT: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  RENDER_EXTERNAL_URL: origin, APP_URL: origin, AUTH_URL: origin,
  STAGING_DATABASE_URL: connection.href, DATABASE_URL: connection.href,
});
const values = () => ({name: 'Staging Owner', email: 'owner@staging.example', token, password, confirmPassword: password});
const headers = () => ({'content-type': 'application/x-www-form-urlencoded', origin, host: new URL(origin).host,
  'x-forwarded-proto': 'https', 'x-forwarded-for': '192.0.2.1', 'sec-fetch-site': 'same-origin'});
function request(fields: Record<string, string> = {}, requestHeaders: Record<string, string> = {}, query = '') {
  return new Request(`${origin}/api/staging/owner-setup${query}`, {
    method: 'POST', headers: {...headers(), ...requestHeaders}, body: new URLSearchParams({...values(), ...fields}),
  });
}
function rejected(response: Response) {
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), `${origin}/staging/setup?error=invalid`);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
}
async function emptyState() {
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n, 0);
  assert.equal((await pool.query('SELECT consumed_at FROM staging_owner_setup')).rows[0].consumed_at, null);
}

before(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE ${testDatabase}`);
  for (const name of (await readdir('db/migrations')).filter(f => f.endsWith('.sql')).sort()) {
    await pool.query(await readFile(`db/migrations/${name}`, 'utf8'));
  }
});
beforeEach(async () => {
  Object.assign(process.env, configuration());
  delete process.env.PRODUCTION_DATABASE_URL;
  await pool.query('TRUNCATE users, auth_rate_limits, staging_owner_setup CASCADE');
  await pool.query('INSERT INTO staging_owner_setup(singleton) VALUES(true)');
});
after(async () => {
  for (const key of Object.keys(configuration())) {
    if (savedEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnvironment[key];
  }
  if (savedEnvironment.PRODUCTION_DATABASE_URL === undefined) delete process.env.PRODUCTION_DATABASE_URL;
  else process.env.PRODUCTION_DATABASE_URL = savedEnvironment.PRODUCTION_DATABASE_URL;
  await pool.end();
  await admin.query(`DROP DATABASE IF EXISTS ${testDatabase} WITH (FORCE)`);
  await admin.end();
});

test('bootstrap requires every explicit staging guard, safe target, independent secret and bounded expiry', async () => {
  assert.equal(stagingOwnerSetupEnabled(configuration()), true);
  for (const [key, value] of Object.entries(configuration())) {
    assert.equal(stagingOwnerSetupEnabled({...configuration(), [key]: ''}), false, key);
    assert.ok(value);
  }
  for (const overrides of [
    {NODE_ENV: 'development'}, {GRANTOS_RUNTIME: 'production'}, {STAGING_OWNER_SETUP_ENABLED: 'false'},
    {STAGING_OWNER_SETUP_TOKEN: 'short'}, {STAGING_OWNER_SETUP_TOKEN: configuration().AUTH_SECRET},
    {STAGING_OWNER_SETUP_TOKEN: token + ' '}, {STAGING_OWNER_EMAIL: 'not-an-email'},
    {STAGING_OWNER_SETUP_EXPIRES_AT: new Date(Date.now() - 1).toISOString()},
    {STAGING_OWNER_SETUP_EXPIRES_AT: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()},
    {STAGING_OWNER_SETUP_EXPIRES_AT: 'tomorrow'},
    {APP_URL: 'https://icangetgrants.com'}, {AUTH_URL: 'https://icangetgrants.com'},
    {DATABASE_URL: 'postgresql://localhost/production'},
    {STAGING_DATABASE_URL: 'postgresql://localhost/production', DATABASE_URL: 'postgresql://localhost/production'},
    {PRODUCTION_DATABASE_URL: connection.href},
  ]) assert.equal(stagingOwnerSetupEnabled({...configuration(), ...overrides}), false, JSON.stringify(Object.keys(overrides)));
  for (const url of ['http://grantos-staging.onrender.com', 'https://icangetgrants.com', `${origin}/path`, `${origin}?x=1`, `${origin}:444`, 'https://user@grantos-staging.onrender.com']) {
    assert.equal(stagingOwnerSetupEnabled({...configuration(), RENDER_EXTERNAL_URL: url, APP_URL: url, AUTH_URL: url}), false);
  }
  delete process.env.GRANTOS_RUNTIME;
  assert.equal((await handleStagingOwnerSetup(pool, request())).status, 404);
  assert.equal(await stagingOwnerSetupAvailable(pool), false);
  await emptyState();
});

test('HTTPS same-origin POST is required; query strings and forwarded-host overrides are never accepted', async () => {
  assert.equal(stagingOwnerSetupPageAllowed(new Headers(headers())), true);
  for (const changed of [{host: 'evil.example'}, {'x-forwarded-proto': 'http'}, {'x-forwarded-host': 'evil.example'}] as Record<string, string>[]) {
    assert.equal(stagingOwnerSetupPageAllowed(new Headers({...headers(), ...changed})), false);
  }
  for (const changed of [
    {origin: ''}, {origin: 'https://evil.example'}, {host: 'icangetgrants.com'},
    {'x-forwarded-proto': 'http'}, {'x-forwarded-proto': ''},
    {'x-forwarded-host': 'evil.example'}, {'sec-fetch-site': 'cross-site'},
  ] as Record<string, string>[]) assert.equal((await handleStagingOwnerSetup(pool, request({}, changed))).status, 404);
  assert.equal((await handleStagingOwnerSetup(pool, request({}, {}, '?token=synthetic'))).status, 404);
  assert.equal((await handleStagingOwnerSetup(pool, new Request(`${origin}/api/staging/owner-setup`, {headers: headers()}))).status, 404);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM auth_rate_limits')).rows[0].n, 0);
  await emptyState();
});

test('a mismatched actual Pool or database name is rejected before mutations', async () => {
  const another = new pg.Pool({connectionString: savedEnvironment.DATABASE_URL});
  try { assert.equal((await handleStagingOwnerSetup(another, request())).status, 404); }
  finally { await another.end(); }
  const fakePool = {options: {connectionString: connection.href}, query: async () => ({rows: [{database: 'production'}]})} as unknown as pg.Pool;
  assert.equal((await handleStagingOwnerSetup(fakePool, request())).status, 404);
  await emptyState();
});

test('invalid token, email, password confirmation and bcrypt-byte-overflow leave no account or consumed marker', async () => {
  for (const fields of [
    {token: token + 'wrong'}, {email: 'other@staging.example'}, {confirmPassword: 'Different private password'},
    {password: 'é'.repeat(37), confirmPassword: 'é'.repeat(37)}, {password: 'short', confirmPassword: 'short'},
  ] as Record<string, string>[]) rejected(await handleStagingOwnerSetup(pool, request(fields)));
  await emptyState();
  assert.equal((await pool.query('SELECT max(count)::int AS n FROM auth_rate_limits')).rows[0].n, 5);
});

test('oversized, duplicate-field and non-form bodies fail generically and never expose submitted secrets', async () => {
  const cases = [
    new Request(`${origin}/api/staging/owner-setup`, {method: 'POST', headers: headers(), body: 'name=' + 'X'.repeat(9000)}),
    new Request(`${origin}/api/staging/owner-setup`, {method: 'POST', headers: headers(), body: new URLSearchParams(values()).toString() + '&token=other'}),
    request({}, {'content-type': 'application/json'}),
  ];
  for (const req of cases) {
    const response = await handleStagingOwnerSetup(pool, req);
    rejected(response);
    assert.equal(await response.text(), '');
    assert.equal(JSON.stringify([...response.headers]).includes(token), false);
    assert.equal(JSON.stringify([...response.headers]).includes(password), false);
  }
  await emptyState();
});

test('DB-backed per-address and global rate limits persist independently of failed account transactions', async () => {
  for (let i = 0; i < 5; i++) rejected(await handleStagingOwnerSetup(pool, request({token: 'wrong'})));
  rejected(await handleStagingOwnerSetup(pool, request()));
  await emptyState();
  await pool.query('TRUNCATE auth_rate_limits');
  for (let i = 0; i < 30; i++) rejected(await handleStagingOwnerSetup(pool, request({token: 'wrong'}, {'x-forwarded-for': `192.0.2.${i + 1}`})));
  rejected(await handleStagingOwnerSetup(pool, request({}, {'x-forwarded-for': '192.0.2.200'})));
  await emptyState();
  await pool.query("UPDATE auth_rate_limits SET window_start=now()-interval '16 minutes'");
  assert.equal((await handleStagingOwnerSetup(pool, request())).headers.get('location'), `${origin}/staging/setup?complete=1`);
});

test('a successful claim atomically creates a strict-beta owner, individual workspace and honest staging audit', async () => {
  assert.equal(await stagingOwnerSetupAvailable(pool), true);
  const response = await handleStagingOwnerSetup(pool, request({email: ' OWNER@STAGING.EXAMPLE '}));
  assert.equal(response.headers.get('location'), `${origin}/staging/setup?complete=1`);
  const user = (await pool.query('SELECT * FROM users')).rows[0];
  assert.equal(user.email, 'owner@staging.example');
  assert.ok(await bcrypt.compare(password, user.password_hash));
  assert.equal(accountAllowed(user, true), true);
  assert.equal(await editorAllowed(pool, user.id), true);
  assert.equal((await requireBetaOwner(pool, user.id)).id, user.id);
  assert.ok(await validSession(pool, user.id, 0, true));
  assert.equal(accountAllowed({...user, email_verified_at: null}, true), false);
  const workspace = (await pool.query('SELECT w.*,m.role,p.applicant_type,p.display_name FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id JOIN profiles p ON p.workspace_id=w.id')).rows[0];
  assert.equal(workspace.kind, 'individual'); assert.equal(workspace.role, 'owner'); assert.equal(workspace.applicant_type, 'individual');
  const state = (await pool.query('SELECT * FROM staging_owner_setup')).rows[0];
  assert.ok(state.consumed_at); assert.equal(state.owner_user_id, user.id);
  const event = (await pool.query('SELECT event FROM beta_events')).rows[0].event;
  assert.match(event, /provider setup token, not email delivery/);
  const audit = (await pool.query('SELECT metadata FROM audit_logs')).rows[0].metadata;
  assert.deepEqual(audit, {environment: 'staging', verification_method: 'provider_setup_token', email_delivered: false});
  const dump = JSON.stringify((await pool.query('SELECT row_to_json(t) AS row FROM staging_owner_setup t')).rows) + event + JSON.stringify(audit);
  assert.equal(dump.includes(token), false); assert.equal(dump.includes(password), false);
  assert.equal(await stagingOwnerSetupAvailable(pool), false);
  rejected(await handleStagingOwnerSetup(pool, request()));
});

test('existing expected email or any prior disabled owner prevents takeover without changing passwords or roles', async () => {
  const existing = (await pool.query("INSERT INTO users(email,name,password_hash) VALUES($1,'Existing','unchanged') RETURNING id", [values().email])).rows[0];
  rejected(await handleStagingOwnerSetup(pool, request()));
  let user = (await pool.query('SELECT * FROM users WHERE id=$1', [existing.id])).rows[0];
  assert.equal(user.password_hash, 'unchanged'); assert.equal(user.beta_owner, false); assert.equal(user.email_verified_at, null);
  await pool.query("UPDATE users SET email='another@staging.example',beta_owner=true,disabled_at=now() WHERE id=$1", [existing.id]);
  rejected(await handleStagingOwnerSetup(pool, request()));
  user = (await pool.query('SELECT * FROM users WHERE id=$1', [existing.id])).rows[0];
  assert.ok(user.disabled_at); assert.equal(user.password_hash, 'unchanged');
  assert.equal((await pool.query('SELECT consumed_at FROM staging_owner_setup')).rows[0].consumed_at, null);
});

test('concurrent separate connections permit exactly one first claim and one linked workspace', async () => {
  const second = new pg.Pool({connectionString: connection.href});
  try {
    const responses = await Promise.all([handleStagingOwnerSetup(pool, request()), handleStagingOwnerSetup(second, request())]);
    assert.equal(responses.filter(r => r.headers.get('location')?.endsWith('complete=1')).length, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM workspaces')).rows[0].n, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM beta_events')).rows[0].n, 1);
  } finally { await second.end(); }
});

test('account removal and token rotation cannot reopen a consumed bootstrap', async () => {
  assert.equal((await handleStagingOwnerSetup(pool, request())).headers.get('location'), `${origin}/staging/setup?complete=1`);
  await pool.query('DELETE FROM beta_events');
  await pool.query('DELETE FROM workspaces');
  await pool.query('DELETE FROM users');
  process.env.STAGING_OWNER_SETUP_TOKEN = token + '_rotated';
  rejected(await handleStagingOwnerSetup(pool, request({token: process.env.STAGING_OWNER_SETUP_TOKEN})));
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n, 0);
  const state = (await pool.query('SELECT * FROM staging_owner_setup')).rows[0];
  assert.ok(state.consumed_at); assert.equal(state.owner_user_id, null);
});

test('failure after creating the account rolls back user, profile, audit and consumption together', async () => {
  await pool.query("ALTER TABLE profiles ADD CONSTRAINT reject_test_profile CHECK(display_name <> 'Staging Owner')");
  try {
    rejected(await handleStagingOwnerSetup(pool, request()));
    await emptyState();
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM workspaces')).rows[0].n, 0);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM beta_events')).rows[0].n, 0);
    assert.equal((await pool.query('SELECT max(count)::int AS n FROM auth_rate_limits')).rows[0].n, 1);
  } finally { await pool.query('ALTER TABLE profiles DROP CONSTRAINT reject_test_profile'); }
});
