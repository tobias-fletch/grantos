import {createHash,randomUUID} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import {Agent,fetch} from 'undici';
import type {Client} from 'pg';
import {publicAddress,safeUrl} from '../checklists/sources';
import {applyProgramEvidence} from './program-store';
import {acquireCrawlLease,renewCrawlLease,releaseCrawlLease} from './lease';
import {automationPaused} from './maintenance';
import {normalizeProvider,providerSources,CA_RESOURCE,type Provider,type ImportedGrant} from './providers';

// Fixed official API endpoints only. No credentials, profile data, or arbitrary URLs.
export async function providerRequest(url:string,body?:object){
 const u=safeUrl(url);if(!['api.grants.gov','publish.data.ca.gov'].includes(u.hostname)||u.protocol!=='https:')throw Error('Unapproved provider endpoint');
 const addresses=await lookup(u.hostname,{all:true});if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw Error('Private provider address');
 const selected=addresses[0],agent=new Agent({connect:{lookup:(_h,options,cb)=>{if((options as {all?:boolean}).all)cb(null,[selected] as never);else cb(null,selected.address,selected.family);}}});
 try{const r=await fetch(u,{dispatcher:agent,method:body?'POST':'GET',body:body?JSON.stringify(body):undefined,headers:{'Content-Type':'application/json','User-Agent':'GrantOSDiscovery'},redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!r.ok){await r.body?.cancel();throw Error(`Provider HTTP ${r.status}`);}
  const chunks:Uint8Array[]=[];let size=0;for await(const chunk of r.body!){size+=chunk.length;if(size>4000000)throw Error('Provider response exceeds 4 MB');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));
 }finally{await agent.close();}
}
export async function importGrant(db:Client,g:ImportedGrant){
 const source=providerSources[g.provider];
 const sid=(await db.query(`INSERT INTO crawl_sources(name,url,approved_domains,geography) VALUES($1,$2,$3,'Provider coverage; eligibility varies by program') ON CONFLICT(url) DO UPDATE SET name=crawl_sources.name RETURNING id`,[source.name,source.url,[source.domain]])).rows[0].id;
 const hash=createHash('sha256').update(JSON.stringify({...g,facts:g.facts.map(({fetchedAt,...f})=>f)})).digest('hex');
 const prior=(await db.query('SELECT * FROM catalog_provider_records WHERE provider=$1 AND external_id=$2',[g.provider,g.id])).rows[0];
 let id=prior?.opportunity_id??(await db.query('SELECT opportunity_id FROM opportunity_source_urls WHERE url=$1 UNION SELECT id FROM opportunities WHERE source_url=$1 OR official_url=$1 LIMIT 1',[g.url])).rows[0]?.opportunity_id;
 const existing=id?(await db.query('SELECT * FROM opportunities WHERE id=$1 FOR UPDATE',[id])).rows[0]:null;
 if(existing&&(existing.publication_state==='hidden'||existing.verification_status==='archived'||existing.merged_into))return 'skipped';
 // Same title is not sufficient to merge. Withhold a second listing when the
 // same named funder/program already exists under another source URL.
 if(!id&&(await db.query('SELECT 1 FROM opportunities o JOIN funders f ON f.id=o.funder_id WHERE lower(o.name)=lower($1) AND lower(f.name)=lower($2) AND o.merged_into IS NULL LIMIT 1',[g.title,g.funder])).rowCount)return 'skipped';
 if(!id){id=randomUUID();let funder=null;if(g.funder){funder=(await db.query('SELECT id FROM funders WHERE name=$1 LIMIT 1',[g.funder])).rows[0]?.id;if(!funder)funder=(await db.query('INSERT INTO funders(name) VALUES($1) RETURNING id',[g.funder])).rows[0].id;}
  await db.query(`INSERT INTO opportunities(id,name,slug,official_url,source_url,funding_type,summary,eligibility_notes,deadline_notes,publication_origin,publication_provenance,funder_id) VALUES($1,$2,$3,$4,$4,'grant',$5,'Unknown','Unknown','crawler',$6,$7)`,[id,g.title,'grant-'+id,g.url,g.summary,JSON.stringify({method:'official-structured-data',provider:g.provider,external_id:g.id,category_origin:'unknown'}),funder]);
 }
 const snapshot=(await db.query(`INSERT INTO crawl_snapshots(source_id,url,hash,title,body,extracted) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(source_id,url,hash) DO UPDATE SET fetched_at=now() RETURNING id,fetched_at`,[sid,g.url,hash,g.title,g.body,JSON.stringify({extractor:'structured-v1',structured_facts:g.facts})])).rows[0];
 await db.query(`INSERT INTO program_evidence_pages(opportunity_id,url,role,association,snapshot_id,fetched_at,facts) VALUES($1,$2,'program','official-structured-data',$3,$4,$5) ON CONFLICT(opportunity_id,url) DO UPDATE SET facts=excluded.facts,snapshot_id=excluded.snapshot_id,fetched_at=excluded.fetched_at,association=excluded.association`,[id,g.url,snapshot.id,snapshot.fetched_at,JSON.stringify(g.facts)]);
 await db.query('INSERT INTO opportunity_source_urls(url,opportunity_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[g.url,id]);
 await applyProgramEvidence(db,id);
 await db.query('INSERT INTO program_round_evidence(opportunity_id,snapshot_id,source_url,fetched_at,facts) VALUES($1,$2,$3,$4,$5) ON CONFLICT(opportunity_id,snapshot_id) DO UPDATE SET facts=excluded.facts,fetched_at=excluded.fetched_at',[id,snapshot.id,g.url,snapshot.fetched_at,JSON.stringify(g.facts)]);
 await db.query(`UPDATE opportunities SET source_fetched_at=now(),last_checked_at=now(),publication_provenance=publication_provenance||$2::jsonb WHERE id=$1`,[id,JSON.stringify({provider:g.provider,external_id:g.id,method:'official-structured-data',applicant_types_complete:g.applicantTypesComplete===true,applicant_types:JSON.parse(g.facts.find(f=>f.field==='applicants')?.value??'[]')})]);
 await db.query(`INSERT INTO catalog_provider_records(provider,external_id,opportunity_id,hash) VALUES($1,$2,$3,$4) ON CONFLICT(provider,external_id) DO UPDATE SET opportunity_id=excluded.opportunity_id,hash=excluded.hash,checked_at=now(),next_check_at=now()+interval '1 day'`,[g.provider,g.id,id,hash]);
 return prior?.hash===hash?'unchanged':existing?'updated':'published';
}
type Budget={charge:(provider:string)=>void};
export async function runProviderSync(db:Client,stop:()=>boolean,budget:Budget,request=providerRequest){
 if(stop()||await automationPaused(db))return;
 const lease=await acquireCrawlLease(db);if(!lease)return;
 try{
 const providers=(await db.query('SELECT * FROM catalog_provider_sync WHERE enabled AND (next_check_at<=now() OR EXISTS(SELECT 1 FROM grant_external_results e WHERE e.provider=catalog_provider_sync.provider AND e.publication_checked_at IS NULL)) ORDER BY last_success_at NULLS FIRST,provider')).rows;
 for(const p of providers){if(stop())break;
 if((await db.query('SELECT 1 FROM crawl_sources WHERE url=$1 AND NOT enabled',[providerSources[p.provider as Provider].url])).rowCount)continue;
 let calls=0,processed=0;const get=async(url:string,body?:object)=>{if(stop()||calls>=50)throw Error('Provider invocation limit');budget.charge(p.provider);calls++;await new Promise(r=>setTimeout(r,1500));return request(url,body);};
 try{
  // Search results are public provider facts, not private search sessions or application data.
  for(const e of (await db.query('SELECT id,data FROM grant_external_results WHERE provider=$1 AND publication_checked_at IS NULL ORDER BY fetched_at LIMIT 10',[p.provider])).rows){
   if(stop())break;await renewCrawlLease(db,lease);await db.query('BEGIN');try{await db.query('SELECT pg_advisory_xact_lock(7823091)');const outcome=await importGrant(db,e.data);await db.query('UPDATE catalog_provider_sync SET imported=imported+$2,skipped=skipped+$3 WHERE provider=$1',[p.provider,outcome==='published'?1:0,outcome==='skipped'?1:0]);await db.query('UPDATE grant_external_results SET publication_checked_at=now() WHERE id=$1',[e.id]);await db.query('COMMIT');}catch(e){await db.query('ROLLBACK');throw e;}
  }
  // Recheck already imported federal records even after they disappear from open search.
  for(const row of (await db.query("SELECT external_id FROM catalog_provider_records WHERE provider=$1 AND next_check_at<=now() ORDER BY next_check_at LIMIT 5",[p.provider])).rows){if(stop())break;
   let raw:any;
   if(p.provider==='grants-gov'){const res=await get('https://api.grants.gov/v1/api/fetchOpportunity',{opportunityId:Number(row.external_id)});if(res.errorcode!==0||!res.data)throw Error('Invalid federal detail');raw=res.data;}
   else{const res=await get(`https://publish.data.ca.gov/api/3/action/datastore_search?resource_id=${CA_RESOURCE}&limit=1&filters=${encodeURIComponent(JSON.stringify({PortalID:Number(row.external_id)}))}`);if(!res.success||!Array.isArray(res.result?.records))throw Error('Invalid California detail');raw=res.result.records[0];}
   const g=raw?normalizeProvider(p.provider as Provider,raw):null;await db.query('BEGIN');try{await db.query('SELECT pg_advisory_xact_lock(7823091)');if(g)await importGrant(db,g);await db.query("UPDATE catalog_provider_records SET next_check_at=now()+interval '1 day' WHERE provider=$1 AND external_id=$2",[p.provider,row.external_id]);await db.query('COMMIT');}catch(e){await db.query('ROLLBACK');throw e;}}
  let pending=p.pending as any[],cursor=p.cursor,total=Infinity;
  if(!pending.length&&!stop()){
   if(p.provider==='grants-gov'){const r=await get('https://api.grants.gov/v1/api/search2',{rows:20,startRecordNum:cursor,oppStatuses:'posted|forecasted',fundingInstruments:'G'});if(r.errorcode!==0||!Array.isArray(r.data?.oppHits))throw Error('Invalid federal search');pending=r.data.oppHits;total=Number(r.data.hitCount);}
   else{const r=await get(`https://publish.data.ca.gov/api/3/action/datastore_search?resource_id=${CA_RESOURCE}&limit=50&offset=${cursor}&sort=PortalID%20asc&filters=${encodeURIComponent(JSON.stringify({Status:'active'}))}`);if(!r.success||!Array.isArray(r.result?.records))throw Error('Invalid California dataset');pending=r.result.records;total=Number(r.result.total);}
   // Cursor advances only after the returned page is durably staged.
   cursor+=pending.length;await db.query('UPDATE catalog_provider_sync SET cursor=$2,pending=$3 WHERE provider=$1',[p.provider,cursor,JSON.stringify(pending)]);
  }
  while(pending.length&&!stop()&&processed<50&&calls<49){await renewCrawlLease(db,lease);const row=pending[0];let raw=row;if(p.provider==='grants-gov'){const r=await get('https://api.grants.gov/v1/api/fetchOpportunity',{opportunityId:Number(row.id)});if(r.errorcode!==0||!r.data)throw Error('Invalid federal detail');raw=r.data;}
   const g=normalizeProvider(p.provider as Provider,raw);await db.query('BEGIN');try{await db.query('SELECT pg_advisory_xact_lock(7823091)');const outcome=g?await importGrant(db,g):'skipped';await db.query('UPDATE catalog_provider_sync SET pending=$2,imported=imported+$3,skipped=skipped+$4 WHERE provider=$1',[p.provider,JSON.stringify(pending.slice(1)),outcome==='published'?1:0,outcome==='skipped'?1:0]);await db.query('COMMIT');pending=pending.slice(1);processed++;}catch(e){await db.query('ROLLBACK');throw e;}
  }
  const complete=!pending.length&&cursor>=total;
  await db.query(`UPDATE catalog_provider_sync SET last_success_at=now(),failures=0,last_error='',cursor=CASE WHEN $2 THEN 0 ELSE cursor END,completed_at=CASE WHEN $2 THEN now() ELSE completed_at END,next_check_at=now()+CASE WHEN $2 THEN interval '1 day' ELSE interval '0 seconds' END WHERE provider=$1`,[p.provider,complete]);
 }catch{await db.query('ROLLBACK');await db.query("UPDATE catalog_provider_sync SET failures=failures+1,last_error='Import interrupted; checkpoint retained. Check provider availability or schema.',next_check_at=now()+least(interval '1 day',interval '15 minutes'*power(2,least(failures,6))) WHERE provider=$1",[p.provider]);}
 }
 }finally{await releaseCrawlLease(db,lease);}
}
