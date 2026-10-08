import { canonicalUrl } from '../opportunities/research';
import { evidenceFacts } from './extract';

export type PageRole = 'program'|'application'|'guidelines'|'faq'|'directory'|'announcement'|'supporting'|'ambiguous';
export function pageRole(title:string,url:string,body=''):PageRole {
 const t=title.trim(),p=new URL(url).pathname;
 if(new URL(url).hostname==='www.spencer.org'&&p.replace(/\/$/,'')==='/grant_types/research-practice-partnerships'&&/^Research-Practice Partnerships:/i.test(t)&&/Research-Practice Partnership \(RPP\) Grants Program/i.test(body))return 'program';
 if(/^(?:anatomy of|a guide to|guide to|tips for|how to)\b/i.test(t))return 'supporting';
 if(/[?？]$/.test(t)||/^(who|what|when|where|why|how|can I|am I|do I)\b/i.test(t))return 'supporting';
 if(/\b(faqs?|frequently asked questions|questions and answers)\b/i.test(t+' '+p))return 'faq';
 if(/\/reviewers?(\/|$)/i.test(p)||/\bgrant review\b/i.test(t))return 'supporting';
 if(/^Applications for (?:the )?20\d{2} Grant Cycle\b/i.test(t))return 'directory';
 if(new URL(url).hostname==='ambergrantsforwomen.com'&&/Share this recipient on social media/i.test(body))return 'announcement';
 if(new URL(url).hostname==='www.rd.usda.gov'&&/^Technical Assistance Awards$/i.test(t)&&/list of entities that received USDA funding/i.test(body))return 'announcement';
 if(/\b(guidelines|application guide|instructions|fact sheet|eligibility requirements)\b/i.test(t)||/\/(guidelines|instructions)(\/|$)/i.test(p))return 'guidelines';
 if(/\b(recipients?|awardees?|winners?|announces?|awarded|receives?|finalists?)\b/i.test(t)||/\/(news|news-and-views|press|press-releases|blog|stories)(\/|$)/i.test(p))return 'announcement';
 if(/\b(directory|resources?|toolkits?|grant search|funding overview|funding opportunities|grants overview)\b/i.test(t)||/^(all |our |current |available )?(grants?|funding|fellowships?)( and (awards|fellowships|grants))?$/i.test(t))return 'directory';
 if(/\b(office hours|orientation|webinars?|downloads?|manage (your|a) grant|reporting|technical assistance for grant applications|terms and conditions)\b/i.test(t)||/\/(resource|resources|downloads|for-grantees|recipients|artists|people)(\/|$)/i.test(p))return 'supporting';
 if(/\b(how (to|do|can)|tips for|why |what is|grant writer|project manager)\b/i.test(t))return 'supporting';
 if(/\/(apply|apply-now|application|application-form|award-application)\/?$/i.test(p)||/^(?:(?:grant )?application|apply now)$/i.test(t)||/^(apply for|application for)\b/i.test(t))return 'application';
 if(/\.(pdf|xml)$/i.test(p))return 'supporting';
 if(t.length>=8&&t.length<=250&&/\b(grants?|fund|funding|fellowships?|awards?|program)\b/i.test(t)&&/\b(apply|applications?|eligib\w*|proposals?|supports?|provides?|funding)\b/i.test(body))return 'program';
 return 'ambiguous';
}
export function supportingRole(role:PageRole){return ['application','guidelines','faq','supporting'].includes(role);}
export function sameProgramLocation(a:string,b:string){
 const x=new URL(canonicalUrl(a)),y=new URL(canonicalUrl(b));
 return x.hostname.replace(/^www\./,'')===y.hostname.replace(/^www\./,'')&&x.pathname===y.pathname&&x.search===y.search;
}
export function identifiableProgramName(name:string,body:string,url='https://example.org/program'){
 // A catalog program can legitimately use an application or FAQ as its source.
 // Classify its name separately from the source URL before hiding anything.
 return pageRole(name,new URL('/program',url).href,body)==='program';
}
// Explicit publisher identifiers survive spelling/title changes, but never cross publishers.
export function publisherIdentity(url:string){
 const u=new URL(url),host=u.hostname.replace(/^www\./,'');
 if(host==='nyfa.org'&&u.pathname.includes('opportunity-info')&&u.searchParams.get('id'))return host+':'+u.searchParams.get('id');
 if(host==='grants.gov'&&/^\/search-results-detail\/\d+\/?$/.test(u.pathname))return host+':'+u.pathname.match(/\d+/)![0];
 return canonicalUrl(url);
}
export function relatedPage(program:{name:string;source_url:string},page:{url:string;title:string;text:string},linked=false){
 if(publisherIdentity(program.source_url)===publisherIdentity(page.url))return 'explicit-program-identifier';
 const a=new URL(program.source_url),b=new URL(page.url),role=pageRole(page.title,page.url,page.text);
 if(a.hostname!==b.hostname||!supportingRole(role))return null;
 const parent=a.pathname.replace(/\/$/,'');
 if(parent&&parent!=='/'&&b.pathname.startsWith(parent+'/'))return 'official-program-subpage';
 // A program's direct official link plus an explicit program-name mention establishes context.
 // Name similarity alone never establishes an association.
 const name=program.name.replace(/\s*[-|–]\s*(?:home|official site).*$/i,'').trim().toLowerCase();
 if(linked&&name.length>=12&&page.text.toLowerCase().includes(name))return 'official-program-link';
 return null;
}
export function supportingLinks(programUrl:string,links:string[]){
 const root=new URL(programUrl);
 return [...new Set(links)].filter(url=>{try{const u=new URL(url);return u.href!==root.href&&/apply|application|guideline|eligib|faq|deadline|\.pdf(?:$|\?)/i.test(u.href);}catch{return false;}}).sort((a,b)=>Number(/\.pdf/i.test(a))-Number(/\.pdf/i.test(b))).slice(0,30);
}
export function supportsProgramFacts(name:string,url:string){
 // PKF's general application FAQ mentions its separate nomination-only awards.
 // That mention does not make the general grant amounts or rolling status applicable.
 const u=new URL(url);
 return !(u.hostname.replace(/^www\./,'')==='pkf.org'&&/Lee Krasner Award|Pollock Prize/i.test(name)&&/\/(?:apply\/)?how-to-apply\/?$/.test(u.pathname));
}
export const PROGRAM_PARSER_VERSION='program-v11';
function dollars(raw:string,scale=''){return Number(raw.replaceAll(',',''))*({million:1000000,thousand:1000,billion:1000000000,k:1000,m:1000000}[scale.toLowerCase()]??1);}
export const factFields=['status','deadline','minimum','maximum','rolling','eligibility','applicants','geography'] as const;
export type Fact={field:typeof factFields[number];value:string;excerpt:string;cycle:string|null;sourceUrl:string;fetchedAt:string;periodEnd?:string;rule?:string;conflict?:boolean};
const evidenceYears=(text:string)=>[...new Set([...text.matchAll(/(?:\b|FY\s*)(20\d{2})\b/gi)].map(m=>m[1]))];
export function programFacts(page:{url:string;title:string;text:string;extracted:Record<string,string>},fetchedAt:string,now=new Date()):Fact[]{
 const role=pageRole(page.title,page.url,page.text);
 if(['directory','announcement','ambiguous'].includes(role))return [];
 const facts:Fact[]=[];
 const cycleText=page.title.match(/(?:FY\s*)?20\d{2}(?:\s*[-–/]\s*(?:20)?\d{2})?/i)?.[0]??page.text.match(/(?:FY\s*20\d{2}|20\d{2}(?:\s*[-–/]\s*(?:20)?\d{2})?\s+(?:funding|application|grant)\s+(?:round|cycle|period))/i)?.[0];
 const pageCycle=cycleText?.match(/20\d{2}(?:\s*[-–/]\s*(?:20)?\d{2})?/)?.[0].replace(/\s/g,'')??null;
 const add=(field:Fact['field'],value:string,excerpt:string,rule='explicit-program-'+field+'-v3')=>{
  if(!excerpt||!page.text.includes(excerpt))return;
  const years=evidenceYears(excerpt);
  facts.push({field,value,excerpt,cycle:pageCycle??(years.length===1?years[0]:years.length>1?'unresolved':null),sourceUrl:page.url,fetchedAt,rule});
 };
 const x=page.extracted??{},old=evidenceFacts(x,page.text,page.url,now);
 if(old.eligibility)add('eligibility',old.eligibility,old.eligibility,'eligibility-section-v4');
 if(old.eligibility&&!/\b(not|except|excluding|ineligible)\b/i.test(old.eligibility)){
  const types=([[/\bnonprofit|501\(c\)\(3\)/i,'nonprofit'],[/\bsmall businesses|for-profit businesses/i,'business'],[/\bindividual(?:s| artists)?\b/i,'individual'],[/\bstudents?\b/i,'student'],[/\bresearchers?\b/i,'researcher']] as [RegExp,string][]).filter(([re])=>re.test(old.eligibility!)).map(([,v])=>v).sort();
  if(types.length)add('applicants',JSON.stringify(types),old.eligibility);
 }
 if(old.maximum)add('maximum',String(old.maximum),x.amount_evidence);
 if(old.deadline)add('deadline',old.deadline,x.deadline_evidence);
 if(old.status!=='unknown')add('status',old.status,x.status_evidence);
 const host=new URL(page.url).hostname;
 if(host==='www.spencer.org'&&new URL(page.url).pathname.replace(/\/$/,'')==='/grant_types/vision-grants'){
  for(const m of page.text.matchAll(/Vision Grants are \$([\d,]+) total\./g)){const amount=dollars(m[1]);if(amount>0&&amount<=100000000){add('minimum',String(amount),m[0],'spencer-vision-fixed-award-v1');add('maximum',String(amount),m[0],'spencer-vision-fixed-award-v1');}}
 }
 // USDA RD exposes a dedicated, current program-window label. Unlike historical
 // application-period prose, that field is an explicit current status statement.
 if(host==='www.rd.usda.gov'&&new URL(page.url).pathname.startsWith('/programs-services/')){
  for(const m of page.text.matchAll(/Application Window:\s*(Open|Closed)\b/gi))facts.push({field:'status',value:m[1].toLowerCase(),excerpt:m[0],cycle:null,sourceUrl:page.url,fetchedAt,rule:'usda-rd-current-window-v1'});
 }
 if(host==='www.ams.usda.gov'&&new URL(page.url).pathname.startsWith('/services/grants/')){
  for(const m of page.text.matchAll(/(?:The )?FY\s?(20\d{2})\b[^.!?]{0,150}\bapplication period is (?:now )?(open|closed)\b[^.!?]*\.?/gi))add('status',m[2].toLowerCase(),m[0]);
 }
 for(const m of page.text.matchAll(/(?:maximum grant amount|grant amounts? up to|maximum award|grants? of up to|budgets up to)\s*:?\s*(?:USD\s*\$?|\$)([\d,]+(?:\.\d+)?)\s*(million|thousand|billion|[mk]\b)?/gi)){
  if(/\b(CAD|AUD|NZD|Canadian dollars|Australian dollars)\b/i.test(page.text)&&! /USD/.test(m[0]))continue;
  const amount=dollars(m[1],m[2]);if(amount>0&&amount<=100000000)add('maximum',String(amount),m[0]);
 }
 for(const m of page.text.matchAll(/(?:grant|award|funding) amounts?\s*(?:range\s*)?(?:from|of|between|:)?\s*\$([\d,]+)\s*(?:to|[-–]|and)\s*\$([\d,]+)/gi)){
  if(/\b(CAD|AUD|NZD|Canadian dollars|Australian dollars)\b/i.test(page.text))continue;
  const a=Number(m[1].replaceAll(',','')),b=Number(m[2].replaceAll(',',''));if(a>0&&b>=a&&b<=100000000){add('minimum',String(a),m[0]);add('maximum',String(b),m[0]);}
 }
 for(const m of page.text.matchAll(/(?:minimum grant amount|minimum award)\s*:?\s*(?:USD\s*\$?|\$)([\d,]+(?:\.\d+)?)\s*(million|thousand|billion|[mk]\b)?/gi)){const v=dollars(m[1],m[2]);if(v>0&&v<=100000000&&(!/\b(CAD|AUD|NZD)\b/i.test(page.text)||/USD/.test(m[0])))add('minimum',String(v),m[0]);}
 for(const m of page.text.matchAll(/applications (?:are )?(?:accepted|reviewed) (?:on a rolling basis|year[- ]round)|(?:application )?deadline\s*:\s*rolling/gi)){
  add('rolling','true',m[0]);if(/accepted/i.test(m[0]))add('status','open',m[0]);
 }
 // Multiple eligibility clauses on one page describe one set of requirements.
 const eligibilityExcerpts:string[]=[];
 for(const m of page.text.matchAll(/(?:eligible applicants (?:include|are)|(?:this (?:grant|program) is )?open to|applicants must be)\s+(?:U\.S\.|e\.g\.|i\.e\.|[^.!?\n]){5,1200}(?:[.!?](?=\s|$)|$)/gi)){
  if(/\b(not|except|excluding|ineligible)\b/i.test(m[0]))continue;
  if(!old.eligibility)eligibilityExcerpts.push(m[0]);
  const mapping:[RegExp,string][]=[[/\bnonprofit|501\(c\)\(3\)/i,'nonprofit'],[/\bsmall businesses|for-profit businesses/i,'business'],[/\bindividual(?:s| artists)?\b/i,'individual'],[/\bstudents?\b/i,'student'],[/\bresearchers?\b/i,'researcher'],[/\bfiscally sponsored/i,'fiscal_sponsored']];
  const types=mapping.filter(([re])=>re.test(m[0])).map(([,v])=>v).sort();if(types.length)add('applicants',JSON.stringify(types),m[0]);
 }
 if(eligibilityExcerpts.length){
  const combined=[...new Set(eligibilityExcerpts)].join(' '),first=eligibilityExcerpts[0],last=eligibilityExcerpts.at(-1)!;
  const excerpt=page.text.slice(page.text.indexOf(first),page.text.lastIndexOf(last)+last.length);
  add('eligibility',combined,excerpt,'eligibility-excerpt-v4');
 }
 for(const m of page.text.matchAll(/(?:applicants must (?:reside|be based|be located)|eligible applicants (?:reside|are based)|projects must (?:be based|be located|take place)) in (New York City|New York State|the United States)(?:[.!?]|\s|$)/gi)){
  const place=m[1].toLowerCase(),g=place==='new york city'?{country:'United States',state:'New York',city:'New York City',rule:'eligible'}:place==='new york state'?{country:'United States',state:'New York',rule:'eligible'}:{country:'United States',rule:'eligible'};
  add('geography',JSON.stringify([g]),m[0]);
 }
 for(const m of page.text.matchAll(/(?:application deadline|applications due|deadline)\s*:\s*(20\d{2}-\d{2}-\d{2})\b/gi)){
  const date=new Date(m[1]+'T00:00:00Z');if(!Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===m[1])add('deadline',m[1],m[0]);
 }
 // Only explicit application statements, never an inferred status from a date or an apply link.
 for(const m of page.text.matchAll(/(?:[^.!?\n]{0,65}\b)?applications (?:are |are currently |currently |now )?(?:open|closed|being accepted|not being accepted)\b[^.!?\n]{0,100}[.!?]?/gi)){
  if(/applications open\s*:?\s*(?:January|February|March|April|May|June|July|August|September|October|November|December|\d)/i.test(m[0]))continue;
  if(/\b(were|was|previous|last year|will|opens|historical)\b/i.test(m[0]))continue;
  add('status',/closed|not being accepted/i.test(m[0])?'closed':'open',m[0]);
 }
 const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
 for(const m of page.text.matchAll(/(?:application deadline|applications (?:are )?due|deadline)\s*(?::|is)?\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(20\d{2})\b/gi)){
  const date=new Date(Date.UTC(Number(m[3]),months.indexOf(m[1].toLowerCase()),Number(m[2])));
  if(date.getUTCDate()===Number(m[2]))add('deadline',date.toISOString().slice(0,10),m[0]);
 }
 const deadlines=facts.filter(f=>f.field==='deadline');
 const datedOpening=page.text.match(/applications open\s*:?\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+20\d{2}/i);
 if(datedOpening&&!facts.some(f=>f.field==='status'))facts.push({field:'status',value:'unknown',excerpt:datedOpening[0],cycle:pageCycle,sourceUrl:page.url,fetchedAt,conflict:true,rule:'dated-opening-is-not-current-availability-v11'});
 // Publishers sometimes update a visible timeline but leave an old dated FAQ.
 // A yearless closing date cannot establish a replacement year, but a mismatch
 // is enough to withhold the old date rather than silently choosing it.
 for(const m of page.text.matchAll(/applications close\s+(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\b/gi)){
  const monthDay=String(months.indexOf(m[1].toLowerCase())+1).padStart(2,'0')+'-'+m[2].padStart(2,'0');
  for(const prior of deadlines)if(prior.value.slice(5)!==monthDay)facts.push({...prior,excerpt:m[0],conflict:true,rule:'conflicting-application-timeline-v8'});
 }
 for(const fact of facts){
  if(!fact.cycle&&deadlines.length===1)fact.cycle=deadlines[0].cycle;
  const end=deadlines.filter(d=>d.cycle===fact.cycle).map(d=>d.value).sort().at(-1);if(end)fact.periodEnd=end;
 }
 return facts;
}
export function resolveProgramFacts(facts:Fact[],now=new Date()){
 const values:Partial<Record<Fact['field'],string>>={},reasons:Record<string,string>={};
 for(const field of factFields){
  const candidates=facts.filter(f=>f.field===field);
  // A labeled round extending into another year remains usable through its explicit deadline.
  // Historical-only material is not promoted merely because it is the newest page fetched.
  const viable=candidates.filter(f=>{
   if(f.cycle==='unresolved')return false;
   if(!f.cycle)return true;
   if(f.periodEnd&&Date.parse(f.periodEnd+'T23:59:59Z')>=now.getTime())return true;
   const years=f.cycle.match(/\d+/g)??[],last=years.at(-1)??'';
   const endYear=last.length===2?Number((years[0]??'').slice(0,2)+last):Number(last);
   return endYear>=now.getUTCFullYear();
  });
  const scoped=viable.filter(f=>f.cycle);
  const newest=scoped.map(f=>Number(f.cycle!.slice(0,4))).sort((a,b)=>b-a)[0];
  const usable=scoped.length?scoped.filter(f=>Number(f.cycle!.slice(0,4))===newest):viable;
  if(usable.some(f=>f.conflict)){reasons[field]='Conflicting current application timeline and dated requirements';continue;}
  const distinct=[...new Set(usable.map(f=>f.value))];
  if(distinct.length===1)values[field]=distinct[0];
  else reasons[field]=distinct.length>1?'Conflicting current source evidence':candidates.length?'Only historical or future-cycle evidence; current cycle unresolved':'No explicit program-specific evidence';
 }
 if(values.rolling==='true'&&values.deadline){delete values.rolling;delete values.deadline;reasons.rolling=reasons.deadline='Conflicting current source evidence: rolling and fixed deadline';}
 // Contradictory dates do not prove closure, but make an open claim unreliable.
 if(values.status==='open'&&values.deadline&&Date.parse(values.deadline+'T23:59:59Z')<now.getTime()){
  delete values.status;reasons.status='Open statement conflicts with an elapsed deadline; current availability unresolved';
 }
 return {values,reasons};
}

