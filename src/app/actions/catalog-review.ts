'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireWorkspace } from '@/lib/auth/workspace';
import { pool } from '@/lib/db/pool';
import { reviewSchema, parseLocations } from '@/lib/opportunities/editorial';
import { canonicalUrl } from '@/lib/opportunities/research';
import { retrieve } from '@/lib/checklists/sources';
import { writeReviewedGrant } from '@/lib/opportunities/editorial-store';

export async function publishReviewAction(_previous:{error:string},form:FormData):Promise<{error:string}> {
 const {session}=await requireWorkspace();
 if(!session.user.catalogEditor)return {error:'Catalog editor access is required.'};
 const input=reviewSchema.safeParse({...Object.fromEntries(form),categories:form.getAll('categories'),applicants:form.getAll('applicants'),archive:form.get('archive')==='yes',rolling:form.get('rolling')==='yes'});
 if(!input.success)return {error:input.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join(' ')};
 const data=input.data;
 let url:string,locations:ReturnType<typeof parseLocations>;
 try {
  url=canonicalUrl(data.url); locations=parseLocations(data.locations);
  const {source}=await retrieve(url,new URL(url).origin);
  const normalize=(s:string)=>s.replace(/\s+/g,' ').trim();
  if(!normalize(source.text).includes(normalize(data.evidence)))return {error:'The evidence quote was not found on the source page. Reread the source and use an exact excerpt.'};
 }catch{return {error:'Could not read the public source or location entries. Nothing was published.'};}
 const client=await pool.connect();
 try {
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(7823091)");
  const candidate=String(form.get('candidateId')??'');
  if(candidate)z.string().uuid().parse(candidate);
  await writeReviewedGrant(client,session.user.id,data,undefined,candidate||undefined);
  await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK');return {error:e instanceof Error && /already in|not found/.test(e.message)?e.message:'Review could not be saved. No catalog changes were applied.'};}
 finally{client.release();}
 revalidatePath('/app','layout');redirect('/app/catalog-review?updated=1');
}
