import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { databaseReady, REQUIRED_MIGRATIONS } from '../src/lib/db/readiness';

test('health readiness requires every shipped migration including guided applications', async () => {
  const shipped = (await readdir('db/migrations')).filter(name => name.endsWith('.sql')).sort();
  assert.deepEqual([...REQUIRED_MIGRATIONS], shipped);
  assert.equal(new Set(REQUIRED_MIGRATIONS).size, REQUIRED_MIGRATIONS.length);
  assert.ok(REQUIRED_MIGRATIONS.includes('039_application_guidance.sql'));
  assert.ok(REQUIRED_MIGRATIONS.includes('040_snapshot_recording_time.sql'));
  assert.ok(REQUIRED_MIGRATIONS.includes('041_staging_owner_setup.sql'));
});
test('health readiness rejects partially migrated databases and parameterizes expected migration names', async () => {
  for (const total of [0, REQUIRED_MIGRATIONS.length - 1, REQUIRED_MIGRATIONS.length]) {
    const ready = await databaseReady({ query: async (sql, values) => {
      assert.match(sql, /filename = ANY\(\$1::text\[\]\)/);
      assert.deepEqual(values, [[...REQUIRED_MIGRATIONS]]);
      return { rows: [{ total }] };
    } });
    assert.equal(ready, total === REQUIRED_MIGRATIONS.length);
  }
  await assert.rejects(databaseReady({ query: async () => { throw Error('unavailable'); } }));
});
