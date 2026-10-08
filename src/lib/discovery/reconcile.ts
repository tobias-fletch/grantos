import {settleReconciliation,settleLegacyInventories} from './reconciliation-summary';
import {attachEvidence,applyProgramEvidence} from "./program-store";
export {attachEvidence,applyProgramEvidence} from "./program-store";
import type {Client} from 'pg';
import {createReader,type CrawlPage} from './reader';
import {acquireCrawlLease,renewCrawlLease,releaseCrawlLease} from './lease';
import {recordPage,registerLinks} from './store';
import {publishCandidate} from './publish';
import {monitorCatalogPage} from './monitor';
import {canonicalUrl} from '../opportunities/research';
import {PROGRAM_PARSER_VERSION,pageRole,relatedPage,supportingLinks,publisherIdentity,sameProgramLocation,identifiableProgramName} from './program-evidence';

export async function freezeReconciliation(db:Client){
 await db.query('BEGIN');
 try{
  await db.query('SELECT pg_advisory_xact_lock(7823091)');
  await settleLegacyInventories(db);
  const existing=(await db.query("SELECT id FROM catalog_reconciliation_runs WHERE status<>'complete' LIMIT 1")).rows[0];
  if(existing){await db.query('COMMIT');return existing.id as string;}
  const run=(await db.query('INSERT INTO catalog_reconciliation_runs DEFAULT VALUES RETURNING id')).rows[0].id;
  const crawl=(await db.query("INSERT INTO crawl_runs(trigger,status,started_at,note) VALUES('acceptance','running',now(),'Frozen catalog reconciliation') RETURNING id")).rows[0].id;
  await db.query('UPDATE catalog_reconciliation_runs SET crawl_run_id=$2 WHERE id=$1',[run,crawl]);
  await db.query(`INSERT INTO catalog_reconciliation_items(run_id,opportunity_id,source_id,url,title)
   SELECT $1,o.id,(SELECT s.id FROM crawl_sources s WHERE s.url=o.source_url OR split_part(split_part(o.source_url,'/',3),':',1)=ANY(s.approved_domains) ORDER BY (s.url=o.source_url) DESC,s.enabled DESC,s.id LIMIT 1),o.source_url,o.name
   FROM opportunities o WHERE NOT o.is_demo AND publication_state='published' AND merged_into IS NULL ORDER BY o.created_at,o.id ON CONFLICT DO NOTHING`,[run]);
  await db.query(`INSERT INTO catalog_reconciliation_items(run_id,candidate_id,opportunity_id,source_id,url,title)
   SELECT $1,c.id,c.opportunity_id,c.source_id,c.url,c.title FROM crawl_candidates c
   WHERE c.status='pending' AND c.kind<>'domain' ORDER BY c.created_at DESC,c.id ON CONFLICT DO NOTHING`,[run]);
  await db.query(`INSERT INTO catalog_reconciliation_pages(item_id,url) SELECT id,url FROM catalog_reconciliation_items WHERE run_id=$1 ON CONFLICT DO NOTHING`,[run]);
  // Move outstanding checkpoints into the new inventory without resetting retry clocks.
  await db.query(`INSERT INTO catalog_reconciliation_pages(item_id,url,depth,state,attempts,next_attempt_at,snapshot_id,reason)
   SELECT DISTINCT ON(n.id,p.url) n.id,p.url,p.depth,p.state,p.attempts,p.next_attempt_at,p.snapshot_id,p.reason
   FROM catalog_reconciliation_items n JOIN LATERAL (SELECT o.* FROM catalog_reconciliation_items o JOIN catalog_reconciliation_runs pr ON pr.id=o.run_id WHERE o.url=n.url AND o.source_id IS NOT DISTINCT FROM n.source_id AND o.run_id<>n.run_id AND o.status='blocked' ORDER BY pr.created_at DESC LIMIT 1) old ON true
   JOIN catalog_reconciliation_runs r ON r.id=old.run_id JOIN catalog_reconciliation_pages p ON p.item_id=old.id
   WHERE n.run_id=$1 ORDER BY n.id,p.url,r.created_at DESC
   ON CONFLICT(item_id,url) DO UPDATE SET state=excluded.state,attempts=excluded.attempts,next_attempt_at=excluded.next_attempt_at,snapshot_id=excluded.snapshot_id,reason=excluded.reason`,[run]);
  await db.query(`UPDATE catalog_reconciliation_items old SET status='complete',reason='Continued in newer inventory'
   WHERE old.status='blocked' AND old.run_id<>$1 AND EXISTS(SELECT 1 FROM catalog_reconciliation_items n WHERE n.run_id=$1 AND n.url=old.url AND n.source_id IS NOT DISTINCT FROM old.source_id)`,[run]);
  await db.query('COMMIT');return run as string;
 }catch(e){await db.query('ROLLBACK');throw e;}
}
// Queue one bounded reconciliation inventory after extraction/identity rules change.
// The ordinary worker handles checkpoints; this does not extend its run budget.
export async function queueParserReconciliation(db:Client){
 const lease=await acquireCrawlLease(db);if(!lease)return;
 try{
  const settings=(await db.query('SELECT paused,reconciliation_parser_version FROM catalog_automation WHERE id=1')).rows[0];
  if(settings.paused||settings.reconciliation_parser_version===PROGRAM_PARSER_VERSION)return;
  await settleLegacyInventories(db);
  if((await db.query("SELECT 1 FROM catalog_reconciliation_runs WHERE status<>'complete' LIMIT 1")).rowCount)return;
  const id=await freezeReconciliation(db);
  await db.query('UPDATE catalog_automation SET reconciliation_parser_version=$1 WHERE id=1',[PROGRAM_PARSER_VERSION]);
  return id;
 }finally{await releaseCrawlLease(db,lease);}
}
async function event(db:Client,item:any,action:string,detail:string){
 await db.query('INSERT INTO catalog_reconciliation_events(run_id,item_id,opportunity_id,action,detail) VALUES($1,$2,$3,$4,$5)',[item.run_id,item.id,item.opportunity_id,action,detail]);
}
// Each invocation shares the normal crawler lease. Inventory and individual page outcomes survive restarts.
export async function runReconciliation(db:Client,reader=createReader(),stopping=()=>false,budget=1000){
 const totals={pages:0,completed:0,merged:0,hidden:0,resolved:0,blocked:0,unfinished:Number((await db.query("SELECT count(*) FROM catalog_reconciliation_items WHERE status<>'complete'")).rows[0].count),busy:false,paused:false};
 if((await db.query('SELECT paused FROM catalog_automation WHERE id=1')).rows[0]?.paused){totals.paused=true;return totals;}
 const lease=await acquireCrawlLease(db);if(!lease){totals.busy=true;return totals;}
 const sourceCounts=new Map<string,number>();
 try{
  await settleLegacyInventories(db);
  await db.query('BEGIN');
  await db.query('SELECT pg_advisory_xact_lock(7823091)');
  const run=(await db.query("SELECT r.* FROM catalog_reconciliation_runs r WHERE r.status<>'complete' OR EXISTS(SELECT 1 FROM catalog_reconciliation_items i WHERE i.run_id=r.id AND i.status='blocked' AND i.next_attempt_at<=now()) ORDER BY (r.status<>'complete') DESC,r.created_at LIMIT 1")).rows[0];if(!run){await db.query('COMMIT');return totals;}
  await db.query("UPDATE catalog_reconciliation_runs SET status='running',heartbeat_at=now() WHERE id=$1",[run.id]);
  await db.query('COMMIT');
  const items=(await db.query(`SELECT i.*,s.enabled,s.approved_domains FROM catalog_reconciliation_items i LEFT JOIN crawl_sources s ON s.id=i.source_id
   WHERE i.run_id=$1 AND i.status IN ('queued','running','blocked') AND i.next_attempt_at<=now()
   ORDER BY (i.opportunity_id IS NOT NULL) DESC,i.checked_at NULLS FIRST,i.id`,[run.id])).rows;
  for(const item of items){
   if(stopping()||totals.pages>=Math.min(1000,budget))break;
   if((await db.query('SELECT paused FROM catalog_automation WHERE id=1')).rows[0]?.paused)break;
   if(!item.enabled){await db.query("UPDATE catalog_reconciliation_items SET status='blocked',reason='Source disabled or unregistered',next_attempt_at=now()+interval '1 day' WHERE id=$1",[item.id]);totals.blocked++;continue;}
   if((sourceCounts.get(item.source_id)??0)>=50)continue;
   await db.query("UPDATE catalog_reconciliation_items SET status='running',checked_at=now() WHERE id=$1",[item.id]);
   let progress=true;
   while(progress&&!stopping()&&totals.pages<Math.min(1000,budget)&&(sourceCounts.get(item.source_id)??0)<50){
    await renewCrawlLease(db,lease);
    const next=(await db.query(`SELECT p.*,f.failures,f.next_check_at FROM catalog_reconciliation_pages p
     LEFT JOIN crawl_frontier f ON f.source_id=$2 AND f.url=p.url
     WHERE p.item_id=$1 AND p.state IN ('queued','failed') AND p.next_attempt_at<=now()
     AND (coalesce(f.failures,0)=0 OR f.next_check_at<=now()) ORDER BY p.depth,p.url LIMIT 1`,[item.id,item.source_id])).rows[0];
    if(!next)break;
    if('canRead' in reader&&!(reader as any).canRead(next.url,item.approved_domains))break;
    progress=false;
    totals.pages++;sourceCounts.set(item.source_id,(sourceCounts.get(item.source_id)??0)+1);
    // Reserve the attempt before network I/O. A killed worker retries only after the backoff.
    await db.query("UPDATE catalog_reconciliation_pages SET attempts=attempts+1,next_attempt_at=now()+interval '1 hour' WHERE item_id=$1 AND url=$2",[item.id,next.url]);
    let page:CrawlPage;
    try{page=await reader.read(next.url,item.approved_domains);}
    catch(e){
     const reason=e instanceof Error?e.message.slice(0,250):'Source unavailable';
     await db.query("UPDATE catalog_reconciliation_pages SET state='failed',reason=$3,next_attempt_at=now()+make_interval(hours=>least(168,power(2,least(attempts,7))::int)) WHERE item_id=$1 AND url=$2",[item.id,next.url,reason]);
     await event(db,item,'blocked',reason);totals.blocked++;progress=true;continue;
    }
    await renewCrawlLease(db,lease);
    await db.query('BEGIN');
    try{
     await db.query('SELECT pg_advisory_xact_lock(7823091)');
     await recordPage(db,item.source_id,page);
     const snapshot=(await db.query('SELECT * FROM crawl_snapshots WHERE source_id=$1 AND url=$2 ORDER BY fetched_at DESC LIMIT 1',[item.source_id,canonicalUrl(page.url)])).rows[0];
     if(next.depth===0&&!sameProgramLocation(item.url,page.url)&&publisherIdentity(item.url)!==publisherIdentity(page.url)){
      await db.query("UPDATE catalog_reconciliation_pages SET state='excluded',snapshot_id=$3,reason='Redirect changes program location; identity review required' WHERE item_id=$1 AND url=$2",[item.id,next.url,snapshot.id]);
      await db.query("UPDATE catalog_reconciliation_items SET status='ambiguous',reason='Redirect changes program location; existing listing retained',unresolved=jsonb_build_object('identity','Official redirect needs program identity review') WHERE id=$1",[item.id]);
      await event(db,item,'identity-review','Redirect retained as evidence; no automatic hide or merge');await db.query('COMMIT');break;
     }
     await monitorCatalogPage(db,run.crawl_run_id,next.url,page);
     await db.query("INSERT INTO crawl_visits(run_id,source_id,url,status) VALUES($1,$2,$3,'read') ON CONFLICT DO NOTHING",[run.crawl_run_id,item.source_id,next.url]);
     const role=pageRole(page.title,page.url,page.text);
     const grants=(await db.query("SELECT * FROM opportunities WHERE NOT is_demo AND merged_into IS NULL ORDER BY (last_verified_at IS NOT NULL OR verification_status='verified') DESC,created_at,id")).rows;
     let grant=grants.find(g=>g.id===item.opportunity_id);
     if(grant&&item.candidate_id&&!relatedPage(grant,page,false)&&publisherIdentity(grant.source_url)!==publisherIdentity(page.url)){
      const alias=(await db.query('SELECT 1 FROM opportunity_source_urls WHERE opportunity_id=$1 AND url=$2',[grant.id,canonicalUrl(page.url)])).rowCount;
      if(!alias)grant=undefined;
     }
     let association=next.depth===0?'program-page':grant?relatedPage(grant,page,true):null;
     if(next.depth===0){
      // Publisher identifiers and program subpages are affirmative evidence; names are never merge keys.
      const target=grants.find(g=>g.id!==grant?.id&&g.publication_state==='published'&&relatedPage(g,page,false));
      if(target){
       association=relatedPage(target,page,false)!;
       // Exact program duplicates prefer verified, then oldest; supporting pages always join the program.
       if(grant&&grants.indexOf(grant)<grants.indexOf(target)&&(role==='program'||grant.last_verified_at||identifiableProgramName(grant.name,page.text,grant.source_url))){
        const parent=(await db.query('SELECT * FROM crawl_snapshots WHERE url=$1 AND fetched_at>now()-interval \'24 hours\' ORDER BY fetched_at DESC LIMIT 1',[canonicalUrl(target.source_url)])).rows[0];
        if(parent){
         await attachEvidence(db,grant.id,{url:parent.url,title:parent.title,text:parent.body,extracted:parent.extracted,links:parent.links,kind:'html'},parent,'official-program-link');
         await db.query('SELECT merge_reconciled_program($1,$2)',[target.id,grant.id]);totals.merged++;await event(db,item,'merged','Confirmed relationship; verified or oldest program record retained');
        }else await event(db,item,'duplicate-review','Confirmed related page; fresh canonical evidence needed before retaining the preferred grant ID');
       }else{
        await attachEvidence(db,target.id,page,snapshot,association);
        if(grant&&grant.publication_state!=='hidden'){
         await db.query('SELECT merge_reconciled_program($1,$2)',[grant.id,target.id]);totals.merged++;await event(db,item,'merged','Confirmed official program association');
        }
        grant=target;item.opportunity_id=target.id;
       }
      }else if(['directory','announcement','supporting','guidelines','faq','application'].includes(role)&&grant&&(grant.last_verified_at||grant.publication_origin!=='crawler'||identifiableProgramName(grant.name,page.text,grant.source_url))){
       association='catalog-source-context-unresolved';
       await event(db,item,'source-review','Identifiable program retained; primary source is '+role+' and requires program-specific context');
      }else if(['directory','announcement','supporting','guidelines','faq','application'].includes(role)){
       if(grant&&grant.publication_state==='published'){
        await db.query("UPDATE opportunities SET publication_state='hidden',updated_at=now(),publication_provenance=publication_provenance||jsonb_build_object('reconciliation_hidden_reason',$2::text) WHERE id=$1",[grant.id,role]);
        totals.hidden++;await event(db,item,'hidden','Confirmed '+role+'; retained as evidence, reversible');
       }
       await db.query("UPDATE catalog_reconciliation_pages SET state='excluded',snapshot_id=$3,reason=$4 WHERE item_id=$1 AND url=$2",[item.id,next.url,snapshot.id,role]);
       await db.query("UPDATE catalog_reconciliation_items SET status='complete',reason=$2 WHERE id=$1",[item.id,'Non-program evidence: '+role]);
       // Retain candidates, but exclude confirmed non-programs from proposed public results.
       await db.query("UPDATE crawl_candidates SET status='dismissed' WHERE url=$1 AND kind<>'domain' AND status='pending'",[canonicalUrl(page.url)]);
       await db.query('COMMIT');totals.completed++;break;
      }
      if(!grant&&role==='program'){
       const candidate=(await db.query("SELECT id FROM crawl_candidates WHERE url=$1 AND status='pending' AND kind<>'domain' ORDER BY created_at DESC LIMIT 1",[canonicalUrl(page.url)])).rows[0];
       if(candidate){const result=await publishCandidate(db,candidate.id);if(result.opportunityId&&result.outcome!=='skipped'){grant=(await db.query('SELECT * FROM opportunities WHERE id=$1',[result.opportunityId])).rows[0];await event(db,item,result.outcome,result.reason);}}
       item.opportunity_id=grant?.id??null;
      }
     }
     if(grant&&association){
      await attachEvidence(db,grant.id,page,snapshot,association);
      const oldStatus=grant.application_status;
      const resolvedBefore=Number((await db.query("SELECT count(*) FROM catalog_field_history WHERE opportunity_id=$1 AND (old_value IS NULL OR old_value IN ('null','\"unknown\"','\"Unknown\"','[]')) AND new_value NOT IN ('null','\"unknown\"','\"Unknown\"','[]')",[grant.id])).rows[0].count);
      const resolved=await applyProgramEvidence(db,grant.id);
      const resolvedAfter=Number((await db.query("SELECT count(*) FROM catalog_field_history WHERE opportunity_id=$1 AND (old_value IS NULL OR old_value IN ('null','\"unknown\"','\"Unknown\"','[]')) AND new_value NOT IN ('null','\"unknown\"','\"Unknown\"','[]')",[grant.id])).rows[0].count);
      if(resolvedAfter>resolvedBefore)await event(db,item,'facts-resolved',String(resolvedAfter-resolvedBefore));
      if(oldStatus==='unknown'&&resolved.values.status&&!grant.last_verified_at){totals.resolved++;await event(db,item,'status-resolved',resolved.values.status);}
      await db.query('UPDATE catalog_reconciliation_items SET opportunity_id=$2,unresolved=$3 WHERE id=$1',[item.id,grant.id,JSON.stringify(resolved.reasons)]);
      if(next.depth<3){
       for(const raw of supportingLinks(grant.source_url,page.links)){
        let url:string;try{url=canonicalUrl(raw);}catch{continue;}
        if(!item.approved_domains.includes(new URL(url).hostname)){
         await registerLinks(db,{id:item.source_id,approved_domains:item.approved_domains},[url],next.depth+1);continue;
        }
        await registerLinks(db,{id:item.source_id,approved_domains:item.approved_domains},[url],next.depth+1);
        await db.query(`INSERT INTO catalog_reconciliation_pages(item_id,url,depth) SELECT $1,$2,$3 WHERE (SELECT count(*) FROM catalog_reconciliation_pages WHERE item_id=$1)<11 ON CONFLICT DO NOTHING`,[item.id,url,next.depth+1]);
       }
      }
     }
     await db.query("UPDATE catalog_reconciliation_pages SET state=$3,snapshot_id=$4,reason=$5 WHERE item_id=$1 AND url=$2",[item.id,next.url,association?'read':'excluded',snapshot.id,association??'Program association not established']);
     if(!grant){await db.query("UPDATE catalog_reconciliation_items SET status='ambiguous',reason='Program identity unresolved; no automatic publication or merge' WHERE id=$1",[item.id]);}
     await db.query('UPDATE catalog_reconciliation_runs SET heartbeat_at=now() WHERE id=$1',[run.id]);
     await db.query('UPDATE catalog_automation SET heartbeat_at=now() WHERE id=1');
     await db.query('COMMIT');progress=!!grant;
    }catch(e){await db.query('ROLLBACK');throw e;}
   }
   const remains=Number((await db.query("SELECT count(*) FROM catalog_reconciliation_pages WHERE item_id=$1 AND state IN ('queued','failed')",[item.id])).rows[0].count);
   if(!remains){
    const done=await db.query("UPDATE catalog_reconciliation_items SET status='complete',reason=CASE WHEN unresolved='{}'::jsonb THEN 'Checked associated official pages' ELSE 'Checked; unresolved facts remain Unknown' END WHERE id=$1 AND status='running' RETURNING id",[item.id]);
    totals.completed+=done.rowCount??0;
   }else await db.query("UPDATE catalog_reconciliation_items SET status='blocked',reason='Supporting checks unfinished or deferred',next_attempt_at=coalesce((SELECT min(greatest(p.next_attempt_at,CASE WHEN f.failures>0 THEN f.next_check_at ELSE p.next_attempt_at END)) FROM catalog_reconciliation_pages p LEFT JOIN crawl_frontier f ON f.source_id=$2 AND f.url=p.url WHERE p.item_id=$1 AND p.state IN ('queued','failed')),now()+interval '1 hour') WHERE id=$1 AND status='running'",[item.id,item.source_id]);
  }
  totals.unfinished=Number((await db.query("SELECT count(*) FROM catalog_reconciliation_items WHERE run_id=$1 AND status<>'complete'",[run.id])).rows[0].count);
  const summary=await settleReconciliation(db,run.id);
  Object.assign(totals,{inventoryPending:summary.unchecked,retryScheduled:summary.retry_scheduled,researchNeeded:summary.research_needed,factsResolved:summary.facts_resolved});
  return totals;
 }finally{await db.query('ROLLBACK');await releaseCrawlLease(db,lease);}
}
