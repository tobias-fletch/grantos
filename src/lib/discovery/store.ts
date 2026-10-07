import { createHash } from 'node:crypto';
import type { Pool,PoolClient,Client } from 'pg';
import { canonicalUrl } from '../opportunities/research';
import { editorAllowed } from '../beta/security';
import { scheduledDay } from './policy';
import type { CrawlPage } from './reader';
export type DB=Pool|PoolClient|Client;
export async function requireEditor(db:DB,userId:string,emails=process.env.CATALOG_EDITOR_EMAILS??''){

 if(!await editorAllowed(db,userId))throw new Error('Catalog editor access is required.');
}
export async function enqueueDaily(db:DB,now=new Date()){
 return (await db.query(`INSERT INTO crawl_runs(schedule_day,trigger) VALUES($1,'scheduled') ON CONFLICT DO NOTHING RETURNING id`,[scheduledDay(now)])).rows[0]?.id;
}
export async function enqueueManual(db:DB,userId:string,emails?:string){
 await requireEditor(db,userId,emails);
 return (await db.query("INSERT INTO crawl_runs(trigger,requested_by) VALUES('manual',$1) ON CONFLICT DO NOTHING RETURNING id",[userId])).rows[0]?.id;
}
export async function registerLinks(db:DB,source:{id:string;approved_domains:string[]},links:string[],depth:number){
 let truncated=false;
 for(const raw of links){
  let url:string;try{url=canonicalUrl(raw);}catch{continue;}
  const host=new URL(url).hostname;
  if(!source.approved_domains.includes(host)){
   await db.query(`INSERT INTO crawl_candidates(source_id,url,hash,kind,title,proposed,evidence)
    VALUES($1,$2,$3,'domain',$4,$5,$6) ON CONFLICT DO NOTHING`,[source.id,new URL(url).origin,host,host,JSON.stringify({domain:host,example_url:url}),`Linked from a registered source. Approve the domain only after confirming its owner.`]);continue;
  }
  if(depth>3){truncated=true;continue;}
  const result=await db.query(`INSERT INTO crawl_frontier(source_id,url,depth)
   SELECT $1,$2,$3 WHERE (SELECT count(*) FROM crawl_frontier WHERE source_id=$1)<5000
   ON CONFLICT(source_id,url) DO UPDATE SET depth=least(crawl_frontier.depth,excluded.depth) RETURNING id`,[source.id,url,depth]);
  if(!result.rowCount)truncated=true;
 }
 return truncated;
}
export async function recordPage(db:DB,sourceId:string,page:CrawlPage){
 const url=canonicalUrl(page.url),hash=createHash('sha256').update(page.text).digest('hex');
 const previousSnapshot=(await db.query('SELECT * FROM crawl_snapshots WHERE url=$1 ORDER BY fetched_at DESC LIMIT 1',[url])).rows[0];
 const snapshot=(await db.query(`INSERT INTO crawl_snapshots(source_id,url,hash,title,body,extracted,fetched_at) VALUES($1,$2,$3,$4,$5,$6,clock_timestamp())
 ON CONFLICT(source_id,url,hash) DO UPDATE SET fetched_at=clock_timestamp(),extracted=excluded.extracted RETURNING id`,[sourceId,url,hash,page.title,page.text,JSON.stringify(page.extracted)])).rows[0];
 if((previousSnapshot?.hash===hash&&previousSnapshot?.extracted?.extractor===page.extracted.extractor) || page.kind==='xml')return;
 const grants=(await db.query('SELECT * FROM opportunities WHERE NOT is_demo')).rows;
 const grant=grants.find(g=>[g.source_url,g.official_url].some(v=>{try{return canonicalUrl(v)===url;}catch{return false;}}));
 if(!grant&&!/\b(grants?|funding|fellowships?|awards?|solicitations?)\b/i.test(page.title))return;
 const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
 const duplicate=grants.find(g=>normalize(g.name)===normalize(page.title));
 const before=grant?{id:grant.id,name:grant.name,status:grant.application_status,deadline:grant.deadline_at,minimum:grant.minimum_award,maximum:grant.maximum_award,eligibility:grant.eligibility_notes,notes:grant.deadline_notes}:{};
 const proposed={...page.extracted,possible_duplicate_id:duplicate?.id??null,possible_duplicate_name:duplicate?.name??null,previous_excerpt:previousSnapshot?.body?.slice(0,12000)??null};
 // Only the latest source version remains actionable. Never mutate verified grant fields here.
 await db.query("UPDATE crawl_candidates SET status='superseded' WHERE url=$1 AND kind<>'domain' AND status='pending' AND hash<>$2",[url,hash]);
 await db.query(`INSERT INTO crawl_candidates(source_id,url,hash,snapshot_id,opportunity_id,kind,title,previous,proposed,evidence)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(source_id,url,hash,kind) DO UPDATE SET
 status='pending',previous=excluded.previous,proposed=excluded.proposed,evidence=excluded.evidence,created_at=clock_timestamp(),reviewed_by=NULL,reviewed_at=NULL`,
 [sourceId,url,hash,snapshot.id,grant?.id??null,grant?'changed':'new',page.title||url,JSON.stringify(before),JSON.stringify(proposed),page.text.slice(0,24000)]);
}
export async function crawlSummary(db:DB){
 return (await db.query(`SELECT r.*,
 (SELECT count(*)::int FROM crawl_visits v WHERE v.run_id=r.id) AS pages,
 (SELECT count(*)::int FROM crawl_visits v WHERE v.run_id=r.id AND status IN ('failed','blocked')) AS failures,
 (SELECT count(*)::int FROM crawl_candidates WHERE status='pending') AS backlog
 FROM crawl_runs r ORDER BY created_at DESC LIMIT 1`)).rows[0]??null;
}
