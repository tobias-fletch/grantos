'use server';
import {requireWorkspace} from '@/lib/auth/workspace';
import {pool} from '@/lib/db/pool';
import {contributionQuota,insertContribution} from '@/lib/discovery/contribution-store';
import {contributionInput} from '@/lib/discovery/contribution-input';
import {redirect} from 'next/navigation';
export async function submitContribution(form:FormData){
 const {session,workspace}=await requireWorkspace();
 if(!['owner','admin','member'].includes(workspace.role))redirect('/app/contributions?error=readonly');
 if(!await contributionQuota(pool,session.user.id))redirect('/app/contributions?error=limit');
 let input;try{input=contributionInput({url:form.get('url'),opportunityId:form.get('opportunityId')??'',field:form.get('field'),proposed:form.get('proposed')??'',note:form.get('note')??''});}catch{redirect('/app/contributions?error=input');}
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  await insertContribution(db,session.user.id,input);
  await db.query('COMMIT');
 }catch{await db.query('ROLLBACK');redirect('/app/contributions?error=unavailable');}finally{db.release();}
 redirect('/app/contributions?submitted=1');
}
