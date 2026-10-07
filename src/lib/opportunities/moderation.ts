import type { Client,PoolClient } from 'pg';
import { requireEditor } from '../discovery/store';
import { canonicalUrl } from './research';
// Called inside a transaction with the same advisory lock as crawler/editorial publication.
export async function moderateGrant(db:Client|PoolClient,userId:string,id:string,action:'hide'|'merge',targetId?:string,emails?:string){
 await requireEditor(db,userId,emails);
 const source=(await db.query('SELECT * FROM opportunities WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!source)throw Error('Grant not found.');
 if(action==='merge'){
  const target=(await db.query("SELECT * FROM opportunities WHERE id=$1 AND publication_state='published' AND merged_into IS NULL FOR UPDATE",[targetId])).rows[0];
  if(!target||target.id===id)throw Error('Choose a different published grant.');
  // Never move a job underneath a running generator.
  if((await db.query("SELECT 1 FROM checklist_jobs WHERE opportunity_id=ANY($1::uuid[]) AND status IN ('queued','running')",[[id,target.id]])).rowCount)throw Error('Wait for active checklist jobs before merging.');
  // Retarget before moving saves so the save trigger reuses the original application.
  await db.query('UPDATE applications SET opportunity_id=$2,updated_at=now() WHERE opportunity_id=$1',[id,target.id]);
  await db.query(`INSERT INTO saved_opportunities(workspace_id,opportunity_id,saved_by,saved_at)
   SELECT workspace_id,$2,saved_by,saved_at FROM saved_opportunities WHERE opportunity_id=$1 ON CONFLICT DO NOTHING`,[id,target.id]);
  await db.query('DELETE FROM saved_opportunities WHERE opportunity_id=$1',[id]);
  await db.query('UPDATE grant_tasks SET opportunity_id=$2 WHERE opportunity_id=$1',[id,target.id]);
  await db.query('UPDATE checklist_jobs SET opportunity_id=$2 WHERE opportunity_id=$1',[id,target.id]);
  await db.query('UPDATE opportunity_source_urls SET opportunity_id=$2 WHERE opportunity_id=$1',[id,target.id]);
  for(const raw of [source.source_url,source.official_url])await db.query('INSERT INTO opportunity_source_urls(url,opportunity_id) VALUES($1,$2) ON CONFLICT(url) DO UPDATE SET opportunity_id=excluded.opportunity_id',[canonicalUrl(raw),target.id]);
  await db.query('UPDATE crawl_candidates SET opportunity_id=$2 WHERE opportunity_id=$1',[id,target.id]);
  await db.query('UPDATE opportunities SET merged_into=$2 WHERE id=$1',[id,target.id]);
 }
 await db.query("UPDATE opportunities SET publication_state='hidden',updated_at=now() WHERE id=$1",[id]);
 await db.query('INSERT INTO catalog_moderation_events(opportunity_id,actor_id,action,details) VALUES($1,$2,$3,$4)',[id,userId,action,JSON.stringify({targetId:targetId??null})]);
}
