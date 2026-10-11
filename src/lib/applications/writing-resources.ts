import type {DB} from '../checklists/store';
import {applicationAccess} from './store';
import {guidanceUrl} from './guidance';

export type ProgramWritingExample = {
  kind:'funded_project'|'sample_application'; title:string; url:string; sourceUrl:string;
  excerpt:string; year:string|null; fetchedAt:string; snapshotId:string;
};
export type ApplicationWritingResourceData = {programUrl:string|null; savedSourceUrl:string|null; examples:ProgramWritingExample[]};
export type WritingExampleEvidence = {
  url:string; association:string; snapshot_id:string; latest_snapshot_id:string; snapshot_url:string;
  fetched_at:Date|string; body:string; links:unknown; approved_domains:string[]; examples:unknown;
};
const normalized=(s:string)=>s.replace(/\s+/gu,' ').trim();
const same=(a:string,b:string)=>guidanceUrl(a)?.replace(/\/$/u,'')===guidanceUrl(b)?.replace(/\/$/u,'');
const publisher=(url:string)=>new URL(url).hostname.replace(/^www\./u,'');
const associations=new Set(['program-page','explicit-program-identifier','official-program-subpage','official-program-link','official-structured-data','historical-examples-only']);
const fundedMarker=/\b(?:recipients?|grantees?|award winners?|funded projects?|funded by|received (?:a |the )?grant|awarded (?:a |the )?grant|supported by)\b/iu;
const negativeAward=/\b(?:not|never|unsuccessful|rejected|unfunded)\b[^.!?]{0,80}\b(?:funded|supported|awarded|successful|recipient|application|proposal|grant|award)\b|\b(?:unsuccessful|rejected|unfunded)\b/iu;
function fundedTitlePassage(title:string,context:string){
  // A title on the same page as somebody else's award is not award provenance.
  // Require the title and award marker in one short source passage, not separate paragraphs.
  return context.split(/(?<=[.!?])\s+|\n+/u).some(passage=>{
    const text=normalized(passage),at=text.toLowerCase().indexOf(normalized(title).toLowerCase());
    if(at<0||text.length>600||negativeAward.test(text))return false;
    const nearby=text.slice(Math.max(0,at-100),at+title.length+200);
    return fundedMarker.test(nearby);
  });
}
/** Uses existing evidence only. Never fetches a URL or promotes a sample to a winning proposal. */
export function programWritingExamples(officialUrl:string, pages:WritingExampleEvidence[], now=Date.now()):ProgramWritingExample[] {
  const official=guidanceUrl(officialUrl);if(!official)return [];
  const result:ProgramWritingExample[]=[];
  for(const page of pages){
    const source=guidanceUrl(page.url),date=new Date(page.fetched_at).getTime();
    if(!source||publisher(source)!==publisher(official)||!page.approved_domains.includes(new URL(source).hostname)||
      !associations.has(page.association)||!same(page.url,page.snapshot_url)||!page.snapshot_id||page.snapshot_id!==page.latest_snapshot_id||
      !Number.isFinite(date)||date>now||date<now-90*86400000||!Array.isArray(page.examples))continue;
    const body=normalized(page.body);
    for(const raw of page.examples){
      if(!raw||typeof raw!=='object')continue;
      const e=raw as Record<string,unknown>,url=guidanceUrl(e.url);
      if(!url||!['funded_project','sample_application'].includes(String(e.kind))||typeof e.title!=='string'||!e.title.trim()||e.title.length>300||
        typeof e.source_url!=='string'||!same(e.source_url,source)||typeof e.excerpt!=='string'||!e.excerpt.trim()||
        !body.includes(normalized(e.excerpt))||!body.includes(normalized(e.title)))continue;
      if(!same(url,source)&&(!Array.isArray(page.links)||!page.links.some(link=>typeof link==='string'&&same(link,url))))continue;
      // The recorded excerpt itself must support the label. Sample does not mean funded.
      const context=typeof e.context==='string'?e.context:e.excerpt;
      if(!body.includes(normalized(context)))continue;
      if(e.kind==='funded_project'&&!fundedTitlePassage(e.title,context))continue;
      if(e.kind==='sample_application'&&!/\b(?:sample|example|successful|funded)\s+(?:grant\s+)?(?:application|proposal|narrative)|\b(?:application|proposal)\s+(?:example|sample)/iu.test(context+' '+e.title))continue;
      if(negativeAward.test(context))continue;
      if(result.some(item=>item.url===url))continue;
      result.push({kind:e.kind as ProgramWritingExample['kind'],title:e.title,url,sourceUrl:source,
        excerpt:normalized(e.excerpt).split(' ').slice(0,22).join(' '),year:typeof e.year==='string'&&/^\d{4}$/u.test(e.year)?e.year:null,
        fetchedAt:new Date(date).toISOString(),snapshotId:page.snapshot_id});
      if(result.length===12)return result;
    }
  }
  return result;
}
export async function applicationWritingResources(db:DB,user:string,applicationId:string):Promise<ApplicationWritingResourceData>{
  const app=await applicationAccess(db,user,applicationId);
  const empty={programUrl:null,savedSourceUrl:guidanceUrl(app.source_url),examples:[]};
  if(!app.opportunity_id)return empty;
  const program=(await db.query(`SELECT official_url FROM opportunities WHERE id=$1 AND NOT is_demo AND merged_into IS NULL AND publication_state='published' AND verification_status<>'archived'`,[app.opportunity_id])).rows[0];
  if(!program)return empty;
  const pages=(await db.query<WritingExampleEvidence>(`SELECT p.url,p.association,p.snapshot_id,p.examples,s.fetched_at,s.body,s.links,s.url AS snapshot_url,c.approved_domains,
    (SELECT n.id FROM crawl_snapshots n WHERE n.url=s.url ORDER BY n.fetched_at DESC,n.id DESC LIMIT 1) AS latest_snapshot_id
    FROM program_evidence_pages p JOIN crawl_snapshots s ON s.id=p.snapshot_id JOIN crawl_sources c ON c.id=s.source_id
    WHERE p.opportunity_id=$1 ORDER BY s.fetched_at DESC,p.url`,[app.opportunity_id])).rows;
  return {...empty,programUrl:guidanceUrl(program.official_url),examples:programWritingExamples(program.official_url,pages)};
}
