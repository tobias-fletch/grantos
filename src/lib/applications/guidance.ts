/** A rendering-only evidence model. No crawling, extraction, inferred questions, or AI. */
export const guidanceFields = ['application_url','eligibility','document','step','deadline','fee','match','question','criterion'] as const;
export type GuidanceField = typeof guidanceFields[number];
export type GuidanceProvenance = {
  sourceUrl: string; excerpt: string; fetchedAt: string; verifiedAt: string | null;
  snapshotId: string; cycle: string | null; section: string; applicantScope: string;
  method: 'stored-source-fact' | 'assistant-reviewed' | 'human-reviewed'; reviewedAt?: string | null; authorityChain?: string[]; reviewId: string | null;
};
export type GuidanceItem = { field: GuidanceField; value: string; provenance: GuidanceProvenance };
export type ApplicationGuidance = {
  opportunityId: string | null; programUrl: string | null; applicationUrl: string | null;
  items: GuidanceItem[]; unknown: GuidanceField[]; warnings: string[];
  sourceCheckedAt: string | null; lastVerifiedAt: string | null;
  suggestions: string[];
};
export type GuidanceEvidencePage = {
  url: string; role: string; association: string; snapshot_id: string; fetched_at: Date | string;
  body: string; links: unknown; approved_domains: string[]; snapshot_url: string; latest_snapshot_id: string;
  facts: unknown;
};
export type GuidanceReview = {
  id: string; field: GuidanceField; value: string; snapshot_id: string; source_url: string; source_excerpt: string;
  source_section: string; applicant_scope: string; cycle: string | null; period_end: string | null; verified_at: Date | string;
};
export type GuidanceProgram = { id: string; official_url: string; source_url: string; deadline_at?: Date | string | null; last_verified_at?: Date | string | null; awaiting_review?: boolean; monitor_state?: string; };
const associations = new Set(['program-page','explicit-program-identifier','official-program-subpage','official-program-link','official-structured-data']);
const roles = new Set(['program','application','guidelines','faq','supporting']);
const iso = (v: unknown) => (typeof v === 'string' || v instanceof Date) && Number.isFinite(new Date(v).getTime()) ? new Date(v).toISOString() : null;
export function guidanceUrl(value: unknown): string | null {
  try {
    if (typeof value !== 'string') return null;
    const u = new URL(value);
    // These URLs are navigation only. Never send them to a server-side fetcher.
    if (u.protocol !== 'https:' || u.username || u.password || u.port && u.port !== '443' || !u.hostname.includes('.') || /(?:^|\.)(?:localhost|local|internal|test|example|invalid)$/.test(u.hostname) || /^\[|^\d+(?:\.\d+){3}$/.test(u.hostname)) return null;
    return u.href;
  } catch { return null; }
}
const sameUrl = (a: unknown, b: unknown) => !!guidanceUrl(a) && guidanceUrl(a)?.replace(/\/$/,'') === guidanceUrl(b)?.replace(/\/$/,'');
const publisher = (value: string) => {const safe=guidanceUrl(value);return safe?new URL(safe).hostname.replace(/^www\./,''):null;};
export function trustedGuidancePage(program: GuidanceProgram, page: GuidanceEvidencePage, now = Date.now(), allPages: GuidanceEvidencePage[] = []): boolean {
  const url=guidanceUrl(page.url), official=guidanceUrl(program.official_url), fetched=iso(page.fetched_at);
  const current=!!url && !!official && !!fetched && Date.parse(fetched) <= now && Date.parse(fetched) >= now-90*86400000 &&
    sameUrl(page.url,page.snapshot_url) && page.snapshot_id === page.latest_snapshot_id &&
    page.approved_domains.includes(new URL(url).hostname) && roles.has(page.role);
  if(!current)return false;
  if(publisher(url!)===publisher(official!))return associations.has(page.association);
  // A reviewed exact link chain (at most one same-publisher intermediate) from this program's canonical official page
  // establishes authority for an external form/PDF. Never follow links here.
  return page.association==='reviewed-official-link' && allPages.some(parent=>
    sameUrl(parent.url,program.official_url) && ['program','application'].includes(parent.role) &&
    trustedGuidancePage(program,parent,now) && Array.isArray(parent.links) && (parent.links.some(link=>guidanceUrl(link)===guidanceUrl(page.url)) || allPages.some(middle=>publisher(middle.url)===publisher(official!) && ['program','application','guidelines'].includes(middle.role) && trustedGuidancePage(program,middle,now) && parent.links instanceof Array && parent.links.some(link=>guidanceUrl(link)===guidanceUrl(middle.url)) && Array.isArray(middle.links) && middle.links.some(link=>guidanceUrl(link)===guidanceUrl(page.url)))));
}
export function guidanceAuthorityChain(program:GuidanceProgram,page:GuidanceEvidencePage,pages:GuidanceEvidencePage[],now=Date.now()):string[]{
 if(!trustedGuidancePage(program,page,now,pages))return [];
 if(publisher(page.url)===publisher(program.official_url))return [page.url];
 const root=pages.find(p=>sameUrl(p.url,program.official_url)&&trustedGuidancePage(program,p,now)&&['program','application'].includes(p.role));
 if(!root||!Array.isArray(root.links))return [];
 if(root.links.some(l=>guidanceUrl(l)===guidanceUrl(page.url)))return [root.url,page.url];
 const middle=pages.find(p=>publisher(p.url)===publisher(program.official_url)&&trustedGuidancePage(program,p,now)&&['program','application','guidelines'].includes(p.role)&&Array.isArray(root.links)&&root.links.some(l=>guidanceUrl(l)===guidanceUrl(p.url))&&Array.isArray(p.links)&&p.links.some(l=>guidanceUrl(l)===guidanceUrl(page.url)));
 return middle?[root.url,middle.url,page.url]:[];
}
export function currentGuidanceCycle(cycle: string | null, periodEnd: string | null | undefined, deadline: GuidanceProgram['deadline_at'], now = Date.now()) {
  if (cycle === 'unresolved') return false;
  const today=new Date(now).toISOString().slice(0,10), end=periodEnd?.slice(0,10);
  if (end && (!/^\d{4}-\d{2}-\d{2}$/.test(end) || end < today)) return false;
  if (!cycle) return true;
  if(!end&&iso(deadline)&&iso(deadline)!.slice(0,10)<today)return false;
  // An explicitly associated active deadline can belong to a next-year award cycle.
  if (end && end === iso(deadline)?.slice(0,10)) return true;
  const years=cycle.match(/20\d{2}/g)?.map(Number)??[];
  const shortEnd=cycle.match(/20\d{2}\s*[-–/]\s*(\d{2})(?!\d)/)?.[1];
  if(shortEnd&&years.length)years.push(Number(String(years[0]).slice(0,2)+shortEnd));
  const year=new Date(now).getUTCFullYear();
  return years.length > 0 && Math.min(...years) <= year && Math.max(...years) >= year;
}
export function emptyGuidance(): ApplicationGuidance {
  return {opportunityId:null,programUrl:null,applicationUrl:null,items:[],unknown:[...guidanceFields],warnings:['Current program-specific guidance is not available.'],sourceCheckedAt:null,lastVerifiedAt:null,suggestions:['Confirm the legal applicant and the current application round on the official source.','Check which requirements apply to your applicant route before preparing documents.','Review the funder’s actual questions and submission instructions before submitting on its site.']};
}
export function buildApplicationGuidance(program: GuidanceProgram, pages: GuidanceEvidencePage[], reviews: GuidanceReview[] = [], fieldStates: {field:string;state:string}[] = [], now = Date.now()): ApplicationGuidance {
  const result=emptyGuidance();result.opportunityId=program.id;result.warnings=[];
  const trusted=pages.filter(p=>trustedGuidancePage(program,p,now,pages));
  result.programUrl=trusted.length?guidanceUrl(program.official_url):null;
  result.sourceCheckedAt=trusted.map(p=>iso(p.fetched_at)!).sort().at(-1)??null;
  const blocked=new Set(fieldStates.filter(s=>['conflicting','locked_conflict','inaccessible'].includes(s.state)).map(s=>s.field));
  const add=(field:GuidanceField,value:string,page:GuidanceEvidencePage,excerpt:string,cycle:string|null,review?:GuidanceReview)=>{
    result.items.push({field,value,provenance:{sourceUrl:page.url,authorityChain:guidanceAuthorityChain(program,page,pages,now),excerpt,fetchedAt:iso(page.fetched_at)!,verifiedAt:review?iso(review.verified_at):null,snapshotId:page.snapshot_id,cycle,section:review?.source_section??'',applicantScope:review?.applicant_scope??'',method:review?'human-reviewed':'stored-source-fact',reviewId:review?.id??null}});
  };
  if (!program.awaiting_review && program.monitor_state !== 'discontinued') {
    for (const page of trusted) for (const raw of Array.isArray(page.facts)?page.facts:[]) {
      if (!raw || typeof raw!=='object') continue;
      const f=raw as Record<string,unknown>;
      if(f.withdrawn===true)continue;
      // Offline reviewed starter facts retain exact excerpts and explicitly identify
      // assistant review. This never creates a human verification timestamp.
      if(f.rule==='reviewed-starter-v1'&&f.reviewMethod==='assistant-reviewed'){
        const reviewed=iso(f.reviewedAt),field=f.field as GuidanceField;
        if(!guidanceFields.includes(field)||f.conflict||blocked.has(field)||typeof f.value!=='string'||typeof f.excerpt!=='string'||!f.excerpt.trim()||!sameUrl(f.sourceUrl,page.url)||!(page.body.includes(f.excerpt)||field==='application_url'&&f.excerpt===f.value&&Array.isArray(page.links)&&page.links.some(l=>sameUrl(l,f.value)))||!reviewed||Date.parse(reviewed)>now||Date.parse(reviewed)<now-90*86400000||!currentGuidanceCycle(typeof f.cycle==='string'?f.cycle:null,typeof f.periodEnd==='string'?f.periodEnd:null,program.deadline_at,now))continue;
        const scope=typeof f.applicantScope==='string'?f.applicantScope:'';
        if(scope&&!page.body.includes(scope))continue;
        if(field==='application_url'){
          if(!guidanceUrl(f.value)||!Array.isArray(page.links)||!page.links.some(l=>sameUrl(l,f.value)))continue;
        }else if(!f.excerpt.includes(f.value)||field==='eligibility'&&f.value.length>1000)continue;
        result.items.push({field,value:f.value,provenance:{sourceUrl:page.url,authorityChain:guidanceAuthorityChain(program,page,pages,now),excerpt:f.excerpt,fetchedAt:iso(page.fetched_at)!,verifiedAt:null,reviewedAt:reviewed,snapshotId:page.snapshot_id,cycle:typeof f.cycle==='string'?f.cycle:null,section:typeof f.section==='string'?f.section:'',applicantScope:scope,method:'assistant-reviewed',reviewId:null}});
        continue;
      }
      if (!['eligibility','deadline','rolling'].includes(String(f.field)) || f.conflict || blocked.has(String(f.field)) || typeof f.value!=='string' || typeof f.excerpt!=='string' || !f.excerpt.trim() || !sameUrl(f.sourceUrl,page.url) || !page.body.includes(f.excerpt) || !currentGuidanceCycle(typeof f.cycle==='string'?f.cycle:null,typeof f.periodEnd==='string'?f.periodEnd:null,program.deadline_at,now)) continue;
      if (f.field==='eligibility') {if(f.value.length>1000||!f.excerpt.includes(f.value))continue;add('eligibility',f.value,page,f.excerpt,typeof f.cycle==='string'?f.cycle:null);}
      else if(f.field==='deadline' && /^\d{4}-\d{2}-\d{2}$/.test(f.value) && f.value>=new Date(now).toISOString().slice(0,10))add('deadline',f.value+' · Time and time zone unverified',page,f.excerpt,typeof f.cycle==='string'?f.cycle:null);
      else if(f.field==='rolling'&&f.value==='true')add('deadline','Rolling · Confirm any cutoff with the funder',page,f.excerpt,typeof f.cycle==='string'?f.cycle:null);
    }
    for (const review of reviews) {
      const page=trusted.find(p=>p.snapshot_id===review.snapshot_id&&sameUrl(p.url,review.source_url));
      const checked=iso(review.verified_at);
      if(!page||!checked||Date.parse(checked)>now||Date.parse(checked)<now-90*86400000||!currentGuidanceCycle(review.cycle,review.period_end,program.deadline_at,now)||!page.body.includes(review.source_excerpt)||review.applicant_scope&&!page.body.includes(review.applicant_scope))continue;
      if(review.field==='application_url'){
        if(!guidanceUrl(review.value)||!Array.isArray(page.links)||!page.links.some(l=>sameUrl(l,review.value)))continue;
      } else if(!review.source_excerpt.includes(review.value)||blocked.has(review.field))continue;
      // A reviewed deadline can include the precise time/timezone absent in parsed dates.
      if(review.field==='deadline')result.items=result.items.filter(i=>i.field!=='deadline'||i.provenance.method==='human-reviewed');
      add(review.field,review.value,page,review.source_excerpt,review.cycle,review);
    }
    const portals=[...new Set(result.items.filter(i=>i.field==='application_url').map(i=>i.value))];
    if(portals.length===1)result.applicationUrl=portals[0];
    else if(portals.length>1){result.items=result.items.filter(i=>i.field!=='application_url');result.warnings.push('Application links conflict; confirm the correct route on the program source.');}
  } else result.warnings.push(program.monitor_state==='discontinued'?'This program is recorded as discontinued.':'Source changes await review. Requirements are withheld until they are checked.');
  for(const field of ['deadline','fee','match'] as const){
    const unscoped=result.items.filter(i=>i.field===field&&!i.provenance.applicantScope);
    if(new Set(unscoped.map(i=>i.value)).size>1){result.items=result.items.filter(i=>i.field!==field||!!i.provenance.applicantScope);result.warnings.push(`${field==='match'?'Matching-fund':field[0].toUpperCase()+field.slice(1)} evidence conflicts; confirm the applicable current requirement.`);}
  }
  result.items=result.items.filter((v,i,a)=>a.findIndex(x=>x.field===v.field&&x.value===v.value&&x.provenance.applicantScope===v.provenance.applicantScope)===i);
  result.unknown=guidanceFields.filter(f=>!result.items.some(i=>i.field===f));
  result.lastVerifiedAt=result.items.map(i=>i.provenance.verifiedAt).filter((v):v is string=>!!v).sort().at(-1)??null;
  if(!trusted.length)result.warnings.push('No current, trusted program-specific snapshot is available.');
  if(result.unknown.length)result.warnings.push('This is a partial guide. Missing or unverified requirements must be checked with the funder.');
  return result;
}
