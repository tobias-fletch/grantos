import {z} from 'zod';
import {projectContextSchema} from './context';
import {workspaceAccess} from '../applications/store';
import {dateValue,type DB} from '../checklists/store';
import {applicantTypes,categories} from '../opportunities/store';
const text=z.string().trim().max(120);
export const projectInput=z.object({name:text.min(2),description:z.string().trim().max(6000),applicant_type:z.string().refine(v=>applicantTypes.includes(v)),country:text.min(2),state:text,city:text,postal_code:z.string().trim().max(20),categories:z.array(z.string().refine(v=>categories.includes(v))).max(14),amount:z.preprocess(v=>v===''||v==null?null:Number(v),z.number().finite().min(0).max(999999999999).nullable()),target_date:dateValue.nullable(),context:projectContextSchema.optional()});
export async function listProjects(db:DB,user:string){const w=await workspaceAccess(db,user);return (await db.query('SELECT *,target_date::text FROM funding_projects WHERE workspace_id=$1 ORDER BY created_at DESC',[w.id])).rows;}
export async function saveProject(db:DB,user:string,id:string|null,input:unknown){const w=await workspaceAccess(db,user,true),v=projectInput.parse(input);const values=[v.name,v.description,v.applicant_type,v.country,v.state,v.city,v.postal_code,[...new Set(v.categories)],v.amount,v.target_date,w.id];
 if(id){z.string().uuid().parse(id);const r=await db.query('UPDATE funding_projects SET name=$1,description=$2,applicant_type=$3,country=$4,state=$5,city=$6,postal_code=$7,categories=$8,amount=$9,target_date=$10,context=COALESCE($13::jsonb,context),updated_at=now() WHERE workspace_id=$11 AND id=$12 RETURNING id',[...values,id,v.context===undefined?null:JSON.stringify(v.context)]);if(!r.rowCount)throw Error('Project not found');return id;}
 return (await db.query('INSERT INTO funding_projects(name,description,applicant_type,country,state,city,postal_code,categories,amount,target_date,workspace_id,context) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb) RETURNING id',[...values,JSON.stringify(v.context??{})])).rows[0].id;
}
export async function archiveProject(db:DB,user:string,id:string,archive:boolean){const w=await workspaceAccess(db,user,true);z.string().uuid().parse(id);if(!(await db.query('UPDATE funding_projects SET archived_at=CASE WHEN $3 THEN now() ELSE NULL END,updated_at=now() WHERE id=$1 AND workspace_id=$2',[id,w.id,archive])).rowCount)throw Error('Project not found');}
