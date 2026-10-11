'use server';
import { auth } from '@/auth';
import { pool } from '@/lib/db/pool';
import { startApplication, startSavedApplication } from '@/lib/applications/start';
import { ProjectSaveConflict } from '@/lib/applications/save-result';
import { liveSearchEnabled } from '@/lib/search/providers';
import { revalidatePath } from 'next/cache';
export async function startApplicationAction(kind:'catalog'|'lead'|'external',id:string,projectId?:string|null):Promise<{id?:string;error?:string}>{
  const session=await auth();
  if(!session?.user?.id)return {error:'Please log in again.'};
  try{
    if(kind==='external'&&!liveSearchEnabled())throw Error('Unavailable');
    const applicationId=await startApplication(pool,session.user.id,kind,id,projectId);
    revalidatePath('/app','layout');return {id:applicationId};
  }catch(error){return {error:error instanceof ProjectSaveConflict?error.message:'Could not start preparation. Check your workspace and project access, then try again.'};}
}

export async function startSavedApplicationAction(id:string,projectId?:string|null):Promise<{id?:string;error?:string}>{
  const session=await auth();if(!session?.user?.id)return {error:'Please log in again.'};
  try{const applicationId=await startSavedApplication(pool,session.user.id,id,projectId);revalidatePath('/app','layout');return {id:applicationId};}
  catch(error){return {error:error instanceof ProjectSaveConflict?error.message:'Could not start preparation. Check your workspace and project access, then try again.'};}
}
