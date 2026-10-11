import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {transaction,type DB} from '../checklists/store';
import {workspaceAccess} from '../applications/store';
import {parseFilters,type SearchParams,type Filters} from '../opportunities/store';
import {locationParams} from '../opportunities/geography';
import {rateLimit} from '../beta/security';
import type {Provider} from '../discovery/providers';
import {officialJson,searchRequest,searchPage,normalizeLive,SourceError,capabilities} from './providers';
export async function startSession(db:DB,userId:string,requestId:string,params:SearchParams){
 z.string().uuid().parse(requestId);const w=await workspaceAccess(db,userId);
 await transaction(db,async c=>{
  await c.query('DELETE FROM grant_search_results r USING grant_search_sessions s WHERE r.session_id=s.id AND s.workspace_id=$1 AND s.expires_at<now()',[w.id]);
  await c.query('DELETE FROM grant_search_progress p USING grant_search_sessions s WHERE p.session_id=s.id AND s.workspace_id=$1 AND s.expires_at<now()',[w.id]);
  await c.query('DELETE FROM grant_search_sessions WHERE workspace_id=$1 AND expires_at<now()',[w.id]);
  await c.query("DELETE FROM grant_search_requests WHERE key IN(SELECT key FROM grant_search_requests WHERE coalesce(fetched_at,retry_at)<now()-interval '7 days' AND (lease_until IS NULL OR lease_until<now()) LIMIT 100)");
 });
 const old=(await db.query('SELECT id FROM grant_search_sessions WHERE workspace_id=$1 AND request_id=$2',[w.id,requestId])).rows[0];if(old)return old.id;
 if(!await rateLimit(db,'live-start:'+userId,20,3600))throw new SourceError(true);
 const f=parseFilters(locationParams(params,w));f.resultType='programs';f.saved=false;f.suggested=false;
 return transaction(db,async c=>{const s=(await c.query('INSERT INTO grant_search_sessions(workspace_id,request_id,filters) VALUES($1,$2,$3) ON CONFLICT(workspace_id,request_id) DO UPDATE SET request_id=excluded.request_id RETURNING id',[w.id,requestId,JSON.stringify(f)])).rows[0];
 for(const p of ['grants-gov','california'])await c.query('INSERT INTO grant_search_progress(session_id,provider) VALUES($1,$2) ON CONFLICT DO NOTHING',[s.id,p]);return s.id;});
}
export async function sessionAccess(db:DB,userId:string,id:string){z.string().uuid().parse(id);const w=await workspaceAccess(db,userId);const s=(await db.query('SELECT * FROM grant_search_sessions WHERE id=$1 AND workspace_id=$2 AND expires_at>now()',[id,w.id])).rows[0];if(!s)throw Error('Search expired or unavailable');return s;}
export async function sessionStatus(db:DB,userId:string,id:string){await sessionAccess(db,userId,id);return {id,providers:(await db.query("SELECT provider,CASE WHEN status='searching' AND lease_until<now() THEN 'more' ELSE status END AS status,total,exhausted,retry_at,cursor,jsonb_array_length(pending) AS staged FROM grant_search_progress WHERE session_id=$1 ORDER BY provider",[id])).rows,retrieved:Number((await db.query('SELECT count(*) FROM grant_search_results WHERE session_id=$1',[id])).rows[0].count)};}
export async function sharedRequest(db:DB,provider:string,url:string,body:object|undefined,since:Date,signal:AbortSignal,request=officialJson){
 const key=createHash('sha256').update(JSON.stringify([provider,url,body])).digest('hex');const owner=randomUUID();
 await db.query('INSERT INTO grant_search_requests(key,provider) VALUES($1,$2) ON CONFLICT DO NOTHING',[key,provider]);
 const row=(await db.query('SELECT * FROM grant_search_requests WHERE key=$1',[key])).rows[0];
 if(row.response&&row.fetched_at&&new Date(row.fetched_at)>=since)return row.response;
 if(new Date(row.retry_at)>new Date())throw new SourceError(true);
 const claim=await db.query("UPDATE grant_search_requests SET owner=$2,lease_until=now()+interval '20 seconds' WHERE key=$1 AND (lease_until IS NULL OR lease_until<now()) RETURNING key",[key,owner]);if(!claim.rowCount){
 while(!signal.aborted){await new Promise(r=>setTimeout(r,150));const shared=(await db.query('SELECT response,fetched_at,lease_until FROM grant_search_requests WHERE key=$1',[key])).rows[0];if(shared.response&&new Date(shared.fetched_at)>=since)return shared.response;if(!shared.lease_until)break;}return null;
 }
 try{if(!await rateLimit(db,'live-provider:'+provider,provider in capabilities?capabilities[provider as keyof typeof capabilities].requestsPerMinute:20,60))throw new SourceError(true);
 const response=await request(url,body,signal);await db.query('UPDATE grant_search_requests SET response=$3,fetched_at=now(),lease_until=NULL,owner=NULL WHERE key=$1 AND owner=$2',[key,owner,JSON.stringify(response)]);return response;
 }catch(e){await db.query("UPDATE grant_search_requests SET lease_until=NULL,owner=NULL,retry_at=now()+interval '1 minute' WHERE key=$1 AND owner=$2",[key,owner]);throw e;}
}
export async function searchBatch(db:DB,userId:string,id:string,request=officialJson){
 const s=await sessionAccess(db,userId,id);
 if((await db.query('SELECT paused FROM catalog_automation WHERE id=1')).rows[0]?.paused)throw Error('Research is paused');
 if(!await rateLimit(db,'live-batch:'+userId,60,3600))throw new SourceError(true);
 const signal=AbortSignal.timeout(12000); // Leaves time for checkpoints within the 15-second request target.
 const providers=(await db.query('SELECT * FROM grant_search_progress WHERE session_id=$1 AND NOT exhausted AND retry_at<=now()',[id])).rows;
 await Promise.allSettled(providers.slice(0,2).map(async p=>{
 const owner=randomUUID(),provider=p.provider as Provider;
 const config=(await db.query('SELECT enabled FROM catalog_provider_sync WHERE provider=$1',[provider])).rows[0];
 const sourceUrl=provider==='grants-gov'?'https://www.grants.gov/search-grants':'https://www.grants.ca.gov/';
 if(config?.enabled===false||(await db.query('SELECT 1 FROM crawl_sources WHERE url=$1 AND NOT enabled',[sourceUrl])).rowCount){await db.query("UPDATE grant_search_progress SET status='unavailable' WHERE session_id=$1 AND provider=$2",[id,provider]);return;}
 const claimed=await db.query("UPDATE grant_search_progress SET owner=$3,lease_until=now()+interval '20 seconds',status='searching' WHERE session_id=$1 AND provider=$2 AND NOT exhausted AND retry_at<=now() AND (lease_until IS NULL OR lease_until<now()) RETURNING *",[id,provider,owner]);if(!claimed.rowCount)return;Object.assign(p,claimed.rows[0]);
 try{
 let pending=p.pending as any[],cursor=p.cursor,total=p.total,phase=p.phase??0,phaseTotal=p.phase_total;
 const get=(url:string,body?:object)=>sharedRequest(db,provider,url,body,new Date(s.created_at),signal,request);
 if(!pending.length){const spec=searchRequest(provider,s.filters,cursor,phase),r=await get(spec.url,spec.body);if(!r)throw Error('Shared request running');const page=searchPage(provider,r);pending=page.rows;phaseTotal=page.total;total=(cursor===0?(total??0):Math.max(0,(total??0)-(p.phase_total??0)))+page.total;if(!pending.length&&cursor<phaseTotal)throw new SourceError();cursor+=pending.length;
 await db.query('UPDATE grant_search_progress SET pending=$3,cursor=$4,total=$5,phase_total=$7 WHERE session_id=$1 AND provider=$2 AND owner=$6',[id,provider,JSON.stringify(pending),cursor,total,owner,phaseTotal]);}
 let n=0;
 while(pending.length&&!signal.aborted&&n<20){
 const raw=pending[0];let detail=raw;
 if(provider==='grants-gov'){const r=await get('https://api.grants.gov/v1/api/fetchOpportunity',{opportunityId:Number(raw.id)});if(!r)break;if(r.errorcode!==0||!r.data)throw new SourceError();detail=r.data;}
 const g=normalizeLive(provider,detail);
 await transaction(db,async c=>{if(!(await c.query('SELECT 1 FROM grant_search_progress WHERE session_id=$1 AND provider=$2 AND owner=$3 FOR UPDATE',[id,provider,owner])).rowCount)throw Error('Lease lost');if(g){const result=(await c.query('INSERT INTO grant_external_results(provider,external_id,source_url,data) VALUES($1,$2,$3,$4) ON CONFLICT(provider,external_id) DO UPDATE SET data=excluded.data,fetched_at=now(),publication_checked_at=NULL RETURNING id',[provider,g.id,g.url,JSON.stringify(g)])).rows[0];await c.query('INSERT INTO grant_search_results(session_id,result_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,result.id]);}
 await c.query('UPDATE grant_search_progress SET pending=$3 WHERE session_id=$1 AND provider=$2 AND owner=$4',[id,provider,JSON.stringify(pending.slice(1)),owner]);});pending=pending.slice(1);n++;
 }
 const stageDone=pending.length===0&&cursor>=phaseTotal;const done=stageDone&&(provider!=='grants-gov'||phase===2);
 if(stageDone&&!done)await db.query('UPDATE grant_search_progress SET phase=phase+1,cursor=0,phase_total=NULL WHERE session_id=$1 AND provider=$2 AND owner=$3',[id,provider,owner]);
 await db.query("UPDATE grant_search_progress SET exhausted=$4,status=$5,owner=NULL,lease_until=NULL WHERE session_id=$1 AND provider=$2 AND owner=$3",[id,provider,owner,done,done?'received':'more']);
 }catch(e){await db.query("UPDATE grant_search_progress SET status=$4,retry_at=now()+interval '1 minute',owner=NULL,lease_until=NULL WHERE session_id=$1 AND provider=$2 AND owner=$3",[id,provider,owner,e instanceof SourceError&&e.limited?'limited':'unavailable']);}
 }));return sessionStatus(db,userId,id);
}
