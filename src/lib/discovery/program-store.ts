import type {Client,PoolClient} from "pg";
import type {CrawlPage} from "./reader";
import {canonicalUrl} from "../opportunities/research";
import {pageRole,programFacts,resolveProgramFacts,PROGRAM_PARSER_VERSION,factFields,type Fact} from "./program-evidence";
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
 const states=(await db.query('SELECT * FROM catalog_field_state WHERE opportunity_id=$1',[id])).rows;
 for(const field of factFields){
  const state=states.find(s=>s.field===field),reason=resolved.reasons[field]??'',conflict=/conflict/i.test(reason),value=resolved.values[field];
  const old=await fieldValue(db,grant,field);
  let next=value===undefined?(conflict?emptyValue(field):old):['applicants','geography'].includes(field)?JSON.parse(value):field==='rolling'?value==='true':['minimum','maximum'].includes(field)?Number(value):value;
  // Eligibility is compound prose. A single supported sentence is useful for a blank
  // record, but omission of other conditions does not justify replacing complete notes.
  if(field==='eligibility'&&value&&old&&old!=='Unknown'&&!evidence.some(f=>f.field===field&&f.value===value&&f.rule==='eligibility-section-v4'))next=old;
  const changed=!sameFactValue(old,next);
  const supporting=evidence.filter(f=>f.field===field);
  const outcome=state?.locked&&changed?'locked_conflict':conflict?'conflicting':value!==undefined?'found':'not_checked';
  await db.query(`INSERT INTO catalog_field_state(opportunity_id,field,state,evidence,reason,parser_version) VALUES($1,$2,$3,$4,$5,$6)
   ON CONFLICT(opportunity_id,field) DO UPDATE SET state=CASE WHEN excluded.state='not_checked' THEN catalog_field_state.state ELSE excluded.state END,evidence=excluded.evidence,reason=excluded.reason,parser_version=excluded.parser_version,updated_at=now()`,[id,field,outcome,JSON.stringify(supporting),state?.locked&&changed?'Locked correction differs from official evidence':reason,PROGRAM_PARSER_VERSION]);
  if(!changed||state?.locked)continue;
  await db.query('INSERT INTO catalog_field_history(opportunity_id,field,old_value,new_value,evidence,parser_version) VALUES($1,$2,$3,$4,$5,$6)',[id,field,JSON.stringify(old),JSON.stringify(next),JSON.stringify(supporting),PROGRAM_PARSER_VERSION]);
  await writeField(db,id,field,next);
  // The audit preserves human values; an automatic edit is not human verification.
  await db.query("UPDATE opportunities SET verification_status='needs_verification',last_verified_at=NULL,auto_verified_at=NULL,updated_at=now(),catalog_updated_at=now() WHERE id=$1",[id]);
 }
 await db.query(`UPDATE opportunities SET source_fetched_at=coalesce((SELECT max(fetched_at) FROM program_evidence_pages WHERE opportunity_id=$1),source_fetched_at),publication_provenance=publication_provenance||jsonb_build_object('reconciliation',$2::jsonb) WHERE id=$1`,[id,JSON.stringify({reasons:resolved.reasons,method:'related-official-pages',parser:PROGRAM_PARSER_VERSION})]);
 return resolved;
}

export function emptyValue(field:string):any{return field==='status'?'unknown':field==='eligibility'?'Unknown':field==='rolling'?false:['applicants','geography'].includes(field)?[]:null;}
export function sameFactValue(a:any,b:any):boolean{
 const stable=(v:any):any=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
 return JSON.stringify(stable(a))===JSON.stringify(stable(b));
}
export async function fieldValue(db:Client|PoolClient,g:any,field:string):Promise<any>{
 if(field==='applicants')return (await db.query('SELECT applicant_type FROM opportunity_applicant_types WHERE opportunity_id=$1 ORDER BY applicant_type',[g.id])).rows.map(r=>r.applicant_type);
 if(field==='geography')return (await db.query("SELECT jsonb_strip_nulls(jsonb_build_object('country',country,'state',state,'city',city,'county',county,'borough',borough,'postal_code',postal_code,'rule',rule)) g FROM opportunity_geographies WHERE opportunity_id=$1 ORDER BY country,state,city",[g.id])).rows.map(r=>r.g);
 const key=({status:'application_status',deadline:'deadline_at',minimum:'minimum_award',maximum:'maximum_award',eligibility:'eligibility_notes',rolling:'rolling'} as Record<string,string>)[field];
 const v=g[key];return field==='deadline'&&v?new Date(v).toISOString().slice(0,10):['minimum','maximum'].includes(field)&&v!==null?Number(v):v;
}
export async function writeField(db:Client|PoolClient,id:string,field:string,value:any){
 if(field==='applicants'){
  await db.query('DELETE FROM opportunity_applicant_types WHERE opportunity_id=$1',[id]);
  await db.query('INSERT INTO opportunity_applicant_types SELECT $1,unnest($2::text[]) ON CONFLICT DO NOTHING',[id,value]);return;
 }
 if(field==='geography'){
  await db.query('DELETE FROM opportunity_geographies WHERE opportunity_id=$1',[id]);
  for(const g of value)await db.query('INSERT INTO opportunity_geographies(opportunity_id,country,state,city,county,borough,postal_code,rule) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,g.country??null,g.state??null,g.city??null,g.county??null,g.borough??null,g.postal_code??null,g.rule??'eligible']);return;
 }
 const key=({status:'application_status',deadline:'deadline_at',minimum:'minimum_award',maximum:'maximum_award',eligibility:'eligibility_notes',rolling:'rolling'} as Record<string,string>)[field];
 if(!key)throw Error('Invalid catalog field');
 await db.query(`UPDATE opportunities SET ${key}=$2 WHERE id=$1`,[id,value]);
 if(field==='rolling'&&value)await db.query("UPDATE opportunities SET deadline_notes='Rolling applications; check the official source' WHERE id=$1",[id]);
}
