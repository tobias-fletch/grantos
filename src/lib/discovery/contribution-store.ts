import {requireEditor,type DB} from './store';
import {currentWorkspace} from '../opportunities/store';
import {contributionInput} from './contribution-input';
import {rateLimit} from '../beta/security';
export async function contributionAccess(db:DB,userId:string,write=false){
 const workspace=await currentWorkspace(db,userId);
 const active=(await db.query('SELECT beta_active FROM users WHERE id=$1',[userId])).rows[0];
 if(!workspace||active?.beta_active===false||(write&&!['owner','admin','member'].includes(workspace.role)))throw Error('Contribution access denied');
}
export async function ownContributions(db:DB,userId:string){
 await contributionAccess(db,userId);
 return (await db.query(`SELECT c.id,c.source_url,c.field,c.state,c.outcome,s.proposed_value,s.note,s.created_at FROM catalog_contribution_submissions s JOIN catalog_contributions c ON c.id=s.contribution_id WHERE s.user_id=$1 ORDER BY s.created_at DESC LIMIT 50`,[userId])).rows;
}
// Caller owns the transaction. The quota must be checked separately so rollback
// cannot undo the shared account limit on an invalid request.
export async function contributionQuota(db:DB,userId:string){await contributionAccess(db,userId,true);return rateLimit(db,'contribution:'+userId,10,3600);}
export async function insertContribution(db:DB,userId:string,raw:unknown){
 await contributionAccess(db,userId,true);const input=contributionInput(raw);
 if(input.opportunityId&&!(await db.query("SELECT 1 FROM opportunities WHERE id=$1 AND publication_state='published' AND merged_into IS NULL",[input.opportunityId])).rowCount)throw Error('Unavailable grant');
 const row=(await db.query(`INSERT INTO catalog_contributions(source_url,opportunity_id,field) VALUES($1,$2,$3)
 ON CONFLICT(source_url,opportunity_id,field) DO UPDATE SET source_url=excluded.source_url RETURNING id`,[input.url,input.opportunityId||null,input.field])).rows[0];
 await db.query('INSERT INTO catalog_contribution_submissions(contribution_id,user_id,proposed_value,note) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[row.id,userId,input.proposed,input.note]);
 return row.id;
}
export async function closeContribution(db:DB,userId:string,id:string){
 await requireEditor(db,userId);
 const result=await db.query("UPDATE catalog_contributions SET state='unconfirmed',outcome='Reviewed: insufficient official evidence to apply this suggestion.',checked_at=now() WHERE id=$1 AND state IN ('checking','decision') RETURNING id",[id]);
 if(result.rowCount)await db.query("INSERT INTO catalog_admin_events(actor_id,action,subject) VALUES($1,'contribution-unconfirmed',$2)",[userId,id]);
}
