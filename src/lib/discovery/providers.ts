import {load} from 'cheerio';
import type {Fact} from './program-evidence';
export type Provider='grants-gov'|'california';
export type ImportedGrant={provider:Provider;id:string;url:string;title:string;funder:string;summary:string;body:string;facts:Fact[]};
export const CA_RESOURCE='111c8c88-21f6-453c-ae2c-b4785a0624f5';
export const providerSources={
 'grants-gov':{name:'Grants.gov official API',url:'https://www.grants.gov/search-grants',domain:'www.grants.gov'},
 california:{name:'California Grants Portal open data',url:'https://www.grants.ca.gov/',domain:'www.grants.ca.gov'},
};
const plain=(v:unknown)=>load(String(v??'')).text().replace(/\s+/g,' ').trim().slice(0,24000);
export function sourceDate(v:unknown){const s=String(v??'');const m=s.match(/^(\d{4})-(\d{2})-(\d{2})/)??s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);if(!m)return null;const iso=m[1].length===4?`${m[1]}-${m[2]}-${m[3]}`:`${m[3]}-${m[1]}-${m[2]}`;const d=new Date(iso+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===iso?iso:null;}
function amount(v:unknown){const s=String(v??'').replace(/[$,]/g,'');return /^\d+(\.\d{1,2})?$/.test(s)&&Number(s)<=999999999999?Number(s):null;}
export function normalizeProvider(provider:Provider,r:any,now=new Date()):ImportedGrant|null{
 const federal=provider==='grants-gov',s=federal?(r.synopsis??r.forecast):r;
 if(!s)return null;
 // Only explicit grants; loans, procurement, mixed/unknown instruments are not grants.
 if(federal?!s.fundingInstruments?.some((x:any)=>x.id==='G'):String(r.Type).trim().toLowerCase()!=='grant')return null;
 const id=String(federal?r.id:r.PortalID);if(!/^\d+$/.test(id))return null;
 const title=plain(federal?r.opportunityTitle:r.Title);if(title.length<8||title.length>250)return null;
 const url=federal?`https://www.grants.gov/search-results-detail/${id}`:`https://www.grants.ca.gov/?p=${id}`;
 const summary=plain(federal?s.synopsisDesc??s.forecastDesc:r.Purpose||r.Description);
 const eligibility=federal?[...(s.applicantTypes??[]).map((x:any)=>plain(x.description)),plain(s.applicantEligibilityDesc)].filter(Boolean).join('; '):[plain(r.ApplicantType),plain(r.ApplicantTypeNotes),plain(r.Geography)].filter(Boolean).join('; ');
 const body=[title,summary,plain(federal?s.responseDateDesc:r.Description),eligibility].join('\n');
 const facts:Fact[]=[];const add=(field:Fact['field'],value:string,raw:unknown)=>facts.push({field,value,excerpt:plain(raw),cycle:null,sourceUrl:url,fetchedAt:now.toISOString(),rule:`structured-${provider}-v1`});
 const deadline=sourceDate(federal?s.responseDateStr:r.ApplicationDeadline),opens=sourceDate(federal?s.postingDateStr:r.OpenDate);
 if(deadline)add('deadline',deadline,federal?s.responseDateStr:r.ApplicationDeadline);
 if(!federal&&/^(ongoing|rolling)$/i.test(String(r.ApplicationDeadline??'').trim()))add('rolling','true',r.ApplicationDeadline);
 // A forecast's estimated dates are not actual application dates.
 const rawStatus=String(federal?r.ost:r.Status).toLowerCase();
 const status=federal?({posted:'open',forecasted:'upcoming',closed:'closed',archived:'closed'} as Record<string,string>)[rawStatus]:rawStatus==='active'?'open':rawStatus==='closed'?'closed':undefined;
 if(status){let value=status;if(value==='open'&&opens&&opens>now.toISOString().slice(0,10))value='upcoming';if(value==='open'&&deadline&&deadline<now.toISOString().slice(0,10))value='closed';add('status',value,`${rawStatus}; deadline: ${deadline??'unknown'}; posted: ${opens??'unknown'}`);}
 if(opens&&rawStatus!=='forecasted')add('opens',opens,opens);
 if(eligibility)add('eligibility',eligibility,eligibility);
 if(federal){for(const [field,key] of [['minimum','awardFloor'],['maximum','awardCeiling']] as const){const n=amount(s[key]);if(n!==null)add(field,String(n),s[key]);}}
 else {const raw=String(r.EstAmounts??'');const range=raw.match(/^Between\s+(\$[\d,.]+)\s+and\s+(\$[\d,.]+)$/i),fixed=raw.match(/^\$[\d,.]+$/);if(range&&amount(range[1])!==null&&amount(range[2])!==null&&amount(range[1])!<=amount(range[2])!){add('minimum',String(amount(range[1])),raw);add('maximum',String(amount(range[2])),raw);}else if(fixed&&amount(raw)!==null){add('minimum',String(amount(raw)),raw);add('maximum',String(amount(raw)),raw);}}
 const applicants=federal?(s.applicantTypes??[]).flatMap((x:any)=>({'06':['organization'],6:['organization'],20:['organization'],21:['individual'],22:['business'],23:['business'],12:['nonprofit'],13:['nonprofit']} as Record<string,string[]>)[x.id]??[]):String(r.ApplicantType??'').split(';').flatMap((x:string)=>({Individual:['individual'],Business:['business'],Nonprofit:['nonprofit']} as Record<string,string[]>)[x.trim()]??[]);
 if(applicants.length)add('applicants',JSON.stringify([...new Set(applicants)].sort()),eligibility);
 // An institution is not its students; federal sponsorship is not nationwide eligibility.
 const geo=plain(federal?s.applicantEligibilityDesc:r.Geography);
 if(!federal&&/^(?:statewide|throughout california|all of california|california statewide)[. ]*$/i.test(geo))add('geography',JSON.stringify([{country:'United States',state:'California',rule:'eligible'}]),geo);
 const cats=federal?(s.fundingActivityCategories??[]).flatMap((x:any)=>({AG:['Agriculture / Food'],FN:['Agriculture / Food'],ED:['Education'],ST:['Research','Technology'],CD:['Community Project']} as Record<string,string[]>)[x.id]??[]):String(r.Categories??'').split(';').flatMap((x:string)=>({Education:['Education'],'Agriculture':['Agriculture / Food'],'Science, Technology, and Research & Development':['Research','Technology']} as Record<string,string[]>)[x.trim()]??[]);
 if(cats.length)add('categories',JSON.stringify([...new Set(cats)].sort()),federal?JSON.stringify(s.fundingActivityCategories):r.Categories);
 return {provider,id,url,title,funder:plain(federal?s.agencyName:r.AgencyDept),summary:summary||'Official grant opportunity. Read the source for complete requirements.',body,facts};
}
