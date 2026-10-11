import { applicationAccess } from './store';
import type { DB } from '../checklists/store';
import type { ProjectContext } from '../projects/context';
import { applicantDisjoint, applicantMatches, currentSource, resultAvailability, type GrantResult, type Geography } from '../opportunities/ranking';
import { availabilityLabel } from '../opportunities/availability';
import { catalogAvailabilitySql } from '../opportunities/availability-sql';

export type FitProject = { id: string; name: string; applicant_type: string; country: string; state?: string; city?: string; postal_code?: string; archived_at?: Date | string | null; context?: ProjectContext };
export type FitEvidence = {
  source_url: string; source_fetched_at?: Date | string | null; last_verified_at?: Date | string | null;
  auto_verified_at?: Date | string | null; monitor_success?: Date | string | null; monitor_next?: Date | string | null;
  verification_status?: string; publication_provenance?: Record<string, unknown>; applicant_types: string[];
  geographies: Geography[]; eligibility_notes?: string; status?: string; deadline_at?: Date | string | null;
  opens_at?: Date | string | null; rolling?: boolean; recurrence?: string | null;
};
export type FitCheck = { key: string; label: string; state: 'recorded_match' | 'unknown' | 'excluded'; detail: string };
export type ApplicationFit = {
  project: { id: string; name: string; archived: boolean } | null;
  state: 'unknown' | 'excluded'; summary: string; checks: FitCheck[]; prompts: string[];
  source: { url: string | null; fetchedAt: string | null; checkedAt: string | null; current: boolean; structured: boolean };
  eligibilityExcerpt: string | null;
};
const iso = (v: Date | string | null | undefined) => v && Number.isFinite(new Date(v).getTime()) ? new Date(v).toISOString() : null;
const safeUrl = (v: string) => { try { const u = new URL(v); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; } catch { return null; } };

