import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import dotenv from 'dotenv';
import { onboardingSchema, quickSetupSchema, quickSetupDraftSchema } from '../src/lib/validation/onboarding';
import { saveOnboarding, completedSetupDestination } from '../src/lib/onboarding/store';
import { projectSearch, projectSearchDestination } from '../src/lib/projects/search';
import type { DB } from '../src/lib/checklists/store';

const input = {
  displayName: 'Neighborhood arts', applicantType: 'nonprofit', country: 'United States', state: 'New York', city: 'New York City',
  county: 'Kings', borough: 'Brooklyn', postalCode: '11201', categories: ['Visual Art', 'Community Project'],
  projectName: 'Art in the park', fundingPurpose: 'Pay teaching artists and purchase supplies for free workshops.',
  projectLocation: 'Los Angeles parks and online workshops',
};

test('quick setup validates completion, saves bounded incomplete progress, and leaves legacy profile editing independent', () => {
  assert.deepEqual(quickSetupSchema.parse(input), input);
  assert.equal(quickSetupSchema.safeParse({ ...input, fundingPurpose: 'Short' }).success, false);
  assert.equal(quickSetupSchema.safeParse({ ...input, projectLocation: '' }).success, false);
  assert.equal(quickSetupSchema.safeParse({ ...input, categories: [] }).success, false);
  assert.equal(quickSetupDraftSchema.safeParse({ ...input, displayName: '', country: '', categories: [], projectName: '', fundingPurpose: '', projectLocation: '' }).success, true);
  for (const [field, max] of Object.entries({ projectName: 120, fundingPurpose: 6000, projectLocation: 1000 })) {
    assert.equal(quickSetupDraftSchema.safeParse({ ...input, [field]: 'x'.repeat(max + 1) }).success, false);
  }
  assert.equal(quickSetupDraftSchema.safeParse({ ...input, categories: ['Invented category'] }).success, false);
  assert.equal(onboardingSchema.safeParse({ ...input, projectName: undefined, fundingPurpose: undefined, projectLocation: undefined }).success, true);
});

test('project-scoped matches use applicant address and interests, include unknowns, and keep purpose and service area private', () => {
  const project = { id: randomUUID(), name: input.projectName, applicant_type: input.applicantType, country: input.country, state: input.state, city: input.city, postal_code: input.postalCode, categories: input.categories, description: input.fundingPurpose, context: { service_area: input.projectLocation } };
  const url = new URL(projectSearch(project), 'https://example.test');
  assert.equal(url.searchParams.get('city'), 'New York City');
  assert.equal(url.searchParams.get('applicant'), 'nonprofit');
  assert.deepEqual(url.searchParams.getAll('category'), input.categories);
  assert.equal(url.searchParams.get('geoEligibility'), 'all');
  assert.equal(url.searchParams.get('project'), project.id);
  assert.equal(url.searchParams.get('projectFilters'), 'custom');
  assert.equal(decodeURIComponent(url.href).includes(input.projectLocation), false);
  assert.equal(decodeURIComponent(url.href).includes(input.fundingPurpose), false);
  const adjusted = new URL(projectSearchDestination(project, { project: project.id, city: 'Chicago', category: ['Music'], q: 'Teaching', geoEligibility: 'unknown' }), 'https://example.test');
  assert.equal(adjusted.searchParams.get('city'), 'Chicago');
  assert.deepEqual(adjusted.searchParams.getAll('category'), ['Music']);
  assert.equal(adjusted.searchParams.get('geoEligibility'), 'unknown');
  assert.equal(adjusted.searchParams.get('q'), 'Teaching');
});

test('completed setup only routes to active projects in the same workspace', async () => {
  const queries: {sql: string; args: unknown[]}[] = [];
  const db = { query: async (sql: string, args: unknown[]) => { queries.push({ sql, args }); return { rowCount: 0, rows: [] }; } } as unknown as DB;
  assert.equal(await completedSetupDestination(db, 'workspace', 'project'), '/app/dashboard');
  assert.match(queries[0].sql, /workspace_id=\$2 AND archived_at IS NULL/);
  assert.deepEqual(queries[0].args, ['project', 'workspace']);
});

