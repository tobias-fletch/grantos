import type {DB} from '../checklists/store';
import {sharedRequest} from './sessions';
import {officialJson} from './providers';
export type AwardExample={title:string;recipient:string;year:string;description:string;url:string;source:string};
export function exampleQuery(g:{opportunityNumber?:string;body?:string;funder?:string}){
 if(/National Institutes of Health|\bNIH\b/i.test(g.funder??'')&&/^(?:PAR|PA|RFA)-[A-Z0-9-]+$/.test(g.opportunityNumber??''))return {provider:'nih',identifier:g.opportunityNumber!,url:'https://api.reporter.nih.gov/v2/projects/search',body:{criteria:{foa:[g.opportunityNumber]},offset:0,limit:10}};
 const code=g.body?.match(/\bNSF program reference code\s*:\s*(\d{4})\b/i)?.[1];
 if(code&&/National Science Foundation/i.test(g.funder??''))return {provider:'nsf',identifier:code,url:'https://api.nsf.gov/services/v1/awards.json?'+new URLSearchParams({ProgRefCode:code,offset:'1',printFields:'id,title,awardeeName,date,abstractText,progRefCode'}),body:undefined};
 return null;
}
export function awardExamples(provider:string,identifier:string,r:any):AwardExample[]{
 const rows=provider==='nih'?r.results:r.response?.award;if(!Array.isArray(rows))throw Error('Invalid award response');
 return rows.filter((v:any)=>provider==='nih'?v.opportunity_number===identifier:String(v.progRefCode??'').split(/[,;\s]+/).includes(identifier)).slice(0,10).flatMap((v:any)=>{
 const id=provider==='nih'?v.appl_id:v.id;if(!/^\d+$/.test(String(id)))return [];
 return [{title:String(v.project_title??v.title??'Funded project').slice(0,300),recipient:String(v.organization?.org_name??v.awardeeName??'Recipient not supplied'),year:String(v.fiscal_year??String(v.date??'').match(/\d{4}/)?.[0]??'Unknown'),description:String(v.abstract_text??v.abstractText??'').slice(0,600),url:provider==='nih'?`https://reporter.nih.gov/project-details/${id}`:`https://www.nsf.gov/awardsearch/showAward?AWD_ID=${id}`,source:provider==='nih'?'NIH RePORTER':'NSF Awards'}];
 });
}
export async function lookupExamples(db:DB,g:Parameters<typeof exampleQuery>[0],request=officialJson,signal=AbortSignal.timeout(10000)){
 const q=exampleQuery(g);if(!q)return {checked:false,examples:[],reason:'No confirmed award-program identifier is available. No keyword-based winning-project association was inferred.'};
 const r=await sharedRequest(db,q.provider,q.url,q.body,new Date(Date.now()-7*86400000),signal,request);
 if(!r)throw Error('Example lookup in progress');
 return {checked:true,examples:awardExamples(q.provider,q.identifier,r),reason:q.provider==='nsf'?'Related historical projects sharing the official NSF program reference code; not necessarily awards under this particular opportunity.':'Historical projects matched by official opportunity number; these do not establish current requirements.'};
}
