import {pool} from '@/lib/db/pool';
import type {Fact} from '@/lib/discovery/program-evidence';
export async function RoundEvidence({id}:{id:string}){
 // Merged records retain their evidence and private histories. Follow the merge
 // chain for display, without rewriting or deleting historical evidence.
 const rows=(await pool.query(`WITH RECURSIVE ids AS (
 SELECT id FROM opportunities WHERE id=$1 UNION SELECT o.id FROM opportunities o JOIN ids ON o.merged_into=ids.id
 ) SELECT r.* FROM program_round_evidence r JOIN ids ON ids.id=r.opportunity_id ORDER BY fetched_at DESC,source_url LIMIT 20`,[id])).rows;
 const seen=new Set<string>();
 const entries=rows.flatMap(r=>(r.facts as Fact[]).filter(f=>['deadline','opens'].includes(f.field)&&!f.conflict).flatMap(f=>{
  const key=f.field+f.value+r.source_url;if(seen.has(key))return [];seen.add(key);return [{...f,url:r.source_url,checked:r.fetched_at}];
 }));
 if(!entries.length)return null;
 return <details className="mt-6 rounded-2xl border p-6"><summary className="cursor-pointer font-semibold">Application date history and supporting pages</summary><p className="mt-3">Dates recorded from official evidence. Historical dates do not establish current availability or predict the next round.</p><ul className="mt-4 space-y-3">{entries.map((f,i)=><li key={i}>{f.field==='opens'?'Opening':'Deadline'}: {f.value} · <a href={f.url} target="_blank" rel="noopener noreferrer" className="underline">Source</a> · Checked {new Date(f.checked).toLocaleDateString('en-US',{timeZone:'UTC'})}<p className="text-sm">{f.excerpt}</p></li>)}</ul></details>;
}
