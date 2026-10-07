import {extractFacts} from './extract';
import { lookup } from 'node:dns/promises';
import { Agent, fetch } from 'undici';
import { load } from 'cheerio';
import { publicAddress,safeUrl,pdfContent,type ReaderDependencies } from '../checklists/sources';
export const BOT='GrantOSDiscovery';
export class CrawlError extends Error { constructor(message:string,public blocked=false,public approvalUrl?:string){super(message);} }
type Rule={allow:boolean;pattern:string};
export function robotsPolicy(text:string) {
 const groups:{agents:string[];rules:Rule[];delay:number}[]=[];const sitemaps:string[]=[];
 let group:typeof groups[number]|undefined,hasRules=false;
 for(const raw of text.split(/\r?\n/)){
  const line=raw.split('#')[0].trim();const colon=line.indexOf(':');if(colon<0)continue;
  const key=line.slice(0,colon).toLowerCase(),value=line.slice(colon+1).trim();
  if(key==='sitemap'){sitemaps.push(value);continue;}
  if(key==='user-agent'){if(!group||hasRules){group={agents:[],rules:[],delay:0};groups.push(group);hasRules=false;}group.agents.push(value.toLowerCase());}
  else if(group){hasRules=true;if((key==='allow'||key==='disallow')&&value)group.rules.push({allow:key==='allow',pattern:value});if(key==='crawl-delay'&&Number.isFinite(Number(value)))group.delay=Math.max(group.delay,Number(value)*1000);}
 }
 const specific=groups.filter(g=>g.agents.some(a=>a!=='*'&&BOT.toLowerCase().includes(a)));
 const applicable=specific.length?specific:groups.filter(g=>g.agents.includes('*'));
 const rules=applicable.flatMap(g=>g.rules);
 return {sitemaps:sitemaps.slice(0,10),delay:Math.max(1500,...applicable.map(g=>g.delay)),allowed:(url:string)=>{
  const u=new URL(url),path=u.pathname+u.search;
  const matches=rules.filter(r=>{const end=r.pattern.endsWith('$');const p=end?r.pattern.slice(0,-1):r.pattern;return new RegExp('^'+p.split('*').map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+(end?'$':'')).test(path);});
  matches.sort((a,b)=>b.pattern.replace(/\*/g,'').length-a.pattern.replace(/\*/g,'').length||Number(b.allow)-Number(a.allow));return matches[0]?.allow??true;
 }};
}
export type ConditionalPage={etag?:string;lastModified?:string;page:CrawlPage};
export type CrawlPage={notModified?:boolean;etag?:string;lastModified?:string;url:string;title:string;text:string;links:string[];kind:'html'|'xml'|'pdf'|'text';extracted:Record<string,string>};
export function parsePage(bytes:Uint8Array,type:string,url:string):Promise<CrawlPage>|CrawlPage {
 if(type==='application/pdf')return pdfContent(bytes).then(text=>({url,title:new URL(url).pathname.split('/').pop()??'PDF',text,links:[],kind:'pdf',extracted:{}}));
 const raw=Buffer.from(bytes).toString('utf8');
 const xml=!type.includes('xhtml')&&(/xml|rss|atom/.test(type)||/^\s*<\?xml/.test(raw));
 const $=load(raw,{xmlMode:xml});
 if(xml){const links=[...$('loc, item > link').toArray().map(el=>$(el).text()),...$('entry > link').toArray().map(el=>$(el).attr('href')??'')];return {url,title:'Feed or sitemap',text:$.text().replace(/\s+/g,' ').trim(),links:links.slice(0,5000),kind:'xml',extracted:{}};}
 const title=($('h1').first().text()||$('title').text()).replace(/\s+/g,' ').trim().slice(0,250);
 const links=$('a[href],link[rel="alternate"]').toArray().filter(el=>/grant|fund|apply|application|guideline|eligib|deadline|opportunit|solicitation|next|page=|\.pdf|rss|atom|sitemap/i.test(($(el).text()+' '+$(el).attr('href'))) || $(el).attr('rel')==='next').map(el=>{try{return new URL($(el).attr('href')!,url).href;}catch{return '';}}).filter(Boolean);
 $('script,style,nav,footer,header,noscript,form,iframe').remove();$('p,div,section,h1,h2,h3,h4,h5,h6,li,dt,dd,br').append(' ');
 const text=($('main').length?$('main').text():$('body').text()||$.text()).replace(/\s+/g,' ').trim();
 const extracted:Record<string,string>=extractFacts(raw,url);const u=new URL(url);
 // Publisher-specific rules supply proposals only; no automatic publication or inferred dates.
 if(['www.arts.gov','www.ams.usda.gov','www.spencer.org'].includes(u.hostname)&&title)extracted.name=title;
 return {url,title,text,links:[...new Set(links)].slice(0,5000),kind:type==='text/plain'?'text':'html',extracted};
}
export function createReader(deps:ReaderDependencies & {sleep:(ms:number)=>Promise<void>}={resolve:lookup,request:fetch,sleep:(ms:number)=>new Promise<void>(r=>setTimeout(r,ms))}) {
 const policies=new Map<string,ReturnType<typeof robotsPolicy>>();const last=new Map<string,number>();
 async function request(url:string,delay:number,conditional?:ConditionalPage){
  const u=safeUrl(url),host=u.hostname.replace(/^\[|\]$/g,'');
  if(delay>60000)throw new CrawlError('Publisher crawl delay exceeds this worker limit; deferred.',true);
  await deps.sleep(Math.max(0,(last.get(host)??0)+delay-Date.now()));last.set(host,Date.now());
  const addresses=await deps.resolve(host,{all:true});if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new CrawlError('Source does not resolve exclusively to public addresses.',true);
  const selected=addresses[0];const agent=new Agent({connect:{lookup:(_h,options,cb)=>{if((options as {all?:boolean}).all)cb(null,[selected] as never);else cb(null,selected.address,selected.family);}}});
  try{
   const res=await deps.request(u,{dispatcher:agent,redirect:'manual',signal:AbortSignal.timeout(12000),headers:{...(conditional?.etag?{'if-none-match':conditional.etag}:{}),...(conditional?.lastModified?{'if-modified-since':conditional.lastModified}:{}),'user-agent':`${BOT}/1.0`,accept:'text/html,application/pdf,application/xml,text/xml,application/rss+xml,application/atom+xml,text/plain'}});
   const reader=res.body?.getReader();const chunks:Uint8Array[]=[];let size=0;
   try{if(reader)while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>4000000)throw new CrawlError('Source exceeds 4 MB.');chunks.push(next.value);}}finally{await reader?.cancel();}
   return {etag:res.headers.get('etag')??undefined,lastModified:res.headers.get('last-modified')??undefined,status:res.status,type:res.headers.get('content-type')?.split(';')[0]??'',location:res.headers.get('location'),retry:res.headers.get('retry-after'),bytes:Buffer.concat(chunks)};
  }finally{await agent.close();}
 }
 async function policy(origin:string){
  if(policies.has(origin))return policies.get(origin)!;
  let url=origin+'/robots.txt';let res=await request(url,1500);
  for(let n=0;[301,302,303,307,308].includes(res.status)&&n<3;n++){url=new URL(res.location??'',url).href;if(safeUrl(url).origin!==origin)throw new CrawlError('Robots redirects off-site; deferred.',true);res=await request(url,1500);}
  if(res.status!==404&&res.status!==410&&(res.status<200||res.status>=300))throw new CrawlError('Robots policy unavailable; deferred.',true);
  const p=robotsPolicy(res.status===404||res.status===410?'':res.bytes.toString('utf8'));policies.set(origin,p);return p;
 }
 return {policy,read:async(value:string,approved:string[],conditional?:ConditionalPage):Promise<CrawlPage>=>{
  let url=value;
  for(let redirect=0;redirect<=3;redirect++){
   const u=safeUrl(url);if(!approved.includes(u.hostname))throw new CrawlError('Domain needs editor approval.',true,url);
   const p=await policy(u.origin);if(!p.allowed(url))throw new CrawlError('Disallowed by robots.txt.',true);
   let res=await request(url,p.delay,url===value?conditional:undefined);
   for(let attempt=0;attempt<2&&(res.status===429||res.status>=500);attempt++){
    const seconds=Number(res.retry);const wait=Number.isFinite(seconds)?seconds*1000:res.retry?Date.parse(res.retry)-Date.now():2000*(attempt+1);
    if(wait>60000)throw new CrawlError('Publisher requested a later retry.');
    await deps.sleep(Math.max(2000,wait||0));res=await request(url,p.delay,url===value?conditional:undefined);
   }
   if([301,302,303,307,308].includes(res.status)){if(!res.location)throw new CrawlError('Invalid redirect.');url=new URL(res.location,url).href;continue;}
   if(res.status===304&&conditional&&url===value)return {...conditional.page,notModified:true,etag:res.etag??conditional.etag,lastModified:res.lastModified??conditional.lastModified};
   if(res.status<200||res.status>=300)throw new CrawlError(`Source returned HTTP ${res.status}.`);
   if(!/^(text\/(html|plain|xml)|application\/(pdf|xml|rss\+xml|atom\+xml|xhtml\+xml))$/.test(res.type))throw new CrawlError('Unsupported source format.');
   const page=await parsePage(res.bytes,res.type,url);page.etag=res.etag;page.lastModified=res.lastModified;page.text=page.text.slice(0,100000);if(page.text.length<30)throw new CrawlError('Source needs JavaScript or has insufficient readable text.');return page;
  }
  throw new CrawlError('Too many redirects.');
 }};
}
