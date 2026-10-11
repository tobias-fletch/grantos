import {transaction,type DB} from '../checklists/store';
import {workspaceAccess} from '../applications/store';
import {matchProfile,type GrantResult,type FundingProfile} from '../opportunities/ranking';
import {matchGeography} from '../opportunities/geography';
import type {Filters} from '../opportunities/store';
import {matchesFundingFocus} from '../opportunities/funding-focus';
import {canonicalUrl} from '../opportunities/research';
import {z} from 'zod';
export function externalCard(row:any,f:Filters,profile:FundingProfile):GrantResult|null{
 const g=row.data;const fact=(key:string)=>g.facts.find((x:any)=>x.field===key)?.value;
 const cats=JSON.parse(fact('categories')??'[]'),applicants=JSON.parse(fact('applicants')??'[]'),geo=JSON.parse(fact('geography')??'[]');
 const legalApplicant=['student','researcher','consultant'].includes(f.applicant)?'individual':f.applicant;
 const codes=g.legalApplicantCodes as string[]|null;
 if(legalApplicant==='individual'&&codes?.length&&!codes.some(c=>['21','25','99'].includes(c)))return null;
 const gm=matchGeography(geo,f),status=fact('status')??'unknown',maximum=fact('maximum')==null?null:Number(fact('maximum'));
 if(gm.state==='excluded'||(f.applicant&&applicants.length&&!applicants.includes(legalApplicant)))return null;
 if(f.status&&status!==f.status&&!(f.status==='round_ended'&&status==='closed'))return null;
 if(f.minAward&&(maximum==null||maximum<f.minAward))return null;
 if(f.categories.length&&!f.categories.some(c=>cats.includes(c)))return null;
 if(f.q&&!f.q.toLowerCase().split(/\s+/).every(t=>(g.title+' '+g.body+' '+g.funder).toLowerCase().includes(t)))return null;
 if(f.focus.length&&!matchesFundingFocus(g.title+' '+g.body,f.focus))return null;
 const deadline=fact('deadline'),rolling=fact('rolling')==='true';
 const r:GrantResult={id:row.id,kind:'external',recordType:'program',title:g.title,source:g.funder||g.provider,url:g.url,slug:`external/${row.id}`,summary:g.summary,eligibility:fact('eligibility')??'Needs checking',amount:maximum==null?'Unknown':(Number(fact('minimum'))===maximum?'':'Up to ')+new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(maximum),maximum,deadline:deadline&&deadline>=new Date().toISOString().slice(0,10)?deadline:null,previousDeadline:deadline&&deadline<new Date().toISOString().slice(0,10)?deadline:null,status:status==='closed'?'round_ended':status,rolling,categories:cats,applicants,locations:geo.map((x:any)=>[x.city,x.state,x.country].filter(Boolean).join(', ')),verified:false,fetched:new Date(row.fetched_at).toISOString(),reasons:[],conflicts:0,matches:0,relevance:0,applicationId:row.application_id??null,awaitingReview:false,geographyMatch:gm};
 return matchProfile(r,{...profile,applicant_type:legalApplicant||profile.applicant_type},geo,f.q);
}
export async function externalResults(db:DB,userId:string,requestId:unknown,f:Filters,profile:FundingProfile){
 if(typeof requestId!=='string'||!z.string().uuid().safeParse(requestId).success)return [];
 const w=await workspaceAccess(db,userId);
 const rows=(await db.query(`SELECT e.*,(SELECT a.id FROM applications a WHERE a.workspace_id=$1 AND rtrim(a.source_url,'/')=rtrim(e.source_url,'/') ORDER BY a.created_at LIMIT 1) application_id
 FROM grant_external_results e JOIN grant_search_results r ON r.result_id=e.id JOIN grant_search_sessions s ON s.id=r.session_id
 WHERE s.workspace_id=$1 AND s.request_id=$2 AND s.expires_at>now()
 AND NOT EXISTS(SELECT 1 FROM opportunities o WHERE rtrim(o.source_url,'/')=rtrim(e.source_url,'/') OR rtrim(o.official_url,'/')=rtrim(e.source_url,'/') OR o.id IN(SELECT opportunity_id FROM opportunity_source_urls a WHERE rtrim(a.url,'/')=rtrim(e.source_url,'/')))
 AND NOT EXISTS(SELECT 1 FROM catalog_provider_records pr WHERE pr.provider=e.provider AND pr.external_id=e.external_id)
 `,[w.id,requestId])).rows;
 return rows.map(r=>externalCard(r,f,profile)).filter((r):r is GrantResult=>!!r);
}
export async function externalAccess(db:DB,userId:string,id:string){z.string().uuid().parse(id);const w=await workspaceAccess(db,userId);const r=(await db.query(`SELECT e.*,(SELECT a.id FROM applications a WHERE a.workspace_id=$2 AND rtrim(a.source_url,'/')=rtrim(e.source_url,'/') ORDER BY a.created_at LIMIT 1) application_id FROM grant_external_results e WHERE e.id=$1 AND (EXISTS(SELECT 1 FROM grant_search_results r JOIN grant_search_sessions s ON s.id=r.session_id WHERE r.result_id=e.id AND s.workspace_id=$2 AND s.expires_at>now()) OR EXISTS(SELECT 1 FROM applications a WHERE a.workspace_id=$2 AND rtrim(a.source_url,'/')=rtrim(e.source_url,'/')))`,[id,w.id])).rows[0];if(!r)throw Error('Result unavailable');return r;}
export async function saveExternal(db:DB,userId:string,id:string){return transaction(db,async c=>{
 const w=await workspaceAccess(c,userId,true),r=await externalAccess(c,userId,id),g=r.data,url=canonicalUrl(g.url).replace(/\/$/,'');
 await c.query('SELECT pg_advisory_xact_lock(7823091)');await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,9010))',[w.id]);
 const o=(await c.query("SELECT id FROM opportunities WHERE publication_state='published' AND (rtrim(source_url,'/')=$1 OR id IN(SELECT opportunity_id FROM opportunity_source_urls WHERE rtrim(url,'/')=$1)) ORDER BY created_at LIMIT 1",[url])).rows[0];
 const old=(await c.query('SELECT id FROM applications WHERE workspace_id=$1 AND (source_url=$2 OR opportunity_id=$3) ORDER BY created_at LIMIT 1',[w.id,url,o?.id??null])).rows[0];if(old)return old.id;
 const a=(await c.query('INSERT INTO applications(workspace_id,opportunity_id,title,source_url,source_excerpt,source_fetched_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[w.id,o?.id??null,g.title,url,g.summary,r.fetched_at,userId])).rows[0];
 await c.query("INSERT INTO application_history(application_id,actor_id,event,stage) VALUES($1,$2,'Saved official API result','saved')",[a.id,userId]);return a.id;
});}