/** Only broad recorded facts are compared. Project location does not establish residence or service area. */
export function assessProjectFit(project: FitProject | null, evidence: FitEvidence | null, saved: { source_url: string; source_fetched_at?: Date | string | null; source_excerpt?: string | null }, now = Date.now()): ApplicationFit {
  const p = evidence?.publication_provenance ?? {};
  const official = p.method === 'official-structured-data' && ['grants-gov', 'california'].includes(String(p.provider));
  const verified = evidence?.verification_status === 'verified' && !!iso(evidence.last_verified_at);
  const checked = official ? iso(evidence?.source_fetched_at) : [iso(evidence?.last_verified_at), iso(evidence?.monitor_success)].filter((v): v is string => !!v).sort().at(-1) ?? null;
  const stale = !!evidence?.monitor_next && Date.parse(iso(evidence.monitor_next) ?? '') < now && (!evidence.last_verified_at || Date.parse(iso(evidence.last_verified_at) ?? '') < Date.parse(iso(evidence.monitor_next) ?? ''));
  const result: GrantResult = {
    id: '', kind: 'catalog', title: '', source: '', url: evidence?.source_url ?? saved.source_url, slug: null, summary: '', amount: '', maximum: null,
    deadline: iso(evidence?.deadline_at), opens: iso(evidence?.opens_at), rolling: evidence?.rolling, recurrence: evidence?.recurrence,
    status: evidence?.status ?? 'unknown', categories: [], applicants: evidence?.applicant_types ?? [], locations: [],
    verified, officialSource: official, sourceStale: !official && stale, sourceChecked: checked,
    fetched: iso(evidence?.source_fetched_at), reasons: [], conflicts: 0, matches: 0, relevance: 0, applicationId: null, awaitingReview: false,
  };
  const fresh = !!evidence && currentSource(result, now);
  const trusted = fresh && (verified || official);
  const types = evidence?.applicant_types ?? [];
  const complete = p.applicant_types_complete === true && Array.isArray(p.applicant_types) && JSON.stringify([...p.applicant_types].sort()) === JSON.stringify([...types].sort());
  const conflict = !!project && !!project.applicant_type && trusted && (complete || verified && !evidence?.auto_verified_at) && applicantDisjoint(types, project.applicant_type) && !applicantMatches(types, project.applicant_type);
  const broadMatch = !!project && trusted && applicantMatches(types, project.applicant_type);
  const coverage = (evidence?.geographies ?? []).map(g => `${g.rule === 'excluded' ? 'Excluded' : g.rule === 'eligible' ? 'Listed' : 'Unclear rule'}: ${[g.postal_code, g.borough, g.county, g.city, g.state, g.country].filter(Boolean).join(', ') || 'unspecified area'}`).join('; ');
  const location = project ? [project.city, project.state, project.country, project.postal_code].filter(Boolean).join(', ') : '';
  const serviceArea = project?.context?.service_area?.trim();
  const legalStatus = project?.context?.legal_status;
  const legalLabel = legalStatus && legalStatus !== 'unknown' ? legalStatus.replaceAll('_', ' ') : 'not recorded';
  const checks: FitCheck[] = [
    { key: 'applicant', label: 'Applicant type', state: conflict ? 'excluded' : broadMatch ? 'recorded_match' : 'unknown', detail: !project ? 'Connect a project to compare its applicant type.' : conflict ? `Project type: ${project.applicant_type}. Current recorded requirements list ${types.join(', ')}; these broad types conflict. Confirm with the funder before proceeding.` : broadMatch ? `Project type ${project.applicant_type} matches a recorded broad applicant category. This does not establish legal eligibility.` : `Project type: ${project.applicant_type || 'not recorded'}. ${types.length ? `Recorded categories: ${types.join(', ')}. Tags may be incomplete or the source needs checking.` : 'No structured applicant requirements are available.'}` },
    { key: 'geography', label: 'Location and service area', state: 'unknown', detail: `${location ? `Project location: ${location}. ` : ''}${serviceArea ? `Declared service area (user supplied): ${serviceArea}. ` : 'Service area: not recorded. '}${coverage ? `Recorded geographic rules: ${coverage}. ` : 'No structured geographic requirements are recorded. '}The recorded rules do not identify whether they apply to applicant residence, registration, project delivery, or beneficiaries. Confirm the required location and actual service area.` },
    { key: 'legal', label: 'Legal and program requirements', state: 'unknown', detail: `Declared legal status (user supplied): ${legalLabel}. A broad applicant type does not confirm incorporation, tax-exempt status, fiscal sponsorship, ownership, residency, or other program-specific requirements. Check the official rules and supporting evidence.` },
    { key: 'availability', label: 'Application round', state: 'unknown', detail: `Recorded round: ${availabilityLabel(evidence ? resultAvailability(result, now) : 'unknown', !!evidence?.rolling)}.${result.deadline ? ` Recorded deadline: ${result.deadline.slice(0, 10)} (confirm the funder’s time zone).` : ''} Confirm the current round and submission deadline on the official source.` },
    { key: 'source', label: 'Source freshness', state: 'unknown', detail: !evidence ? 'This saved source has no available published catalog rules. A saved excerpt is research evidence only.' : trusted ? 'Source evidence was checked or fetched within 90 days. Requirements can still change; review the linked source.' : 'Current, trusted source evidence is unavailable or older than 90 days. Recheck requirements before relying on them.' },
  ];
  return {
    project: project ? { id: project.id, name: project.name, archived: !!project.archived_at } : null,
    state: conflict ? 'excluded' : 'unknown', summary: conflict ? 'A recorded applicant-type conflict needs attention.' : 'Eligibility needs confirmation.', checks,
    prompts: [...(!project ? ['Connect a project below to compare its saved applicant details.'] : []), ...(project?.archived_at ? ['This linked project is archived. Confirm its details are still current.'] : []), 'Confirm which legal entity or individual will apply and any required status or fiscal sponsor.', 'Confirm whether the geographic rules concern the applicant, the work, or the people served.', 'Review every official requirement, including restrictions not represented here.'],
    source: { url: safeUrl(evidence?.source_url ?? saved.source_url), fetchedAt: iso(evidence?.source_fetched_at ?? saved.source_fetched_at), checkedAt: checked, current: trusted, structured: !!evidence },
    eligibilityExcerpt: evidence?.eligibility_notes?.trim() || saved.source_excerpt?.trim() || null,
  };
}

export async function applicationFit(db: DB, user: string, applicationId: string): Promise<ApplicationFit> {
  const app = await applicationAccess(db, user, applicationId);
  const project = app.project_id ? (await db.query<FitProject>('SELECT id,name,applicant_type,country,state,city,postal_code,archived_at,context FROM funding_projects WHERE id=$1 AND workspace_id=$2', [app.project_id, app.workspace_id])).rows[0] ?? null : null;
  const evidence = app.opportunity_id ? (await db.query<FitEvidence>(`SELECT o.*,${catalogAvailabilitySql} AS status,
    m.last_success_at AS monitor_success,m.next_check_at AS monitor_next,
    ARRAY(SELECT applicant_type FROM opportunity_applicant_types WHERE opportunity_id=o.id ORDER BY applicant_type) AS applicant_types,
    (SELECT coalesce(jsonb_agg(jsonb_build_object('country',g.country,'state',g.state,'city',g.city,'county',g.county,'borough',g.borough,'postal_code',g.postal_code,'rule',g.rule)),'[]') FROM opportunity_geographies g WHERE g.opportunity_id=o.id) AS geographies
    FROM opportunities o LEFT JOIN catalog_monitoring m ON m.opportunity_id=o.id
    WHERE o.id=$1 AND o.publication_state='published' AND o.verification_status<>'archived' AND o.merged_into IS NULL AND NOT o.is_demo`, [app.opportunity_id])).rows[0] ?? null : null;
  return assessProjectFit(project, evidence, app);
}
