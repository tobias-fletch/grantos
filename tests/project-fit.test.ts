import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessProjectFit, applicationFit, type FitEvidence, type FitProject } from '../src/lib/applications/fit';
import type { DB } from '../src/lib/checklists/store';
const now = Date.parse('2026-10-11T12:00:00Z');
const project: FitProject = { id: 'project', name: 'Community kitchen', applicant_type: 'business', country: 'United States', state: 'Louisiana', city: 'New Orleans', postal_code: '70112' };
const saved = { source_url: 'https://example.org/grant', source_excerpt: 'Research lead evidence only', source_fetched_at: '2026-10-01' };
const source: FitEvidence = { source_url: saved.source_url, applicant_types: ['business'], geographies: [{ country: 'United States', state: 'Louisiana', city: null, borough: null, rule: 'eligible' }], verification_status: 'verified', last_verified_at: '2026-10-01', source_fetched_at: '2026-09-30', eligibility_notes: 'Applicant must be registered and serve eligible residents.', status: 'open', deadline_at: '2026-11-01' };
const check = (fit: ReturnType<typeof assessProjectFit>, key: string) => fit.checks.find(c => c.key === key)!;

test('broad applicant match never establishes legal or service-area eligibility', () => {
  const fit = assessProjectFit(project, source, saved, now);
  assert.equal(check(fit, 'applicant').state, 'recorded_match');
  assert.equal(fit.state, 'unknown');
  assert.equal(check(fit, 'legal').state, 'unknown');
  assert.equal(check(fit, 'geography').state, 'unknown');
  assert.match(check(fit, 'geography').detail, /applicant residence, registration, project delivery, or beneficiaries/);
  assert.match(check(fit, 'legal').detail, /tax-exempt status, fiscal sponsorship/);
  assert.equal(fit.source.checkedAt, '2026-10-01T00:00:00.000Z');
  assert.equal(fit.source.fetchedAt, '2026-09-30T00:00:00.000Z');
  assert.equal(fit.eligibilityExcerpt, source.eligibility_notes);
  assert.deepEqual(JSON.parse(JSON.stringify(fit)), fit);
});

test('explicit business versus individual conflicts only with current complete or human-verified rules', () => {
  for (const [applicant, listed] of [['business', 'individual'], ['individual', 'business'], ['researcher', 'business']]) {
    assert.equal(assessProjectFit({ ...project, applicant_type: applicant }, { ...source, applicant_types: [listed] }, saved, now).state, 'excluded');
  }
  assert.equal(assessProjectFit(project, { ...source, applicant_types: ['individual'], auto_verified_at: '2026-10-01' }, saved, now).state, 'unknown');
  const complete = { ...source, applicant_types: ['individual'], auto_verified_at: '2026-10-01', publication_provenance: { applicant_types_complete: true, applicant_types: ['individual'] } };
  assert.equal(assessProjectFit(project, complete, saved, now).state, 'excluded');
  assert.equal(assessProjectFit(project, { ...complete, publication_provenance: { applicant_types_complete: true, applicant_types: ['business'] } }, saved, now).state, 'unknown');
  assert.equal(assessProjectFit(project, { ...source, applicant_types: ['organization'] }, saved, now).state, 'unknown');
});

test('service-area mismatch does not become applicant-address exclusion', () => {
  const fit = assessProjectFit(project, { ...source, geographies: [{ country: 'United States', state: 'New York', city: null, borough: null, rule: 'eligible' }] }, saved, now);
  assert.equal(check(fit, 'geography').state, 'unknown');
  assert.equal(fit.state, 'unknown');
  assert.match(check(fit, 'geography').detail, /New York/);
  const excluded = assessProjectFit(project, { ...source, geographies: [{ ...source.geographies[0], rule: 'excluded' }] }, saved, now);
  assert.equal(check(excluded, 'geography').state, 'unknown');
  assert.match(check(excluded, 'geography').detail, /Excluded: Louisiana/);
});

test('missing project and candidate or external source are useful unknowns', () => {
  const fit = assessProjectFit(null, null, saved, now);
  assert.equal(fit.state, 'unknown');
  assert.equal(fit.project, null);
  assert.equal(fit.source.structured, false);
  assert.equal(fit.source.current, false);
  assert.ok(fit.prompts.some(p => p.startsWith('Connect a project')));
  assert.equal(fit.eligibilityExcerpt, saved.source_excerpt);
  assert.equal(assessProjectFit(project, null, saved, now).state, 'unknown');
  assert.equal(assessProjectFit(null, source, saved, now).state, 'unknown');
});

