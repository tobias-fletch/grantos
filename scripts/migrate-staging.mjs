import { spawnSync } from 'node:child_process';
import { requireStagingDatabaseUrl } from './staging-database.mjs';
try {
  const url = requireStagingDatabaseUrl();
  const result = spawnSync(process.execPath, ['scripts/migrate.mjs'], {
    env: { ...process.env, DATABASE_URL: url, MIGRATION_DATABASE_URL: url }, stdio: 'inherit',
  });
  if (result.error || result.status !== 0) throw new Error('Staging migration failed.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Staging migration failed.');
  process.exitCode = 1;
}
