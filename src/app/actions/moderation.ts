'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireWorkspace } from '@/lib/auth/workspace';
import { pool } from '@/lib/db/pool';
import { moderateGrant } from '@/lib/opportunities/moderation';
export async function moderateAction(_prev:{message:string},form:FormData){
 const {session}=await requireWorkspace();
 const input=z.object({id:z.string().uuid(),action:z.enum(['hide','merge']),targetId:z.union([z.string().uuid(),z.literal('')])}).safeParse(Object.fromEntries(form));
 if(!input.success)return {message:'Choose a grant and valid action.'};
 const db=await pool.connect();
 try{await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(7823091)');await moderateGrant(db,session.user.id,input.data.id,input.data.action,input.data.targetId||undefined);await db.query('COMMIT');}
 catch{await db.query('ROLLBACK');return {message:'Unable to change this listing. Check editor access, the target grant, and any active checklist jobs.'};}
 finally{db.release();}
 revalidatePath('/app','layout');return {message:'Catalog updated. Merged saves and tasks remain with the retained grant.'};
}
