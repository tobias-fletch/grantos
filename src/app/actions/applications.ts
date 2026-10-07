'use server';
import {auth} from '@/auth';
import {pool} from '@/lib/db/pool';
import {saveCandidate,editApplication,archiveApplication,applicationTask} from '@/lib/applications/store';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
export async function saveCandidateAction(form:FormData){const s=await auth();if(!s?.user?.id)redirect('/login');let id:string;
 try{id=await saveCandidate(pool,s.user.id,z.string().uuid().parse(form.get('candidateId')));}catch{redirect('/app/opportunities?error=save');}
 revalidatePath('/app','layout');redirect(`/app/applications/${id}`);
}
export async function applicationAction(form:FormData){const s=await auth();if(!s?.user?.id)redirect('/login');const parsed=z.string().uuid().safeParse(form.get('id'));if(!parsed.success)redirect('/app/applications?error=invalid');const id=parsed.data;let failed=false;
 try{const op=String(form.get('operation'));if(op==='update')await editApplication(pool,s.user.id,id,{stage:form.get('stage'),notes:String(form.get('notes')??''),target_date:form.get('target_date')||null,submitted_date:form.get('submitted_date')||null,requested_amount:form.get('requested_amount'),awarded_amount:form.get('awarded_amount')});
 else if(op==='archive'||op==='restore')await archiveApplication(pool,s.user.id,id,op==='archive');
 else await applicationTask(pool,s.user.id,id,op,form.get('taskId') as string|null,{title:String(form.get('title')??''),notes:String(form.get('notes')??''),due_date:form.get('due_date')||null});
 }catch{failed=true;}
 revalidatePath('/app','layout');redirect(`/app/applications/${id}?${failed?'error=update':'updated=1'}`);
}
