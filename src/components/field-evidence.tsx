import {pool} from '@/lib/db/pool';
export async function FieldEvidence({id}:{id:string}){
 const rows=(await pool.query('SELECT field,state,evidence,updated_at FROM catalog_field_state WHERE opportunity_id=$1 ORDER BY field',[id])).rows;
 if(!rows.length)return null;
 return <section className='mt-6 rounded-2xl border p-6'><h2 className='text-xl font-semibold'>Evidence by fact</h2><p className='mt-2'>Confirmation applies only to the facts listed below. Only the funder can confirm your eligibility.</p><ul className='mt-4 space-y-3'>{rows.map(r=><li key={r.field}><strong>{r.field}</strong> · {r.state==='found'?'Official-source confirmed':'Unverified'} · Evidence fetched {(r.evidence??[]).length?new Date(Math.max(...r.evidence.map((f:any)=>new Date(f.fetchedAt).getTime()).filter(Number.isFinite))).toLocaleDateString('en-US',{timeZone:'America/New_York'}):'Not yet available'}{[...new Set<string>((r.evidence??[]).map((f:any)=>f.sourceUrl).filter((u:unknown)=>typeof u==='string'&&u.startsWith('https://')))].map(url=><a key={url} href={url} target='_blank' rel='noopener noreferrer' className='ml-3 underline'>Official evidence ↗</a>)}</li>)}</ul></section>;
}