dotenv.config({ path: '.env.local', quiet: true });
test('quick setup persists progress, completes concurrently once, isolates workspaces, and preserves existing drafts', { skip: !process.env.DATABASE_URL }, async () => {
  const connectionString = process.env.DATABASE_URL!;
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(connectionString).hostname), 'Use a local test database');
  const schema = 'quick_setup_' + randomBytes(6).toString('hex');
  const admin = new pg.Client({ connectionString });
  await admin.connect();
  let db: pg.Pool | undefined;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query('BEGIN');
    await admin.query(`SET LOCAL search_path TO ${schema},public`);
    for (const file of (await readdir('db/migrations')).filter(file => file.endsWith('.sql')).sort()) {
      await admin.query((await readFile('db/migrations/' + file, 'utf8')).replace(/^BEGIN;\s*|^COMMIT;\s*/gm, ''));
    }
    await admin.query('COMMIT');
    db = new pg.Pool({ connectionString, options: `-c search_path=${schema},public`, max: 3 });
    const owner = randomUUID(), viewer = randomUUID(), other = randomUUID();
    for (const id of [owner, viewer, other]) await db.query('INSERT INTO users(id,email,name) VALUES($1,$2,$2)', [id, id + '@test.example']);
    const workspace = (await db.query("INSERT INTO workspaces(name,slug,kind,created_by) VALUES('Setup','setup','nonprofit',$1) RETURNING id", [owner])).rows[0].id;
    const otherWorkspace = (await db.query("INSERT INTO workspaces(name,slug,kind,created_by) VALUES('Other','other','nonprofit',$1) RETURNING id", [other])).rows[0].id;
    await db.query("INSERT INTO workspace_members(workspace_id,user_id,role,created_at) VALUES($1,$2,'owner','2020-01-01'),($1,$3,'viewer','2020-01-01'),($4,$5,'owner','2020-01-01'),($4,$2,'owner','2021-01-01')", [workspace, owner, viewer, otherWorkspace, other]);

    const incomplete = { ...input, projectName: '', fundingPurpose: '', projectLocation: '', categories: [] };
    assert.equal((await saveOnboarding(db, owner, 'draft', incomplete)).completed, false);
    let profile = (await db.query('SELECT * FROM profiles WHERE workspace_id=$1', [workspace])).rows[0];
    assert.equal(profile.onboarding_completed_at, null);
    assert.deepEqual(profile.quick_setup_draft, { projectName: '', fundingPurpose: '', projectLocation: '' });
    assert.equal((await db.query('SELECT count(*) FROM funding_projects')).rows[0].count, '0');
    await assert.rejects(saveOnboarding(db, owner, 'complete', incomplete));
    await saveOnboarding(db, owner, 'draft', input);
    profile = (await db.query('SELECT * FROM profiles WHERE workspace_id=$1', [workspace])).rows[0];
    assert.equal(profile.quick_setup_draft.fundingPurpose, input.fundingPurpose);
    await assert.rejects(saveOnboarding(db, viewer, 'draft', input), /denied/);
    await assert.rejects(saveOnboarding(db, randomUUID(), 'complete', input), /denied/);

    const existingProject = (await db.query(
      "INSERT INTO funding_projects(workspace_id,name,description,applicant_type,country) VALUES($1,$2,'Existing work in progress','individual','United States') RETURNING id",
      [workspace, input.projectName],
    )).rows[0].id;
    const completed = await Promise.all([saveOnboarding(db, owner, 'complete', input), saveOnboarding(db, owner, 'complete', input)]);
    assert.equal(completed[0].destination, completed[1].destination);
    assert.equal((await db.query('SELECT count(*) FROM funding_projects WHERE workspace_id=$1', [workspace])).rows[0].count, '2');
    profile = (await db.query('SELECT * FROM profiles WHERE workspace_id=$1', [workspace])).rows[0];
    const project = (await db.query('SELECT * FROM funding_projects WHERE id=$1', [profile.quick_setup_project_id])).rows[0];
    assert.notEqual(project.id, existingProject);
    assert.equal((await db.query('SELECT description FROM funding_projects WHERE id=$1', [existingProject])).rows[0].description, 'Existing work in progress');
    assert.equal(project.description, input.fundingPurpose);
    assert.equal(project.city, input.city);
    assert.equal(project.context.service_area, input.projectLocation);
    assert.ok(profile.onboarding_completed_at);
    assert.deepEqual(profile.quick_setup_draft, {});
    assert.equal((await db.query('SELECT count(*) FROM profiles WHERE workspace_id=$1', [otherWorkspace])).rows[0].count, '0');
    const application = (await db.query("INSERT INTO applications(workspace_id,project_id,title,source_url,created_by,notes) VALUES($1,$2,'Saved draft','https://example.test/grant',$3,'Keep this draft') RETURNING id", [workspace, project.id, owner])).rows[0].id;
    await db.query("INSERT INTO application_preparation(application_id,kind,data) VALUES($1,'question',$2::jsonb)", [application, JSON.stringify({ question: 'Why?', answer: 'Keep my answer' })]);
    const changed = { ...input, projectName: 'Do not overwrite', fundingPurpose: 'Do not overwrite this project', city: 'Boston' };
    assert.equal((await saveOnboarding(db, owner, 'complete', changed)).destination, completed[0].destination);
    assert.equal((await saveOnboarding(db, owner, 'complete', {})).destination, completed[0].destination);
    await saveOnboarding(db, owner, 'profile', changed);
    assert.equal((await db.query('SELECT city FROM profiles WHERE workspace_id=$1', [workspace])).rows[0].city, 'Boston');
    assert.equal((await db.query('SELECT description FROM funding_projects WHERE id=$1', [project.id])).rows[0].description, input.fundingPurpose);
    assert.equal((await db.query('SELECT notes FROM applications WHERE id=$1', [application])).rows[0].notes, 'Keep this draft');
    assert.equal((await db.query('SELECT data FROM application_preparation WHERE application_id=$1', [application])).rows[0].data.answer, 'Keep my answer');

    await saveOnboarding(db, other, 'draft', input);
    const realPool = db;
    const interrupted = {
      totalCount: realPool.totalCount,
      connect: async () => {
        const client = await realPool.connect();
        return {
          query: async (sql: string, args?: unknown[]) => {
            if (sql.includes('INSERT INTO funding_projects')) throw Error('Simulated interruption');
            return client.query(sql, args);
          },
          release: () => client.release(),
        };
      },
    } as unknown as DB;
    await assert.rejects(saveOnboarding(interrupted, other, 'complete', changed), /Simulated interruption/);
    const resumed = (await db.query('SELECT * FROM profiles WHERE workspace_id=$1', [otherWorkspace])).rows[0];
    assert.equal(resumed.onboarding_completed_at, null);
    assert.equal(resumed.city, input.city);
    assert.equal(resumed.quick_setup_draft.fundingPurpose, input.fundingPurpose);
    assert.equal((await db.query('SELECT count(*) FROM funding_projects WHERE workspace_id=$1', [otherWorkspace])).rows[0].count, '0');
    const otherProject = (await saveOnboarding(db, other, 'complete', input)).destination.split('project=')[1];
    await assert.rejects(db.query('UPDATE profiles SET quick_setup_project_id=$1 WHERE workspace_id=$2', [otherProject, workspace]), /foreign key/);
    await db.query('UPDATE funding_projects SET archived_at=now() WHERE id=$1', [project.id]);
    assert.equal((await saveOnboarding(db, owner, 'complete', {})).destination, '/app/dashboard');

    // Legacy completed profiles remain usable without inventing or replacing a project.
    await db.query('UPDATE profiles SET quick_setup_project_id=NULL WHERE workspace_id=$1', [otherWorkspace]);
    assert.equal((await saveOnboarding(db, other, 'complete', {})).destination, '/app/dashboard');
    assert.equal((await db.query('SELECT count(*) FROM funding_projects WHERE workspace_id=$1', [otherWorkspace])).rows[0].count, '1');
  } finally {
    await db?.end();
    await admin.query('ROLLBACK');
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
