import {auth} from '@/auth';
import {pool} from '@/lib/db/pool';
import {liveSearchEnabled,normalizeLive} from '@/lib/search/providers';
import {sharedRequest} from '@/lib/search/sessions';
import {externalAccess} from '@/lib/search/results';
import {lookupExamples} from '@/lib/search/examples';
import {rateLimit} from '@/lib/beta/security';
import {z} from 'zod';
export const maxDuration=15;
export async function GET(req:Request){
 if(!liveSearchEnabled())return Response.json({error:'Unavailable'},{status:404});
 const s=await auth();if(!s?.user?.id)return Response.json({error:'Sign in required'},{status:401});
 if((await pool.query('SELECT paused FROM catalog_automation WHERE id=1')).rows[0]?.paused)return Response.json({error:'Source lookups are paused.'},{status:503});
 try{const p=new URL(req.url).searchParams,id=z.string().uuid().parse(p.get('id'));let g;const signal=AbortSignal.timeout(10000);
 if(!await rateLimit(pool,'example-lookup:'+s.user.id,30,3600))return Response.json({error:'Example lookup limit reached.'},{status:429});
 if(p.get('kind')==='external')g=(await externalAccess(pool,s.user.id,id)).data;
 else {const row=(await pool.query("SELECT source_url FROM opportunities WHERE id=$1 AND publication_state='published' AND merged_into IS NULL",[id])).rows[0];if(!row)throw Error('Unavailable');g=(await pool.query('SELECT data FROM grant_external_results WHERE source_url=$1',[row.source_url])).rows[0]?.data;
 if(!g){const identity=(await pool.query("SELECT external_id FROM catalog_provider_records WHERE opportunity_id=$1 AND provider='grants-gov'",[id])).rows[0];
 if(identity&&/^\d+$/.test(identity.external_id)){const r=await sharedRequest(pool,'grants-gov','https://api.grants.gov/v1/api/fetchOpportunity',{opportunityId:Number(identity.external_id)},new Date(Date.now()-7*86400000),signal);if(r?.data)g=normalizeLive('grants-gov',r.data);}}
 }
 return Response.json(await lookupExamples(pool,g??{},undefined,signal),{headers:{'Cache-Control':'private, no-store'}});
 }catch{return Response.json({error:'Example sources unavailable. Try again later.'},{status:503});}
}
