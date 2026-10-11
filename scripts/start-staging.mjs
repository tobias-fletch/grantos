import { spawnSync } from 'node:child_process';
import { stagingRuntimeEnvironment } from './staging-runtime.mjs';

// Staging-only convenience: the disposable owner connection can initialize this
// isolated database. Production keeps migrations separate and uses restricted roles.
try {
  const env = stagingRuntimeEnvironment();
  for (const [args, label] of [
    [['scripts/migrate-staging.mjs'], 'migrations'],
    [['--import', 'tsx', 'scripts/import-reviewed-starter.ts', '--apply', '--append-existing-evidence'], 'reviewed catalog import'],
    [['--import', 'tsx', 'scripts/enrich-reviewed-guidance.ts', '--apply'], 'reviewed guidance enrichment'],
  ]) {
    const result = spawnSync(process.execPath, args, { env, stdio: 'inherit', timeout: 120000 });
    if (result.error || result.status !== 0) throw new Error(`Staging ${label} failed; web startup stopped.`);
  }
  Object.assign(process.env, env);
  await import('./start-production.mjs');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Staging startup failed.');
  process.exitCode = 1;
}
