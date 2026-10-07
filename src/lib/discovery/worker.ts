import {acquireCrawlLease,renewCrawlLease,releaseCrawlLease} from './lease';
import { publishBacklog } from './publish';
import { seedCatalogMonitoring,monitorCatalogPage } from './monitor';
import type { Client } from 'pg';
import { createReader,CrawlError } from './reader';
import { canonicalUrl } from '../opportunities/research';
import { recordPage,registerLinks } from './store';

// A durable lease protects both daily and search workers across pooled connections.
export async function runCrawl(db:Client,reader=createReader(),stopping=()=>false){
 const lock=await acquireCrawlLease(db);
 if(!lock)return false;
 try{
  const run=(await db.query("SELECT * FROM crawl_runs WHERE status IN ('running','queued') ORDER BY created_at LIMIT 1")).rows[0];if(!run)return false;
  await db.query("UPDATE crawl_runs SET status='running',started_at=coalesce(started_at,now()),heartbeat_at=now() WHERE id=$1",[run.id]);
  // A crashed page is retried; successful pages are retained as durable checkpoints.
  await db.query("DELETE FROM crawl_visits WHERE run_id=$1 AND status='reading'",[run.id]);
  await seedCatalogMonitoring(db);
  const sources=(await db.query('SELECT s.* FROM crawl_sources s WHERE enabled AND ($1::uuid IS NULL OR id=$1) ORDER BY (SELECT max(created_at) FROM crawl_visits WHERE source_id=s.id) NULLS FIRST,s.created_at,s.id',[run.source_id])).rows;
  let truncated=false;
  for(const source of sources){
   await registerLinks(db,source,[source.url],0);
   try{
    const policy=await reader.policy(new URL(source.url).origin);
    const sitemaps=policy.sitemaps.length?policy.sitemaps:[new URL('/sitemap.xml',source.url).href];
    truncated=(await registerLinks(db,source,sitemaps,0))||truncated;
   }catch{/* The per-page reader records robots failures with the visit. */}
   while(!stopping()){
    await renewCrawlLease(db,lock);
    const total=(await db.query('SELECT count(*)::int AS total FROM crawl_visits WHERE run_id=$1',[run.id])).rows[0].total;
    const count=(await db.query('SELECT count(*)::int AS total FROM crawl_visits WHERE run_id=$1 AND source_id=$2',[run.id,source.id])).rows[0].total;
    if(total>=run.page_limit||count>=50){truncated=true;break;}
    const item=(await db.query(`SELECT f.* FROM crawl_frontier f WHERE source_id=$1 AND NOT EXISTS
    (SELECT 1 FROM crawl_visits v WHERE v.run_id=$2 AND v.source_id=f.source_id AND v.url=f.url)
    ORDER BY (depth=0) DESC,attempted_at NULLS FIRST,depth,id LIMIT 1`,[source.id,run.id])).rows[0];
    if(!item)break;
    await db.query("INSERT INTO crawl_visits(run_id,source_id,url,status) VALUES($1,$2,$3,'reading')",[run.id,source.id,item.url]);
    try{
     const page=await reader.read(item.url,source.approved_domains);
     await db.query('BEGIN');
     await recordPage(db,source.id,page);
     await monitorCatalogPage(db,run.id,item.url,page);
     truncated=(await registerLinks(db,source,page.links,item.depth+1))||truncated;
     await db.query("UPDATE crawl_visits SET status='read' WHERE run_id=$1 AND source_id=$2 AND url=$3",[run.id,source.id,item.url]);
     await db.query('UPDATE crawl_frontier SET attempted_at=now(),last_run_id=$2 WHERE id=$1',[item.id,run.id]);
     await db.query('COMMIT');
    }catch(e){
     await db.query('ROLLBACK');
     if(e instanceof CrawlError && e.approvalUrl)await registerLinks(db,source,[e.approvalUrl],item.depth);
     await db.query('BEGIN');
     await db.query('UPDATE crawl_visits SET status=$4,error=$5 WHERE run_id=$1 AND source_id=$2 AND url=$3',[run.id,source.id,item.url,e instanceof CrawlError&&e.blocked?'blocked':'failed',e instanceof Error?e.message.slice(0,500):'Source read failed.']);
     try{await monitorCatalogPage(db,run.id,item.url,undefined,e instanceof Error?e.message:'Source read failed');await db.query('COMMIT');}
     catch(error){await db.query('ROLLBACK');throw error;}
     await db.query('UPDATE crawl_frontier SET attempted_at=now(),last_run_id=$2 WHERE id=$1',[item.id,run.id]);
    }
    await db.query('UPDATE crawl_runs SET heartbeat_at=now() WHERE id=$1',[run.id]);
   }
   if(stopping())return true;
   const pages=(await db.query('SELECT count(*)::int AS n FROM crawl_visits WHERE run_id=$1',[run.id])).rows[0].n;
   if(pages>=run.page_limit){truncated=true;break;}
  }
  await renewCrawlLease(db,lock);
  await publishBacklog(db,run.id,stopping);
  if(stopping())return true;
  const failures=(await db.query("SELECT count(*)::int AS n FROM crawl_visits WHERE run_id=$1 AND status IN ('failed','blocked')",[run.id])).rows[0].n;
  await db.query('UPDATE crawl_runs SET status=$2,finished_at=now(),heartbeat_at=now(),note=$3 WHERE id=$1',[run.id,truncated||failures?'partial':'complete',truncated?'Bounded crawl completed. Page/depth limits reached; queued URLs within depth three continue in later runs.':'Registered sources checked. Identifiable leads published; ambiguous items remain in review.']);
  return true;
 }finally{await db.query('ROLLBACK');await releaseCrawlLease(db,lock);}
}