test('stale, missing, future, and untrusted evidence cannot produce a current match or open assertion', () => {
  for (const evidence of [
    { ...source, last_verified_at: '2025-01-01' },
    { ...source, last_verified_at: null, source_fetched_at: null },
    { ...source, last_verified_at: '2027-01-01' },
    { ...source, verification_status: 'needs_verification' },
    { ...source, monitor_next: '2026-10-02' },
  ]) {
    const fit = assessProjectFit(project, evidence, saved, now);
    assert.equal(fit.source.current, false);
    assert.equal(check(fit, 'applicant').state, 'unknown');
    assert.match(check(fit, 'availability').detail, /Recorded round: Unknown/);
  }
  const ended = assessProjectFit(project, { ...source, deadline_at: '2026-09-01', recurrence: 'annual' }, saved, now);
  assert.match(check(ended, 'availability').detail, /Between rounds/);
});

test('archived project is explicit and unsafe source links are not rendered', () => {
  const fit = assessProjectFit({ ...project, archived_at: '2026-10-01' }, null, { source_url: 'javascript:alert(1)' }, now);
  assert.equal(fit.project?.archived, true);
  assert.ok(fit.prompts.some(p => p.includes('archived')));
  assert.equal(fit.source.url, null);
});

test('loader access-checks first and does not query private project for inaccessible application', async () => {
  const statements: string[] = [];
  const db = { query: async (sql: string) => { statements.push(sql); return { rows: [], rowCount: 0 }; } } as unknown as DB;
  await assert.rejects(applicationFit(db, 'user', '11111111-1111-4111-8111-111111111111'), /Workspace access denied/);
  assert.equal(statements.length, 1);
  assert.ok(!statements[0].includes('funding_projects'));
});

test('loader scopes linked project to application workspace and limits rules to published catalog', async () => {
  const statements: { sql: string; args: unknown[] }[] = [];
  const db = { query: async (sql: string, args: unknown[]) => {
    statements.push({ sql, args });
    if (sql.includes('FROM workspace_members')) return { rows: [{ id: 'workspace', role: 'viewer' }], rowCount: 1 };
    if (sql.includes('FROM applications')) return { rows: [{ ...saved, workspace_id: 'workspace', project_id: 'project', opportunity_id: 'opportunity' }], rowCount: 1 };
    if (sql.includes('FROM funding_projects')) return { rows: [project], rowCount: 1 };
    if (sql.includes('FROM opportunities o')) return { rows: [source], rowCount: 1 };
    throw Error(sql);
  } } as unknown as DB;
  const fit = await applicationFit(db, 'user', '11111111-1111-4111-8111-111111111111');
  assert.equal(fit.project?.name, project.name);
  const projectQuery = statements.find(s => s.sql.includes('FROM funding_projects'))!;
  assert.match(projectQuery.sql, /workspace_id=\$2/);
  assert.deepEqual(projectQuery.args, ['project', 'workspace']);
  const rulesQuery = statements.find(s => s.sql.includes('FROM opportunities o'))!;
  assert.match(rulesQuery.sql, /publication_state='published'/);
  assert.match(rulesQuery.sql, /verification_status<>'archived'/);
  assert.match(rulesQuery.sql, /merged_into IS NULL/);
  assert.ok(statements.every(s => /^SELECT/.test(s.sql)));
});


test('declared legal status and service area remain separate unverified facts', () => {
  const fit = assessProjectFit({ ...project, context: { legal_status: 'fiscally_sponsored', service_area: 'New York City residents' } }, source, saved, now);
  assert.match(check(fit, 'legal').detail, /Declared legal status \(user supplied\): fiscally sponsored/);
  assert.match(check(fit, 'geography').detail, /Project location: New Orleans, Louisiana/);
  assert.match(check(fit, 'geography').detail, /Declared service area \(user supplied\): New York City residents/);
  assert.equal(check(fit, 'legal').state, 'unknown');
  assert.equal(check(fit, 'geography').state, 'unknown');
  assert.equal(fit.state, 'unknown');
});
