import dotenv from 'dotenv';
import pg from 'pg';
dotenv.config({path:'.env.local',quiet:true});dotenv.config({quiet:true});
const [workspaceId,plan]=process.argv.slice(2);
if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId??'') || !['free','paid'].includes(plan)){console.error('Usage: npm run set-plan -- <workspace UUID> free|paid');process.exit(1);}
const db=new pg.Client({connectionString:process.env.DATABASE_URL});
try{await db.connect();await db.query('BEGIN');const r=await db.query('UPDATE workspaces SET plan=$2,updated_at=now() WHERE id=$1 RETURNING id',[workspaceId,plan]);if(!r.rowCount)throw new Error('Workspace not found.');await db.query("INSERT INTO audit_logs(workspace_id,action,entity_type,entity_id,metadata) VALUES($1::uuid,'workspace.plan_changed','workspace',($1::uuid)::text,$2)",[workspaceId,JSON.stringify({plan,via:'server-admin-command'})]);await db.query('COMMIT');console.log(`Workspace ${workspaceId} plan set to ${plan}.`);}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(e instanceof Error?e.message:'Plan update failed.');process.exitCode=1;}finally{await db.end();}
