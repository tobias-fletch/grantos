import {load} from 'cheerio';
import type {Client,PoolClient} from 'pg';
import {canonicalUrl} from '../opportunities/research';
import type {CrawlPage} from './reader';

export type ProgramExample={kind:'funded_project'|'sample_application';title:string;url:string;excerpt:string;source_url:string;image_url:string|null;image_alt:string;year:string|null;context:string};
const clean=(s:string)=>s.replace(/\s+/g,' ').trim();
const sample=/\b(sample|example|successful|funded)\s+(?:grant\s+)?(?:applications?|proposals?|narratives?)\b|\b(?:application|proposal)\s+(?:examples?|samples?)\b/i;
const awarded=/\b(recipients?|grantees?|award winners?|funded projects?|funded by|received (?:a |the )?grant|awarded (?:a |the )?grant|supported by|grant recipients?)\b/i;
const directory=/^(?:(?:view|see|all|past|previous|our|recent|current|\d{4})\s+)*(?:grant\s+)?(?:recipients|grantees|projects|awards|winners|stories|read more|learn more|apply now)$/i;
export const exampleLink=/recipient|grantee|funded.project|past.project|success.stor|sample.*(?:application|proposal)|example.*(?:application|proposal)/i;
function publicUrl(raw:string,base:string){try{return canonicalUrl(new URL(raw,base).href);}catch{return null;}}
function picture(raw:string|undefined,base:string){
 if(!raw)return null;const url=publicUrl(raw,base);if(!url)return null;
 // Only publisher-hosted images. No arbitrary image proxy or third-party trackers.
 if(new URL(url).hostname!==new URL(base).hostname||/logo|icon|avatar|pixel|tracking|\.svg(?:$|\?)/i.test(url))return null;
 return url;
}
export function extractExampleMetadata(html:string,url:string){
 const $=load(html);$('script,style,nav,footer,header,form,iframe').remove();
 const root=$('main').length?$('main'):$('body');
 const candidates:ProgramExample[]=[];
 const make=(title:string,href:string,context:string,img?:string,alt=''):ProgramExample|null=>{
  title=clean(title).slice(0,200);context=clean(context).slice(0,1800);
  if(/\b(?:not|never|unsuccessful|rejected)\s+(?:a\s+)?(?:funded|supported|awarded|successful|recipient|application|proposal)|\bnot an? (?:example|sample)\b/i.test(context))return null;
  const kind=sample.test(title+' '+context)?'sample_application':awarded.test(context)?'funded_project':null;
  const target=publicUrl(href,url);
  if(!kind||!target||title.length<5||directory.test(title)||/\b(?:blank|template|guidelines|instructions|faq)\b/i.test(title))return null;
  return {kind,title,url:target,excerpt:context.split(/\s+/).slice(0,22).join(' '),source_url:url,image_url:picture(img,url),image_alt:clean(alt).slice(0,200),year:context.match(/\b(?:19|20)\d{2}\b/)?.[0]??null,context};
 };
 for(const el of root.find('a[href]').toArray()){
  const a=$(el),box=a.closest('article,li,figure,p').length?a.closest('article,li,figure,p'):a.parent();
  const heading=box.find('h2,h3,h4').first().text();
  const label=clean(a.text())||heading;
  const img=box.find('img').first();
  const sectionHeading=a.closest('section').find('h2,h3').first().text();
  const c=make(directory.test(label)&&heading?heading:label,a.attr('href')!,sectionHeading+' '+box.text(),img.attr('src'),img.attr('alt'));
  if(c)candidates.push(c);
 }
 const title=clean($('h1').first().text()||$('title').text());
 const paragraphs=root.find('p').toArray().map(p=>clean($(p).text())).filter(p=>sample.test(p)||awarded.test(p));
 const fig=root.find('figure').filter((_,el)=>!!$(el).find('figcaption').text()).first();
 const img=fig.find('img').first();
 const self=make(title,url,paragraphs.slice(0,3).join(' '),img.attr('src'),img.attr('alt'));
 return {candidates:candidates.slice(0,30),self};
}
export function examplesFor(program:{name:string;source_url:string},page:CrawlPage,primary=false){
 let meta:{candidates:ProgramExample[];self:ProgramExample|null};
 try{meta=JSON.parse(page.extracted.program_examples??'{}');}catch{return [];}
 const name=clean(program.name).toLowerCase();
 const explicitlyRelated=(context:string)=>name.length>=10&&clean(context).toLowerCase().includes(name);
 const result=(meta.candidates??[]).filter(e=>primary||explicitlyRelated(e.context));
 if(!primary&&meta.self&&explicitlyRelated(meta.self.context))result.unshift(meta.self);
 // Never call the program itself a successful project or an example application.
 return [...new Map(result.filter(e=>e.url!==canonicalUrl(program.source_url)&&e.title.toLowerCase()!==name).map(e=>[e.url,e])).values()].slice(0,12);
}
export async function recordProgramExamples(db:Client|PoolClient,id:string,page:CrawlPage,snapshot:any,primary=false){
 if(!page.extracted.program_examples)return false;
 const program=(await db.query('SELECT name,source_url FROM opportunities WHERE id=$1',[id])).rows[0];if(!program)return false;
 const examples=examplesFor(program,page,primary);
 if(!examples.length){await db.query("UPDATE program_evidence_pages SET examples='[]' WHERE opportunity_id=$1 AND url=$2",[id,canonicalUrl(page.url)]);return false;}
 await db.query(`INSERT INTO program_evidence_pages(opportunity_id,url,role,association,snapshot_id,fetched_at,facts,examples)
 VALUES($1,$2,'supporting','historical-examples-only',$3,$4,'[]',$5)
 ON CONFLICT(opportunity_id,url) DO UPDATE SET examples=excluded.examples,snapshot_id=excluded.snapshot_id,fetched_at=excluded.fetched_at`,[id,canonicalUrl(page.url),snapshot.id,snapshot.fetched_at,JSON.stringify(examples)]);
 return examples.some(e=>e.url===canonicalUrl(page.url));
}
