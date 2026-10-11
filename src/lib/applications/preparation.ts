import {z} from 'zod';
import {applicationAccess} from './store';
import {projectDraftStarters,starterHistoryEvent} from './writing';
import {transaction,type DB} from '../checklists/store';
const text=z.string().trim();
const url=z.string().trim().max(2000).refine(v=>!v||/^https?:\/\//i.test(v)&&URL.canParse(v),'Use an http(s) source URL');
export const eligibilityInput=z.object({requirement:text.min(1).max(1000),status:z.enum(['unchecked','meets','does_not_meet','needs_confirmation']),source_url:url,notes:text.max(4000)});
export const questionInput=z.object({question:text.min(1).max(3000),answer:z.string().max(50000),word_limit:z.preprocess(v=>v===''||v==null?null:Number(v),z.number().int().min(1).max(50000).nullable()),source_url:url});
const money=z.coerce.number().finite().min(0).max(999999999).refine(v=>Math.abs(v*100-Math.round(v*100))<0.0001,'Use at most two decimals');
export const budgetInput=z.object({item:text.min(1).max(300),cost:money,requested:money,justification:text.max(4000)}).refine(v=>v.requested<=v.cost,'Requested funding cannot exceed cost');
export async function preparationData(db:DB,user:string,id:string){await applicationAccess(db,user,id);return (await db.query('SELECT * FROM application_preparation WHERE application_id=$1 ORDER BY created_at,id',[id])).rows;}
export async function prepareApplication(db:DB,user:string,id:string,operation:string,input:Record<string,unknown>){return transaction(db,async c=>{const a=await applicationAccess(c,user,id,true);let event='';let savedItem:string|undefined;
 if(operation==='draft_starters'){
 // Serialize starter creation with other starter clicks and project-link updates.
 const locked=(await c.query('SELECT project_id,archived_at FROM applications WHERE id=$1 AND workspace_id=$2 FOR UPDATE',[id,a.workspace_id])).rows[0];
 if(!locked||locked.archived_at||!locked.project_id)throw Error('Connect an active project first');
 const project=(await c.query('SELECT name,description,context FROM funding_projects WHERE id=$1 AND workspace_id=$2 AND archived_at IS NULL FOR SHARE',[locked.project_id,a.workspace_id])).rows[0];
 if(!project)throw Error('Project unavailable');
 if((await c.query('SELECT 1 FROM application_history WHERE application_id=$1 AND event=$2 LIMIT 1',[id,starterHistoryEvent])).rowCount)return;
 for(const draft of projectDraftStarters(project))await c.query("INSERT INTO application_preparation(application_id,kind,data) VALUES($1,'question',$2)",[id,JSON.stringify(draft)]);
 event=starterHistoryEvent;
 }
 else if(operation==='project'){const project=input.project_id||null;if(project){z.string().uuid().parse(project);if(!(await c.query('SELECT 1 FROM funding_projects WHERE id=$1 AND workspace_id=$2 AND archived_at IS NULL',[project,a.workspace_id])).rowCount)throw Error('Project unavailable');}await c.query('UPDATE applications SET project_id=$2,updated_at=now() WHERE id=$1',[id,project]);event=project?'Project linked':'Project unlinked';}
 else {const kind=z.enum(['eligibility','question','budget']).parse(input.kind);const item=input.item_id?z.string().uuid().parse(input.item_id):null;
 if(operation==='archive'||operation==='restore'){if(!item)throw Error('Item required');if(!(await c.query('UPDATE application_preparation SET archived_at=CASE WHEN $4 THEN now() ELSE NULL END,version=version+1,updated_at=now() WHERE id=$1 AND application_id=$2 AND kind=$3 AND version=$5',[item,id,kind,operation==='archive',z.coerce.number().int().positive().parse(input.version)])).rowCount)throw Error('Item changed; reload');event=kind+' '+operation;}
 else if(operation==='save'){const data=(kind==='eligibility'?eligibilityInput:kind==='question'?questionInput:budgetInput).parse(input);if(item){if(!(await c.query('UPDATE application_preparation SET data=$3,version=version+1,updated_at=now() WHERE id=$1 AND application_id=$2 AND kind=$4 AND version=$5 AND archived_at IS NULL',[item,id,JSON.stringify(data),kind,z.coerce.number().int().positive().parse(input.version)])).rowCount)throw Error('Item changed; reload');savedItem=item;}else savedItem=(await c.query('INSERT INTO application_preparation(application_id,kind,data) VALUES($1,$2,$3) RETURNING id',[id,kind,JSON.stringify(data)])).rows[0].id;event=kind+' '+(item?'updated':'added');}else throw Error('Unknown operation');}
 await c.query('INSERT INTO application_history(application_id,actor_id,event) VALUES($1,$2,$3)',[id,user,event]);return savedItem;});}
