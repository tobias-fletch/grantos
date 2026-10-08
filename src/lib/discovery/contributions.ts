import type {Client} from 'pg';
import {createReader} from './reader';
import {acquireCrawlLease,renewCrawlLease,releaseCrawlLease} from './lease';
import {recordPage,registerLinks} from './store';
import {publishCandidate} from './publish';
import {attachEvidence,applyProgramEvidence} from './program-store';
import {relatedPage} from './program-evidence';
import {canonicalUrl} from '../opportunities/research';

// The worker deliberately cannot read contributors' proposals or private notes.
// It re-extracts facts from approved official sources, never from user assertions.
export async function processContributions(db:Client,reader=createReader(),stopping=()=>false){
 const lease=await acquireCrawlLease(db);if(!lease)return;
 try{
  if((await db.query('SELECT paused FROM catalog_automation WHERE id=1')).rows[0]?.paused)return;
  const jobs=(await db.query("SELECT * FROM catalog_contributions WHERE state IN ('checking','decision') AND next_attempt_at<=now() ORDER BY created_at,id LIMIT 10")).rows;
  for(const job of jobs){
   if(stopping())break;
   await renewCrawlLease(db,lease);
   const source=(await db.query('SELECT * FROM crawl_sources WHERE enabled AND $1=ANY(approved_domains) ORDER BY id LIMIT 1',[new URL(job.source_url).hostname])).rows[0];
   if(!source){await db.query("UPDATE catalog_contributions SET state='decision',outcome='Official source approval required before checking this URL.',next_attempt_at=now()+interval '1 day',checked_at=now() WHERE id=$1",[job.id]);continue;}
   const pending=(await db.query('SELECT next_check_at,failures FROM crawl_frontier WHERE source_id=$1 AND url=$2',[source.id,job.source_url])).rows[0];
   if(pending?.failures&&new Date(pending.next_check_at).getTime()>Date.now()){
    await db.query("UPDATE catalog_contributions SET next_attempt_at=$2,outcome='Source retry scheduled; respecting existing backoff.' WHERE id=$1",[job.id,pending.next_check_at]);continue;
   }
   if('canRead' in reader&&!(reader as any).canRead(job.source_url,source.approved_domains))continue;
   await db.query("UPDATE catalog_contributions SET attempts=attempts+1,next_attempt_at=now()+interval '1 hour' WHERE id=$1",[job.id]);
   try{
    const page=await reader.read(job.source_url,source.approved_domains);
    await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(7823091)');
    await recordPage(db,source.id,page);
    await registerLinks(db,source,page.links,1);
    const url=canonicalUrl(page.url);
    let state='unconfirmed',outcome='The checked official page did not establish the requested fact or an identifiable grant program.';
    if(job.opportunity_id){
     const grant=(await db.query("SELECT * FROM opportunities WHERE id=$1 AND publication_state='published' AND merged_into IS NULL FOR UPDATE",[job.opportunity_id])).rows[0];
     const linked=grant&&!!(await db.query('SELECT 1 FROM program_evidence_pages p JOIN crawl_snapshots s ON s.id=p.snapshot_id WHERE p.opportunity_id=$1 AND s.links @> $2::jsonb AND p.association<>$3',[grant.id,JSON.stringify([url]),'catalog-source-context-unresolved'])).rowCount;
     const association=grant&&relatedPage(grant,page,linked);
     if(association){
      const snapshot=(await db.query('SELECT * FROM crawl_snapshots WHERE source_id=$1 AND url=$2 ORDER BY fetched_at DESC LIMIT 1',[source.id,url])).rows[0];
      await attachEvidence(db,grant.id,page,snapshot,association);await applyProgramEvidence(db,grant.id);
      const fact=(await db.query('SELECT state,evidence FROM catalog_field_state WHERE opportunity_id=$1 AND field=$2',[grant.id,job.field])).rows[0];
      if(fact?.state==='found'&&fact.evidence.some((f:any)=>f.sourceUrl===url)){state='applied';outcome='Official evidence checked and the supported catalog fact confirmed or updated. The result may differ from your suggestion.';}
      if(['conflicting','locked_conflict'].includes(fact?.state)){state='decision';outcome='Conflicting official evidence or a locked correction needs review.';}
     }
    }else{
     const candidate=(await db.query("SELECT id FROM crawl_candidates WHERE source_id=$1 AND url=$2 AND kind<>'domain' ORDER BY created_at DESC LIMIT 1",[source.id,url])).rows[0];
     if(candidate){const result=await publishCandidate(db,candidate.id);if(['published','updated'].includes(result.outcome)){state='applied';outcome='An identifiable program is available in the public catalog; incomplete facts remain Unknown.';}else outcome='The page could not be confirmed as a distinct grant program. It remains available for research.';}
     const existing=(await db.query("SELECT 1 FROM opportunities o WHERE publication_state='published' AND merged_into IS NULL AND (source_url=$1 OR id IN (SELECT opportunity_id FROM opportunity_source_urls WHERE url=$1))",[url])).rowCount;
     if(existing){state='applied';outcome='This source is linked to a published catalog program.';}
    }
    await db.query('UPDATE catalog_contributions SET state=$2,outcome=$3,checked_at=now(),next_attempt_at=now()+interval \'7 days\' WHERE id=$1',[job.id,state,outcome]);
    await db.query('COMMIT');
   }catch{
    await db.query('ROLLBACK');
    await db.query("UPDATE catalog_contributions SET state=CASE WHEN attempts>=3 THEN 'decision' ELSE 'checking' END,outcome='Source check unavailable; retry scheduled with backoff.',checked_at=now(),next_attempt_at=now()+make_interval(hours=>$2) WHERE id=$1",[job.id,Math.min(168,2**Math.min(job.attempts+1,7))]);
   }
  }
 }finally{await db.query('ROLLBACK');await releaseCrawlLease(db,lease);}
}
