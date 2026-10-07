import { randomUUID } from 'node:crypto';
import type { Client,PoolClient } from 'pg';
import { canonicalUrl } from '../opportunities/research';
import { categories } from '../opportunities/store';

export function programKey(title:string){
 return title.toLowerCase().normalize('NFKD').replace(/\b(19|20)\d{2}(?:[-–]\d{2,4})?\b/g,'').replace(/\b(the|usda|nea|nsf|spencer)\b/g,'').replace(/[^a-z0-9]/g,'');
}
export function likelySameProgram(title:string,url:string,existing:{name:string;source_url:string}){
 if(programKey(existing.name)===programKey(title))return true;
 const current=new URL(url),prior=new URL(existing.source_url);
 if(current.hostname!==prior.hostname)return false;
 // Application subpages belong to their parent program; publisher-specific aliases
 // cover catalog titles that differ from the publisher's current wording.
 if(/\/(?:apply-now|application)\/?$/.test(current.pathname)&&current.pathname.replace(/\/(?:apply-now|application)\/?$/,'').replace(/\/$/,'')===prior.pathname.replace(/\/$/,''))return true;
 return current.hostname==='www.pkf.org'&&current.pathname==='/grants/grant-for-artists'&&programKey(existing.name)===programKey('Pollock-Krasner Artist Grants');
}
export function classifyGrant(title:string,url:string,evidence:string){
 const name=title.replace(/\s+/g,' ').trim();const path=new URL(url).pathname;
 if(/\/(?:recipients?|guidelines|process|faq|assistance)(?:\/|$)/i.test(path)||/^(?:about our funding|technical assistance for grant applications)$/i.test(name))return 'Supporting page or recipient biography';
 if(/\b(finalists?|announces?|receives?|judges|ceremony|lessons learned|grant writer|project manager|development manager|operations|tips for|rules|frequently asked|guidelines|applicant eligibility|terms and conditions|fact sheet|step-by-step|proposal and award process)\b/i.test(name)||/\/(?:press|press-releases?|jobs?|careers?|artists?|people|bios?|stories)(?:\/|$)/i.test(path))return 'Announcement, biography, job, or supporting document';
 if(/^(?:manage|get|find) (?:a )?grants?$|^funding (?:at|for)\b|^how we\b|^applying for\b|^other grant|^educator grants and fellowships$|^we give grants\b|^where women\b|^small business grants for women in\b|^\d{4} WomensNet|\bgrants? (?:listing|rules|has a secret)\b|\b\d+ terrific grants\b|\bawards (?:artist|shahzia)\b/i.test(name))return 'General directory or supporting content';
 if(/\b(directory|archives?|resources?|toolkits?|contacts?|webinars?|recipients?|winners?|awarded|administer|reporting|news|blog)\b/i.test(name)||/\/(?:news|blog|resources|awards|administer|contacts|for-grantees)(?:\/|$)/i.test(path))return 'Non-grant resource or directory';
 if(/\b(how (?:do i|to)|apply for funding|application support|solicitations? & awards)\b/i.test(name)||/\.(?:pdf|xml)$/i.test(path))return 'Supporting document or ambiguous listing';
 if(/^(?:(?:all|current|available|research|our)\s+)?(?:awards?\s*(?:&|and)\s*)?(?:grants?|funding|funding opportunities|fellowships?)(?:\s*(?:&|and)\s*opportunities|\s+programs?)?$/i.test(name))return 'General program directory';
 if(name.length<8||name.length>250||! /\b(grants?|fellowships?|awards?|fund|funding|program)\b/i.test(name))return 'No recognizable program title';
 if(!/\b(apply|application|applications|eligib\w*|proposals?|funding|supports?|provides?|awards?)\b/i.test(evidence))return 'Insufficient program evidence';
 return null;
}
type DB=Client|PoolClient;
export type PublicationOutcome={outcome:'published'|'updated'|'skipped';reason:string;opportunityId?:string};
// Caller owns a transaction and the catalog lock shared with editorial publication.
export async function publishCandidate(db:DB,candidateId:string):Promise<PublicationOutcome>{
 const c=(await db.query(`SELECT c.*,s.approved_domains,s.categories AS source_categories,
 sn.fetched_at,sn.body,sn.extracted FROM crawl_candidates c JOIN crawl_sources s ON s.id=c.source_id
 LEFT JOIN crawl_snapshots sn ON sn.id=c.snapshot_id WHERE c.id=$1 FOR UPDATE OF c`,[candidateId])).rows[0];
 if(!c||c.status!=='pending'||c.kind==='domain')return {outcome:'skipped',reason:'Not a pending grant candidate'};
 const url=canonicalUrl(c.url);const host=new URL(url).hostname;
 if(!c.snapshot_id||!c.body||!c.approved_domains.includes(host))return {outcome:'skipped',reason:'Source evidence or approved domain is missing'};
 const stale=(await db.query('SELECT hash FROM crawl_snapshots WHERE url=$1 ORDER BY fetched_at DESC LIMIT 1',[url])).rows[0];
 if(stale?.hash!==c.hash)return {outcome:'skipped',reason:'A newer source snapshot requires review'};
 const all=(await db.query('SELECT * FROM opportunities WHERE NOT is_demo')).rows;
 const alias=(await db.query('SELECT opportunity_id FROM opportunity_source_urls WHERE url=$1',[url])).rows[0]?.opportunity_id;
 let grant=all.find(g=>g.id===(alias??c.opportunity_id)||[g.source_url,g.official_url].some((u:string)=>{try{return canonicalUrl(u)===url;}catch{return false;}}));
 const reason=classifyGrant(c.title,url,c.body);
 if(!grant&&reason)return {outcome:'skipped',reason};
 if(!grant){
  const matches=all.filter(g=>likelySameProgram(c.title,url,g));
  // Same program title on another page is a likely duplicate, not a new grant.
  if(matches.length){
   if(matches.length===1){await db.query('UPDATE crawl_candidates SET opportunity_id=$2 WHERE id=$1',[c.id,matches[0].id]);}
   return {outcome:'skipped',reason:'Likely duplicate program — merge or review the existing listing',opportunityId:matches.length===1?matches[0].id:undefined};
  }
 }
 if(grant){
  await db.query('UPDATE crawl_candidates SET opportunity_id=$2 WHERE id=$1',[c.id,grant.id]);
  if(grant.publication_state==='hidden'||grant.verification_status==='archived'||grant.merged_into)return {outcome:'skipped',reason:'Editor-hidden or merged listing stays unpublished',opportunityId:grant.id};
  if(grant.publication_origin!=='crawler'||grant.last_verified_at||grant.verification_status==='verified')return {outcome:'skipped',reason:'Reviewed catalog facts require editor approval',opportunityId:grant.id};
  if(reason)return {outcome:'skipped',reason:'Source no longer clearly identifies a program; editor review required',opportunityId:grant.id};
 }
 const id=grant?.id??randomUUID();
 // Only a publisher-specific exact status excerpt is supported today; all other missing fields stay unknown.
 const x=c.extracted??{};
 const status=['open','closed'].includes(x.status)&&typeof x.status_evidence==='string'&&x.status_evidence.length>=12&&c.body.includes(x.status_evidence)?x.status:'unknown';
 const provenance={candidate_id:c.id,snapshot_id:c.snapshot_id,source_id:c.source_id,hash:c.hash,source_url:url,method:'direct-source',status_evidence:status==='unknown'?null:x.status_evidence};
 if(!grant){
  await db.query(`INSERT INTO opportunities(id,name,slug,official_url,source_url,funding_type,summary,eligibility_notes,deadline_notes,
  application_status,verification_status,publication_origin,source_fetched_at,publication_provenance)
  VALUES($1,$2,$3,$4,$4,'grant',$5,'Unknown','Unknown',$6,'needs_verification','crawler',$7,$8)`,
  [id,c.title,`grant-${id}`,url,`Grant lead discovered on ${host}. Check the source for requirements and current application details.`,status,c.fetched_at,JSON.stringify(provenance)]);
  // Categories describe source discovery context, not applicant eligibility.
  const selected=c.source_categories.filter((value:string)=>categories.includes(value));
  await db.query('INSERT INTO opportunity_categories SELECT $1,unnest($2::text[]) ON CONFLICT DO NOTHING',[id,selected]);
 }else{
  await db.query(`UPDATE opportunities SET name=$2,application_status=$3,source_fetched_at=$4,publication_provenance=$5,
  source_url=$6,official_url=$6,updated_at=now(),catalog_updated_at=now() WHERE id=$1`,[id,c.title,status,c.fetched_at,JSON.stringify(provenance),url]);
 }
 await db.query('INSERT INTO opportunity_source_urls(url,opportunity_id) VALUES($1,$2) ON CONFLICT(url) DO NOTHING',[url,id]);
 await db.query("UPDATE crawl_candidates SET status='published',opportunity_id=$2 WHERE id=$1",[c.id,id]);
 return {outcome:grant?'updated':'published',reason:grant?'Updated source-supported unverified fields':'Published unverified grant lead',opportunityId:id};
}
export async function publishBacklog(db:DB,runId:string|null=null,stopping=()=>false){
 const totals={published:0,updated:0,skipped:0,failed:0};
 const pending=(await db.query(`SELECT c.id FROM crawl_candidates c LEFT JOIN crawl_publication_results r ON r.candidate_id=c.id
 WHERE c.status='pending' AND c.kind<>'domain' AND (r.candidate_id IS NULL OR r.processed_at<c.created_at OR (r.outcome='failed' AND r.attempts<3))
 ORDER BY c.created_at,c.id`)).rows;
 for(const item of pending){
  if(stopping())break;
  try{
   await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(7823091)');
   // Recheck under the lock: concurrent workers cannot double-publish or overwrite a prior result.
   const prior=(await db.query('SELECT r.outcome,r.attempts,r.processed_at<c.created_at AS renewed FROM crawl_publication_results r JOIN crawl_candidates c ON c.id=r.candidate_id WHERE candidate_id=$1',[item.id])).rows[0];
   if(prior&&!prior.renewed&&(prior.outcome!=='failed'||prior.attempts>=3)){await db.query('COMMIT');continue;}
   const result=await publishCandidate(db,item.id);
   await db.query(`INSERT INTO crawl_publication_results(candidate_id,run_id,opportunity_id,outcome,reason) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(candidate_id) DO UPDATE SET outcome=excluded.outcome,reason=excluded.reason,opportunity_id=excluded.opportunity_id,
    run_id=excluded.run_id,attempts=crawl_publication_results.attempts+1,processed_at=now()`,[item.id,runId,result.opportunityId??null,result.outcome,result.reason]);
   await db.query('COMMIT');totals[result.outcome]++;
  }catch{
   await db.query('ROLLBACK');
   await db.query(`INSERT INTO crawl_publication_results(candidate_id,run_id,outcome,reason) VALUES($1,$2,'failed','Publication failed; pending for retry or editor review')
   ON CONFLICT(candidate_id) DO UPDATE SET outcome='failed',attempts=crawl_publication_results.attempts+1,processed_at=now()`,[item.id,runId]);totals.failed++;
  }
 }
 return totals;
}
