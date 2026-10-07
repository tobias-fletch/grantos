'use server';
import { revalidatePath } from 'next/cache';
import { requireWorkspace } from '@/lib/auth/workspace';
import { pool } from '@/lib/db/pool';
import { enqueueManual,requireEditor,registerLinks } from '@/lib/discovery/store';
import { canonicalUrl } from '@/lib/opportunities/research';
import { categories } from '@/lib/opportunities/store';
import { z } from 'zod';
import {maintenanceCommand} from '@/lib/discovery/admin';
import {fundingFocusOptions} from '@/lib/opportunities/funding-focus';
const sourceSchema=z.object({id:z.union([z.string().uuid(),z.literal('')]),name:z.string().trim().min(2).max(250),url:z.string().max(2000),geography:z.string().trim().min(2).max(250),domains:z.string().max(3000)});
export async function discoveryAction(_previous:{message:string},form:FormData):Promise<{message:string}>{
 const {session}=await requireWorkspace();
 try{
  await requireEditor(pool,session.user.id);
  const command=String(form.get('command'));
  if(['pause','resume','hourly','daily','refresh-grant','restore-grant','refresh-source'].includes(command)){
   const id=['pause','resume','hourly','daily'].includes(command)?'':z.string().uuid().parse(form.get('id'));
   const client=await pool.connect();try{await client.query('BEGIN');await maintenanceCommand(client,session.user.id,command,id);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
   revalidatePath('/app','layout');return {message:command==='pause'?'Automation paused.':command==='resume'?'Automation resumed.':'Saved; refresh queued for the cloud worker.'};
  }
  if(command==='run'){
   const id=await enqueueManual(pool,session.user.id);revalidatePath('/app/discovery-admin');return {message:id?'Refresh queued for the cloud discovery worker.':'A refresh is already queued or running.'};
  }
  if(command==='source'){
   const s=sourceSchema.parse(Object.fromEntries(form)),url=canonicalUrl(s.url);
   const domains=[...new Set(s.domains.split(/[\s,]+/).filter(Boolean).map(d=>{const u=new URL('https://'+d);if(u.hostname!==d||u.port||u.pathname!=='/')throw Error();return new URL(canonicalUrl(u.href)).hostname;}))];
   if(!domains.includes(new URL(url).hostname))return {message:'Approve the source URL’s exact hostname before enabling it.'};
   const selected=form.getAll('categories').map(String);if(!selected.length||selected.some(c=>!categories.includes(c)))return {message:'Select valid funding categories.'};
   const focuses=form.getAll('funding_focus').map(String);if(focuses.some(f=>!fundingFocusOptions.some(o=>o.value===f)))throw Error('Invalid focus');
   const hours=z.coerce.number().int().min(6).max(168).parse(form.get('interval_hours')??24);
   if(s.id)await pool.query('UPDATE crawl_sources SET name=$2,url=$3,approved_domains=$4,categories=$5,geography=$6,enabled=$7 WHERE id=$1',[s.id,s.name,url,domains,selected,s.geography,form.get('enabled')==='yes']);
   else await pool.query('INSERT INTO crawl_sources(name,url,approved_domains,categories,geography,enabled) VALUES($1,$2,$3,$4,$5,$6)',[s.name,url,domains,selected,s.geography,form.get('enabled')==='yes']);
   await pool.query('UPDATE crawl_sources SET funding_focus=$2,interval_hours=$3 WHERE url=$1',[url,focuses,hours]);
  }else if(command==='dismiss'||command==='domain'){
   const id=z.string().uuid().parse(form.get('id'));const client=await pool.connect();
   try{
    await client.query('BEGIN');
    const candidate=(await client.query("SELECT * FROM crawl_candidates WHERE id=$1 AND status='pending' FOR UPDATE",[id])).rows[0];if(!candidate)throw Error();
    if(command==='domain'){
     if(candidate.kind!=='domain')throw Error();
     const domain=new URL(canonicalUrl(candidate.url)).hostname;
     const source=(await client.query('UPDATE crawl_sources SET approved_domains=ARRAY(SELECT DISTINCT unnest(approved_domains || ARRAY[$2])) WHERE id=$1 RETURNING *',[candidate.source_id,domain])).rows[0];
     await registerLinks(client,source,[candidate.proposed.example_url],0);
    }
    await client.query('UPDATE crawl_candidates SET status=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$1',[id,command==='domain'?'approved':'dismissed',session.user.id]);
    await client.query('COMMIT');
   }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }else return {message:'Unknown action.'};
  await pool.query('INSERT INTO catalog_admin_events(actor_id,action,subject) VALUES($1,$2,$3)',[session.user.id,command,String(form.get('id')??form.get('url')??'').slice(0,2000)]);
  revalidatePath('/app','layout');return {message:'Saved.'};
 }catch{return {message:'Could not save. Check editor access, valid source details, and whether this item has already been reviewed.'};}
}
