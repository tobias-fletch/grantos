// Shared fail-closed guard for explicit staging-only mutation tools.
// Names/attestations prevent accidental fallback; they do not prove provider isolation.
export function requireStagingDatabaseUrl(env = process.env) {
  if (env.STAGING_CONFIRMATION !== 'grantos-isolated-staging' || !env.STAGING_DATABASE_URL) {
    throw new Error('Set STAGING_DATABASE_URL and STAGING_CONFIRMATION=grantos-isolated-staging after verifying provider isolation.');
  }
  let url;
  try { url = new URL(env.STAGING_DATABASE_URL); } catch { throw new Error('Invalid staging database configuration.'); }
  const name = decodeURIComponent(url.pathname.slice(1));
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !/(^|[_-])staging([_-]|$)/i.test(name)) {
    throw new Error('Use a dedicated PostgreSQL database with a staging token in its name, such as grantos_staging.');
  }
  if (env.PRODUCTION_DATABASE_URL) {
    let production;
    try { production = new URL(env.PRODUCTION_DATABASE_URL); } catch { throw new Error('Invalid production comparison configuration.'); }
    const identity = u => `${u.hostname.toLowerCase()}:${u.port || '5432'}/${decodeURIComponent(u.pathname.slice(1))}`;
    if (identity(url) === identity(production)) throw new Error('Staging must not use the production database.');
  }
  return url.href;
}
