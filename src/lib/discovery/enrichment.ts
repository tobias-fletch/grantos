import type {Client} from 'pg';
import {createReader,type CrawlPage} from './reader';
import {acquireCrawlLease,renewCrawlLease,releaseCrawlLease} from './lease';
import {recordPage,registerLinks} from './store';
import {canonicalUrl} from '../opportunities/research';
import {attachEvidence,applyProgramEvidence,fieldValue,emptyValue} from './program-store';
import {PROGRAM_PARSER_VERSION,factFields,pageRole,relatedPage,sameProgramLocation,identifiableProgramName} from './program-evidence';

export async function enqueueEnrichment(db:Client){
 // Evidence changes and parser upgrades wake jobs; otherwise incomplete programs are revisited weekly.
 await db.query(`INSERT INTO catalog_enrichment_jobs(opportunity_id,source_id)
 SELECT o.id,(SELECT s.id FROM crawl_sources s WHERE s.enabled AND split_part(o.source_url,'/',3)=ANY(s.approved_domains) ORDER BY (s.url=o.source_url) DESC,s.id LIMIT 1)
 FROM opportunities o WHERE NOT is_demo AND publication_state='published' AND merged_into IS NULL AND verification_status<>'archived'
 ON CONFLICT(opportunity_id) DO UPDATE SET source_id=coalesce(excluded.source_id,catalog_enrichment_jobs.source_id)`);
 await db.query(`UPDATE catalog_enrichment_jobs j SET state='queued',next_attempt_at=now()
 WHERE j.state<>'running' AND (j.parser_version<>$1 OR j.evidence_fingerprint<>coalesce((SELECT string_agg(p.url||s.hash,',' ORDER BY p.url) FROM program_evidence_pages p JOIN crawl_snapshots s ON s.id=p.snapshot_id WHERE p.opportunity_id=j.opportunity_id),''))`,[PROGRAM_PARSER_VERSION]);
}
export function rankResearchLinks(name:string,missing:string[],links:string[]){
 const words=name.toLowerCase().split(/\W+/).filter(w=>w.length>3&&!['grant','grants','program','funding','foundation'].includes(w));
 const terms=[...(missing.includes('status')||missing.includes('deadline')?['application','apply','deadline','dates']:[]),...(missing.some(f=>['eligibility','applicants','geography'].includes(f))?['eligibility','guidelines','faq','requirements']:[]),...(missing.includes('maximum')?['amount','guidelines','funding']:[]),'pdf'];
 return [...new Set(links)].map(url=>({url,score:words.filter(w=>url.toLowerCase().includes(w)).length*4+terms.filter(w=>url.toLowerCase().includes(w)).length*2})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.url.localeCompare(b.url)).map(x=>x.url);
}
export async function runEnrichment(db:Client,reader=createReader(),stopping=()=>false,budget=300){
 const totals={pages:0,programs:0,changed:0};
 const lease=await acquireCrawlLease(db);if(!lease)return totals;
 try{
  if((await db.query('SELECT paused FROM catalog_automation WHERE id=1')).rows[0]?.paused)return totals;
  await enqueueEnrichment(db);
  const jobs=(await db.query(`SELECT j.*,o.name,o.source_url,s.approved_domains,s.url AS registry_url,s.enabled FROM catalog_enrichment_jobs j JOIN opportunities o ON o.id=j.opportunity_id LEFT JOIN crawl_sources s ON s.id=j.source_id
   WHERE j.next_attempt_at<=now() AND o.publication_state='published' AND o.merged_into IS NULL AND o.verification_status<>'archived'
   ORDER BY row_number() OVER(PARTITION BY j.source_id ORDER BY j.checked_at NULLS FIRST,j.opportunity_id),j.checked_at NULLS FIRST,j.opportunity_id`)).rows;
  const sourceCounts=new Map<string,number>();
  for(const job of jobs){
   if(stopping()||totals.pages>=budget)break;
   await renewCrawlLease(db,lease);
   if(!job.enabled){await db.query("UPDATE catalog_enrichment_jobs SET state='retry',next_attempt_at=now()+interval '1 day',reason='Source disabled or unregistered',parser_version=$2 WHERE opportunity_id=$1",[job.opportunity_id,PROGRAM_PARSER_VERSION]);continue;}
   if((sourceCounts.get(job.source_id)??0)>=50)continue;
   const id=job.opportunity_id;
   const grant=(await db.query('SELECT * FROM opportunities WHERE id=$1',[id])).rows[0];
   const missing:string[]=[];
   for(const field of factFields){const v=await fieldValue(db,grant,field);if(field!=='minimum'&&field!=='rolling'&&(v==null||v===''||JSON.stringify(v)===JSON.stringify(emptyValue(field))))missing.push(field);}
   for(const field of missing)await db.query('INSERT INTO catalog_field_state(opportunity_id,field) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,field]);
   await db.query("UPDATE catalog_enrichment_jobs SET state='running',checked_at=now(),missing_fields=$2 WHERE opportunity_id=$1",[id,missing]);
   if(job.state!=='running')await db.query("UPDATE catalog_enrichment_pages SET state='queued' WHERE opportunity_id=$1 AND state IN ('read','excluded')",[id]);
   await db.query('INSERT INTO catalog_enrichment_pages(opportunity_id,url,depth) VALUES($1,$2,0) ON CONFLICT DO NOTHING',[id,canonicalUrl(job.source_url)]);
   // Previously attached official evidence is prioritized ahead of expanding unrelated directories.
   await db.query(`INSERT INTO catalog_enrichment_pages(opportunity_id,url,depth) SELECT opportunity_id,url,1 FROM program_evidence_pages WHERE opportunity_id=$1 ORDER BY fetched_at DESC LIMIT 10 ON CONFLICT DO NOTHING`,[id]);
   let failed=false,interrupted=false,processed=0;
   while(!stopping()&&totals.pages<budget&&processed<11&&(sourceCounts.get(job.source_id)??0)<50){
    const item=(await db.query("SELECT * FROM catalog_enrichment_pages WHERE opportunity_id=$1 AND state IN ('queued','failed') AND next_attempt_at<=now() ORDER BY (url=$2) DESC,priority,depth,url LIMIT 1",[id,canonicalUrl(job.source_url)])).rows[0];
    if(!item)break;
    if('canRead' in reader&&!(reader as any).canRead(item.url,job.approved_domains))break;
    if(!job.approved_domains.includes(new URL(item.url).hostname)){await db.query("UPDATE catalog_enrichment_pages SET state='excluded',reason='Domain approval required' WHERE opportunity_id=$1 AND url=$2",[id,item.url]);continue;}
    processed++;
    await renewCrawlLease(db,lease);
    let page:CrawlPage,snapshot:any;
    const cached=(await db.query('SELECT * FROM crawl_snapshots WHERE source_id=$1 AND url=$2 ORDER BY fetched_at DESC LIMIT 1',[job.source_id,item.url])).rows[0];
    try{
     if(cached&&Date.now()-new Date(cached.fetched_at).getTime()<86400000){snapshot=cached;page={url:cached.url,title:cached.title,text:cached.body,extracted:cached.extracted,links:cached.links??[],kind:'html'};}
     else{
      totals.pages++;sourceCounts.set(job.source_id,(sourceCounts.get(job.source_id)??0)+1);
      await db.query("UPDATE catalog_enrichment_pages SET attempts=attempts+1,next_attempt_at=now()+interval '1 hour' WHERE opportunity_id=$1 AND url=$2",[id,item.url]);
      page=await reader.read(item.url,job.approved_domains);
      await recordPage(db,job.source_id,page);
      snapshot=(await db.query('SELECT * FROM crawl_snapshots WHERE source_id=$1 AND url=$2 ORDER BY fetched_at DESC LIMIT 1',[job.source_id,canonicalUrl(page.url)])).rows[0];
     }
    }catch{
     failed=true;
     await db.query("UPDATE catalog_enrichment_pages SET state='failed',reason='Source inaccessible; retry with backoff',next_attempt_at=now()+make_interval(hours=>$3) WHERE opportunity_id=$1 AND url=$2",[id,item.url,Math.min(168,2**Math.min(item.attempts+1,7))]);continue;
    }
    await db.query('BEGIN');
    try{
     await db.query('SELECT pg_advisory_xact_lock(7823091)');
     const role=pageRole(page.title,page.url,page.text);
     const primary=sameProgramLocation(job.source_url,page.url);
     if(primary&&grant.publication_origin==='crawler'&&!grant.last_verified_at&&!identifiableProgramName(grant.name,page.text,grant.source_url)&&['directory','announcement','faq','guidelines','application','supporting'].includes(role)){
      await attachEvidence(db,id,page,snapshot,'catalog-source-context-unresolved');
      await db.query("UPDATE opportunities SET publication_state='hidden',updated_at=now(),publication_provenance=publication_provenance||jsonb_build_object('reconciliation_hidden_reason','Confirmed non-program title and official page') WHERE id=$1",[id]);
      await db.query("INSERT INTO catalog_reconciliation_events(opportunity_id,action,detail) VALUES($1,'hidden','Enrichment confirmed non-program content; evidence retained')",[id]);
      await db.query("UPDATE catalog_enrichment_pages SET state='excluded',snapshot_id=$3 WHERE opportunity_id=$1 AND url=$2",[id,item.url,snapshot.id]);
      await db.query("UPDATE catalog_enrichment_jobs SET state='complete',reason='Confirmed non-program listing hidden' WHERE opportunity_id=$1",[id]);
      await db.query('COMMIT');break;
     }
     const direct=!!(await db.query(`SELECT 1 FROM program_evidence_pages p JOIN crawl_snapshots s ON s.id=p.snapshot_id WHERE p.opportunity_id=$1 AND p.association<>'catalog-source-context-unresolved' AND s.links @> $2::jsonb LIMIT 1`,[id,JSON.stringify([page.url])])).rowCount;
     const association=primary?(role==='program'?'program-page':page.text.toLowerCase().includes(job.name.toLowerCase())?'explicit-program-identifier':null):relatedPage({name:job.name,source_url:job.source_url},page,direct);
     if(association&&!['directory','announcement','ambiguous'].includes(role)){
      await attachEvidence(db,id,page,snapshot,association);
      await applyProgramEvidence(db,id);
     }
     await db.query("UPDATE catalog_enrichment_pages SET state='read',snapshot_id=$3,reason=$4 WHERE opportunity_id=$1 AND url=$2",[id,item.url,snapshot.id,association?'Official evidence processed':'Navigation evidence; program association not established']);
     if(item.depth<3){
      const links=rankResearchLinks(job.name,missing,page.links).slice(0,item.depth===0?5:10);
      links.push(...page.links.filter(u=>/\/(?:feed|rss|sitemap)(?:[./?]|$)/i.test(u)).slice(0,2));
      if(primary&&processed===1){links.push(job.registry_url);try{const policy=await reader.policy(new URL(job.source_url).origin);links.push(...policy.sitemaps.slice(0,2));}catch{}}
      const used=Number((await db.query('SELECT count(*) FROM catalog_enrichment_pages WHERE opportunity_id=$1',[id])).rows[0].count);
      let slots=Math.max(0,11-used);
      for(const url of [...new Set(links)]){
       if(!slots)break;
       if(!job.approved_domains.includes(new URL(url).hostname)){await registerLinks(db,{id:job.source_id,approved_domains:job.approved_domains},[url],item.depth+1);continue;}
       const inserted=await db.query('INSERT INTO catalog_enrichment_pages(opportunity_id,url,depth,priority) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[id,canonicalUrl(url),item.depth+1,links.indexOf(url)+1]);slots-=inserted.rowCount??0;
      }
     }
     await db.query('COMMIT');
    }catch(e){await db.query('ROLLBACK');throw e;}
   }
   interrupted=stopping()||totals.pages>=budget||(sourceCounts.get(job.source_id)??0)>=50;
   const outstanding=Number((await db.query("SELECT count(*) FROM catalog_enrichment_pages WHERE opportunity_id=$1 AND state IN ('queued','failed')",[id])).rows[0].count);
   const inaccessible=failed||Number((await db.query("SELECT count(*) FROM catalog_enrichment_pages WHERE opportunity_id=$1 AND state='failed'",[id])).rows[0].count)>0;
   await db.query(`UPDATE catalog_field_state SET state=$2,reason=$3 WHERE opportunity_id=$1 AND state='not_checked'`,[id,inaccessible?'inaccessible':outstanding?'not_checked':'not_published',inaccessible?'Official pages inaccessible; retry scheduled':outstanding?'More official pages queued':'Not found in checked official pages; weekly research continues']);
   const remaining=(await db.query("SELECT field FROM catalog_field_state WHERE opportunity_id=$1 AND state<>'found' AND field NOT IN ('minimum','rolling')",[id])).rows.map(r=>r.field);
   const state=outstanding?(interrupted?'running':'retry'):remaining.length?'waiting':'complete';
   await db.query(`UPDATE catalog_enrichment_jobs SET state=$2,next_attempt_at=now()+make_interval(hours=>$3),reason=$4,parser_version=$5,missing_fields=$6,
    evidence_fingerprint=coalesce((SELECT string_agg(p.url||s.hash,',' ORDER BY p.url) FROM program_evidence_pages p JOIN crawl_snapshots s ON s.id=p.snapshot_id WHERE p.opportunity_id=$1),'') WHERE opportunity_id=$1`,[id,state,outstanding?1:168,outstanding?'Supporting checks pending or inaccessible':remaining.length?'Information unavailable in checked evidence; weekly research':'Supported facts found',PROGRAM_PARSER_VERSION,remaining]);
   totals.programs++;
  }
  return totals;
 }finally{await db.query('ROLLBACK');await releaseCrawlLease(db,lease);}
}
