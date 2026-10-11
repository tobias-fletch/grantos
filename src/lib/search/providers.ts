import {lookup} from 'node:dns/promises';
import {Agent,fetch} from 'undici';
import {publicAddress} from '../checklists/sources';
import {CA_RESOURCE,normalizeProvider,type Provider} from '../discovery/providers';
import type {Filters} from '../opportunities/store';
export const liveSearchEnabled=()=>process.env.LIVE_GRANT_SEARCH==='true';
export const capabilities={
 'grants-gov':{name:'Grants.gov',kind:'opportunities',authentication:'none',pagination:'offset',filters:['keyword','status','instrument','funding categories','legal applicant'],attribution:'Grants.gov API; not endorsed or certified by HHS',refresh:'each deliberate search',requestsPerMinute:30},
 california:{name:'California Grants Portal',kind:'opportunities',authentication:'none',pagination:'offset',filters:['keyword','type'],attribution:'California Grants Portal public-domain data',refresh:'each deliberate search; upstream daily',requestsPerMinute:30},
 nih:{name:'NIH RePORTER',kind:'historical examples',authentication:'none',pagination:'offset',filters:['opportunity number'],requestsPerMinute:20},
 nsf:{name:'NSF awards',kind:'historical examples',authentication:'none',pagination:'offset',filters:['program reference'],requestsPerMinute:20},
} as const;
export class SourceError extends Error{constructor(public limited=false){super(limited?'Source rate limited':'Source unavailable');}}
export async function officialJson(url:string,body:object|undefined,signal:AbortSignal){
 const u=new URL(url);if(u.protocol!=='https:'||!['api.grants.gov','publish.data.ca.gov','api.reporter.nih.gov','api.nsf.gov'].includes(u.hostname))throw new SourceError();
 const addresses=await Promise.race([lookup(u.hostname,{all:true}),new Promise<never>((_,reject)=>{if(signal.aborted)reject(new SourceError());else signal.addEventListener('abort',()=>reject(new SourceError()),{once:true});})]);
 if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new SourceError();
 const a=addresses[0],agent=new Agent({connect:{lookup:(_h,o,cb)=>{if((o as {all?:boolean}).all)cb(null,[a] as never);else cb(null,a.address,a.family);}}});
 try{const r=await fetch(u,{dispatcher:agent,redirect:'error',signal,method:body?'POST':'GET',headers:{'Content-Type':'application/json','User-Agent':'GrantOS'},body:body?JSON.stringify(body):undefined});
 if(!r.ok){await r.body?.cancel();throw new SourceError(r.status===429);}
 const parts:Uint8Array[]=[];let size=0;for await(const p of r.body!){size+=p.length;if(size>4_000_000)throw new SourceError();parts.push(p);}return JSON.parse(Buffer.concat(parts).toString('utf8'));
 }finally{await agent.destroy();}
}
// Only explicit public search criteria go to providers. Profile ZIP/private work do not.
export function providerKeyword(q:string){return q.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,' ').replace(/\b\d{5}(?:-\d{4})?\b/g,' ').replace(/(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/g,' ').replace(/\s+/g,' ').trim();}
export function searchRequest(provider:Provider,f:Filters,cursor:number,phase=0){
 const keyword=providerKeyword(f.q);
 const categoryCodes:Record<string,string[]>= {'Music':['AR'],'Visual Art':['AR'],'Film / Video':['AR'],'Theater':['AR'],'Dance':['AR'],'Writing / Literature':['AR'],'Photography':['AR'],'Research':['ST'],'Technology':['ST'],'Education':['ED'],'Community Project':['CD'],'Agriculture / Food':['AG','FN']};
 const fundingCategories=f.categories.every(c=>!!categoryCodes[c])?[...new Set(f.categories.flatMap(c=>categoryCodes[c]))].join('|'):'';
 const eligibilities:Record<string,string>={individual:'21|25|99',student:'21|25|99',researcher:'21|25|99',consultant:'21|25|99',business:'22|23|25|99',nonprofit:'12|13|25|99'};

 if(provider==='grants-gov')return {url:'https://api.grants.gov/v1/api/search2',body:{rows:20,startRecordNum:cursor,keyword,oppStatuses:['posted','forecasted','closed|archived'][phase]??'closed|archived',fundingInstruments:'G',...(fundingCategories?{fundingCategories}:{}),...(eligibilities[f.applicant]?{eligibilities:eligibilities[f.applicant]}:{})}};
 const p=new URLSearchParams({resource_id:CA_RESOURCE,limit:'20',offset:String(cursor),sort:'Status asc, OpenDate desc, PortalID asc',filters:JSON.stringify({Type:'Grant'})});if(keyword)p.set('q',keyword);
 return {url:'https://publish.data.ca.gov/api/3/action/datastore_search?'+p,body:undefined};
}
export function searchPage(provider:Provider,r:any){const rows=provider==='grants-gov'?r.data?.oppHits:r.result?.records;const total=Number(provider==='grants-gov'?r.data?.hitCount:r.result?.total);if(!Array.isArray(rows)||!Number.isFinite(total)||total<0||(provider==='grants-gov'?r.errorcode!==0:!r.success))throw new SourceError();return {rows,total};}
export function normalizeLive(provider:Provider,r:any){const g=normalizeProvider(provider,r);if(!g)return null;return {...g,summary:g.summary.slice(0,1200),legalApplicantCodes:provider==='grants-gov'?(r.synopsis??r.forecast)?.applicantTypes?.map((x:any)=>String(x.id)):null,opportunityNumber:provider==='grants-gov'?String(r.opportunityNumber??''):null};}
