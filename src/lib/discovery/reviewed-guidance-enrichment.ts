import type {Client,PoolClient} from 'pg';
import {reviewedStarterSchema,validateReviewedStarter,reviewedHash,type ReviewedStarter,type ReviewedRecord} from './reviewed-starter';

type Result={key:string;opportunityId:string|null;outcome:'enriched'|'unchanged'|'skipped';reason?:string;addedFacts:number};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const host=(u:string)=>new URL(u).hostname.replace(/^www\./,'');
const exactLink=(r:ReviewedRecord,url:string)=>r.sources.some(s=>s.url===r.officialUrl&&['program','application'].includes(s.role)&&(s.links.includes(url)||r.sources.some(m=>host(m.url)===host(r.officialUrl)&&['program','application','guidelines'].includes(m.role)&&s.links.includes(m.url)&&m.links.includes(url))));
const withdrawalReason=(key:string,f:Record<string,unknown>)=>key==='la-shaw-center-subsidy'&&f.field==='criterion'&&f.value==='Funds received asa result of this application will be used solely for the project described herein.'?'Post-award use condition, not a selection criterion.':key==='ny-nyserda-pon3414'&&f.field==='deadline'&&f.value==='accepted on a rolling basis'?'Rolling intake is compatible with the retained explicit closing date; not a competing deadline.':null;
const factKey=(g:Record<string,unknown>)=>JSON.stringify([g.field,g.value,g.sourceUrl,g.excerpt,g.applicantScope??'',g.cycle,g.periodEnd]);
/** Reviewed evidence revisions only. Caller owns isolated-staging guard and transaction. */
export async function enrichReviewedGuidance(db:Client|PoolClient,input:unknown,now=Date.now()):Promise<Result[]>{
 const manifest=reviewedStarterSchema.parse(input),completionKey=reviewedHash({manifest,mode:'guidance-enrichment-v1'});
 await db.query('SELECT pg_advisory_xact_lock(7823091)');
 const audits=(await db.query("SELECT action,subject FROM catalog_admin_events WHERE action IN ('reviewed_staging_import','reviewed_staging_evidence_append','reviewed_guidance_revision','reviewed_guidance_manifest_complete')")).rows.map(a=>({...JSON.parse(a.subject),action:a.action}));
 const complete=audits.find(a=>a.action==='reviewed_guidance_manifest_complete'&&a.completionKey===completionKey);
 if(complete)return complete.records.map((r:Result)=>({...r,outcome:'unchanged',addedFacts:0,reason:'Exact guidance revision already applied; no dates refreshed.'}));
 validateReviewedStarter(manifest,now);
 const tracked=new Map<string,string>();for(const a of audits)if(a.opportunityId&&a.key)tracked.set(a.key,a.opportunityId);
 const managedIds=new Set(manifest.records.map(r=>tracked.get(r.key)).filter(Boolean));
 const results:Result[]=[];
 for(const r of manifest.records){
  const id=tracked.get(r.key),recordHash=reviewedHash(r);
  const skip=(reason:string)=>results.push({key:r.key,opportunityId:id??null,outcome:'skipped',reason,addedFacts:0});
  if(!id){skip('No prior reviewed starter import audit; ordinary catalog records are not revised.');continue;}
  if(audits.some(a=>a.action==='reviewed_guidance_revision'&&a.opportunityId===id&&a.recordHash===recordHash)){results.push({key:r.key,opportunityId:id,outcome:'unchanged',addedFacts:0});continue;}
  const program=(await db.query('SELECT * FROM opportunities WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!program||program.publication_state!=='published'||program.verification_status==='archived'||program.merged_into||program.is_demo||![program.official_url,program.source_url].includes(r.officialUrl)){skip('Program identity/publication changed.');continue;}
  const protection=(await db.query(`SELECT 'protected' FROM catalog_field_state WHERE opportunity_id=$1 AND (locked OR state IN ('locked_conflict','inaccessible') OR state='conflicting' AND parser_version<>'reviewed-starter-v1')
   UNION ALL SELECT 'changed' FROM crawl_candidates WHERE opportunity_id=$1 AND status='pending' AND kind='changed'
   UNION ALL SELECT 'discontinued' FROM catalog_monitoring WHERE opportunity_id=$1 AND state='discontinued'
   UNION ALL SELECT 'human review' FROM opportunity_application_guidance WHERE opportunity_id=$1`,[id])).rowCount;
  if(protection){skip('Locked/manual conflict, pending source change, discontinuation or human review is preserved.');continue;}
  const existing=(await db.query(`SELECT p.*,s.body,s.links,s.hash,s.extracted FROM program_evidence_pages p JOIN crawl_snapshots s ON s.id=p.snapshot_id WHERE p.opportunity_id=$1`,[id])).rows;
  let unsafe='';
  for(const source of r.sources){
   const old=existing.find(p=>p.url===source.url);
   // A revision must retain every previously captured quote and link verbatim.
   if(old&&(!source.body.includes(old.body)||!Array.isArray(old.links)||old.links.some((link:string)=>!source.links.includes(link))))unsafe='A previous exact source excerpt or link is absent; explicit source-change review required.';
   const related=(await db.query(`SELECT p.opportunity_id,p.snapshot_id,p.facts,s.body,s.links,o.publication_state,o.verification_status,o.merged_into,o.is_demo FROM program_evidence_pages p JOIN crawl_snapshots s ON s.id=p.snapshot_id JOIN opportunities o ON o.id=p.opportunity_id WHERE p.url=$1`,[source.url])).rows;
   const relatedIds=related.map(p=>p.opportunity_id);
   if(relatedIds.length&&(await db.query("SELECT 1 FROM catalog_field_state WHERE opportunity_id=ANY($1::uuid[]) AND (locked OR state IN ('locked_conflict','inaccessible') OR state='conflicting' AND parser_version<>'reviewed-starter-v1') UNION ALL SELECT 1 FROM crawl_candidates WHERE opportunity_id=ANY($1::uuid[]) AND status='pending' AND kind='changed' UNION ALL SELECT 1 FROM catalog_monitoring WHERE opportunity_id=ANY($1::uuid[]) AND state='discontinued'",[relatedIds])).rowCount)unsafe='A related program sharing this source is protected or awaiting review.';
   for(const p of related)if(p.publication_state!=='published'||p.verification_status==='archived'||p.merged_into||p.is_demo||p.facts.some((f:Record<string,unknown>)=>f.rule!=='reviewed-starter-v1')||!managedIds.has(p.opportunity_id)||!source.body.includes(p.body)||p.links.some((link:string)=>!source.links.includes(link)))unsafe='Source URL belongs to unrelated evidence or no longer supports another program’s prior excerpts.';
   const human=(await db.query('SELECT 1 FROM opportunity_application_guidance WHERE source_url=$1 LIMIT 1',[source.url])).rowCount;
   if(human)unsafe='Human-reviewed source URL is immutable; no automatic pointer changes.';
   const latest=(await db.query('SELECT id,body,links,extracted FROM crawl_snapshots WHERE url=$1 ORDER BY fetched_at DESC,recorded_at DESC,id DESC LIMIT 1',[source.url])).rows[0];
   if(latest&&(!['official-excerpt-only-v1','reviewed-guidance-composite-v1'].includes(latest.extracted?.format)||!source.body.includes(latest.body)||latest.links.some((link:string)=>!source.links.includes(link))))unsafe='Newer or incompatible snapshot exists; source-change reconciliation required.';
   if(old&&(old.facts as Record<string,unknown>[]).some(f=>f.rule!=='reviewed-starter-v1'))unsafe='Existing non-starter facts are preserved for explicit review.';
  }
  if(unsafe){skip(unsafe);continue;}
  let added=0;
  // Precisely refine an assistant-created broad conflict, never a manual state.
  const states=(await db.query("SELECT * FROM catalog_field_state WHERE opportunity_id=$1 AND NOT locked AND state='conflicting' AND parser_version='reviewed-starter-v1'",[id])).rows;
  for(const state of states){const refined=r.conflicts.find(c=>c.reason===state.reason&&c.field!==state.field);
   if(refined){await db.query("INSERT INTO catalog_field_history(opportunity_id,field,old_value,new_value,evidence,parser_version,action) VALUES($1,'conflict_scope',$2,$3,$4,'reviewed-starter-v1','reviewed-guidance-conflict-refinement')",[id,JSON.stringify({field:state.field,reason:state.reason}),JSON.stringify(refined),JSON.stringify({reviewedAt:manifest.reviewedAt,method:'assistant-reviewed'})]);
    await db.query('UPDATE catalog_field_state SET field=$3 WHERE opportunity_id=$1 AND field=$2 AND NOT locked AND parser_version=\'reviewed-starter-v1\'',[id,state.field,refined.field]);}
  }
  for(const source of r.sources){
   const old=existing.find(p=>p.url===source.url),oldFacts:Record<string,unknown>[]=old?.facts??[];
   const additions=r.guidance.filter(g=>g.sourceUrl===source.url&&!oldFacts.some(f=>factKey(f)===factKey(g)));
   added+=additions.length;
   const facts=[...oldFacts.map(f=>({...f,conflict:r.conflicts.some(c=>c.field===f.field),...(withdrawalReason(r.key,f)?{withdrawn:true,withdrawalReason:withdrawalReason(r.key,f)}:{})})),...additions.map(g=>({...g,rule:'reviewed-starter-v1',reviewMethod:'assistant-reviewed',reviewedAt:manifest.reviewedAt,conflict:r.conflicts.some(c=>c.field===g.field)}))];
   const sid=(await db.query('INSERT INTO crawl_sources(name,url,approved_domains,geography,enabled) VALUES($1,$2,$3,$4,false) ON CONFLICT(url) DO NOTHING RETURNING id',[source.title,source.url,[new URL(source.url).hostname],r.geographyNotes])).rows[0]?.id??(await db.query('SELECT id FROM crawl_sources WHERE url=$1',[source.url])).rows[0].id;
   let snapshotId=old?.snapshot_id,fetchedAt=old?.fetched_at;
   if(!old||old.body!==source.body||!same(old.links,source.links)){
    const hash=reviewedHash({body:source.body,links:source.links,fetchedAt:source.fetchedAt,format:'reviewed-guidance-composite-v1'});
    const snapshot=(await db.query(`INSERT INTO crawl_snapshots(source_id,url,hash,title,body,links,extracted,fetched_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(source_id,url,hash) DO NOTHING RETURNING id,fetched_at`,[sid,source.url,hash,source.title,source.body,JSON.stringify(source.links),JSON.stringify({format:'reviewed-guidance-composite-v1',reviewMethod:'assistant-reviewed',reviewedAt:manifest.reviewedAt,accessMethod:source.accessMethod,accessNotes:source.accessNotes,priorSnapshotId:old?.snapshot_id??null}),source.fetchedAt])).rows[0]??(await db.query('SELECT id,fetched_at FROM crawl_snapshots WHERE source_id=$1 AND url=$2 AND hash=$3',[sid,source.url,hash])).rows[0];snapshotId=snapshot.id;fetchedAt=snapshot.fetched_at;
    // Other managed programs retain their exact fact lists on the shared new
    // immutable source snapshot. Preflight checked all prior excerpts and links.
    await db.query('UPDATE program_evidence_pages SET snapshot_id=$2,fetched_at=$3 WHERE url=$1 AND opportunity_id<>$4',[source.url,snapshotId,fetchedAt,id]);
   }
   const association=host(source.url)===host(r.officialUrl)?'program-page':exactLink(r,source.url)?'reviewed-official-link':'unresolved-external-source';
   await db.query(`INSERT INTO program_evidence_pages(opportunity_id,url,role,association,snapshot_id,fetched_at,facts) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(opportunity_id,url) DO UPDATE SET role=excluded.role,association=excluded.association,snapshot_id=excluded.snapshot_id,fetched_at=excluded.fetched_at,facts=excluded.facts`,[id,source.url,source.role,association,snapshotId,fetchedAt,JSON.stringify(facts)]);
  }
  await db.query("INSERT INTO catalog_field_history(opportunity_id,field,old_value,new_value,evidence,parser_version,action) VALUES($1,'guidance',$2,$3,$4,'reviewed-starter-v1','reviewed-guidance-enrichment')",[id,JSON.stringify(existing.map(p=>({url:p.url,snapshotId:p.snapshot_id,facts:p.facts}))),JSON.stringify(r.guidance),JSON.stringify({sources:r.sources,reviewedAt:manifest.reviewedAt,method:'assistant-reviewed'})]);
  await db.query("INSERT INTO catalog_admin_events(action,subject) VALUES('reviewed_guidance_revision',$1)",[JSON.stringify({key:r.key,opportunityId:id,recordHash,addedFacts:added,reviewedAt:manifest.reviewedAt})]);
  results.push({key:r.key,opportunityId:id,outcome:'enriched',addedFacts:added});
 }
 if(results.every(r=>r.outcome!=='skipped'))await db.query("INSERT INTO catalog_admin_events(action,subject) VALUES('reviewed_guidance_manifest_complete',$1)",[JSON.stringify({completionKey,records:results})]);
 return results;
}
