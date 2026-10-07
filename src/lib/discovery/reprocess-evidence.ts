import type {Client} from 'pg';
import {acquireCrawlLease,renewCrawlLease,releaseCrawlLease} from './lease';
import {attachEvidence,applyProgramEvidence} from './program-store';
import {pageRole,identifiableProgramName,sameProgramLocation} from './program-evidence';
import {canonicalUrl} from '../opportunities/research';
// Re-evaluate already fetched evidence with improved publisher rules, without
// repeating requests or resetting durable network checkpoints.
export async function reprocessEvidence(db:Client,runId:string,stopping=()=>false){
 const totals={checked:0,updated:0,hidden:0,resolved:0,busy:false,paused:false};
 if((await db.query('SELECT paused FROM catalog_automation WHERE id=1')).rows[0]?.paused){totals.paused=true;return totals;}
 const lease=await acquireCrawlLease(db);if(!lease){totals.busy=true;return totals;}
 try{
  const rows=(await db.query(`SELECT DISTINCT o.id FROM opportunities o JOIN catalog_reconciliation_items i ON i.opportunity_id=o.id
   WHERE i.run_id=$1 AND o.publication_state='published' AND o.merged_into IS NULL ORDER BY o.id`,[runId])).rows;
  for(const row of rows){
   if(stopping())break;await renewCrawlLease(db,lease);
   await db.query('BEGIN');
   try{
    await db.query('SELECT pg_advisory_xact_lock(7823091)');
    const grant=(await db.query('SELECT * FROM opportunities WHERE id=$1 FOR UPDATE',[row.id])).rows[0];
    const primary=(await db.query(`SELECT sn.* FROM crawl_snapshots sn JOIN crawl_sources cs ON cs.id=sn.source_id WHERE sn.url=$1 AND sn.fetched_at>now()-interval '24 hours' AND cs.enabled AND split_part(sn.url,'/',3)=ANY(cs.approved_domains) ORDER BY sn.fetched_at DESC LIMIT 1`,[canonicalUrl(grant.source_url)])).rows[0];
    if(primary)await attachEvidence(db,grant.id,{url:primary.url,title:primary.title,text:primary.body,extracted:primary.extracted,links:primary.links,kind:'html'},primary,pageRole(primary.title,primary.url,primary.body)==='program'?'program-page':'catalog-source-context-unresolved');
    const pages=(await db.query(`SELECT p.*,s.title,s.body,s.extracted,s.links,s.fetched_at AS checked_at FROM program_evidence_pages p
     JOIN crawl_snapshots s ON s.id=p.snapshot_id JOIN crawl_sources cs ON cs.id=s.source_id WHERE p.opportunity_id=$1 AND cs.enabled AND s.fetched_at>now()-interval '24 hours' ORDER BY p.fetched_at DESC LIMIT 11`,[grant.id])).rows;
    let hide=false;
    for(const p of pages){
     const role=pageRole(p.title,p.url,p.body);
     if(sameProgramLocation(grant.source_url,p.url)&&!grant.last_verified_at&&grant.publication_origin==='crawler'&&!identifiableProgramName(grant.name,p.body,grant.source_url)&&['directory','announcement','faq','guidelines','application','supporting'].includes(role))hide=true;
     await attachEvidence(db,grant.id,{url:p.url,title:p.title,text:p.body,extracted:p.extracted,links:p.links,kind:'html'},{id:p.snapshot_id,fetched_at:p.checked_at},p.association);
    }
    if(hide){
     await db.query("UPDATE opportunities SET publication_state='hidden',updated_at=now(),publication_provenance=publication_provenance||jsonb_build_object('reconciliation_hidden_reason','Confirmed non-program title and official source content') WHERE id=$1",[grant.id]);
     await db.query("INSERT INTO catalog_reconciliation_events(run_id,opportunity_id,action,detail) VALUES($1,$2,'hidden','Confirmed non-program catalog title and fresh source evidence')",[runId,grant.id]);totals.hidden++;
    }else if(pages.length){
     const resolved=await applyProgramEvidence(db,grant.id);
     await db.query('UPDATE catalog_reconciliation_items SET unresolved=$2 WHERE run_id=$3 AND opportunity_id=$1',[grant.id,JSON.stringify(resolved.reasons),runId]);
     const after=(await db.query('SELECT application_status,deadline_at,maximum_award,eligibility_notes FROM opportunities WHERE id=$1',[grant.id])).rows[0];
     if(grant.application_status==='unknown'&&after.application_status!=='unknown'){
      totals.resolved++;await db.query("INSERT INTO catalog_reconciliation_events(run_id,opportunity_id,action,detail) VALUES($1,$2,'status-resolved',$3)",[runId,grant.id,'Explicit official-source status: '+after.application_status]);
     }
     if(Object.keys(after).some(key=>String(after[key]??'')!==String(grant[key]??''))){
      totals.updated++;await db.query("INSERT INTO catalog_reconciliation_events(run_id,opportunity_id,action,detail) VALUES($1,$2,'facts-updated','Source-supported public facts updated from recent official evidence')",[runId,grant.id]);
     }
    }
    await db.query('COMMIT');totals.checked++;
   }catch(e){await db.query('ROLLBACK');throw e;}
  }
  return totals;
 }finally{await releaseCrawlLease(db,lease);}
}
