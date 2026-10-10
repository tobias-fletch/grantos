'use server';
import {requireWorkspace} from '@/lib/auth/workspace';
import {pool} from '@/lib/db/pool';
import {saveProject,archiveProject} from '@/lib/projects/store';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
export async function projectAction(form:FormData){const {session}=await requireWorkspace();let failed=false;try{const id=String(form.get('id')||'');const op=form.get('operation');if(op==='archive'||op==='restore')await archiveProject(pool,session.user!.id!,id,op==='archive');else await saveProject(pool,session.user!.id!,id||null,{...Object.fromEntries(form),categories:form.getAll('categories'),target_date:form.get('target_date')||null});}catch{failed=true;}revalidatePath('/app/projects');redirect('/app/projects?'+(failed?'error=1':'saved=1'));}
