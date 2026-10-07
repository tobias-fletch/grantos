import { z } from 'zod';
import { currentWorkspace } from '../opportunities/store';
import { canonicalUrl } from '../opportunities/research';
import { transaction,dateValue,taskInput,type DB } from '../checklists/store';
export const stages=['saved','preparing','submitted','awarded','declined','withdrawn'] as const;
export async function workspaceAccess(db:DB,userId:string,write=false){const w=await currentWorkspace(db,userId);if(!w||(write&&!['owner','admin','member'].includes(w.role)))throw Error('Workspace access denied');return w;}
export async function applicationAccess(db:DB,userId:string,id:string,write=false){z.string().uuid().parse(id);const w=await workspaceAccess(db,userId,write);const a=(await db.query('SELECT *,target_date::text,submitted_date::text FROM applications WHERE id=$1 AND workspace_id=$2',[id,w.id])).rows[0];if(!a)throw Error('Application not found');return a;}
export async function saveCandidate(db:DB,userId:string,id:string){return transaction(db,async c=>{
 z.string().uuid().parse(id);const w=await workspaceAccess(c,userId,true);
 await c.query('SELECT pg_advisory_xact_lock(7823091)');
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,9010))',[w.id]);
 const lead=(await c.query(`SELECT c.*,sn.fetched_at FROM crawl_candidates c JOIN crawl_snapshots sn ON sn.id=c.snapshot_id WHERE c.id=$1 AND c.kind<>'domain' AND c.status IN ('pending','published')`,[id])).rows[0];if(!lead)throw Error('Candidate unavailable');
 const url=canonicalUrl(lead.url).replace(/\/$/,'');
 const grant=(await c.query(`SELECT o.id FROM opportunities o WHERE o.publication_state='published' AND o.verification_status<>'archived' AND (o.id=$1 OR rtrim(o.source_url,'/')=$2 OR o.id IN(SELECT opportunity_id FROM opportunity_source_urls WHERE rtrim(url,'/')=$2)) LIMIT 1`,[lead.opportunity_id,url])).rows[0];
 const existing=(await c.query('SELECT id FROM applications WHERE workspace_id=$1 AND (source_url=$2 OR ($3::uuid IS NOT NULL AND opportunity_id=$3)) ORDER BY created_at LIMIT 1',[w.id,url,grant?.id??null])).rows[0];if(existing)return existing.id as string;
 const a=(await c.query(`INSERT INTO applications(workspace_id,opportunity_id,candidate_id,title,source_url,source_excerpt,source_fetched_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(workspace_id,source_url) DO NOTHING RETURNING id`,[w.id,grant?.id??null,id,lead.title,url,lead.evidence,lead.fetched_at,userId])).rows[0];
 if(a){await c.query("INSERT INTO application_history(application_id,actor_id,event,stage) VALUES($1,$2,'Saved candidate','saved')",[a.id,userId]);return a.id as string;}
 return (await c.query('SELECT id FROM applications WHERE workspace_id=$1 AND source_url=$2',[w.id,url])).rows[0].id as string;
 });}
const amount=z.preprocess(v=>v===''||v==null?null:Number(v),z.number().finite().min(0).max(999999999999.99).nullable());
export const applicationInput=z.object({stage:z.enum(stages),notes:z.string().max(20000),target_date:dateValue.nullable(),submitted_date:dateValue.nullable(),requested_amount:amount,awarded_amount:amount});
export async function editApplication(db:DB,userId:string,id:string,input:unknown){const v=applicationInput.parse(input);return transaction(db,async c=>{
 const a=await applicationAccess(c,userId,id,true);await c.query('SELECT id FROM applications WHERE id=$1 FOR UPDATE',[id]);
 const previous=(await c.query('SELECT stage FROM applications WHERE id=$1',[id])).rows[0].stage;
 await c.query('UPDATE applications SET stage=$2,notes=$3,target_date=$4,submitted_date=$5,requested_amount=$6,awarded_amount=$7,updated_at=now() WHERE id=$1 AND workspace_id=$8',[id,v.stage,v.notes,v.target_date,v.submitted_date,v.requested_amount,v.awarded_amount,a.workspace_id]);
 await c.query('INSERT INTO application_history(application_id,actor_id,event,previous_stage,stage) VALUES($1,$2,$3,$4,$5)',[id,userId,previous===v.stage?'Details updated':'Stage changed',previous,v.stage]);
 });}
export async function archiveApplication(db:DB,userId:string,id:string,archive:boolean){return transaction(db,async c=>{await applicationAccess(c,userId,id,true);await c.query('UPDATE applications SET archived_at=CASE WHEN $2 THEN now() ELSE NULL END,updated_at=now() WHERE id=$1',[id,archive]);await c.query('INSERT INTO application_history(application_id,actor_id,event) VALUES($1,$2,$3)',[id,userId,archive?'Archived':'Restored']);});}
export async function applicationTask(db:DB,userId:string,id:string,operation:string,taskId:string|null,input:unknown){const a=await applicationAccess(db,userId,id,true);
 if(operation==='add'){const t=taskInput.parse(input);await db.query('INSERT INTO grant_tasks(workspace_id,application_id,opportunity_id,title,notes,due_date,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[a.workspace_id,id,a.opportunity_id,t.title,t.notes,t.due_date,userId]);return;}
 z.string().uuid().parse(taskId);let change:string;let values:unknown[]=[taskId,id,a.workspace_id];
 if(operation==='edit'){const t=taskInput.parse(input);change='title=$4,notes=$5,due_date=$6';values.push(t.title,t.notes,t.due_date);}
 else if(operation==='complete')change='completed_at=now()';else if(operation==='reopen')change='completed_at=NULL';else if(operation==='delete')change='deleted_at=now()';else throw Error('Invalid task operation');
 if(!(await db.query(`UPDATE grant_tasks SET ${change},updated_at=now() WHERE id=$1 AND application_id=$2 AND workspace_id=$3 AND deleted_at IS NULL`,values)).rowCount)throw Error('Task not found');
}
export async function listApplications(db:DB,userId:string,params:{q?:string;stage?:string;archived?:string;active?:boolean}={}){const w=await workspaceAccess(db,userId);const q=(params.q??'').slice(0,200).replace(/[\\%_]/g,'\\$&');const stage=stages.includes(params.stage as typeof stages[number])?params.stage:'';
 return (await db.query(`SELECT a.*,a.target_date::text,a.submitted_date::text,o.deadline_at,
 (SELECT count(*)::int FROM grant_tasks t WHERE t.application_id=a.id AND t.deleted_at IS NULL) AS tasks,
 (SELECT count(*)::int FROM grant_tasks t WHERE t.application_id=a.id AND t.deleted_at IS NULL AND t.completed_at IS NOT NULL) AS completed
 FROM applications a LEFT JOIN opportunities o ON o.id=a.opportunity_id WHERE a.workspace_id=$1 AND (a.archived_at IS NOT NULL)=$2 AND ($3='' OR a.stage=$3) AND (a.title ILIKE $4 ESCAPE '\\' OR a.notes ILIKE $4 ESCAPE '\\') AND (NOT $5 OR a.stage IN ('saved','preparing','submitted')) ORDER BY coalesce(a.target_date,o.deadline_at AT TIME ZONE 'America/New_York') ASC NULLS LAST,a.created_at DESC`,[w.id,params.archived==='1',stage,`%${q}%`,params.active??false])).rows;
}
