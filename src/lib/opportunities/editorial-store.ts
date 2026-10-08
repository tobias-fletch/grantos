import { editorAllowed } from '../beta/security';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient, Client } from 'pg';
import { z } from 'zod';
import { reviewSchema, parseLocations } from './editorial';
import { canonicalUrl } from './research';
// Caller owns a transaction and catalog advisory lock. All writes and audit history commit together.
export async function writeReviewedGrant(db:Pool|PoolClient|Client,userId:string,data:z.infer<typeof reviewSchema>,editorEmails=process.env.CATALOG_EDITOR_EMAILS??'',candidateId?:string) {

 if(!await editorAllowed(db,userId))throw new Error('Catalog editor access is required.');
 data=reviewSchema.parse(data);
 const url=canonicalUrl(data.url),locations=parseLocations(data.locations);
 if(candidateId){
  const candidate=(await db.query("SELECT * FROM crawl_candidates WHERE id=$1 AND status='pending' AND kind<>'domain' FOR UPDATE",[candidateId])).rows[0];
  if(!candidate || canonicalUrl(candidate.url)!==url || (candidate.opportunity_id && candidate.opportunity_id!==data.id))throw new Error('Review candidate is no longer current or does not match this grant.');
 }
  const existing=await db.query('SELECT id,official_url,source_url,name FROM opportunities');
  const normalizeName=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
  const duplicate=existing.rows.find(o=>o.id!==data.id && (normalizeName(o.name)===normalizeName(data.name) || [o.official_url,o.source_url].some(u=>{try{return canonicalUrl(u)===url;}catch{return false;}})));
  if(duplicate)throw new Error('This program or source is already in the catalog. Open the existing record to review it.');
  if(data.id&&!existing.rows.some(o=>o.id===data.id))throw new Error('Catalog record not found.');
  let funder=(await db.query('SELECT id FROM funders WHERE lower(name)=lower($1) LIMIT 1',[data.funder])).rows[0]?.id;
  if(!funder)funder=(await db.query('INSERT INTO funders(name,website_url) VALUES($1,$2) RETURNING id',[data.funder,url])).rows[0].id;
  const id=data.id||randomUUID();
  if(!data.id)await db.query("INSERT INTO opportunities(id,name,slug,funding_type,official_url,source_url) VALUES($1,$2,$3,'grant',$4,$4)",[id,data.name,`grant-${id}`,url]);
  // Cycle-specific fields are reset; old dates, fees, or rolling flags must not survive a review silently.
  await db.query(`UPDATE opportunities SET name=$2,funder_id=$3,official_url=$4,source_url=$4,summary=$5,
   eligibility_notes=$6,deadline_notes=$7,application_status=$8,minimum_award=$9,maximum_award=$10,
   deadline_at=$11,opens_at=$12,rolling=$14,application_fee=$15,typical_award=NULL,currency=$16,
   publication_state=CASE WHEN $13='archived' THEN 'hidden' ELSE 'published' END,last_checked_at=now(),last_verified_at=now(),updated_at=now(),catalog_updated_at=CASE WHEN $17 THEN now() ELSE catalog_updated_at END,verification_status=$13::verification_status WHERE id=$1`,
   [id,data.name,funder,url,data.summary,data.eligibility,data.notes,data.status,data.minimum,data.maximum,data.deadline,data.opens,data.archive?'archived':'verified',data.rolling,data.fee,data.currency,!!data.id]);
  await db.query("UPDATE opportunities SET publication_provenance=publication_provenance||jsonb_build_object('category_origin','editor') WHERE id=$1",[id]);
  await db.query('DELETE FROM opportunity_categories WHERE opportunity_id=$1',[id]);
  await db.query('INSERT INTO opportunity_categories SELECT $1,unnest($2::text[])',[id,data.categories]);
  await db.query('DELETE FROM opportunity_applicant_types WHERE opportunity_id=$1',[id]);
  await db.query('INSERT INTO opportunity_applicant_types SELECT $1,unnest($2::text[])',[id,data.applicants]);
  await db.query('DELETE FROM opportunity_geographies WHERE opportunity_id=$1',[id]);
  for(const loc of locations)await db.query('INSERT INTO opportunity_geographies(opportunity_id,country,state,city) VALUES($1,$2,$3,$4)',[id,loc.country,loc.state,loc.city]);
  await db.query('INSERT INTO opportunity_reviews(opportunity_id,reviewed_by,source_url,evidence,details) VALUES($1,$2,$3,$4,$5)',[id,userId,url,data.evidence,JSON.stringify(data)]);
  if(!data.archive)await db.query("UPDATE catalog_monitoring SET state='active',evidence=$2,changed_at=now() WHERE opportunity_id=$1 AND state='discontinued'",[id,'Editor reviewed and republished this program.']);
  if(candidateId)await db.query("UPDATE crawl_candidates SET status='approved',opportunity_id=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$1",[candidateId,id,userId]);
  return id;
}
