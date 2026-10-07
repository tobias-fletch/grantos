import type {DB} from './store';
import {registerLinks} from './store';
import type {CrawlPage} from './reader';
import {canonicalUrl} from '../opportunities/research';

// Conservative, program-specific evidence only. A closed cycle is not discontinuation.
export function lifecycleSignal(name:string,page:CrawlPage){
 const normalized=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
 const title=normalized(page.title),program=normalized(name);
 if(program.length<8||!title.includes(program))return null;
 const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const subject=`(?:this (?:grant|program|fund|fellowship)|the program|${escaped})`;
 const retired=new RegExp(`(?:^|[.!?]\\s+)${subject} (?:has been (?:permanently )?discontinued|is (?:permanently discontinued|no longer offered|permanently closed)|will no longer be offered)\\b[^.!?]*[.!?]?`,'i');
 const returned=new RegExp(`(?:^|[.!?]\\s+)${subject} (?:is (?:now |once again )?(?:accepting applications|open for applications)|has (?:reopened|resumed))\\b[^.!?]*[.!?]?`,'i');
 const evidence=page.text.match(retired)?.[0];
 if(evidence&&!/\b(if|unless|might|may|could|until|this (?:year|cycle|round|season)|temporarily)\b/i.test(evidence))return {state:'discontinued' as const,evidence};
 const restored=page.text.match(returned)?.[0];
 return restored&&!/\b(if|unless|might|may|could)\b/i.test(restored)?{state:'active' as const,evidence:restored}:null;
}

// Seed catalog URLs explicitly so programs need not be rediscovered through directory links.
// Existing disabled registries remain disabled; their domains are not enabled behind the editor's back.
export async function seedCatalogMonitoring(db:DB){
 const grants=(await db.query("SELECT id,name,source_url FROM opportunities WHERE NOT is_demo AND publication_state='published' AND verification_status<>'archived' AND merged_into IS NULL")).rows;
 for(const grant of grants){
  let url:string;try{url=canonicalUrl(grant.source_url);}catch{continue;}
  const host=new URL(url).hostname;
  let source=(await db.query('SELECT * FROM crawl_sources WHERE url=$1 OR $2=ANY(approved_domains) ORDER BY (url=$1) DESC,enabled DESC,created_at,id LIMIT 1',[url,host])).rows[0];
  if(!source)source=(await db.query(`INSERT INTO crawl_sources(name,url,approved_domains,categories)
   VALUES($1,$2,$3,ARRAY(SELECT category FROM opportunity_categories WHERE opportunity_id=$4))
   ON CONFLICT(url) DO UPDATE SET url=excluded.url RETURNING *`,[`Catalog: ${grant.name}`,url,[host],grant.id])).rows[0];
  if(source.enabled)await registerLinks(db,source,[url],0);
 }
}

// Called in the page transaction. One outcome per grant/run makes restart recovery idempotent.
export async function monitorCatalogPage(db:DB,runId:string,url:string,page?:CrawlPage,error=''){
 const grants=(await db.query("SELECT id,name,source_url FROM opportunities WHERE NOT is_demo AND publication_state='published' AND verification_status<>'archived' AND merged_into IS NULL")).rows;
 for(const grant of grants){
  try{if(canonicalUrl(grant.source_url)!==canonicalUrl(url))continue;}catch{continue;}
  await db.query('INSERT INTO catalog_monitoring(opportunity_id) VALUES($1) ON CONFLICT DO NOTHING',[grant.id]);
  const current=(await db.query('SELECT * FROM catalog_monitoring WHERE opportunity_id=$1 FOR UPDATE',[grant.id])).rows[0];
  const signal=page?lifecycleSignal(grant.name,page):null;
  const state=signal?.state??current.state;
  const outcome=!page?'failed':state!==current.state?(state==='discontinued'?'archived':'restored'):'checked';
  const inserted=await db.query(`INSERT INTO catalog_monitor_events(opportunity_id,run_id,outcome,evidence,source_url)
   VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id`,[grant.id,runId,outcome,signal?.evidence??error.slice(0,500),url]);
  if(!inserted.rowCount)continue;
  await db.query(`UPDATE catalog_monitoring SET state=$2,last_attempt_at=now(),
   last_success_at=CASE WHEN $3 THEN now() ELSE last_success_at END,
   consecutive_failures=CASE WHEN $3 THEN 0 ELSE consecutive_failures+1 END,last_error=$4,
   evidence=CASE WHEN $5<>'' THEN $5 ELSE evidence END,source_url=$6,
   changed_at=CASE WHEN state<>$2 THEN now() ELSE changed_at END WHERE opportunity_id=$1`,
   [grant.id,state,!!page,page?'':error.slice(0,500),signal?.evidence??'',url]);
 }
}
