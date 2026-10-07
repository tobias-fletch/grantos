import type {Client,PoolClient} from "pg";
import type {CrawlPage} from "./reader";
import {canonicalUrl} from "../opportunities/research";
import {pageRole,programFacts,resolveProgramFacts,type Fact} from "./program-evidence";
export async function attachEvidence(db:Client|PoolClient,id:string,page:CrawlPage,snapshot:any,association:string){
 const role=pageRole(page.title,page.url,page.text);
 await db.query(`INSERT INTO program_evidence_pages(opportunity_id,url,role,association,snapshot_id,fetched_at,facts) VALUES($1,$2,$3,$4,$5,$6,$7)
  ON CONFLICT(opportunity_id,url) DO UPDATE SET role=excluded.role,association=excluded.association,snapshot_id=excluded.snapshot_id,fetched_at=excluded.fetched_at,facts=excluded.facts`,
 [id,canonicalUrl(page.url),role,association,snapshot.id,snapshot.fetched_at,JSON.stringify(association==='catalog-source-context-unresolved'?[]:programFacts(page,new Date(snapshot.fetched_at).toISOString()))]);
 await db.query('INSERT INTO opportunity_source_urls(url,opportunity_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[canonicalUrl(page.url),id]);
}
export async function applyProgramEvidence(db:Client|PoolClient,id:string){
 const grant=(await db.query('SELECT * FROM opportunities WHERE id=$1 FOR UPDATE',[id])).rows[0];
 const evidence=(await db.query('SELECT facts FROM program_evidence_pages WHERE opportunity_id=$1',[id])).rows.flatMap(r=>r.facts as Fact[]);
 const resolved=resolveProgramFacts(evidence);
 if(!grant||grant.publication_state==='hidden'||grant.merged_into||grant.verification_status==='archived')return resolved;
 if(grant.last_verified_at||grant.verification_status==='verified'||grant.publication_origin!=='crawler'){
  resolved.reasons.review='Editor-verified facts are preserved; changed evidence requires review';return resolved;
 }
 const v=resolved.values;
 // Absence is not a change. Explicit contradictory evidence is a change and stays unresolved.
 const status=v.status??(/conflict/i.test(resolved.reasons.status??'')?'unknown':null);
 await db.query(`UPDATE opportunities SET application_status=coalesce($2,application_status),
 deadline_at=CASE WHEN $6 THEN NULL ELSE coalesce($3::date,deadline_at) END,
 maximum_award=CASE WHEN $7 THEN NULL ELSE coalesce($4::numeric,maximum_award) END,
 eligibility_notes=CASE WHEN $8 THEN 'Unknown' ELSE coalesce($5,eligibility_notes) END,
 source_fetched_at=coalesce((SELECT max(fetched_at) FROM program_evidence_pages WHERE opportunity_id=$1),source_fetched_at),publication_provenance=publication_provenance||jsonb_build_object('reconciliation', $9::jsonb),updated_at=now(),catalog_updated_at=now()
 WHERE id=$1`,[id,status,v.deadline??null,v.maximum??null,v.eligibility??null,/conflict/i.test(resolved.reasons.deadline??''),/conflict/i.test(resolved.reasons.maximum??''),/conflict/i.test(resolved.reasons.eligibility??''),JSON.stringify({reasons:resolved.reasons,method:'related-official-pages'})]);
 return resolved;
}
