import type { Pool, PoolClient, Client } from 'pg';
import { currentWorkspace } from './store';
import { canonicalUrl, type ResearchReport } from './research';
type DB = Pool | PoolClient | Client;
export async function researchWorkspace(db:DB,userId:string,write=false) {
 const w=await currentWorkspace(db,userId);
 if(!w || (write && !['owner','admin','member'].includes(w.role))) throw new Error('Workspace access is not permitted.');
 return w;
}
export async function reserveResearch(db:DB,userId:string,topic:string) {
 const w=await researchWorkspace(db,userId,true);
 // ON CONFLICT evaluates the locked row, so simultaneous submissions cannot both reserve a slot.
 const result=await db.query(`WITH reservation AS (
 INSERT INTO discovery_limits(workspace_id,day,used,next_allowed) VALUES($1,(now() AT TIME ZONE 'UTC')::date,1,now()+interval '10 minutes')
 ON CONFLICT(workspace_id) DO UPDATE SET day=excluded.day,
 used=CASE WHEN discovery_limits.day=excluded.day THEN discovery_limits.used+1 ELSE 1 END,next_allowed=excluded.next_allowed
 WHERE discovery_limits.next_allowed<=now() AND (discovery_limits.day<>excluded.day OR discovery_limits.used<5)
 RETURNING workspace_id)
 INSERT INTO discovery_runs(workspace_id,requested_by,query) SELECT workspace_id,$2,$3 FROM reservation RETURNING id`,[w.id,userId,topic]);
 if(!result.rowCount) throw new Error('Search limit reached: wait for the current search or try later (five searches per workspace per day).');
 return {id:result.rows[0].id,workspaceId:w.id};
}
export async function persistResearch(db:DB,userId:string,runId:string,report:ResearchReport) {
 const w=await researchWorkspace(db,userId,true);
 const run=await db.query('SELECT id FROM discovery_runs WHERE id=$1 AND workspace_id=$2 AND requested_by=$3',[runId,w.id,userId]);
 if(!run.rowCount) throw new Error('Search not found.');
 for(const lead of report.leads) {
  const url=canonicalUrl(lead.url);
  await db.query(`INSERT INTO discovery_leads(workspace_id,url,title,snippet,sources,warnings,checked_at)
  VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $7 THEN now() ELSE NULL END)
  ON CONFLICT(workspace_id,url) DO UPDATE SET title=excluded.title,snippet=excluded.snippet,
  sources=excluded.sources,warnings=excluded.warnings,checked_at=excluded.checked_at`,
  [w.id,url,lead.title,lead.snippet,JSON.stringify(lead.sources),JSON.stringify(lead.warnings),lead.sources.length>0]);
 }
 await db.query(`UPDATE discovery_runs SET status=$3,report=$4,finished_at=now() WHERE id=$1 AND workspace_id=$2`,
 [runId,w.id,report.warnings.length ? (report.leads.length?'partial':'failed'):'complete',JSON.stringify({queries:report.queries,warnings:report.warnings,count:report.leads.length})]);
 await db.query("UPDATE discovery_limits SET next_allowed=now()+interval '1 minute' WHERE workspace_id=$1",[w.id]);
}
export async function researchData(db:DB,userId:string) {
 const w=await researchWorkspace(db,userId);
 const leads=await db.query(`SELECT l.*,o.slug AS existing_slug FROM discovery_leads l
 LEFT JOIN LATERAL (SELECT slug FROM opportunities WHERE official_url=l.url OR source_url=l.url LIMIT 1) o ON true
 WHERE workspace_id=$1 ORDER BY checked_at DESC NULLS LAST,created_at DESC LIMIT 60`,[w.id]);
 const runs=await db.query('SELECT * FROM discovery_runs WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 5',[w.id]);
 return {leads:leads.rows,runs:runs.rows};
}
