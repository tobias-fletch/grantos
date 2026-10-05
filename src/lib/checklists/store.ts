import type { Pool, PoolClient, Client } from "pg";
import { z } from "zod";
import { currentWorkspace } from "../opportunities/store";
export type DB = Pool | PoolClient | Client;
export const dateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v);
export const taskInput = z.object({title:z.string().trim().min(1).max(200),notes:z.string().trim().max(2000).default(""),due_date:dateValue.nullable().default(null)});
export const draftTask = taskInput.extend({source_url:z.string().url(),source_excerpt:z.string().min(10).max(1000),uncertainty:z.string().max(1000),date_excerpt:z.string().max(1000)});
export type DraftTask = z.infer<typeof draftTask>;
export type Task = {id:string;opportunity_id:string;title:string;notes:string;due_date:string|null;completed_at:Date|null;source_url:string|null;source_excerpt:string|null;uncertainty:string|null;grant_name?:string;slug?:string};
export type Job = {id:string;status:string;draft:DraftTask[]|null;sources:{url:string}[];warnings:string[];error:string|null;created_at:Date};
export async function transaction<T>(db:DB,fn:(c:PoolClient|Client)=>Promise<T>):Promise<T> {
 const own="totalCount" in db; const c=own ? await (db as Pool).connect() : db as PoolClient|Client;
 try {await c.query(own?"BEGIN":"SAVEPOINT checklist_operation");const result=await fn(c);await c.query(own?"COMMIT":"RELEASE SAVEPOINT checklist_operation");return result;}
 catch(e){await c.query(own?"ROLLBACK":"ROLLBACK TO SAVEPOINT checklist_operation");throw e;}
 finally {if(own)(c as PoolClient).release();}
}
export async function access(db:DB,userId:string,opportunityId?:string,write=false) {
 const w=await currentWorkspace(db,userId);if(!w || (write && !["owner","admin","member"].includes(w.role)))throw new Error("Your workspace permissions do not allow this action.");
 if(opportunityId && !(await db.query("SELECT 1 FROM saved_opportunities WHERE workspace_id=$1 AND opportunity_id=$2",[w.id,opportunityId])).rowCount)throw new Error("Save this grant before managing its checklist.");
 return w;
}
export async function checklistData(db:DB,userId:string,opportunityId:string) {
 const workspace=await access(db,userId,opportunityId);
 const tasks=await db.query<Task>("SELECT t.*,t.due_date::text FROM grant_tasks t WHERE workspace_id=$1 AND opportunity_id=$2 AND deleted_at IS NULL ORDER BY t.completed_at NULLS FIRST,t.due_date NULLS LAST,t.created_at",[workspace.id,opportunityId]);
 const jobs=await db.query<Job>("SELECT * FROM checklist_jobs WHERE workspace_id=$1 AND opportunity_id=$2 AND status <> 'confirmed' ORDER BY created_at DESC LIMIT 5",[workspace.id,opportunityId]);
 return {workspace,tasks:tasks.rows,jobs:jobs.rows};
}
export async function addTask(db:DB,userId:string,opportunityId:string,input:unknown) {
 const w=await access(db,userId,opportunityId,true),t=taskInput.parse(input);
 return (await db.query("INSERT INTO grant_tasks(workspace_id,opportunity_id,title,notes,due_date,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",[w.id,opportunityId,t.title,t.notes,t.due_date,userId])).rows[0].id as string;
}
export async function mutateTask(db:DB,userId:string,opportunityId:string,taskId:string,operation:"edit"|"complete"|"reopen"|"delete",input?:unknown) {
 const w=await access(db,userId,opportunityId,true);
 let result;
 if(operation==="edit"){const t=taskInput.parse(input);result=await db.query("UPDATE grant_tasks SET title=$4,notes=$5,due_date=$6,updated_at=now() WHERE id=$1 AND workspace_id=$2 AND opportunity_id=$3 AND deleted_at IS NULL",[taskId,w.id,opportunityId,t.title,t.notes,t.due_date]);}
 else {const change=operation==="complete"?"completed_at=now()":operation==="reopen"?"completed_at=NULL":"deleted_at=now()";result=await db.query(`UPDATE grant_tasks SET ${change},updated_at=now() WHERE id=$1 AND workspace_id=$2 AND opportunity_id=$3 AND deleted_at IS NULL`,[taskId,w.id,opportunityId]);}
 if(!result.rowCount)throw new Error("Task not found in your saved grant.");
}
export async function queueChecklist(db:DB,userId:string,opportunityId:string,configured:boolean) {
 return transaction(db,async c=>{
 const w=await access(c,userId,opportunityId,true);
 await c.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE",[w.id]);
 const plan=(await c.query("SELECT plan FROM workspaces WHERE id=$1",[w.id])).rows[0].plan;
 if(plan!=="paid")throw new Error("AI checklist generation is available on the paid plan. You can add tasks manually for free.");
 if(!configured)throw new Error("AI generation is not configured yet. Add tasks manually or contact the administrator.");
 const active=await c.query("SELECT id FROM checklist_jobs WHERE workspace_id=$1 AND opportunity_id=$2 AND status IN ('queued','running')",[w.id,opportunityId]);
 if(active.rowCount)return active.rows[0].id as string;
 const count=await c.query("SELECT count(*)::int AS total FROM checklist_jobs WHERE workspace_id=$1 AND created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'",[w.id]);
 if(count.rows[0].total>=10)throw new Error("Your workspace has reached today's limit of 10 generation requests. Try again tomorrow.");
 return (await c.query("INSERT INTO checklist_jobs(workspace_id,opportunity_id,requested_by) VALUES($1,$2,$3) RETURNING id",[w.id,opportunityId,userId])).rows[0].id as string;
 });
}
export async function confirmChecklist(db:DB,userId:string,opportunityId:string,jobId:string,edited:unknown) {
 return transaction(db,async c=>{
 const w=await access(c,userId,opportunityId,true);
 const job=(await c.query("SELECT * FROM checklist_jobs WHERE id=$1 AND workspace_id=$2 AND opportunity_id=$3 FOR UPDATE",[jobId,w.id,opportunityId])).rows[0];
 if(!job)throw new Error("Draft not found.");if(job.status==="confirmed")return;
 if(job.status!=="draft")throw new Error("This checklist is not ready to confirm.");
 const selections=z.array(taskInput.extend({index:z.number().int().min(0).max(39)})).min(1).max(40).parse(edited);
 if(new Set(selections.map(t=>t.index)).size!==selections.length)throw new Error("Duplicate draft task.");
 for(const t of selections){const original=job.draft[t.index] as DraftTask|undefined;if(!original)throw new Error("Draft changed; reload before confirming.");
 await c.query("INSERT INTO grant_tasks(workspace_id,opportunity_id,title,notes,due_date,source_url,source_excerpt,uncertainty,generation_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",[w.id,opportunityId,t.title,t.notes,t.due_date,original.source_url,original.source_excerpt,original.uncertainty,jobId,userId]);}
 await c.query("UPDATE checklist_jobs SET status='confirmed',confirmed_at=now(),confirmed_by=$2 WHERE id=$1",[jobId,userId]);
 });
}
export async function dashboardTasks(db:DB,userId:string) {
 const w=await access(db,userId);
 return (await db.query<Task>(`SELECT t.*,t.due_date::text,o.name AS grant_name,o.slug FROM grant_tasks t JOIN saved_opportunities s ON s.workspace_id=t.workspace_id AND s.opportunity_id=t.opportunity_id JOIN opportunities o ON o.id=t.opportunity_id WHERE t.workspace_id=$1 AND t.deleted_at IS NULL AND t.completed_at IS NULL ORDER BY t.due_date NULLS LAST,t.created_at`,[w.id])).rows;
}
