import {createHash, timingSafeEqual} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {z} from 'zod';
import type {Pool} from 'pg';
import {transaction} from '../checklists/store';
import {emailSchema, passwordSchema, rateLimit, requestAddress} from '../beta/security';

type Environment = Record<string, string | undefined>;
const tokenPattern = /^[A-Za-z0-9_+/=-]{32,256}$/;
const setupInput = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  token: z.string().max(256),
  password: passwordSchema,
  confirmPassword: passwordSchema,
}).refine(v => v.password === v.confirmPassword);

// Keep configuration server-side. Neither the expected email nor the setup
// secret is returned to a page, serialized into client props, or logged.
function setupConfiguration(env: Environment = process.env) {
  if (env.NODE_ENV !== 'production' || env.GRANTOS_RUNTIME !== 'staging' ||
      env.STAGING_OWNER_SETUP_ENABLED !== 'true' ||
      env.STAGING_CONFIRMATION !== 'grantos-isolated-staging' ||
      env.TRUST_PROXY !== 'render' || !env.AUTH_SECRET ||
      !env.STAGING_OWNER_SETUP_TOKEN || !tokenPattern.test(env.STAGING_OWNER_SETUP_TOKEN) ||
      env.STAGING_OWNER_SETUP_TOKEN === env.AUTH_SECRET) return null;
  const expires = Date.parse(env.STAGING_OWNER_SETUP_EXPIRES_AT ?? '');
  const now = Date.now();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(env.STAGING_OWNER_SETUP_EXPIRES_AT ?? '') ||
      !Number.isFinite(expires) || expires <= now || expires > now + 24 * 60 * 60 * 1000) return null;
  const email = emailSchema.safeParse(env.STAGING_OWNER_EMAIL);
  if (!email.success) return null;
  try {
    const origin = new URL(env.RENDER_EXTERNAL_URL ?? '');
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.port ||
        !/^grantos-staging(?:-[a-z0-9]+)?\.onrender\.com$/.test(origin.hostname) ||
        origin.pathname !== '/' || origin.search || origin.hash ||
        env.APP_URL !== origin.origin || env.AUTH_URL !== origin.origin) return null;
    const staging = new URL(env.STAGING_DATABASE_URL ?? '');
    const database = new URL(env.DATABASE_URL ?? '');
    if (!['postgres:', 'postgresql:'].includes(staging.protocol) || !staging.hostname ||
        !/(^|[_-])staging([_-]|$)/i.test(decodeURIComponent(staging.pathname.slice(1))) ||
        database.href !== staging.href) return null;
    if (env.PRODUCTION_DATABASE_URL) {
      const production = new URL(env.PRODUCTION_DATABASE_URL);
      const identity = (u: URL) => `${u.hostname.toLowerCase()}:${u.port || '5432'}/${decodeURIComponent(u.pathname.slice(1))}`;
      if (identity(staging) === identity(production)) return null;
    }
    return {origin: origin.origin, host: origin.host, email: email.data, token: env.STAGING_OWNER_SETUP_TOKEN,
      databaseUrl: database.href, databaseName: decodeURIComponent(database.pathname.slice(1))};
  } catch { return null; }
}

export function stagingOwnerSetupEnabled(env: Environment = process.env): boolean {
  return setupConfiguration(env) !== null;
}

function stagingHeadersMatch(headers: Headers, config: NonNullable<ReturnType<typeof setupConfiguration>>) {
  return headers.get('host') === config.host && headers.get('x-forwarded-proto') === 'https' &&
    (!headers.has('x-forwarded-host') || headers.get('x-forwarded-host') === config.host);
}

export function stagingOwnerSetupPageAllowed(headers: Headers): boolean {
  const config = setupConfiguration();
  return config !== null && stagingHeadersMatch(headers, config);
}

async function databaseBindingMatches(db: Pool, config: NonNullable<ReturnType<typeof setupConfiguration>>): Promise<boolean> {
  // Validate the actual Pool as well as environment variables. A stale or
  // separately constructed connection must not gain bootstrap privileges.
  try {
    if (new URL(db.options.connectionString ?? '').href !== config.databaseUrl) return false;
    const result = await db.query('SELECT current_database() AS database');
    return result.rows[0]?.database === config.databaseName;
  } catch { return false; }
}

export async function stagingOwnerSetupAvailable(db: Pool): Promise<boolean> {
  const config = setupConfiguration();
  if (!config || !await databaseBindingMatches(db, config)) return false;
  const result = await db.query(`SELECT 1 FROM staging_owner_setup
    WHERE singleton AND consumed_at IS NULL AND NOT EXISTS (SELECT 1 FROM users WHERE beta_owner)`);
  return result.rowCount === 1;
}

const privateHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};
const unavailable = () => new Response('Not found', {status: 404, headers: privateHeaders});
const returnToSetup = (origin: string, result: 'invalid' | 'complete') => new Response(null, {
  status: 303,
  headers: {...privateHeaders, Location: `${origin}/staging/setup?${result === 'complete' ? 'complete=1' : 'error=invalid'}`},
});

async function boundedForm(request: Request): Promise<unknown> {
  // The plain HTML form uses urlencoding. Bound even chunked bodies before
  // parsing; never echo a supplied field into a response or an exception.
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/x-www-form-urlencoded') throw Error('Invalid setup request');
  const reader = request.body?.getReader();
  if (!reader) throw Error('Invalid setup request');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); throw Error('Invalid setup request'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
  if ([...form.keys()].length !== 5 || new Set(form.keys()).size !== 5) throw Error('Invalid setup request');
  return Object.fromEntries(form);
}

export async function handleStagingOwnerSetup(db: Pool, request: Request): Promise<Response> {
  const config = setupConfiguration();
  if (!config) return unavailable();
  // Render terminates TLS. Check its forwarded protocol plus the actual Host,
  // never let an untrusted forwarded host replace Host or an absent Origin.
  if (request.method !== 'POST' || new URL(request.url).search ||
      request.headers.get('origin') !== config.origin ||
      !stagingHeadersMatch(request.headers, config) ||
      (request.headers.has('sec-fetch-site') && request.headers.get('sec-fetch-site') !== 'same-origin')) return unavailable();
  try {
    if (!await databaseBindingMatches(db, config)) return unavailable();
    // Limits commit before the owner transaction, so malformed inputs, bad
    // tokens and rolled-back attempts cannot reset their shared DB counters.
    if (!await rateLimit(db, 'staging-owner:global', 30, 900) ||
        !await rateLimit(db, `staging-owner:address:${requestAddress(request.headers)}`, 5, 900)) {
      return returnToSetup(config.origin, 'invalid');
    }
    const input = setupInput.safeParse(await boundedForm(request));
    if (!input.success) return returnToSetup(config.origin, 'invalid');
    const v = input.data;
    // Hash first so both comparisons have fixed-length operands. A rejected
    // email still performs the secret comparison. The raw secret never hits DB.
    const validToken = timingSafeEqual(
      createHash('sha256').update(v.token).digest(),
      createHash('sha256').update(config.token).digest(),
    );
    if (!validToken || v.email !== config.email) return returnToSetup(config.origin, 'invalid');
    const passwordHash = await bcrypt.hash(v.password, 12);
    await transaction(db, async c => {
      const state = (await c.query('SELECT consumed_at FROM staging_owner_setup WHERE singleton FOR UPDATE')).rows[0];
      if (!state || state.consumed_at || !setupConfiguration()) throw Error('Setup unavailable');
      // Serialize with other account writers as well as setup requests. Never
      // upgrade an existing email or race an independently designated owner.
      await c.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE');
      if ((await c.query('SELECT 1 FROM users WHERE beta_owner OR lower(email)=$1 LIMIT 1', [config.email])).rowCount) throw Error('Setup unavailable');
      const user = (await c.query(`INSERT INTO users(email,name,password_hash,email_verified_at,beta_active,beta_owner,catalog_editor)
        VALUES($1,$2,$3,now(),true,true,true) RETURNING id`, [config.email, v.name, passwordHash])).rows[0];
      const workspace = (await c.query(`INSERT INTO workspaces(name,slug,kind,created_by)
        VALUES($1,$2,'individual',$3) RETURNING id`, [v.name, `staging-${user.id}`, user.id])).rows[0];
      await c.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner')", [workspace.id, user.id]);
      await c.query("INSERT INTO profiles(workspace_id,display_name,applicant_type) VALUES($1,$2,'individual')", [workspace.id, v.name]);
      await c.query('UPDATE staging_owner_setup SET consumed_at=now(),owner_user_id=$1 WHERE singleton', [user.id]);
      await c.query(`INSERT INTO beta_events(actor_id,subject_id,event)
        VALUES($1,$1,'Staging first owner created; verification by provider setup token, not email delivery')`, [user.id]);
      await c.query(`INSERT INTO audit_logs(workspace_id,actor_user_id,action,entity_type,entity_id,metadata)
        VALUES($1,$2::uuid,'staging_owner_bootstrap','user',$2::text,$3::jsonb)`, [workspace.id, user.id,
        JSON.stringify({environment: 'staging', verification_method: 'provider_setup_token', email_delivered: false})]);
    });
    return returnToSetup(config.origin, 'complete');
  } catch {
    // Database and validation errors can contain bound values. Never log or
    // return the exception; every rejected attempt receives the same message.
    return returnToSetup(config.origin, 'invalid');
  }
}
