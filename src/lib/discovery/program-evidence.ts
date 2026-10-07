import { canonicalUrl } from '../opportunities/research';
import { evidenceFacts } from './extract';

export type PageRole = 'program'|'application'|'guidelines'|'faq'|'directory'|'announcement'|'supporting'|'ambiguous';
export function pageRole(title:string,url:string,body=''):PageRole {
 const t=title.trim(),p=new URL(url).pathname;
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
export type Fact={field:'status'|'deadline'|'maximum'|'eligibility';value:string;excerpt:string;cycle:string|null;sourceUrl:string;fetchedAt:string};
const evidenceYears=(text:string)=>[...new Set([...text.matchAll(/(?:\b|FY\s*)(20\d{2})\b/gi)].map(m=>m[1]))];
export function programFacts(page:{url:string;title:string;text:string;extracted:Record<string,string>},fetchedAt:string,now=new Date()):Fact[]{
 const role=pageRole(page.title,page.url,page.text);
 if(['directory','announcement','ambiguous'].includes(role))return [];
 const facts:Fact[]=[];
 const titleYears=evidenceYears(page.title);
 const bodyYears=evidenceYears(page.text);
 const pageCycle=titleYears.length===1?titleYears[0]:bodyYears.length===1?bodyYears[0]:bodyYears.length>1?'unresolved':null;
 const add=(field:Fact['field'],value:string,excerpt:string)=>{
  if(!excerpt||!page.text.includes(excerpt))return;
  const years=evidenceYears(excerpt);
  if(years.length>1)return;
  facts.push({field,value,excerpt,cycle:years[0]??pageCycle,sourceUrl:page.url,fetchedAt});
 };
 const x=page.extracted??{},old=evidenceFacts(x,page.text,page.url,now);
 if(old.eligibility)add('eligibility',old.eligibility,old.eligibility);
 if(old.maximum)add('maximum',String(old.maximum),x.amount_evidence);
 if(old.deadline)add('deadline',old.deadline,x.deadline_evidence);
 if(old.status!=='unknown')add('status',old.status,x.status_evidence);
 const host=new URL(page.url).hostname;
 // USDA RD exposes a dedicated, current program-window label. Unlike historical
 // application-period prose, that field is an explicit current status statement.
 if(host==='www.rd.usda.gov'&&new URL(page.url).pathname.startsWith('/programs-services/')){
  for(const m of page.text.matchAll(/Application Window:\s*(Open|Closed)\b/gi))facts.push({field:'status',value:m[1].toLowerCase(),excerpt:m[0],cycle:null,sourceUrl:page.url,fetchedAt});
 }
 if(host==='www.ams.usda.gov'&&new URL(page.url).pathname.startsWith('/services/grants/')){
  for(const m of page.text.matchAll(/(?:The )?FY\s?(20\d{2})\b[^.!?]{0,150}\bapplication period is (?:now )?(open|closed)\b[^.!?]*\.?/gi))add('status',m[2].toLowerCase(),m[0]);
 }
 for(const m of page.text.matchAll(/(?:maximum grant amount|grant amounts? up to|maximum award)\s*:?\s*USD\s*\$?([\d,]+)\b/gi)){
  const amount=Number(m[1].replaceAll(',',''));if(amount>0&&amount<=100000000)add('maximum',String(amount),m[0]);
 }
 for(const m of page.text.matchAll(/(?:application deadline|applications due|deadline)\s*:\s*(20\d{2}-\d{2}-\d{2})\b/gi)){
  const date=new Date(m[1]+'T00:00:00Z');if(!Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===m[1])add('deadline',m[1],m[0]);
 }
 // Only explicit application statements, never an inferred status from a date or an apply link.
 for(const m of page.text.matchAll(/(?:[^.!?\n]{0,65}\b)?applications (?:are |are currently |currently |now )?(?:open|closed|being accepted|not being accepted)\b[^.!?\n]{0,100}[.!?]?/gi)){
  if(/\b(were|was|previous|last year|will|opens|historical)\b/i.test(m[0]))continue;
  add('status',/closed|not being accepted/i.test(m[0])?'closed':'open',m[0]);
 }
 const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
 for(const m of page.text.matchAll(/(?:application deadline|applications (?:are )?due|deadline)\s*(?::|is)?\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(20\d{2})\b/gi)){
  const date=new Date(Date.UTC(Number(m[3]),months.indexOf(m[1].toLowerCase()),Number(m[2])));
  if(date.getUTCDate()===Number(m[2]))add('deadline',date.toISOString().slice(0,10),m[0]);
 }
 return facts;
}
export function resolveProgramFacts(facts:Fact[],now=new Date()){
 const values:Partial<Record<Fact['field'],string>>={},reasons:Record<string,string>={};
 for(const field of ['status','deadline','maximum','eligibility'] as const){
  const candidates=facts.filter(f=>f.field===field);
  const current=candidates.filter(f=>f.cycle===String(now.getUTCFullYear()));
  const unscoped=candidates.filter(f=>!f.cycle);
  const usable=current.length?current:unscoped;
  const distinct=[...new Set(usable.map(f=>f.value))];
  if(distinct.length===1)values[field]=distinct[0];
  else reasons[field]=distinct.length>1?'Conflicting current source evidence':candidates.length?'Only historical or future-cycle evidence; current cycle unresolved':'No explicit program-specific evidence';
 }
 // Contradictory dates do not prove closure, but make an open claim unreliable.
 if(values.status==='open'&&values.deadline&&Date.parse(values.deadline+'T23:59:59Z')<now.getTime()){
  delete values.status;reasons.status='Open statement conflicts with an elapsed deadline; current availability unresolved';
 }
 return {values,reasons};
}
