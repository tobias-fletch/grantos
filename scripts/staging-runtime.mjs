import { requireStagingDatabaseUrl } from './staging-database.mjs';

export function stagingRuntimeEnvironment(env = process.env) {
  const database = requireStagingDatabaseUrl(env);
  let external;
  try { external = new URL(env.RENDER_EXTERNAL_URL ?? ''); } catch { throw new Error('Render staging HTTPS URL is required.'); }
  if (external.protocol !== 'https:' || external.username || external.password || external.port ||
      !/^grantos-staging(?:-[a-z0-9]+)?\.onrender\.com$/.test(external.hostname) ||
      external.pathname !== '/' || external.search || external.hash) {
    throw new Error('Use this staging service’s Render-assigned HTTPS URL, never the live domain.');
  }
  if (!env.AUTH_SECRET || !env.SUPPORT_EMAIL) throw new Error('Staging authentication and support configuration is required.');
  return {
    ...env, DATABASE_URL: database, MIGRATION_DATABASE_URL: database,
    APP_URL: external.origin, AUTH_URL: external.origin, NEXT_PUBLIC_APP_URL: external.origin,
    NODE_ENV: 'production', BETA_MODE: 'true', EMAIL_ENABLED: 'false',
    GMAIL_OAUTH_PRODUCTION_CONFIRMED: 'false', CATALOG_AI_ENABLED: 'false', LIVE_GRANT_SEARCH: 'false',
  };
}
