import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

// This must fail (not skip) if CI loses its database or PostgreSQL client tools.
test('release migration runner is repeatable without changing schema, seeds or applied timestamps', async () => {
  assert.ok(process.env.DATABASE_URL, 'DATABASE_URL must identify a disposable test database');
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname), 'Release tests require an isolated loopback database');
  const admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
  const name = 'grantos_migration_test_' + randomBytes(8).toString('hex');
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = '/' + name;
  let created = false;
  const db = new pg.Client({ connectionString: url.href });
  let connected = false;
  const migrate = () => {
    const result = spawnSync(process.execPath, ['scripts/migrate.mjs'], {
      env: { ...process.env, DATABASE_URL: url.href, MIGRATION_DATABASE_URL: url.href },
      encoding: 'utf8', timeout: 60000,
    });
    assert.equal(result.status, 0, 'Migration runner failed');
  };
  const schema = () => {
    const exe = process.env.PG_BIN ? path.join(process.env.PG_BIN, 'pg_dump' + (process.platform === 'win32' ? '.exe' : '')) : 'pg_dump';
    const result = spawnSync(exe, ['--schema-only', '--no-owner', '--no-acl'], {
      env: { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username),
        PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: name, PGSSLMODE: url.searchParams.get('sslmode') ?? 'prefer' },
      encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024,
    });
    assert.equal(result.status, 0, 'Real pg_dump is required for migration validation');
    // PostgreSQL 17+ intentionally chooses a new psql restriction token per dump.
    return result.stdout.replace(/^\\(?:un)?restrict .*$/gm, '');
  };
  const counts = async () => {
    const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
    const result: Record<string, string> = {};
    for (const { tablename } of tables) result[tablename] = (await db.query('SELECT count(*) FROM public.' + pg.escapeIdentifier(tablename))).rows[0].count;
    return result;
  };
  await admin.connect();
  try {
    await admin.query('CREATE DATABASE ' + pg.escapeIdentifier(name)); created = true;
    migrate();
    await db.connect(); connected = true;
    const expected = (await readdir('db/migrations')).filter(name => name.endsWith('.sql')).sort();
    const before = (await db.query('SELECT filename, applied_at FROM schema_migrations ORDER BY filename')).rows;
    assert.deepEqual(before.map(row => row.filename), expected);
    const schemaBefore = schema(), countsBefore = await counts();
    migrate();
    assert.deepEqual((await db.query('SELECT filename, applied_at FROM schema_migrations ORDER BY filename')).rows, before);
    assert.deepEqual(await counts(), countsBefore);
    assert.equal(schema(), schemaBefore);
  } finally {
    if (connected) await db.end();
    if (created) await admin.query('DROP DATABASE ' + pg.escapeIdentifier(name) + ' WITH (FORCE)');
    await admin.end();
  }
});
