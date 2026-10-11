import {auth} from '@/auth';
import {pool} from '@/lib/db/pool';
import {liveSearchEnabled,SourceError} from '@/lib/search/providers';
import {startSession,sessionStatus,searchBatch} from '@/lib/search/sessions';
export const dynamic='force-dynamic';
export const maxDuration=15;
export async function GET(req:Request){if(!liveSearchEnabled())return Response.json({error:'Unavailable'},{status:404});const s=await auth();if(!s?.user?.id)return Response.json({error:'Sign in required'},{status:401});try{return Response.json(await sessionStatus(pool,s.user.id,new URL(req.url).searchParams.get('id')??''),{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Search expired or unavailable'},{status:404});}}
export async function POST(req:Request){
 if(!liveSearchEnabled())return Response.json({error:'Unavailable'},{status:404});
 const origin=req.headers.get('origin');if(!origin||origin!==new URL(process.env.APP_URL??req.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 const s=await auth();if(!s?.user?.id)return Response.json({error:'Sign in required'},{status:401});
 try{const reader=req.body?.getReader();if(!reader)return Response.json({error:'Invalid request'},{status:400});let size=0;const chunks:Uint8Array[]=[];
 while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>12000){await reader.cancel();return Response.json({error:'Request too large'},{status:413});}chunks.push(r.value);}
 const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if(body.action==='start'){const p=new URLSearchParams(String(body.query??'').slice(0,6000)),params:Record<string,string|string[]>={};for(const k of new Set(p.keys()))params[k]=p.getAll(k).length>1?p.getAll(k):p.get(k)!;const id=await startSession(pool,s.user.id,body.requestId,params);return Response.json(await sessionStatus(pool,s.user.id,id));}
 if(body.action==='batch')return Response.json(await searchBatch(pool,s.user.id,body.id));return Response.json({error:'Invalid action'},{status:400});
 }catch(e){return Response.json({error:e instanceof SourceError&&e.limited?'Search limit reached; try again later.':'Search temporarily unavailable.'},{status:e instanceof SourceError&&e.limited?429:503});}
}
