'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireWorkspace } from '@/lib/auth/workspace';
import { pool } from '@/lib/db/pool';
import { canonicalUrl } from '@/lib/opportunities/research';
import { persistResearch, reserveResearch, researchWorkspace } from '@/lib/opportunities/research-store';
import { collectSources } from '@/lib/checklists/sources';

export async function runResearchAction(_previous:{error:string},form:FormData):Promise<{error:string}> {
 await requireWorkspace();
 return {error:'Premium web research — coming later. Direct source imports and daily catalog discovery remain available.'};
}

export async function readLeadAction(_previous:{error:string},form:FormData):Promise<{error:string}> {
 const {session}=await requireWorkspace();
 try {
  const w=await researchWorkspace(pool,session.user.id,true);
  const url=canonicalUrl(String(form.get('url')??''));
  // Source imports share the same reservation limits as web searches.
  const run=await reserveResearch(pool,session.user.id,`Read source: ${url.slice(0,180)}`);
  try {
   const {sources,warnings}=await collectSources(url);
   await persistResearch(pool,session.user.id,run.id,{queries:[url],warnings:[],leads:[{url,title:String(form.get('title')??'Source for review').slice(0,250),snippet:'Imported source — review the funder and requirements before applying.',sources,warnings}]});
  } catch {
   await pool.query("UPDATE discovery_runs SET status='failed',finished_at=now(),report=$3 WHERE id=$1 AND workspace_id=$2",[run.id,w.id,JSON.stringify({warnings:['Source could not be read. It may block automated access or require login.']})]);
   return {error:'Source could not be read. Use a public HTTPS funder page with readable requirements.'};
  }
 } catch {return {error:'Unable to import source. Check the URL, your workspace permissions, and daily search limit.'};}
 revalidatePath('/app/research'); redirect('/app/research');
}
