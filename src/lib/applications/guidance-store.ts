import { z } from 'zod';
import { transaction, type DB } from '../checklists/store';
import { applicationAccess, workspaceAccess } from './store';
import { editorAllowed } from '../beta/security';
import { buildApplicationGuidance, currentGuidanceCycle, emptyGuidance, guidanceFields, guidanceUrl, trustedGuidancePage, type GuidanceEvidencePage, type GuidanceProgram, type GuidanceReview } from './guidance';

async function guidanceEvidence(db: DB, id: string) {
  const program=(await db.query<GuidanceProgram>(`SELECT o.id,o.official_url,o.source_url,o.deadline_at,o.last_verified_at,m.state AS monitor_state,
    EXISTS(SELECT 1 FROM crawl_candidates c WHERE c.opportunity_id=o.id AND c.status='pending' AND c.kind='changed') AS awaiting_review
    FROM opportunities o LEFT JOIN catalog_monitoring m ON m.opportunity_id=o.id
    WHERE o.id=$1 AND NOT o.is_demo AND o.merged_into IS NULL AND o.publication_state='published' AND o.verification_status<>'archived'`,[id])).rows[0];
  if(!program)return null;
  const pages=(await db.query<GuidanceEvidencePage>(`SELECT p.*,s.body,s.links,s.url AS snapshot_url,c.approved_domains,
    (SELECT n.id FROM crawl_snapshots n WHERE n.url=s.url ORDER BY n.fetched_at DESC,n.id DESC LIMIT 1) AS latest_snapshot_id
    FROM program_evidence_pages p JOIN crawl_snapshots s ON s.id=p.snapshot_id JOIN crawl_sources c ON c.id=s.source_id
    WHERE p.opportunity_id=$1`,[id])).rows;
  const reviews=(await db.query<GuidanceReview>('SELECT *,period_end::text FROM opportunity_application_guidance WHERE opportunity_id=$1 AND revoked_at IS NULL ORDER BY verified_at,id',[id])).rows;
  const states=(await db.query<{field:string;state:string}>('SELECT field,state FROM catalog_field_state WHERE opportunity_id=$1',[id])).rows;
  return {program,pages,reviews,states};
}
export async function opportunityGuidance(db: DB, user: string, id: string) {
  z.string().uuid().parse(id);await workspaceAccess(db,user);
  const data=await guidanceEvidence(db,id);
  return data?buildApplicationGuidance(data.program,data.pages,data.reviews,data.states):emptyGuidance();
}
export async function applicationGuidance(db: DB, user: string, applicationId: string) {
  const app=await applicationAccess(db,user,applicationId);
  return app.opportunity_id?opportunityGuidance(db,user,app.opportunity_id):emptyGuidance();
}
export const guidanceReviewInput=z.object({
  field:z.enum(guidanceFields), value:z.string().trim().min(1).max(3000), snapshot_id:z.string().uuid(),
  source_excerpt:z.string().trim().min(10).max(6000), source_section:z.string().trim().max(300).default(''),
  applicant_scope:z.string().trim().max(1000).default(''), cycle:z.string().trim().min(4).max(80).nullable(),
  period_end:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v).nullable(),
});
/** Explicit editorial ingestion. Uses existing snapshots only; never retrieves a page or accepts client provenance dates. */
export async function recordGuidanceReview(db: DB, user: string, opportunityId: string, input: unknown) {
  z.string().uuid().parse(opportunityId);const v=guidanceReviewInput.parse(input);
  return transaction(db,async c=>{
    if(!await editorAllowed(c,user))throw Error('Catalog editor access is required.');
    await c.query('SELECT pg_advisory_xact_lock(7823091)');
    const data=await guidanceEvidence(c,opportunityId),page=data?.pages.find(p=>p.snapshot_id===v.snapshot_id);
    if(!data||!page||!trustedGuidancePage(data.program,page)||data.program.awaiting_review||data.program.monitor_state==='discontinued')throw Error('A current associated official snapshot is required.');
    if(!currentGuidanceCycle(v.cycle,v.period_end,data.program.deadline_at)||!page.body.includes(v.source_excerpt)||v.applicant_scope&&!page.body.includes(v.applicant_scope))throw Error('An exact current-cycle source excerpt and applicant scope are required.');
    if(v.field==='application_url'){
      const url=guidanceUrl(v.value);
      if(!url||!Array.isArray(page.links)||!page.links.some(l=>guidanceUrl(l)===url))throw Error('The application URL must be an explicit link in the official snapshot.');
    }else if(!v.source_excerpt.includes(v.value))throw Error('Use the exact requirement or question from the cited excerpt.');
    if(v.field==='eligibility'&&v.value.length>1000)throw Error('Split eligibility into source-supported requirements of at most 1000 characters.');
    const id=(await c.query(`INSERT INTO opportunity_application_guidance(opportunity_id,field,value,snapshot_id,source_url,source_excerpt,source_section,applicant_scope,cycle,period_end,reviewed_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,[opportunityId,v.field,v.value,page.snapshot_id,page.url,v.source_excerpt,v.source_section,v.applicant_scope,v.cycle,v.period_end,user])).rows[0].id as string;
    await c.query("INSERT INTO catalog_moderation_events(opportunity_id,actor_id,action,details) VALUES($1,$2,'guidance_review',$3)",[opportunityId,user,JSON.stringify({reviewId:id,field:v.field,snapshotId:page.snapshot_id})]);
    return id;
  });
}
/** Withdraw from current guidance without changing copied private provenance. */
export async function revokeGuidanceReview(db: DB, user: string, opportunityId: string, reviewId: string) {
  z.string().uuid().parse(opportunityId);z.string().uuid().parse(reviewId);
  return transaction(db,async c=>{
    if(!await editorAllowed(c,user))throw Error('Catalog editor access is required.');
    await c.query('SELECT pg_advisory_xact_lock(7823091)');
    if(!(await c.query('UPDATE opportunity_application_guidance SET revoked_at=now() WHERE id=$1 AND opportunity_id=$2 AND revoked_at IS NULL',[reviewId,opportunityId])).rowCount)throw Error('Current guidance review not found.');
    await c.query("INSERT INTO catalog_moderation_events(opportunity_id,actor_id,action,details) VALUES($1,$2,'guidance_withdrawn',$3)",[opportunityId,user,JSON.stringify({reviewId})]);
  });
}
